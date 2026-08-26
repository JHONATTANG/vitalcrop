"""
AGW Edge Gateway — Command Poller
==================================
Trae órdenes desde la nube y las traduce a comandos MQTT para el ESP32.

Es el camino DOWNSTREAM del anteproyecto: *"tendrá la capacidad de recibir
órdenes revisando una tabla de órdenes"*.

CONTRATO CON LA NUBE

La tabla `comandos` guarda en la columna `comando` (JSONB) el payload
**tal cual lo entiende el firmware**. Esa decisión se tomó en la
migración 004 y es la que hace que este módulo sea corto: no hay que
traducir nada, se republica el JSON en el topic de comandos y ya.

Traducir aquí sería además una limitación real. El traductor que había
antes conocía seis comandos; el nodo entiende más de veinte, y los que
de verdad se usan a diario —`set_programa`, `llenar_tierra`, `medir_ec`,
`luz`— no estaban entre los seis. Se conserva como respaldo para
órdenes con la forma antigua (`{"tipo": ...}`), no como camino normal.

Si la API responde 404 el poller se detiene tras avisar una vez, en vez
de generar ruido cada 5 segundos durante días.
"""
from __future__ import annotations

import asyncio

import structlog

from cloud.cloud_client import CloudClient
from mqtt.topics import Commands, Topics

log = structlog.get_logger()


class CommandPoller:
    """Polling de órdenes pendientes en la Cloud API."""

    def __init__(self, config, mqtt_client):
        self.config = config
        self.mqtt_client = mqtt_client
        self._cloud = CloudClient(config)
        self._poll_interval = config.cloud.poll_interval_seconds
        self._enabled = getattr(config.cloud, "enabled", True)
        self._endpoint = getattr(config.cloud, "commands_endpoint", "") or ""

        self.stats = {"recibidos": 0, "despachados": 0, "no_traducibles": 0}

    async def run(self) -> None:
        if not self._enabled or not self._endpoint:
            log.info("Command poller inactivo (sin nube o sin endpoint)")
            while True:
                await asyncio.sleep(3600)

        log.info(
            "Command poller iniciado",
            endpoint=self._endpoint,
            interval=self._poll_interval,
        )
        consecutive_errors = 0

        while True:
            try:
                dispatched = await self._poll()
                consecutive_errors = 0
                if dispatched:
                    log.info("Ordenes despachadas", count=dispatched)
            except asyncio.CancelledError:
                raise
            except _EndpointMissing:
                # El endpoint no está construido todavía. Detenerse en
                # silencio es correcto: no es un fallo, es una fase pendiente.
                log.warning(
                    "El endpoint de ordenes no existe aun — poller detenido",
                    endpoint=self._endpoint,
                )
                while True:
                    await asyncio.sleep(3600)
            except Exception as exc:
                consecutive_errors += 1
                wait = min(self._poll_interval * (2 ** consecutive_errors), 60)
                log.warning(
                    "Poll de ordenes fallido",
                    error=str(exc),
                    consecutive=consecutive_errors,
                    retry_in=wait,
                )
                await asyncio.sleep(wait)
                continue

            await asyncio.sleep(self._poll_interval)

    # ─────────────────────────────────────────────────────────────

    async def _poll(self) -> int:
        try:
            resp = await self._cloud.get(self._endpoint, retries=0)
        except Exception as exc:
            if "404" in str(exc):
                raise _EndpointMissing from exc
            raise

        body = resp.json()
        # "comandos" es la clave que devuelve /api/iot/commands/pending.
        # Las otras dos son formas anteriores del contrato; se aceptan
        # para que un gateway viejo contra una API nueva —o al revés—
        # no se quede mudo sin decir por qué.
        orders = (body.get("comandos") or body.get("data")
                  or body.get("ordenes") or [])
        for order in orders:
            self.stats["recibidos"] += 1
            await self._dispatch(order)
        return len(orders)

    async def _dispatch(self, order: dict) -> None:
        """Traduce la orden y la publica en el topic de comandos del nodo."""
        payload = order.get("comando")
        if not isinstance(payload, dict):
            # Forma antigua: la orden venía descrita por campos sueltos.
            payload = self._to_firmware_command(order)
        if payload is None:
            self.stats["no_traducibles"] += 1
            log.warning("Orden no traducible al contrato del firmware", order=order)
            return

        # Un solo topic de comandos: el ESP32 está suscrito permanentemente
        # a cultivo/indoor/hierbabuena/cmd (MCD §4.1).
        await self.mqtt_client.publish(Topics.CMD, payload)
        self.stats["despachados"] += 1
        log.info("Comando enviado al nodo", topic=Topics.CMD, payload=payload)

        order_id = order.get("id")
        if order_id:
            await self._confirm(order_id)

    @staticmethod
    def _to_firmware_command(order: dict) -> dict | None:
        """
        Orden de la nube → payload del contrato del firmware.

        Acepta tanto el nombre corto (`set_riego`) como descripciones de alto
        nivel del anteproyecto (`subir periodos de riego`).
        """
        tipo = (order.get("tipo") or order.get("cmd") or order.get("action") or "").strip()
        valor = order.get("valor", order.get("value"))

        try:
            if tipo == "set_periodo":
                return Commands.set_periodo(int(valor))
            if tipo == "set_riego":
                return Commands.set_riego(bool(valor))
            if tipo == "set_nocturno":
                return Commands.set_nocturno(bool(valor))
            if tipo == "get_status":
                return Commands.get_status()
            if tipo == "reset":
                return Commands.reset()
            if tipo == "set_umbral":
                return Commands.set_umbral(
                    order["variable"], float(order["min"]), float(order["max"])
                )
        except (TypeError, ValueError, KeyError) as exc:
            log.warning("Orden con parametros invalidos", tipo=tipo, error=str(exc))
            return None

        return None

    async def _confirm(self, order_id) -> None:
        """
        Marca la orden como entregada.

        El acuse cuelga de `/commands/{id}/ack`, no del endpoint de
        pendientes: se deriva quitando el último segmento. Antes se
        hacía PATCH sobre `/pending/{id}`, una ruta que no existe, así
        que toda orden entregada seguía figurando como pendiente y se
        reenviaba al nodo en cada vuelta del poller.

        No es crítico si falla: el nodo ya la recibió.
        """
        base = self._endpoint.rstrip("/").rsplit("/", 1)[0]
        try:
            await self._cloud.post(
                f"{base}/{order_id}/ack",
                retries=0,
            )
        except Exception as exc:
            log.debug("Confirmacion de orden fallida", order_id=order_id,
                      error=str(exc))

    async def close(self) -> None:
        await self._cloud.close()


class _EndpointMissing(Exception):
    """El endpoint de órdenes no está implementado en la Cloud API."""
