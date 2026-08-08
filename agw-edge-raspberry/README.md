# AGW Edge Gateway — VitalCrop IoT
## `agw-edge-raspberry` · Raspberry Pi 4 Edge Controller

> El cerebro local del sistema VitalCrop. Funciona **sin internet**, controla los nodos ESP32 vía MQTT, ejecuta reglas de negocio y sincroniza con la nube cuando hay conectividad.

---

## Arquitectura

```
Internet ←──── eth0/wlan0 (192.168.1.0/24)
                    │
             ┌──────┴──────┐
             │  Raspberry   │  ← Este componente
             │ Pi 4 (Edge)  │
             └──────┬──────┘
                    │
               wlan1 AP
           (10.10.0.0/24)
                    │
        ┌───────────┼────────────┐
        │           │            │
     ESP32-SOIL  ESP32-HYDRO  ESP32-N
```

### Servicios internos

| Servicio | Puerto | Descripción |
|---|---|---|
| Mosquitto (IoT) | `10.10.0.1:1883` | Broker MQTT para ESP32 (auth) |
| Mosquitto (local) | `127.0.0.1:1884` | Broker local para controller (anonymous) |
| Edge Controller | — | App Python async (systemd) |
| Health Server | `0.0.0.0:8080` | FastAPI endpoints de diagnóstico |
| dnsmasq | `wlan1` | DHCP + DNS para la red IoT |
| hostapd | `wlan1` | Access Point WiFi `AGW_IOT_NET` |

---

## Estructura de Carpetas

```
agw-edge-raspberry/
├── system/                  # Configs de servicios Linux
│   ├── mosquitto/           # mosquitto.conf, acl, passwd
│   ├── hostapd/             # hostapd.conf (AP wlan1)
│   ├── dnsmasq/             # dnsmasq.conf (DHCP/DNS)
│   └── systemd/             # agw-edge.service
│
├── edge_controller/         # Aplicación Python principal
│   ├── main.py              # Entry point async
│   ├── config.yaml          # Configuración completa
│   ├── config_loader.py     # Pydantic config loader
│   ├── mqtt/                # Broker client, topics, handler
│   ├── cloud/               # HTTP client, telemetry sync, command poll
│   ├── rules/               # Rules engine + rules.yaml
│   ├── storage/             # SQLite buffer (aiosqlite)
│   └── utils/               # Logger structlog + health FastAPI
│
├── scripts/
│   ├── setup_system.sh      # Instalación completa
│   ├── setup_ap.sh          # Access Point + NAT
│   └── setup_mqtt.sh        # Mosquitto + usuarios
│
├── requirements.txt
└── README.md
```

---

## Requisitos de Hardware

| Componente | Mínimo |
|---|---|
| Raspberry Pi | Pi 4 — 4 GB RAM |
| OS | Raspberry Pi OS **Lite** 64-bit |
| WiFi | 2 interfaces: `wlan0` (o `eth0`) + `wlan1` (AP IoT) |
| Almacenamiento | 16 GB microSD (Clase 10) |

> **wlan1** puede ser un adaptador USB WiFi adicional. Recomendado: Ralink RT5370 o similar compatible con `nl80211`.

---

## Instalación Paso a Paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/vitalcrop/agw-edge-raspberry.git
cd agw-edge-raspberry
```

### 2. Configurar credenciales

Editar `edge_controller/config.yaml`:
```yaml
cloud:
  api_key: "tu_jwt_de_larga_duracion"
device:
  gateway_id: "AGW-EDGE-01"    # Identificador único de este gateway
