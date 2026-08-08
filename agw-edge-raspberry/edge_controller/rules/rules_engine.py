"""
AGW Edge Gateway — Rules Engine
Evalúa reglas de negocio locales en tiempo real
"""
from __future__ import annotations

import json
import operator as op
import time
from typing import Any

import structlog

from rules.rule_loader import Rule, RuleAction, load_rules

log = structlog.get_logger()

# Mapa de operadores string → función de comparación
_OPERATORS: dict[str, Any] = {
    "<":  op.lt,
    "<=": op.le,
    ">":  op.gt,
    ">=": op.ge,
    "==": op.eq,
    "!=": op.ne,
}

# Un comando idéntico no se reenvía dentro de esta ventana. El nodo ya está
# en el estado pedido; repetirlo solo gasta radio y ensucia el log.
REENVIO_COMANDO_S = 300

# Una alerta idéntica no se repite dentro de esta ventana.
REENVIO_ALERTA_S = 300


def _resolve_sensor(data: dict, sensor: str):
    """
    Busca el valor de un sensor en el payload normalizado.

    El firmware anida las lecturas bajo `sensores` (MCD §4.1), así que se
    mira ahí primero. El fallback plano mantiene compatibilidad con
    payloads de prueba escritos a mano.
    """
    sensores = data.get("sensores")
    if isinstance(sensores, dict) and sensor in sensores:
        return sensores[sensor]
    return data.get(sensor)


class RulesEngine:
    """
    Evalúa todas las reglas cargadas contra un payload de telemetría.
    Las acciones se ejecutan sincrónicamente salvo mqtt_publish (inyectado vía callback).
    """

    def __init__(self, config):
        self.config = config
        self._rules: list[Rule] = []
        self._mqtt_publish_cb = None  # inyectado por MQTTClient

        # Última acción emitida por cada regla, para no repetirla.
        # Sin esto, una condición sostenida (p. ej. sustrato seco) republica
        # el mismo comando en CADA trama de telemetría: con período de 10 s
        # serían 360 comandos por hora al nodo, todos idénticos.
        self._ultima_accion: dict[str, tuple[str, float]] = {}
        self._ultima_alerta: dict[str, float] = {}

    def set_mqtt_publish_callback(self, cb) -> None:
        """Permite al MQTTClient inyectar la función de publicación."""
        self._mqtt_publish_cb = cb

    async def load_rules(self) -> None:
        """Carga reglas desde el archivo YAML configurado."""
        rules_file = self.config.rules.rules_file
        self._rules = load_rules(rules_file)
        log.info("Rules loaded", count=len(self._rules), file=rules_file)

    async def evaluate(self, data: dict) -> list[dict]:
        """
        Evalúa todas las reglas contra el payload de telemetría.
        Retorna lista de alertas generadas.
        """
        if not self.config.rules.enabled or not self._rules:
            return []

        device_type = str(data.get("device_type", "")).upper()
        alerts: list[dict] = []

        for rule in self._rules:
            # Filtrar por device_type. "*" aplica a cualquier nodo — es lo
            # habitual en el prototipo, que tiene un solo ESP32.
            if rule.device_type not in ("*", device_type):
                continue

            # Evaluar condición
            sensor_value = _resolve_sensor(data, rule.condition.sensor)
            if sensor_value is None:
                log.debug(
                    "Sensor not in payload",
                    rule_id=rule.id,
                    sensor=rule.condition.sensor,
                )
                continue

            compare_fn = _OPERATORS[rule.condition.operator]
            try:
                triggered = compare_fn(float(sensor_value), rule.condition.threshold)
            except (TypeError, ValueError):
                log.warning(
                    "Cannot compare sensor value",
                    rule_id=rule.id,
                    value=sensor_value,
                )
                continue

            if triggered:
                log.info(
                    "Rule triggered",
                    rule_id=rule.id,
                    rule_name=rule.name,
                    sensor=rule.condition.sensor,
                    value=sensor_value,
                    threshold=rule.condition.threshold,
                )
                rule_alerts = await self._execute_actions(rule, data)
                alerts.extend(rule_alerts)

        return alerts

    async def _execute_actions(self, rule: Rule, data: dict) -> list[dict]:
        alerts: list[dict] = []
        ahora = time.time()
        node_id = data.get("node_id")

        for action in rule.actions:
            if action.type == "alert":
                clave = f"{rule.id}|{node_id}"
                if ahora - self._ultima_alerta.get(clave, 0.0) < REENVIO_ALERTA_S:
                    continue
                self._ultima_alerta[clave] = ahora

                alerts.append({
                    "rule_id": rule.id,
                    "node_id": node_id,
                    "alert_type": action.type.upper(),
                    "severity": action.severity,
                    "message": action.message,
                    "triggered_at": int(ahora),
                    "sensor_data": {
                        rule.condition.sensor: _resolve_sensor(
                            data, rule.condition.sensor
                        )
                    },
                })
                log.warning(
                    "Alerta generada",
                    severity=action.severity,
                    message=action.message,
                    node_id=node_id,
                )

            elif action.type == "mqtt_publish" and self._mqtt_publish_cb:
                payload = dict(action.payload or {})

                # Deduplicar por contenido: si el comando es idéntico al último
                # y aún estamos dentro de la ventana, no se reenvía. El nodo ya
                # está en ese estado; insistir solo gasta radio y batería.
                firma = json.dumps(payload, sort_keys=True)
                clave = f"{rule.id}|{node_id}"
                previa, cuando = self._ultima_accion.get(clave, ("", 0.0))
                if firma == previa and (ahora - cuando) < REENVIO_COMANDO_S:
                    log.debug("Comando omitido (ya enviado)", rule_id=rule.id)
                    continue
                self._ultima_accion[clave] = (firma, ahora)

                payload["node_id"] = node_id
                payload["triggered_at"] = int(ahora)
                await self._mqtt_publish_cb(action.topic, payload)
                log.info(
                    "Comando enviado al nodo",
                    topic=action.topic,
                    rule_id=rule.id,
                    payload=payload,
                )

            elif action.type == "log":
                log.info(
                    "Regla disparada (solo log)",
                    rule_id=rule.id,
                    message=action.message,
                    node_id=node_id,
                )

        return alerts
