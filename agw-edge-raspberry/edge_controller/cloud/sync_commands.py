"""
AGW Edge Gateway — Órdenes desde la nube
=========================================
Trae órdenes de la Cloud API y las republica en el topic de comandos
del nodo al que van dirigidas.

Es el camino DOWNSTREAM del anteproyecto: *"tendrá la capacidad de
recibir órdenes revisando una tabla de órdenes"*.

CÓMO SE ENTERA DE QUE HAY ÓRDENES

Antes preguntaba cada 5 segundos, y la respuesta era «no» 17.000 veces
al día. Eso mantenía la base de datos de la nube despierta el 100 % del
tiempo para nada: la orden llegaba en 5 s porque se preguntaba cada 5 s.

Ahora la nube avisa. El gateway expone una URL pública (Tailscale
Funnel) y la anuncia a la API al arrancar; cuando el panel encola una
orden, la API hace un POST firmado a esa URL y este módulo sale a
buscar las pendientes en el acto. La orden llega en lo que tarda el
POST, menos que antes.

El sondeo no desaparece: queda como red de seguridad cada
`poll_interval_seconds` (10 min), por si un aviso se pierde —Funnel
caído, la Pi reiniciándose justo entonces—. También se sondea al
arrancar y en cuanto vuelve la conectividad tras un corte. Un aviso
duplicado no duplica nada: la fuente de verdad es la tabla, y lo que
ya se marcó como entregado no vuelve a salir.

CONTRATO CON LA NUBE

La columna `comando` (JSONB) guarda el payload **tal cual lo entiende
el firmware**; se republica sin traducir. El traductor de la forma
antigua (`{"tipo": ...}`) se conserva como respaldo.

A QUÉ NODO

Cada orden lleva `sensor_id`. Se publica en el topic del cultivo de ese
nodo —`cultivo/indoor/{especie}/cmd`— y no en el de hierbabuena para
todos, que es lo que hacía la versión anterior: una orden para la
lechuga iba al nodo de hierbabuena y nadie lo notaba porque el ack
llegaba igual. La especie de cada nodo la aprende el MessageHandler de
los topics por los que publica; hasta que un nodo haya publicado algo,
se usa la de la configuración.
"""
from __future__ import annotations

import asyncio
import time
from typing import Callable

import structlog

from cloud.cloud_client import CloudClient
from mqtt.topics import Commands, Topics

log = structlog.get_logger()


