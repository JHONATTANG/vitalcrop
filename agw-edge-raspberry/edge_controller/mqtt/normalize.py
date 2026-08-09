"""
AGW Edge Gateway — Normalización de payloads
=============================================
Traduce entre los tres vocabularios del sistema, que NO coinciden:

  1. FIRMWARE (ESP32)   → id, sensores{temp,hum,hsuelo,ph}, uptime, rssi
  2. INTERNO (esta Pi)  → node_id, sensores{...}, t_rx, gateway_id
  3. NUBE (Cloud API)   → node_id = GATEWAY, sensor_id = ESP32,
                          temperatura, humedad_ambiente, humedad_suelo, ph

⚠️ La trampa del sistema (MCD §4.2): en la nube `node_id` identifica al
GATEWAY (la Raspberry) y `sensor_id` al NODO ESP32. En el firmware, `id`
es el ESP32. Esta traducción ocurre aquí y en ningún otro sitio.

⚠️ El ESP32 no tiene reloj real: envía `uptime` en milisegundos desde el
arranque (millis()). El timestamp UTC lo estampa la Raspberry al recibir.
Esa marca (`t_rx`) es además la base para medir latencia en la Fase 6.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

# Variables de sensor que el firmware puede enviar.
#   temp/hum   HDC1080
#   hsuelo     reflejo numérico del detector de nivel (0 o 100)
#   agua       booleano del detector de nivel — es el dato real
#   ec / tds   conductividad en µS/cm y sólidos disueltos en ppm
#   ph         retirado del alcance (MCD §6.4), se conserva la ruta
SENSOR_KEYS = ("temp", "hum", "hsuelo", "agua", "ec", "tds", "ph")

# Sensores booleanos: no deben pasar por float() ni por los rangos
BOOL_KEYS = ("agua",)

# Mapeo sensor interno → columna de la nube
CLOUD_SENSOR_MAP = {
    "temp":   "temperatura",
    "hum":    "humedad_ambiente",
    "hsuelo": "humedad_suelo",
    "ph":     "ph",
}

# Rangos válidos que impone la Cloud API (CHECK constraints en Neon).
# Filtrar aquí evita un 500 del backend por un sensor desconectado que
# devuelve un valor absurdo.
CLOUD_RANGES = {
    "temperatura":      (-40.0, 100.0),
    "humedad_ambiente": (0.0, 100.0),
    "humedad_suelo":    (0.0, 100.0),
    "ph":               (0.0, 14.0),
}


def _now() -> tuple[float, str]:
    """Instante de recepción: epoch float para cálculos, ISO-8601 para logs."""
    ts = time.time()
    return ts, datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def normalize_telemetry(raw: dict, gateway_id: str) -> dict:
    """
    Payload de `cultivo/indoor/hierbabuena/telemetria` → formato interno.

    Entrada (firmware):
        {"id","fw","uptime","rssi","periodo_ms","sensores":{...}}
    """
    t_rx, t_rx_iso = _now()
    sensores_in = raw.get("sensores") or {}

    sensores: dict[str, Any] = {}
    for key in SENSOR_KEYS:
        value = sensores_in.get(key)
        if value is None:
            sensores[key] = None
        elif key in BOOL_KEYS:
            sensores[key] = bool(value)
        elif isinstance(value, bool):
            # Un booleano llegando a un campo numérico es un error de
            # contrato; mejor descartarlo que convertirlo en 0.0 y que
            # dispare reglas de "valor bajo".
            sensores[key] = None
        elif isinstance(value, (int, float)):
            sensores[key] = float(value)
        else:
            sensores[key] = None

    return {
        "kind":        "telemetria",
        "gateway_id":  gateway_id,
        "node_id":     raw.get("id") or "desconocido",
        "fw":          raw.get("fw"),
        "uptime_ms":   raw.get("uptime"),
        "rssi":        raw.get("rssi"),
        "periodo_ms":  raw.get("periodo_ms"),
        "sensores":    sensores,
        "t_rx":        t_rx,
        "t_rx_iso":    t_rx_iso,
    }


def normalize_alert(raw: dict, gateway_id: str) -> dict:
    """
    Payload de `.../alerta` → formato interno.

    Entrada (firmware):
        {"id","uptime","variable","valor","umbral_min","umbral_max",
         "duracion_ms","nivel"}
    """
    t_rx, t_rx_iso = _now()
    return {
        "kind":        "alerta",
        "gateway_id":  gateway_id,
        "node_id":     raw.get("id") or "desconocido",
        "uptime_ms":   raw.get("uptime"),
        "variable":    raw.get("variable"),
        "valor":       raw.get("valor"),
        "umbral_min":  raw.get("umbral_min"),
        "umbral_max":  raw.get("umbral_max"),
        "duracion_ms": raw.get("duracion_ms"),
        "nivel":       raw.get("nivel"),
        "t_rx":        t_rx,
        "t_rx_iso":    t_rx_iso,
    }


def normalize_status(raw: dict, gateway_id: str) -> dict:
    """
    Payload de `.../status` → formato interno.

    Dos formas posibles:
      · heartbeat  {"id","online","uptime","periodo","fw"}
      · LWT        {"id","online":false}   ← lo publica Mosquitto, no el ESP32
    """
    t_rx, t_rx_iso = _now()
    online = raw.get("online", True)
    # El LWT solo trae id y online:false — se distingue por la ausencia de uptime
    is_lwt = online is False and "uptime" not in raw

    return {
        "kind":       "status",
        "gateway_id": gateway_id,
        "node_id":    raw.get("id") or "desconocido",
        "online":     bool(online),
        "is_lwt":     is_lwt,
        "uptime_ms":  raw.get("uptime"),
        "periodo_ms": raw.get("periodo"),
        "fw":         raw.get("fw"),
        "t_rx":       t_rx,
        "t_rx_iso":   t_rx_iso,
    }


def to_cloud_payload(
    telemetry: dict,
    estado_actuadores: str | None = None,
) -> dict:
    """
    Formato interno → body de `POST /api/telemetria`.

    Aquí ocurre la inversión de nombres:
        node_id (nube)   ← gateway_id (Raspberry)
        sensor_id (nube) ← node_id    (ESP32)
    """
    body: dict[str, Any] = {
        "node_id":   telemetry["gateway_id"],
        "sensor_id": telemetry["node_id"],
    }

    for internal_key, cloud_key in CLOUD_SENSOR_MAP.items():
        value = telemetry.get("sensores", {}).get(internal_key)
        if value is None:
            continue
        low, high = CLOUD_RANGES[cloud_key]
        if low <= value <= high:
            body[cloud_key] = round(value, 2)
        # Fuera de rango → se omite. La API lo rechazaría con 422/500.

    if estado_actuadores:
        # La columna es VARCHAR(255) en Neon
        body["estado_actuadores"] = estado_actuadores[:255]

    return body


def alert_dedup_key(alert: dict) -> str:
    """
    Clave de deduplicación de alertas.

    El firmware republica la alerta en CADA ciclo de 5 s mientras la variable
    siga fuera de rango (MCD §4.1, regla 3). Sin deduplicar por
    (nodo, variable, nivel) se generarían ~12 notificaciones por minuto.
    """
    return f"{alert.get('node_id')}|{alert.get('variable')}|{alert.get('nivel')}"
