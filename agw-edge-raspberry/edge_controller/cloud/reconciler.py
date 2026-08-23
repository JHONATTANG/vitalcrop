"""
AGW Edge — Reconciliador del nodo
==================================

POR QUE EXISTE

Hasta ahora el gateway empujaba el programa a ciegas: lo mandaba y daba
por hecho que el nodo lo aplicaba. Nunca leía lo que el nodo tenía de
verdad, así que no podía detectar que estuvieran en desacuerdo.

Eso permitió un fallo que duró cinco días sin una sola línea de error.
`NodeSync` lee `config.yaml` una vez, al construirse, y el archivo se
editó minutos después de arrancar el servicio. El gateway siguió
reenviando la copia vieja en cada reconexión del nodo — 300 s de bomba
en vez de 180 — y cada "recuperación" deshacía silenciosamente el valor
bueno. El sistema funcionaba: hacía lo incorrecto, con precisión.

QUE HACE

Cada `poll_seconds` pregunta al nodo su estado por HTTP y:

  1. Detecta que se cayó o que volvió, y lo deja escrito en la base de
     datos, no solo en el log. El journal de systemd rota; la tabla no.

  2. Compara el programa que el nodo ejecuta con el que debería, LEIDO
     DEL ARCHIVO en ese momento. Si difieren, lo dice con los dos
     valores y encarga la corrección.

  3. Cada `snapshot_seconds` guarda una fila del histórico local, que es
     el archivo que queda cuando no hay nube a la que subir nada.

POR HTTP Y NO POR MQTT

`/estado` no depende del broker ni de que el nodo tenga encendido el
módulo de status. Si MQTT se cae, esto sigue viendo la verdad — que es
justo cuando más falta hace.

LO QUE NO PUEDE VERIFICAR

El nodo no publica sus tiempos de hidroponía: `/estado` trae el
fotoperiodo, los días de tierra y la telemetría, pero no
`hidro_riego_dia_s` ni sus tres hermanos. Hasta que el firmware los
exponga, esos cuatro se envían pero no se pueden comprobar. Está
señalado en `_CAMPOS_VERIFICABLES` para que no se olvide.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import structlog

log = structlog.get_logger("agw.reconciler")

# Campos del programa que el nodo reporta en /estado y por tanto se
# pueden contrastar. Los cuatro tiempos de hidroponia NO estan aqui
# porque el firmware todavia no los publica.
_CAMPOS_VERIFICABLES = (
    "hora_luz_on",
    "hora_luz_off",
    "tierra_cada_dias",
    "tierra_hora",
    "telemetria_s",
)


class Reconciler:
    """Vigila que el nodo ejecute el programa que debe, y lo archiva."""

    def __init__(self, config, node_sync, local_db):
        self.cfg = config.reconciler
        self.node_sync = node_sync
        self.local_db = local_db

        self.node_id = "desconocido"
        self.online: bool | None = None      # None = aun no se sabe
        self.ultimo_snapshot = 0.0
        self.ultima_poda = 0.0

        self.stats = {
            "caidas": 0,
            "reconexiones": 0,
            "discrepancias": 0,
            "correcciones": 0,
            "snapshots": 0,
        }

    # ─────────────────────────────────────────────────────────────

    async def _leer_estado(self) -> dict | None:
        """El /estado del nodo, o None si no contesta."""
        url = f"{self.cfg.node_url.rstrip('/')}/estado"
        try:
            async with httpx.AsyncClient(timeout=self.cfg.timeout_seconds) as cli:
                r = await cli.get(url)
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            log.debug("El nodo no respondio a /estado", error=str(exc))
            return None

    async def _anotar(self, evento: str, detalle: dict | None = None) -> None:
        try:
            await self.local_db.registrar_evento(self.node_id, evento, detalle)
        except Exception as exc:
            # Que falle la escritura no puede tumbar la vigilancia.
            log.warning("No se pudo registrar el evento", evento=evento, error=str(exc))

    # ── Conectividad ─────────────────────────────────────────────

    async def _revisar_conectividad(self, estado: dict | None) -> None:
        ahora_online = estado is not None

        if self.online is None:
            # Primera lectura: fija el punto de partida sin inventar un
            # evento que no ocurrio durante esta ejecucion.
            self.online = ahora_online
            log.info("Estado inicial del nodo",
                     nodo="EN LINEA" if ahora_online else "SIN RESPUESTA")
            return

        if ahora_online == self.online:
            return

        self.online = ahora_online

        if ahora_online:
            self.stats["reconexiones"] += 1
            log.warning("El nodo volvio a responder", uptime_s=(estado.get("uptime_ms") or 0) // 1000)
            await self._anotar("conectado", {
                "uptime_s": (estado.get("uptime_ms") or 0) // 1000,
                "fw": estado.get("fw"),
                "rssi": estado.get("rssi"),
            })
        else:
            self.stats["caidas"] += 1
            log.error("EL NODO DEJO DE RESPONDER — riego y luz sin supervision")
            await self._anotar("desconectado", {"detectado_en": "/estado"})

    # ── Programa ─────────────────────────────────────────────────

    def _deseado(self) -> dict:
        """
        El programa que el nodo DEBERIA tener, leido del archivo ahora.

        Se pide a NodeSync en vez de guardarse una copia aqui: si cada
        componente cachea su propia version del programa, volvemos al
        problema que este modulo existe para detectar.
        """
        return self.node_sync.programa_vigente()

    async def _revisar_programa(self, estado: dict) -> None:
        actual = estado.get("programa") or {}
        if not actual:
            return                      # firmware viejo, sin bloque programa

        deseado = self._deseado()
        difieren = {
            campo: {"nodo": actual.get(campo), "deberia": deseado.get(campo)}
            for campo in _CAMPOS_VERIFICABLES
            if campo in actual and campo in deseado
            and actual.get(campo) != deseado.get(campo)
        }

        if not difieren:
            return

        self.stats["discrepancias"] += 1
        log.warning("El nodo ejecuta un programa distinto del configurado",
                    **{c: f"{v['nodo']} deberia ser {v['deberia']}"
                       for c, v in difieren.items()})
        await self._anotar("discrepancia", difieren)

        if not self.cfg.corregir:
            return

        try:
            await self.node_sync.enviar_programa(motivo="correccion por discrepancia")
            self.stats["correcciones"] += 1
            await self._anotar("corregido", {"campos": sorted(difieren)})
        except Exception as exc:
            log.warning("No se pudo corregir el programa", error=str(exc))

    # ── Historico ────────────────────────────────────────────────

    async def _archivar(self, estado: dict | None) -> None:
        ahora = time.monotonic()
        if ahora - self.ultimo_snapshot < self.cfg.snapshot_seconds:
            return
        self.ultimo_snapshot = ahora
        try:
            await self.local_db.guardar_snapshot(self.node_id, estado or {})
            self.stats["snapshots"] += 1
        except Exception as exc:
            log.warning("No se pudo guardar el snapshot", error=str(exc))

    async def _podar(self) -> None:
        ahora = time.monotonic()
        if ahora - self.ultima_poda < 6 * 3600:
            return
        self.ultima_poda = ahora
        try:
            n = await self.local_db.podar_historico(self.cfg.retention_days)
            if n:
                log.info("Historico podado", filas=n, retencion_dias=self.cfg.retention_days)
        except Exception as exc:
            log.warning("No se pudo podar el historico", error=str(exc))

    # ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        if not self.cfg.enabled:
            log.info("Reconciliador desactivado por configuracion")
            # No retornar: main.py espera con FIRST_COMPLETED y una tarea
            # que termina apaga el gateway entero.
            await asyncio.Event().wait()

        log.info("Reconciliador en marcha",
                 nodo=self.cfg.node_url,
                 cada_s=self.cfg.poll_seconds,
                 snapshot_s=self.cfg.snapshot_seconds,
                 corrige=self.cfg.corregir)

        while True:
            estado = await self._leer_estado()

            if estado:
                self.node_id = estado.get("id") or self.node_id

            await self._revisar_conectividad(estado)

            if estado:
                await self._revisar_programa(estado)

            await self._archivar(estado)
            await self._podar()

            await asyncio.sleep(self.cfg.poll_seconds)
