"""
AGW Edge Gateway — MQTT Message Handler
========================================
Enruta los tres canales entrantes del firmware ESP32 (MCD §4.1):

    cultivo/indoor/hierbabuena/telemetria  → normaliza, evalúa reglas,
                                             persiste y encola a la nube
    cultivo/indoor/hierbabuena/alerta      → deduplica y persiste
    cultivo/indoor/hierbabuena/status      → heartbeat y detección de LWT

Los tres flujos son independientes y concurrentes: las alertas NO respetan
el período de telemetría, así que no se puede asumir orden ni cadencia.
"""
from __future__ import annotations

import json
import time
from typing import Awaitable, Callable

import structlog

from mqtt.normalize import (
    alert_dedup_key,
    normalize_alert,
    normalize_status,
    normalize_telemetry,
)
from mqtt.topics import Topics

# Nombre explícito: si se dejara el automático sería "mqtt.message_handler",
# que cuelga del logger "mqtt" que aiomqtt fija en WARNING (ver utils/logger.py).
log = structlog.get_logger("agw.handler")

HandlerFn = Callable[[str, dict], Awaitable[None]]

# Ventana de deduplicación de alertas. El firmware republica cada 5 s;
# con 300 s solo pasa una notificación cada 5 min por (nodo,variable,nivel).
ALERT_DEDUP_WINDOW_S = 300


