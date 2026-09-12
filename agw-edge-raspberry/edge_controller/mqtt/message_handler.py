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

import asyncio
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

# CICLO DE VIDA DE UNA ALERTA
#
# El firmware no distingue «empezó» de «sigue»: mientras la condición
# dure, reemite la misma alerta cada 5 s, y cuando deja de darse
# simplemente calla. El gateway sí distingue, y es lo que la nube y el
# panel necesitan: UN evento cuando se abre y UN evento cuando se
# cierra, subidos en el acto, en vez de una lectura cada 5 min de una
# tabla que casi nunca cambia.
#
# Una alerta se da por cerrada cuando el nodo lleva ALERTA_SILENCIO_S
# sin reemitirla: el firmware reemite cada 5 s, así que 90 s son
# dieciocho oportunidades perdidas, no una casualidad.
ALERTA_SILENCIO_S = 90


class MessageHandler:
    """Despacha mensajes MQTT por topic exacto."""

    def __init__(self, config, rules_engine, local_db, telemetry_syncer):
        self.config = config
        self.rules_engine = rules_engine
        self.local_db = local_db
        self.telemetry_syncer = telemetry_syncer
        self.gateway_id = config.device.gateway_id
        self.node_sync = None   # lo inyecta MQTTClient.set_node_sync()

        # Cache de deduplicación: clave → epoch del último envío
        self._alert_seen: dict[str, float] = {}
        # Alertas abiertas ahora mismo: clave → {abierta_en, ultima, n, alert}
        self._alertas_abiertas: dict[str, dict] = {}
        # Especie de cada nodo, aprendida del topic por el que publica.
        # Es lo que permite mandar cada orden al topic de su cultivo.
        self.especie_por_nodo: dict[str, str] = {}
        self.event_syncer = None   # lo inyecta MQTTClient.set_event_syncer()

        # Contadores para las métricas de la Fase 6 (MCD §9)
        self.stats = {
            "telemetria_rx": 0,
            "alerta_rx": 0,
            "alerta_deduplicada": 0,
            "status_rx": 0,
            "evento_rx": 0,
            "lwt_rx": 0,
            "payload_invalido": 0,
            "sin_handler": 0,
        }

        # Indexado por CANAL, no por topic completo. Con un solo cultivo
        # daba igual; con dos, comparar el topic entero obligaría a una
        # entrada por cultivo y por canal, y añadir un tercero sería
        # tocar este diccionario otra vez.
        self._handlers: dict[str, HandlerFn] = {
            "telemetria": self._handle_telemetria,
            "alerta":     self._handle_alerta,
            "status":     self._handle_status,
            "evento":     self._handle_evento,
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
        canal = Topics.canal_de(topic)

        # El ESP32 está suscrito a CMD; cuando la Pi publica ahí, el mensaje
        # vuelve por la suscripción comodín. Se ignora para no procesar
        # nuestros propios comandos como si fueran del nodo.
        if canal == "cmd":
            return

        handler = self._handlers.get(canal)
        if handler is None:
            self.stats["sin_handler"] += 1
            log.warning("Canal sin handler", topic=topic, canal=canal)
            return

        nodo = raw.get("id")
        if isinstance(nodo, str) and nodo:
            self.especie_por_nodo[nodo] = Topics.especie_de(topic)

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
        await self._seguir_alerta(key, alert, now)

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

    def especie_de(self, sensor_id: str) -> str | None:
        return self.especie_por_nodo.get(sensor_id)

    async def _seguir_alerta(self, key: str, alert: dict, now: float) -> None:
        """Abre la alerta la primera vez; después solo anota que sigue."""
        abierta = self._alertas_abiertas.get(key)
        if abierta:
            abierta["ultima"] = now
            abierta["n"] += 1
            abierta["alert"] = alert
            return
        self._alertas_abiertas[key] = {"abierta_en": now, "ultima": now, "n": 1, "alert": alert}
        await self._registrar_alerta(alert, "abierta", {
            "nivel": alert["nivel"], "valor": alert["valor"],
            "umbral_min": alert["umbral_min"], "umbral_max": alert["umbral_max"],
            "duracion_previa_s": (alert.get("duracion_ms") or 0) // 1000,
        })

    async def vigilar_alertas(self) -> None:
        """
        Tarea periódica: cierra las alertas que el nodo dejó de reemitir.

        Corre cada 15 s. No hay otra forma de saber que una condición
        cesó: el firmware no lo anuncia, solo deja de repetirla.
        """
        while True:
            await asyncio.sleep(15)
            now = time.time()
            for key, a in list(self._alertas_abiertas.items()):
                if now - a["ultima"] < ALERTA_SILENCIO_S:
                    continue
                del self._alertas_abiertas[key]
                await self._registrar_alerta(a["alert"], "resuelta", {
                    "nivel": a["alert"]["nivel"],
                    "duracion_s": int(a["ultima"] - a["abierta_en"]),
                    "reemisiones": a["n"],
                })

    async def _registrar_alerta(self, alert: dict, fase: str, detalle: dict) -> None:
        """Evento `alerta_<variable>_<fase>` en el SQLite, y a la nube en el acto."""
        variable = (alert.get("variable") or "desconocida").lower()
        node_id = alert.get("node_id") or "desconocido"
        try:
            await self.local_db.registrar_evento(node_id, f"alerta_{variable}_{fase}", detalle)
        except Exception as exc:
            log.warning("No se pudo registrar la alerta como evento", error=str(exc))
            return
        log.warning(f"Alerta {fase}", variable=variable, nivel=detalle.get("nivel"), node=node_id,
                    **{k: v for k, v in detalle.items() if k != "nivel"})
        if self.event_syncer is not None:
            self.event_syncer.despertar()

    def _prune_alert_cache(self, now: float) -> None:
        """Evita que el cache de deduplicación crezca sin límite."""
        if len(self._alert_seen) < 128:
            return
        cutoff = now - (ALERT_DEDUP_WINDOW_S * 2)
        self._alert_seen = {k: v for k, v in self._alert_seen.items() if v > cutoff}

    # ─────────────────────────────────────────────────────────────
    # Eventos de riego
    # ─────────────────────────────────────────────────────────────

    async def _handle_evento(self, topic: str, raw: dict) -> None:
        """
        Inicio y fin de un ciclo de riego, tal como los publica el nodo.

        Se guardan en `node_events` porque son la única fuente fiable de
        cuánto se ha regado: la telemetría va a 5 minutos y un ciclo
        dura 3, así que muestrear no basta — hay ciclos que no caen en
        ninguna muestra. Hasta ahora, saber si la bomba respetaba el
        programa exigía cronometrarla desde fuera con un script.
        """
        self.stats["evento_rx"] += 1

        node_id  = raw.get("id") or "desconocido"
        circuito = raw.get("circuito", "?")
        fase     = raw.get("fase", "?")
        segundos = raw.get("segundos")

        if fase == "fin":
            log.info("Ciclo de riego terminado", circuito=circuito,
                     modo=raw.get("modo"), segundos=segundos)
        else:
            log.info("Ciclo de riego iniciado", circuito=circuito,
                     modo=raw.get("modo"), programado_s=segundos)

        try:
            await self.local_db.registrar_evento(
                node_id, f"riego_{circuito}_{fase}", raw)
        except Exception as exc:
            log.warning("No se pudo registrar el evento de riego", error=str(exc))

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

        # Avisar al sincronizador: es donde se detecta que el nodo
        # perdio la hora y se le repone antes de que el fotoperiodo
        # empiece a fallar en silencio.
        if self.node_sync is not None:
            try:
                await self.node_sync.al_recibir_status(
                    {**raw, **st}, Topics.especie_de(topic))
            except Exception as exc:
                log.warning("Fallo al notificar a node_sync", error=str(exc))

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
