"""
AGW Edge Gateway — Configuration Loader
Carga config.yaml y lo expone como dataclasses validados con Pydantic
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


# ─────────────────────────────────────────────────────────────────
# Sub-modelos
# ─────────────────────────────────────────────────────────────────

class DeviceConfig(BaseModel):
    gateway_id: str
    location: str
    firmware_version: str = "1.0.0"


class MQTTConfig(BaseModel):
    # Puerto 1883: el mismo que MQTT_PORT del firmware ESP32.
    broker_host: str = "127.0.0.1"
    broker_port: int = 1883
    username: str = ""
    password: str = ""
    keepalive: int = 60
    qos: int = 1
    reconnect_interval: int = 5
    max_reconnect_delay: int = 60


class CloudConfig(BaseModel):
    # enabled=False → todo se acumula en el buffer local sin tocar la red.
    enabled: bool = True
    api_base_url: str
    api_key: str
    telemetry_endpoint: str = "/api/telemetria"
    health_endpoint: str = "/api/health"
    commands_endpoint: str = "/api/commands/pending"
    poll_interval_seconds: int = 5
    push_timeout_seconds: int = 10
    retry_max: int = 3
    batch_size: int = 50


class StorageConfig(BaseModel):
    db_path: str = "/var/lib/agw/buffer.db"
    max_buffered_records: int = 50000


class RulesConfig(BaseModel):
    enabled: bool = True
    rules_file: str = "./rules/rules.yaml"


class HealthConfig(BaseModel):
    enabled: bool = True
    host: str = "0.0.0.0"
    port: int = 8080


class ProgramaConfig(BaseModel):
    """
    Programa de cultivo que el gateway empuja al nodo.

    Es la FUENTE DE VERDAD: el ESP32 guarda estos valores en NVS y los
    ejecuta aunque la Pi desaparezca, pero cada vez que el gateway
    arranca —o repone la hora de un nodo en degradado— vuelve a
    enviarlos. Cambiar el programa solo en el nodo dura hasta el
    siguiente reinicio del gateway; el cambio duradero se hace aquí.

    Los límites son los mismos que valida el firmware (config.h).
    """
    hora_luz_on: int = Field(6, ge=0, le=23)
    hora_luz_off: int = Field(20, ge=0, le=23)
    hidro_riego_dia_s: int = Field(900, ge=10, le=21600)
    hidro_descanso_dia_s: int = Field(900, ge=10, le=86400)
    hidro_riego_noche_s: int = Field(600, ge=10, le=21600)
    hidro_descanso_noche_s: int = Field(7200, ge=10, le=86400)
    # Cada cuántos días se llena la tierra. 10 es el valor del cultivo;
    # se baja a 8-9 en calor y se sube a 12-13 en invierno.
    tierra_cada_dias: int = Field(10, ge=1, le=365)
    tierra_hora: int = Field(7, ge=0, le=23)
    telemetria_s: int = Field(60, ge=5, le=3600)
    # Cadencia de la sonda de conductividad, aparte de la telemetria: la
    # sonda vive sumergida y no hace falta excitarla cada 5 s.
    ec_cada_s: int = Field(60, ge=5, le=3600)


class APWatcherConfig(BaseModel):
    """
    Vigilancia de las asociaciones WiFi del punto de acceso.

    Detecta que el nodo se fue y volvió mirando el AP, no el silencio
    de MQTT: la asociación es inmediata y no depende de que el firmware
    tenga encendido el módulo de status.
    """
    enabled: bool = True
    interface: str = "wlan0"
    # MAC del ESP32. Vacío = cualquier estación que se asocie.
    node_mac: str = ""
    poll_seconds: int = Field(10, ge=2, le=300)
    # Margen entre la asociación y el envío: el nodo aún tiene que coger
    # IP, conectar al broker y suscribirse. Antes de eso, un comando
    # publicado se pierde.
    settle_seconds: int = Field(8, ge=0, le=120)


class ReconcilerConfig(BaseModel):
    """
    Vigilancia del programa que ejecuta el nodo, y archivo local.

    Pregunta al nodo por HTTP —que no depende del broker— y contrasta lo
    que ejecuta con lo que dice config.yaml. Si difieren, lo registra y
    lo corrige. De paso guarda una serie temporal en SQLite, que es el
    archivo que queda cuando no hay nube.
    """
    enabled: bool = True
    node_url: str = "http://10.42.0.26"
    poll_seconds: int = Field(60, ge=10, le=3600)
    timeout_seconds: float = Field(6.0, ge=1, le=30)
    # Cada cuánto se archiva una fila del histórico. 300 s son ~18 MB al
    # año, holgado para el disco de la Pi.
    snapshot_seconds: int = Field(300, ge=30, le=86400)
    retention_days: int = Field(90, ge=1, le=3650)
    # Corregir además de avisar. En false solo deja constancia.
    corregir: bool = True


# ─────────────────────────────────────────────────────────────────
# Config raíz
# ─────────────────────────────────────────────────────────────────

class AppConfig(BaseModel):
    device: DeviceConfig
    mqtt: MQTTConfig
    cloud: CloudConfig
    storage: StorageConfig
    rules: RulesConfig
    health: HealthConfig
    # Con default: los config.yaml que ya existen en las Raspberries
    # desplegadas siguen validando sin tocarlos.
    programa: ProgramaConfig = Field(default_factory=ProgramaConfig)
    ap_watcher: APWatcherConfig = Field(default_factory=APWatcherConfig)
    reconciler: ReconcilerConfig = Field(default_factory=ReconcilerConfig)


# ─────────────────────────────────────────────────────────────────
# Loader
# ─────────────────────────────────────────────────────────────────

_CONFIG_PATH = Path(__file__).parent / "config.yaml"

# El .env vive un nivel arriba de edge_controller/ (raíz del proyecto edge).
# En la Raspberry: /opt/agw-edge/.env con chmod 600.
_ENV_PATH = Path(__file__).parent.parent / ".env"


def _load_dotenv(path: Path = _ENV_PATH) -> None:
    """
    Carga el .env sin depender de python-dotenv.

    systemd puede inyectar las variables con EnvironmentFile=, y en ese caso
    ya están en el entorno. Se usa setdefault para que el entorno real
    siempre gane sobre el archivo.
    """
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ.setdefault(key, value)


_load_dotenv()


def load_config(config_path: Optional[Path] = None) -> AppConfig:
    """Carga y valida config.yaml. Permite overrides desde variables de entorno."""
    path = config_path or _CONFIG_PATH
    # encoding explicito: el YAML lleva acentos y simbolos, y en un
    # sistema cuyo locale no sea UTF-8 open() elige otro codec y revienta
    # al arrancar, antes de que ningun log lo explique.
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    # ── Overrides desde el entorno (agw-edge-raspberry/.env) ─────
    # El entorno gana sobre el YAML: así los secretos viven en .env
    # (chmod 600) y no en un archivo de configuración versionable.
    _apply_env(raw, "AGW_CLOUD_API_KEY",       "cloud",   "api_key")
    _apply_env(raw, "AGW_CLOUD_BASE_URL",      "cloud",   "api_base_url")
    _apply_env(raw, "AGW_CLOUD_TELEMETRY_ENDPOINT", "cloud", "telemetry_endpoint")
    _apply_env(raw, "AGW_CLOUD_ENABLED",       "cloud",   "enabled", cast=_as_bool)
    _apply_env(raw, "AGW_GATEWAY_ID",          "device",  "gateway_id")
    _apply_env(raw, "AGW_GATEWAY_LOCATION",    "device",  "location")
    _apply_env(raw, "AGW_MQTT_HOST",           "mqtt",    "broker_host")
    _apply_env(raw, "AGW_MQTT_PORT",           "mqtt",    "broker_port", cast=int)
    _apply_env(raw, "AGW_MQTT_USERNAME",       "mqtt",    "username")
    _apply_env(raw, "AGW_MQTT_PASSWORD",       "mqtt",    "password")
    _apply_env(raw, "AGW_DB_PATH",             "storage", "db_path")
    _apply_env(raw, "AGW_MAX_BUFFERED_RECORDS", "storage", "max_buffered_records",
               cast=int)
    _apply_env(raw, "AGW_HEALTH_PORT",         "health",  "port", cast=int)
    _apply_env(raw, "AGW_RULES_FILE",          "rules",   "rules_file")

    return AppConfig(**raw)


def _as_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on", "si", "sí")


def _apply_env(raw: dict, env_var: str, section: str, key: str, cast=str) -> None:
    """Sobrescribe raw[section][key] si la variable de entorno existe."""
    value = os.getenv(env_var)
    if value is None or value == "":
        return
    raw.setdefault(section, {})[key] = cast(value)