class CommandPoller:
    """Órdenes pendientes en la Cloud API: por aviso y por sondeo de respaldo."""

    def __init__(self, config, mqtt_client, especie_de: Callable[[str], str | None] | None = None,
                 ritmo=None):
        self.config = config
        self.mqtt_client = mqtt_client
        self.ritmo = ritmo
        self._cloud = CloudClient(config)
        self._poll_interval = config.cloud.poll_interval_seconds
        self._enabled = getattr(config.cloud, "enabled", True)
        self._endpoint = getattr(config.cloud, "commands_endpoint", "") or ""
        self._especie_de = especie_de or (lambda _sid: None)

        # Lo que dispara una vuelta fuera del ciclo: el webhook, la vuelta
        # de la conectividad, o quien quiera.
        self._despertador = asyncio.Event()
        self._ultimo_aviso: float = 0.0
        self._motivo = "arranque"

        self.stats = {"recibidos": 0, "despachados": 0, "no_traducibles": 0,
                      "avisos": 0, "sondeos": 0}

    # ─────────────────────────────────────────────────────────────

    def despertar(self, motivo: str = "aviso") -> None:
        """Pide una vuelta inmediata. Seguro de llamar desde cualquier tarea."""
        if motivo == "aviso":
            self.stats["avisos"] += 1
            self._ultimo_aviso = time.time()
        self._motivo = motivo
        self._despertador.set()

    async def run(self) -> None:
        if not self._enabled or not self._endpoint:
            log.info("Command poller inactivo (sin nube o sin endpoint)")
            while True:
                await asyncio.sleep(3600)

        log.info(f"Ordenes: escuchando avisos, sondeo de respaldo cada {self._poll_interval}s",
                 endpoint=self._endpoint)
        consecutive_errors = 0
        # Primera vuelta nada más arrancar: lo encolado mientras el
        # gateway estaba apagado no debe esperar diez minutos.
        self._despertador.set()

        while True:
            # Espera al aviso o al vencimiento del respaldo, lo que antes
            # llegue. El evento se limpia justo antes de la vuelta para no
            # perder un aviso que entre mientras se está sondeando: si
            # llega uno durante el sondeo, la siguiente espera sale sola.
            # El respaldo va al ritmo común: 30 min dormido, 2 min con
            # alguien en el panel. Así la base de la nube no recibe una
            # visita suelta cada 10 min que le impida dormir. El aviso
            # por webhook sigue despertando al instante.
            timeout = self.ritmo.intervalo if self.ritmo is not None else self._poll_interval
            try:
                await asyncio.wait_for(self._despertador.wait(), timeout=timeout)
                por_aviso, motivo = True, self._motivo
            except asyncio.TimeoutError:
                por_aviso, motivo = False, "respaldo"
            self._despertador.clear()

            try:
                dispatched = await self._poll()
                consecutive_errors = 0
                self.stats["sondeos"] += 1
                if dispatched or por_aviso:
                    log.info("Ordenes despachadas", count=dispatched, por=motivo)
            except asyncio.CancelledError:
                raise
            except _EndpointMissing:
                log.warning("El endpoint de ordenes no existe aun — poller detenido",
                            endpoint=self._endpoint)
                while True:
                    await asyncio.sleep(3600)
            except Exception as exc:
                consecutive_errors += 1
                # Reintento con retroceso, acotado: sin nube no tiene sentido
                # insistir cada pocos segundos, y con ella el aviso despierta.
                wait = min(5 * (2 ** consecutive_errors), self._poll_interval)
                log.warning("Poll de ordenes fallido", error=str(exc),
                            consecutive=consecutive_errors, retry_in=wait)
                try:
                    await asyncio.wait_for(self._despertador.wait(), timeout=wait)
                except asyncio.TimeoutError:
                    pass

    # ─────────────────────────────────────────────────────────────

    async def _poll(self) -> int:
        try:
            resp = await self._cloud.get(self._endpoint, retries=0)
        except Exception as exc:
            if "404" in str(exc):
                raise _EndpointMissing from exc
            raise

        body = resp.json()
        orders = (body.get("comandos") or body.get("data")
                  or body.get("ordenes") or [])
        for order in orders:
            self.stats["recibidos"] += 1
            await self._dispatch(order)
        return len(orders)

    async def _dispatch(self, order: dict) -> None:
        """Publica la orden en el topic de comandos del nodo al que va."""
        payload = order.get("comando")
        if not isinstance(payload, dict):
            payload = self._to_firmware_command(order)
        if payload is None:
            self.stats["no_traducibles"] += 1
            log.warning("Orden no traducible al contrato del firmware", order=order)
            return

        sensor_id = order.get("sensor_id") or ""
        especie = self._especie_de(sensor_id)
        topic = Topics.cmd_para(especie) if especie else Topics.CMD

        await self.mqtt_client.publish(topic, payload)
        self.stats["despachados"] += 1
        log.info("Comando enviado al nodo", topic=topic, sensor_id=sensor_id, payload=payload)

        order_id = order.get("id")
        if order_id:
            await self._confirm(order_id)

    @staticmethod
    def _to_firmware_command(order: dict) -> dict | None:
        """Orden con la forma antigua (`tipo`/`valor`) → payload del firmware."""
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
                return Commands.set_umbral(order["variable"], float(order["min"]), float(order["max"]))
        except (TypeError, ValueError, KeyError) as exc:
            log.warning("Orden con parametros invalidos", tipo=tipo, error=str(exc))
            return None
        return None

    async def _confirm(self, order_id) -> None:
        """Acuse en `/commands/{id}/ack`. No es crítico si falla: el nodo ya la recibió."""
        base = self._endpoint.rstrip("/").rsplit("/", 1)[0]
        try:
            await self._cloud.post(f"{base}/{order_id}/ack", retries=0)
        except Exception as exc:
            log.debug("Confirmacion de orden fallida", order_id=order_id, error=str(exc))

    async def close(self) -> None:
        await self._cloud.close()


class _EndpointMissing(Exception):
    """El endpoint de órdenes no está implementado en la Cloud API."""