```

### 3. Ejecutar instalación automática

```bash
# Dar permisos de ejecución
chmod +x scripts/*.sh

# Ejecutar como root
sudo bash scripts/setup_system.sh
```

Este script ejecuta automáticamente:
- `setup_ap.sh` — configura `wlan1` como Access Point + NAT
- `setup_mqtt.sh` — instala Mosquitto + crea usuarios

#### Contraseñas MQTT customizadas

```bash
# Antes de ejecutar setup_system.sh
export MQTT_ESP32_PASSWORD="MiPasswordSeguro123!"
export MQTT_EDGE_PASSWORD="OtroPasswordSeguro456!"
sudo -E bash scripts/setup_system.sh
```

### 4. Editar archivo de entorno

```bash
sudo nano /opt/agw/.env
```

```env
AGW_ENV=production
AGW_LOG_LEVEL=INFO
AGW_GATEWAY_ID=AGW-EDGE-01
AGW_CLOUD_API_KEY=tu_api_key_real_aqui
```

### 5. Reiniciar

```bash
sudo reboot
```

---

## Verificación Post-Instalación

### Estado de servicios

```bash
sudo systemctl status agw-edge mosquitto hostapd dnsmasq
```

### Logs en tiempo real

```bash
# Edge Controller
sudo journalctl -u agw-edge -f

# Mosquitto
sudo journalctl -u mosquitto -f

# Ver nodos conectados al AP
iw dev wlan1 station dump
```

### Health Check

```bash
# Liveness
curl http://localhost:8080/health

# Readiness (MQTT + DB)
curl http://localhost:8080/health/ready

# Info detallada (nodos, buffer stats)
curl http://localhost:8080/health/info | python3 -m json.tool
```

### Test MQTT manual

```bash
# Suscribirse a todos los topics del AGW
mosquitto_sub -h 127.0.0.1 -p 1884 -t "agw/#" -v

# Simular telemetría de nodo SOIL
mosquitto_pub -h 127.0.0.1 -p 1884 \
  -t "agw/node/soil/telemetry" \
  -m '{"node_id":"SOIL-01","device_type":"SOIL","soil_moisture":20.0,"temperature":28.5,"timestamp":1711234567}'
```

---

## Topics MQTT

| Topic | Dirección | Descripción |
|---|---|---|
| `agw/node/soil/telemetry` | ESP32 → Edge | Telemetría del sensor de suelo |
| `agw/node/hydro/telemetry` | ESP32 → Edge | Telemetría del sensor hidropónico |
| `agw/node/+/status` | ESP32 → Edge | Heartbeat y estado del nodo |
| `agw/node/soil/alerts` | Edge → ESP32 | Alertas generadas por reglas |
| `agw/node/+/config` | Edge → ESP32 | Comandos/configuración enviados |
| `agw/node/+/ota/trigger` | Edge → ESP32 | Trigger de actualización OTA |

---

## Reglas de Negocio (rules.yaml)

El motor de reglas evalúa telemetría en tiempo real. Reglas incluidas:

| ID | Tipo | Condición | Severidad |
|---|---|---|---|
| `soil_low_moisture_alert` | SOIL | moisture < 25% | WARNING |
| `soil_temp_high` | SOIL | temperature > 35°C | WARNING |
| `soil_ec_low` | SOIL | EC < 1.0 mS/cm | WARNING |
| `hydro_ph_critical_high` | HYDRO | pH > 7.5 | CRITICAL |
| `hydro_ph_critical_low` | HYDRO | pH < 5.5 | CRITICAL |
| `hydro_ec_high` | HYDRO | EC > 3.5 mS/cm | WARNING |
| `hydro_water_temp_high` | HYDRO | water_temp > 28°C | WARNING |

Para agregar reglas, editar `edge_controller/rules/rules.yaml` — no requiere reiniciar el servicio si se implementa hot-reload.

---

## Configuración de Red

### Access Point IoT

| Parámetro | Valor |
|---|---|
| SSID | `AGW_IOT_NET` |
| Contraseña | `AgwIoT2024!` (cambiar en `hostapd.conf`) |
| Frecuencia | 2.4 GHz — Canal 6 |
| Seguridad | WPA2-PSK |
| Rango DHCP | `10.10.0.10` – `10.10.0.50` |
| Gateway/DNS | `10.10.0.1` |

### Configurar ESP32 para conectarse

En el firmware ESP32, configurar:
```cpp
const char* ssid = "AGW_IOT_NET";
const char* password = "AgwIoT2024!";
const char* mqtt_server = "10.10.0.1";
const int mqtt_port = 1883;
const char* mqtt_user = "esp32_node";
const char* mqtt_pass = "Esp32IoT2024!";  // O el configurado en setup_mqtt.sh
```

---

## Troubleshooting

### El Edge Controller no inicia

```bash
sudo journalctl -u agw-edge -n 100 --no-pager
# Verificar que Mosquitto está corriendo primero
sudo systemctl status mosquitto
```

### wlan1 no aparece como AP

```bash
# Verificar que wlan1 soporta AP mode
iw phy phy1 info | grep -A 10 "Supported interface modes"
# Debe mostrar "AP"
sudo systemctl restart hostapd
```

### Telemetría no llega a la nube

```bash
# Ver registros pendientes en el buffer SQLite
sqlite3 /var/lib/agw/buffer.db \
  "SELECT COUNT(*) as pendientes FROM telemetry_buffer WHERE synced=0;"

# Forzar recovery
curl http://localhost:8080/health/info
```

---

## Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `AGW_ENV` | `development` | `production` activa JSON logs |
| `AGW_LOG_LEVEL` | `INFO` | Nivel de log (DEBUG/INFO/WARNING) |
| `AGW_GATEWAY_ID` | `AGW-EDGE-01` | Override del gateway_id en config.yaml |
| `AGW_CLOUD_API_KEY` | — | Override del api_key en config.yaml |
| `MQTT_ESP32_PASSWORD` | `Esp32IoT2024!` | Password para setup_mqtt.sh |
| `MQTT_EDGE_PASSWORD` | `EdgeCtrl2024!` | Password para setup_mqtt.sh |

---

## Licencia

VitalCrop AGW — Internal Use Only © 2024