class MessageHandler:
    """Despacha mensajes MQTT por topic exacto."""

    def __init__(self, config, rules_engine, local_db, telemetry_syncer):
        self.config = config
        self.rules_engine = rules_engine
        self.local_db = local_db
        self.telemetry_syncer = telemetry_syncer
        self.gateway_id = config.device.gateway_id

        # Cache de deduplicación: clave → epoch del último envío
        self._alert_seen: dict[str, float] = {}

        # Contadores para las métricas de la Fase 6 (MCD §9)
        self.stats = {
            "telemetria_rx": 0,
            "alerta_rx": 0,
            "alerta_deduplicada": 0,
            "status_rx": 0,
            "lwt_rx": 0,
            "payload_invalido": 0,
            "sin_handler": 0,
        }

        self._handlers: dict[str, HandlerFn] = {
            Topics.TELEMETRIA: self._handle_telemetria,
            Topics.ALERTA:     self._handle_alerta,
            Topics.STATUS:     self._handle_status,
        }

    # ─────────────────────────────────────────────────────────────
    # Dispatcher
    # ─────────────────────────────────────────────────────────────

    async def handle(self, topic: str, payload: bytes) -> None:
        try:
            raw = json.loads(payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            # Un ESP32 reiniciándose puede emitir tramas truncadas.
            # Se cuenta como pérdida; no debe tumbar el gateway.
            self.stats["payload_invalido"] += 1
            log.error("Payload no es JSON valido", topic=topic, error=str(exc))
            return

        if not isinstance(raw, dict):
            self.stats["payload_invalido"] += 1
            log.error("Payload no es un objeto JSON", topic=topic)
            return

        # El ESP32 está suscrito a CMD; cuando la Pi publica ahí, el mensaje
        # vuelve por la suscripción comodín. Se ignora para no procesar
        # nuestros propios comandos como si fueran del nodo.
        if topic == Topics.CMD:
            return

        handler = self._handlers.get(topic)
        if handler is None:
            self.stats["sin_handler"] += 1
            log.warning("Topic sin handler", topic=topic)
            return

        try:
            await handler(topic, raw)
        except Exception as exc:
            log.error(
                "Error en handler",
                topic=topic,
                handler=handler.__name__,
                error=str(exc),
                exc_info=True,
            )

    # ─────────────────────────────────────────────────────────────
    # Telemetría
    # ─────────────────────────────────────────────────────────────

    async def _handle_telemetria(self, topic: str, raw: dict) -> None:
        data = normalize_telemetry(raw, self.gateway_id)
        self.stats["telemetria_rx"] += 1

        s = data["sensores"]
        log.info(
            "Telemetria",
            node=data["node_id"],
            temp=s.get("temp"),
            hum=s.get("hum"),
            hsuelo=s.get("hsuelo"),
            rssi=data.get("rssi"),
            periodo_ms=data.get("periodo_ms"),
        )

        # 1. Reglas locales primero: la autonomía del cultivo no debe
        #    esperar a la red. Aquí se decide riego sin tocar la nube.
        await self.rules_engine.evaluate(data)

        # 2. Persistir en el buffer local (resiliencia sin internet)
        await self.local_db.save_telemetry(data, device_type="HIDROPONIA")

        # 3. Encolar para la nube
        await self.telemetry_syncer.enqueue(data)

    # ─────────────────────────────────────────────────────────────
    # Alertas
    # ─────────────────────────────────────────────────────────────

    async def _handle_alerta(self, topic: str, raw: dict) -> None:
        alert = normalize_alert(raw, self.gateway_id)
        self.stats["alerta_rx"] += 1

        key = alert_dedup_key(alert)
        now = time.time()
        last = self._alert_seen.get(key, 0.0)

        if now - last < ALERT_DEDUP_WINDOW_S:
            self.stats["alerta_deduplicada"] += 1
            log.debug("Alerta deduplicada", key=key)
            return

        self._alert_seen[key] = now
        self._prune_alert_cache(now)

        duracion_min = (alert["duracion_ms"] or 0) // 60000
        log.warning(
            "ALERTA",
            nivel=alert["nivel"],
            variable=alert["variable"],
            valor=alert["valor"],
            rango=[alert["umbral_min"], alert["umbral_max"]],
            duracion_min=duracion_min,
            node=alert["node_id"],
        )

        await self.local_db.save_alert(
            {
                "rule_id": f"firmware:{alert['variable']}",
                "node_id": alert["node_id"],
                "alert_type": f"UMBRAL_{(alert['variable'] or '').upper()}",
                "severity": alert["nivel"],
                "message": (
                    f"{alert['variable']}={alert['valor']} fuera del rango "
                    f"[{alert['umbral_min']}, {alert['umbral_max']}] "
                    f"durante {duracion_min} min"
                ),
                "sensor_data": alert,
            }
        )

    def _prune_alert_cache(self, now: float) -> None:
        """Evita que el cache de deduplicación crezca sin límite."""
        if len(self._alert_seen) < 128:
            return
        cutoff = now - (ALERT_DEDUP_WINDOW_S * 2)
        self._alert_seen = {k: v for k, v in self._alert_seen.items() if v > cutoff}

    # ─────────────────────────────────────────────────────────────
    # Status / heartbeat / LWT
    # ─────────────────────────────────────────────────────────────

    async def _handle_status(self, topic: str, raw: dict) -> None:
        st = normalize_status(raw, self.gateway_id)
        self.stats["status_rx"] += 1

        if st["is_lwt"]:
            # Mosquitto publicó el Last Will: el nodo se cayó sin despedirse
            # (corte de luz, crash, pérdida de WiFi). Es el mecanismo de
            # detección de caída y alimenta la métrica de disponibilidad.
            self.stats["lwt_rx"] += 1
            log.error("NODO CAIDO (LWT)", node=st["node_id"])
        else:
            log.debug(
                "Heartbeat",
                node=st["node_id"],
                uptime_ms=st["uptime_ms"],
                fw=st["fw"],
            )

        await self.local_db.save_node_status(
            {
                "node_id": st["node_id"],
                "device_type": "HIDROPONIA",
                "status": "online" if st["online"] else "offline",
                "firmware_version": st["fw"],
                "rssi": None,
                "uptime_ms": st["uptime_ms"],
                "periodo_ms": st["periodo_ms"],
                "t_rx_iso": st["t_rx_iso"],
                "is_lwt": st["is_lwt"],
            }
        )
