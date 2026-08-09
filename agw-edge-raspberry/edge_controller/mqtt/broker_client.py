"""
AGW Edge Gateway — MQTT Broker Client
asyncio-mqtt wrapper con reconexión automática y backoff exponencial
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import aiomqtt
import structlog

from mqtt.topics import Topics
from mqtt.message_handler import MessageHandler

# Nombre explícito para no heredar el nivel WARNING que aiomqtt fija sobre
# el logger "mqtt" (ver utils/logger.py).
log = structlog.get_logger("agw.broker")


class MQTTClient:
    """
    Wrapper about asyncio-mqtt que:
    - Se reconecta automáticamente con backoff exponencial
    - Enruta mensajes a MessageHandler
    - Expone método publish() thread-safe
    """

    def __init__(self, config, rules_engine, local_db, telemetry_syncer):
        self.config = config
        self._handler = MessageHandler(config, rules_engine, local_db, telemetry_syncer)
        self._client: aiomqtt.Client | None = None
        self._publish_queue: asyncio.Queue[tuple[str, bytes]] = asyncio.Queue()
        self._connected = asyncio.Event()

    # ─────────────────────────────────────────────────────────────
    # Pública API
    # ─────────────────────────────────────────────────────────────

    async def publish(self, topic: str, payload: Any, qos: int = 1) -> None:
        """Encola un mensaje para publicar. No bloquea aunque no haya conexión."""
        if isinstance(payload, (dict, list)):
            payload = json.dumps(payload).encode()
        elif isinstance(payload, str):
            payload = payload.encode()
        await self._publish_queue.put((topic, payload))

    def set_node_sync(self, node_sync) -> None:
        """Inyecta el sincronizador para que el handler pueda avisarle."""
        self._handler.node_sync = node_sync

    def is_connected(self) -> bool:
        return self._connected.is_set()

    # ─────────────────────────────────────────────────────────────
    # Main run loop
    # ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        cfg = self.config.mqtt
        attempt = 0

        while True:
            try:
                delay = min(
                    cfg.reconnect_interval * (2 ** attempt),
                    cfg.max_reconnect_delay,
                )
                if attempt > 0:
                    log.info("MQTT reconnecting", attempt=attempt, delay_seconds=delay)
                    await asyncio.sleep(delay)

                async with aiomqtt.Client(
                    hostname=cfg.broker_host,
                    port=cfg.broker_port,
                    username=cfg.username if cfg.username else None,
                    password=cfg.password if cfg.password else None,
                    keepalive=cfg.keepalive,
                    identifier=f"edge-controller-{self.config.device.gateway_id}",
                ) as client:
                    self._client = client
                    self._connected.set()
                    attempt = 0
                    log.info(
                        "MQTT connected",
                        host=cfg.broker_host,
                        port=cfg.broker_port,
                    )

                    # Suscribir al árbol completo del cultivo: telemetria,
                    # alerta y status en una sola suscripción (MCD §4.1).
                    # QoS 1 porque el proyecto compromete "at least once".
                    await client.subscribe(Topics.ALL, qos=1)
                    log.info("MQTT subscribed", pattern=Topics.ALL)

                    # Correr listener y publisher concurrentemente
                    await asyncio.gather(
                        self._message_loop(client),
                        self._publish_loop(client),
                    )

            except aiomqtt.MqttError as exc:
                self._connected.clear()
                self._client = None
                attempt += 1
                log.warning(
                    "MQTT connection lost",
                    error=str(exc),
                    attempt=attempt,
                )
            except asyncio.CancelledError:
                log.info("MQTT client cancelled")
                raise

    # ─────────────────────────────────────────────────────────────
    # Internos
    # ─────────────────────────────────────────────────────────────

    async def _message_loop(self, client: aiomqtt.Client) -> None:
        """Escucha mensajes entrantes y los despacha al handler."""
        async for message in client.messages:
            topic = str(message.topic)
            payload = message.payload
            log.debug("MQTT message received", topic=topic, bytes=len(payload))
            # Despachar sin bloquear el loop de mensajes
            asyncio.create_task(
                self._handler.handle(topic, payload),
                name=f"handle-{topic}",
            )

    async def _publish_loop(self, client: aiomqtt.Client) -> None:
        """Publica mensajes desde la cola."""
        while True:
            topic, payload = await self._publish_queue.get()
            try:
                await client.publish(topic, payload, qos=1)
                log.debug("MQTT published", topic=topic, bytes=len(payload))
            except aiomqtt.MqttError as exc:
                log.error("MQTT publish failed", topic=topic, error=str(exc))
                # Re-encolar para reintentar en próxima conexión
                await self._publish_queue.put((topic, payload))
                raise  # Propagar para reiniciar la conexión
            finally:
                self._publish_queue.task_done()
