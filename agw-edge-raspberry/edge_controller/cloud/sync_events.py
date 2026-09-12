"""
AGW Edge Gateway — Remitente de eventos
========================================
Sube a la nube los eventos que el gateway registró en su SQLite local.

QUÉ HUECO CIERRA

El gateway anotaba cada decisión del borde —inicio y fin de cada ciclo
de riego, caídas, reconexiones, correcciones de programa— y ahí se
quedaban. El edge solo hablaba con `/telemetria`, `/health` y
`/commands/pending`: no había ninguna puerta por la que un evento
pudiera salir.

El resultado era una nube con 131 eventos frente a 430 en el borde, y
congelada cuatro días. Las páginas que los leen —los ciclos de riego
por hora, las decisiones del borde— mostraban cifras viejas como si
fueran de ahora.

POR QUÉ NO REUTILIZA EL REMITENTE DE TELEMETRÍA

La telemetría es un flujo regular y previsible: una trama cada cinco
minutos, y el que llega tarde importa poco. Los eventos son a ráfagas
—dos por cada ciclo de riego, decenas tras un corte— y cada uno es
único: no hay una lectura siguiente que lo sustituya. Van en lote y con
su propio ritmo.

POR QUÉ MARCA COMO ENVIADO SIN MIEDO

El endpoint es idempotente: la tabla en la nube tiene
UNIQUE (sensor_id, ts, evento) y los repetidos se descartan allí. Un
lote que se sube dos veces no duplica nada, así que marcar antes de
confirmar no puede corromper el histórico — a lo sumo reenvía.
"""
from __future__ import annotations

import asyncio
import json

import structlog

from cloud.cloud_client import CloudClient

log = structlog.get_logger()

# Tamaño del lote. Quinientos es el tope que acepta el endpoint; se usa
# la mitad para que una subida grande no agote el tiempo de la función
# sin servidor, que corta a los 30 s.
LOTE = 250


class EventSyncer:
    """Vacía los eventos pendientes del archivo local hacia la nube."""

    def __init__(self, config, local_db):
        self.config = config
        self.local_db = local_db
        self._cloud = CloudClient(config)
        self._enabled = getattr(config.cloud, "enabled", True)
        self.gateway_id = config.device.gateway_id
        self._endpoint = "/api/iot/eventos"
        # Ciclo de respaldo. Lo normal es que quien registra un evento que
        # importa —una alerta que se abre o se cierra— llame a
        # `despertar()` y suba en el acto.
        self._intervalo = 60
        self._despertador = asyncio.Event()

        self.stats = {"subidos": 0, "duplicados": 0, "lotes": 0, "fallos": 0}

    def despertar(self) -> None:
        """Sube lo pendiente ya, sin esperar al ciclo."""
        self._despertador.set()

    async def run(self) -> None:
        if not self._enabled:
            log.info("Remitente de eventos inactivo (sin nube)")
            while True:
                await asyncio.sleep(3600)

        log.info("Remitente de eventos iniciado",
                 endpoint=self._endpoint, intervalo=self._intervalo)

        # Un respiro antes del primer envío: al arrancar el gateway hay
        # ráfaga de reconexión y no conviene competir con ella.
        await asyncio.sleep(20)

        while True:
            try:
                enviados = await self._vaciar()
                if enviados:
                    log.info("Eventos subidos", n=enviados)
            except asyncio.CancelledError:
                raise
            except Exception as exc:                           # noqa: BLE001
                self.stats["fallos"] += 1
                log.warning("Fallo subiendo eventos", error=str(exc))
            try:
                await asyncio.wait_for(self._despertador.wait(), timeout=self._intervalo)
            except asyncio.TimeoutError:
                pass
            self._despertador.clear()

    # ─────────────────────────────────────────────────────────────

    async def _vaciar(self) -> int:
        """Sube en lotes hasta que no queden pendientes. Devuelve el total."""
        total = 0
        while True:
            filas = await self.local_db.eventos_sin_sincronizar(LOTE)
            if not filas:
                return total

            cuerpo = {
                "gateway_id": self.gateway_id,
                "eventos": [self._a_payload(f) for f in filas],
            }
            resp = await self._cloud.post(self._endpoint, json=cuerpo)
            datos = resp.json()

            self.stats["subidos"] += datos.get("insertados", 0)
            self.stats["duplicados"] += datos.get("duplicados", 0)
            self.stats["lotes"] += 1

            await self.local_db.marcar_eventos_sincronizados([f["id"] for f in filas])
            total += len(filas)

            # Un lote incompleto significa que se acabó lo pendiente.
            if len(filas) < LOTE:
                return total

    @staticmethod
    def _a_payload(fila: dict) -> dict:
        """
        Traduce una fila local al contrato de la nube.

        `created_at` es epoch en segundos y el endpoint espera un
        instante con zona. Se manda en UTC explícito: el nodo y el
        gateway trabajan en hora local, y dejar que el servidor adivine
        la zona es como se corrieron cinco horas los mapas horarios.
        """
        import datetime as dt

        detalle = fila.get("detalle")
        if isinstance(detalle, str):
            try:
                detalle = json.loads(detalle)
            except (ValueError, TypeError):
                detalle = {"texto": detalle}

        ts = dt.datetime.fromtimestamp(fila["created_at"], dt.timezone.utc)
        return {
            "ts": ts.isoformat(),
            "sensor_id": fila["node_id"],
            "evento": fila["evento"],
            "detalle": detalle if isinstance(detalle, dict) else None,
        }

    async def close(self) -> None:
        await self._cloud.close()
