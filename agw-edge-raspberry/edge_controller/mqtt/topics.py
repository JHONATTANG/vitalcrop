"""
AGW MQTT Topics — Contrato canónico del firmware ESP32
=======================================================
Fuente de verdad: MCD §4.1 y iot-nodes/agw-hydro-node/include/config.h

⚠️ Estos topics DEBEN coincidir carácter a carácter con los #define del
firmware. El ESP32 está flasheado en hardware; si hay discrepancia el
gateway no recibe nada, y el fallo es silencioso.

Namespace:  cultivo/{ubicacion}/{especie}/{canal}
"""
from __future__ import annotations

# ─────────────────────────────────────────────────────────────────
# Prefijo del cultivo
# ─────────────────────────────────────────────────────────────────
BASE = "cultivo/indoor/hierbabuena"


class Topics:
    """Constantes de topics MQTT. Espejo de config.h del firmware."""

    # ── ESP32 → Raspberry (la Pi se suscribe) ────────────────────
    TELEMETRIA = f"{BASE}/telemetria"   # cada periodo_ms (default 5 min)
    ALERTA     = f"{BASE}/alerta"       # asíncrono, independiente del período
    STATUS     = f"{BASE}/status"       # heartbeat 60 s + LWT

    # ── Raspberry → ESP32 (la Pi publica) ────────────────────────
    CMD        = f"{BASE}/cmd"

    # ── Suscripción única que cubre los tres canales entrantes ───
    ALL        = f"{BASE}/#"

    # ── Estadísticas del broker (métricas para la Fase 6) ────────
    SYS_CLIENTS      = "$SYS/broker/clients/connected"
    SYS_MSG_RECEIVED = "$SYS/broker/messages/received"
    SYS_MSG_SENT     = "$SYS/broker/messages/sent"
    SYS_BYTES_RECV   = "$SYS/broker/load/bytes/received/1min"
    SYS_UPTIME       = "$SYS/broker/uptime"

    @staticmethod
    def for_crop(ubicacion: str, especie: str, canal: str) -> str:
        """
        Construye un topic para otro cultivo. El prototipo usa uno solo,
        pero el namespace está diseñado para escalar a N cultivos.
        """
        return f"cultivo/{ubicacion.lower()}/{especie.lower()}/{canal}"


# ─────────────────────────────────────────────────────────────────
# Comandos aceptados por el firmware (MCD §4.1)
# ─────────────────────────────────────────────────────────────────
class Commands:
    """Constructores de payload para el topic CMD."""

    @staticmethod
    def set_periodo(ms: int) -> dict:
        """Cambia el ritmo de telemetría. El firmware exige mínimo 5000 ms."""
        if ms < 5000:
            raise ValueError("El firmware rechaza períodos menores a 5000 ms")
        return {"cmd": "set_periodo", "valor": ms}

    @staticmethod
    def set_umbral(variable: str, minimo: float, maximo: float) -> dict:
        """Ajusta umbrales de alerta. Variables: temp, hum, hsuelo, ph."""
        if variable not in ("temp", "hum", "hsuelo", "ph"):
            raise ValueError(f"Variable desconocida para el firmware: {variable}")
        return {"cmd": "set_umbral", "variable": variable, "min": minimo, "max": maximo}

    @staticmethod
    def set_nocturno(activo: bool) -> dict:
        return {"cmd": "set_nocturno", "activo": activo}

    @staticmethod
    def set_riego(encendido: bool) -> dict:
        return {"cmd": "set_riego", "encendido": encendido}

    @staticmethod
    def get_status() -> dict:
        return {"cmd": "get_status"}

    @staticmethod
    def reset() -> dict:
        return {"cmd": "reset"}
