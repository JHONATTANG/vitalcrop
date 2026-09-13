"""
AGW Edge Gateway — Telemetry Syncer
====================================
Sube la telemetría a la Cloud API al ritmo que marque `Ritmo`, y
garantiza que nada se pierda cuando no hay internet.

Contrato real de la API (MCD §4.2):
    POST /api/telemetria   →  UN registro por petición, no lotes.
    Header: Authorization: Bearer <API_TOKEN>

UN SOLO CAMINO

Toda trama se persiste en el SQLite ANTES de cualquier intento de
subida (lo hace el MessageHandler). Este módulo, cuando toca subir,
lee lo no sincronizado del SQLite, lo envía en orden y marca lo que la
nube aceptó. No hay cola en memoria ni camino «en caliente» aparte.

La versión anterior tenía dos caminos —uno en memoria para lo recién
llegado y otro de recuperación leyendo el SQLite— y el primero nunca
marcaba la fila como sincronizada. Resultado: cada trama subía dos
veces, la segunda 30 s después por el bucle de recuperación, y solo
la clave única de la API evitaba que se duplicara en la base. Con un
camino no hay forma de que eso pase, y el SQLite es la única verdad
sobre qué falta por subir: un reinicio a mitad de lote no pierde nada.

CUÁNDO SUBE

Lo decide `Ritmo`: cada 30 min si nadie mira el panel, cada 2 min si
alguien lo mira, y en el acto al pasar de dormido a despierto. También
al arrancar, para vaciar lo que quedara de la vida anterior.

Sobre la latencia del §9: `created_at − t_rx` en la nube pasa a incluir
la espera en cola (hasta 30 min dormido). La API ya separa lo que llega
en menos de 60 s de lo que llega después; con este ritmo casi todo cae
en el segundo grupo. Es la consecuencia elegida de dejar dormir la
base, y se documenta aquí para que nadie lo lea como un enlace lento.
"""
from __future__ import annotations

import asyncio
import json
import time

import structlog

from cloud.cloud_client import CloudClient
from mqtt.normalize import to_cloud_payload

log = structlog.get_logger()

# Claves de lectura que hacen que valga la pena gastar una petición HTTP
_SENSOR_FIELDS = ("temperatura", "humedad_ambiente", "humedad_suelo", "ph")


class TelemetrySyncer:
    """Sincronizador de telemetría edge → nube, al ritmo de `Ritmo`."""

    def __init__(self, config, local_db, ritmo):
        self.config = config
        self.local_db = local_db
        self.ritmo = ritmo
        self._cloud = CloudClient(config)
        self._batch_size = config.cloud.batch_size
        self._enabled = getattr(config.cloud, "enabled", True)
        self._despertador = asyncio.Event()
        self._ultimo_envio = 0.0
        self._fallando = False
        # A quién avisar cuando la nube vuelve tras fallar: el poller de
        # órdenes sale a buscar lo encolado y el anunciador repite la URL.
        self.al_recuperar: list = []

        # Métricas de telecomunicaciones (MCD §9)
        self.stats = {
            "enviados_ok": 0,
            "enviados_fallo": 0,
            "lotes": 0,
            "latencia_ultima_ms": None,
            "latencia_acumulada_ms": 0.0,
            "latencia_muestras": 0,
        }
        # Al despertar se sube en el acto: el panel no espera 2 min.
        ritmo.al_despertar(self.despertar)

    # Se conserva por compatibilidad con el handler: ya no hay cola.
    # La trama está en el SQLite y saldrá en el siguiente lote.
    async def enqueue(self, data: dict) -> None:
        return None

    def despertar(self) -> None:
        self._despertador.set()

    @property
    def latencia_media_ms(self) -> float | None:
        n = self.stats["latencia_muestras"]
        return round(self.stats["latencia_acumulada_ms"] / n, 2) if n else None

    # ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        if not self._enabled:
            log.warning("Sync a la nube DESACTIVADO (cloud.enabled=false) — "
                        "la telemetria se acumula en el buffer local")
            while True:
                await asyncio.sleep(3600)

        log.info("Telemetry syncer iniciado",
                 endpoint=self.config.cloud.telemetry_endpoint,
                 dormido_s=self.ritmo.dormido_s, despierto_s=self.ritmo.activo_s)
        # Un respiro para que el MQTT y la red arranquen; después, el
        # primer lote vacía lo que quedara pendiente.
        await asyncio.sleep(15)

        while True:
            motivo = await self.ritmo.esperar(self._despertador, self._ultimo_envio)
            try:
                n = await self.vaciar()
                if n or motivo != "ritmo":
                    log.info("Lote de telemetria", subidas=n, por=motivo,
                             modo=self.ritmo.describir()["modo"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:                           # noqa: BLE001
                log.warning("Fallo el lote de telemetria", error=str(exc))
            self._ultimo_envio = time.time()

    async def vaciar(self) -> int:
        """Sube todo lo no sincronizado, en orden. Devuelve cuántas aceptó la nube."""
        total, fallo = 0, False
        while not fallo:
            filas = await self.local_db.get_unsynced_telemetry(self._batch_size)
            if not filas:
                break
            enviados: list[int] = []
            for fila in filas:
                if await self._send_one(json.loads(fila["payload"])):
                    enviados.append(fila["id"])
                else:
                    # La red sigue mal: no insistir con el resto para no
                    # disparar el circuit breaker. Se reintenta al siguiente.
                    fallo = True
                    break
            if enviados:
                await self.local_db.mark_synced(enviados)
                total += len(enviados)
        if total:
            self.stats["lotes"] += 1
        # Venía fallando y este lote salió entero: la nube volvió.
        if self._fallando and not fallo:
            for cb in self.al_recuperar:
                try:
                    cb()
                except Exception as exc:                      # noqa: BLE001
                    log.debug("Callback de recuperacion fallo", error=str(exc))
        self._fallando = fallo
        return total

    # ─────────────────────────────────────────────────────────────

    async def _send_one(self, record: dict) -> bool:
        """POST de un único registro. True si la nube lo aceptó."""
        body = to_cloud_payload(record)

        if not any(k in body for k in _SENSOR_FIELDS):
            log.debug("Registro sin lecturas validas — omitido", node=record.get("node_id"))
            return True

        t0 = time.perf_counter()
        try:
            resp = await self._cloud.post(self.config.cloud.telemetry_endpoint, json=body)
            latencia_ms = (time.perf_counter() - t0) * 1000
            self.stats["enviados_ok"] += 1
            self.stats["latencia_ultima_ms"] = round(latencia_ms, 2)
            self.stats["latencia_acumulada_ms"] += latencia_ms
            self.stats["latencia_muestras"] += 1
            log.debug("Telemetria subida", status=resp.status_code,
                      latencia_ms=round(latencia_ms, 1), sensor=body.get("sensor_id"))
            return True
        except Exception as exc:                               # noqa: BLE001
            self.stats["enviados_fallo"] += 1
            log.warning("Fallo al subir — el dato sigue en el buffer SQLite",
                        error=str(exc), sensor=body.get("sensor_id"))
            return False

    async def close(self) -> None:
        await self._cloud.close()
