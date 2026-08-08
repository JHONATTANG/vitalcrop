"""
AGW Edge Gateway — Telemetry Syncer
====================================
Sube telemetría a la Cloud API y garantiza que nada se pierda cuando no hay
internet.

Contrato real de la API (MCD §4.2):
    POST /api/telemetria   →  UN registro por petición, no lotes.
    Header: Authorization: Bearer <API_TOKEN>

⚠️ La versión anterior enviaba `{gateway_id, timestamp, records:[...]}` a
`/api/iot/telemetry`, un endpoint que no existe. Corregido al contrato real.

Flujo:
  1. MessageHandler encola con enqueue()
  2. _live_sender_loop      → envía lo que llega en caliente
  3. _offline_recovery_loop → reintenta lo que quedó en SQLite
  4. Toda la telemetría se persiste ANTES de intentar subirla, así que una
     caída de red nunca provoca pérdida de datos.
"""
from __future__ import annotations

import asyncio
import json
import time

import structlog

from cloud.cloud_client import CloudClient
from mqtt.normalize import to_cloud_payload

log = structlog.get_logger()

# Cada cuánto se reintenta el buffer offline
OFFLINE_RETRY_INTERVAL_S = 30

# Claves de lectura que hacen que valga la pena gastar una petición HTTP
_SENSOR_FIELDS = ("temperatura", "humedad_ambiente", "humedad_suelo", "ph")


class TelemetrySyncer:
    """Sincronizador de telemetría edge → nube."""

    def __init__(self, config, local_db):
        self.config = config
        self.local_db = local_db
        self._cloud = CloudClient(config)
        self._queue: asyncio.Queue[dict] = asyncio.Queue()
        self._batch_size = config.cloud.batch_size
        self._poll_interval = config.cloud.poll_interval_seconds
        self._enabled = getattr(config.cloud, "enabled", True)

        # Métricas de telecomunicaciones (MCD §9)
        self.stats = {
            "enviados_ok": 0,
            "enviados_fallo": 0,
            "recuperados_offline": 0,
            "latencia_ultima_ms": None,
            "latencia_acumulada_ms": 0.0,
            "latencia_muestras": 0,
        }

    async def enqueue(self, data: dict) -> None:
        await self._queue.put(data)

    @property
    def latencia_media_ms(self) -> float | None:
        n = self.stats["latencia_muestras"]
        return round(self.stats["latencia_acumulada_ms"] / n, 2) if n else None

    async def run(self) -> None:
        if not self._enabled:
            # Modo aislado: todo se acumula en SQLite y no se toca la red.
            # Útil en Fase 3 para validar el eslabón MQTT por separado.
            log.warning(
                "Sync a la nube DESACTIVADO (cloud.enabled=false) — "
                "la telemetria se acumula en el buffer local"
            )
            while True:
                await asyncio.sleep(3600)

        log.info(
            "Telemetry syncer iniciado",
            base_url=self.config.cloud.api_base_url,
            endpoint=self.config.cloud.telemetry_endpoint,
            batch_size=self._batch_size,
        )
        await asyncio.gather(
            self._live_sender_loop(),
            self._offline_recovery_loop(),
        )

    # ─────────────────────────────────────────────────────────────
    # Envío en caliente
    # ─────────────────────────────────────────────────────────────

    async def _live_sender_loop(self) -> None:
        while True:
            batch = await self._drain_queue()
            for record in batch:
                await self._send_one(record)

    async def _drain_queue(self) -> list[dict]:
        """Extrae hasta batch_size elementos, esperando el primero."""
        batch: list[dict] = []
        try:
            item = await asyncio.wait_for(
                self._queue.get(), timeout=self._poll_interval
            )
            batch.append(item)
            self._queue.task_done()
            while not self._queue.empty() and len(batch) < self._batch_size:
                batch.append(self._queue.get_nowait())
                self._queue.task_done()
        except asyncio.TimeoutError:
            pass
        return batch

    # ─────────────────────────────────────────────────────────────
    # Recuperación offline
    # ─────────────────────────────────────────────────────────────

    async def _offline_recovery_loop(self) -> None:
        """Vacía el buffer SQLite cuando vuelve la conectividad."""
        while True:
            await asyncio.sleep(OFFLINE_RETRY_INTERVAL_S)
            try:
                records = await self.local_db.get_unsynced_telemetry(self._batch_size)
                if not records:
                    continue

                log.info("Recuperacion offline", pendientes=len(records))
                enviados: list[int] = []
                for row in records:
                    payload = json.loads(row["payload"])
                    if await self._send_one(payload, count_as_recovery=True):
                        enviados.append(row["id"])
                    else:
                        # Si falla uno, la red sigue mal: no insistir con el
                        # resto para no disparar el circuit breaker.
                        break

                if enviados:
                    await self.local_db.mark_synced(enviados)
                    log.info("Buffer vaciado", registros=len(enviados))
            except Exception as exc:
                log.warning("Recuperacion offline fallida", error=str(exc))

    # ─────────────────────────────────────────────────────────────
    # Envío individual (contrato real de la API)
    # ─────────────────────────────────────────────────────────────

    async def _send_one(self, record: dict, count_as_recovery: bool = False) -> bool:
        """POST de un único registro. True si la nube lo aceptó."""
        body = to_cloud_payload(record)

        # Sin ninguna lectura válida no vale la pena gastar una petición
        if not any(k in body for k in _SENSOR_FIELDS):
            log.debug(
                "Registro sin lecturas validas — omitido",
                node=record.get("node_id"),
            )
            return True

        t0 = time.perf_counter()
        try:
            resp = await self._cloud.post(
                self.config.cloud.telemetry_endpoint, json=body
            )
            latencia_ms = (time.perf_counter() - t0) * 1000

            self.stats["enviados_ok"] += 1
            self.stats["latencia_ultima_ms"] = round(latencia_ms, 2)
            self.stats["latencia_acumulada_ms"] += latencia_ms
            self.stats["latencia_muestras"] += 1
            if count_as_recovery:
                self.stats["recuperados_offline"] += 1

            log.info(
                "Telemetria subida",
                status=resp.status_code,
                latencia_ms=round(latencia_ms, 1),
                sensor=body.get("sensor_id"),
            )
            return True

        except Exception as exc:
            self.stats["enviados_fallo"] += 1
            log.warning(
                "Fallo al subir — el dato sigue en el buffer SQLite",
                error=str(exc),
                sensor=body.get("sensor_id"),
            )
            return False

    async def close(self) -> None:
        await self._cloud.close()
