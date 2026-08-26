# VitalCrop AGW — Contexto completo para el agente de infraestructura Raspberry Pi

> **Para el agente:** Este documento es el contrato completo entre el firmware ESP32 (ya implementado) y la infraestructura que debes construir en la Raspberry Pi. Lee todo antes de escribir una sola línea de código.

---

## 1. Visión general del sistema

```
┌─────────────────────────────────────────────┐
│           ESP32 — AGW HydroNode             │
│         (IoT-node-26.001 / FW 1.1.0)        │
│                                             │
│  SENSORES (todos en un solo ESP32):         │
│  ├─ HDC1080  → Temperatura y Humedad aire   │
│  ├─ Analógico GPIO36 → Humedad suelo (%)    │
│  └─ Analógico GPIO34 → pH solución nutritiva│
│                                             │
│  ACTUADORES:                                │
│  ├─ GPIO13 → Electroválvula                 │
│  └─ GPIO12 → Motobomba                      │
│                                             │
│  WiFi SSID: CULTIVO_INDOOR_WIFI             │
│  (hotspot generado por la Raspberry Pi)     │
└──────────────────┬──────────────────────────┘
                   │ WiFi / MQTT TCP 1883
                   ▼
┌─────────────────────────────────────────────┐
│         RASPBERRY PI — Fog Gateway          │
│         IP fija: 10.42.0.1                  │
│                                             │
│  ✦ Broker MQTT (Mosquitto)                  │
│  ✦ Servicio suscriptor / procesador         │
│  ✦ Base de datos local (SQLite / InfluxDB)  │
│  ✦ Uploader a nube (periódico)              │
│  ✦ Sistema de notificaciones de alertas     │
│  ✦ Dispatcher de comandos → ESP32           │
└──────────────────┬──────────────────────────┘
                   │ Internet
                   ▼
         Nube / Dashboard / API
```

**Concepto clave:** El ESP32 es **UN solo dispositivo físico** que integra sensores de hidroponía (temperatura, humedad, pH) y sensor de suelo (humedad suelo). Se comporta como si fueran dos módulos de un mismo cultivo de hierbabuena indoor. La Raspberry Pi es el cerebro Fog: recibe, persiste, enruta a la nube, y envía órdenes al nodo.

---

## 2. Red y conectividad

| Parámetro | Valor |
|---|---|
| Modo WiFi Raspberry | Hotspot (Access Point) |
| SSID | `CULTIVO_INDOOR_WIFI` |
| Contraseña WiFi | `<CLAVE_DEL_AP>` (ver SECRETOS.local.md) |
| IP Raspberry (gateway) | `10.42.0.1` (fija) |
| Puerto MQTT | `1883` |
| Autenticación MQTT | **Desactivada por ahora** (`allow_anonymous true`) |
| MQTT Keepalive | 60 segundos |

### Configurar hotspot en Raspberry Pi

```bash
sudo apt install hostapd dnsmasq -y
```

**/etc/hostapd/hostapd.conf**
```
interface=wlan0
ssid=CULTIVO_INDOOR_WIFI
wpa_passphrase=<CLAVE_DEL_AP>
hw_mode=g
channel=6
wpa=2
wpa_key_mgmt=WPA-PSK
```

**/etc/dhcpcd.conf** — agregar al final:
```
interface wlan0
static ip_address=10.42.0.1/24
nohook wpa_supplicant
```

**/etc/dnsmasq.conf**
```
interface=wlan0
dhcp-range=10.42.0.10,10.42.0.50,255.255.255.0,24h
```

---

## 3. Broker MQTT — Mosquitto

```bash
sudo apt install mosquitto mosquitto-clients -y
sudo systemctl enable mosquitto
```

**/etc/mosquitto/mosquitto.conf**
```
listener 1883
allow_anonymous true
log_dest file /var/log/mosquitto/mosquitto.log
log_type all
persistence true
persistence_location /var/lib/mosquitto/

# --- ACTIVAR AUTH EN EL FUTURO ---
# allow_anonymous false
# password_file /etc/mosquitto/passwd
# Crear usuario: sudo mosquitto_passwd -c /etc/mosquitto/passwd esp32_hydro
```

---

## 4. Contrato MQTT — Topics completos

### 4.1 ESP32 → Raspberry Pi (suscribirse en la RPi)

#### `cultivo/indoor/hierbabuena/telemetria`
Publicado periódicamente. Período default: **5 minutos**, configurable en runtime.

```json
{
  "id": "IoT-node-26.001",
  "fw": "1.1.0",
  "uptime": 3600000,
  "rssi": -65,
  "periodo_ms": 300000,
  "sensores": {
    "temp": 24.50,
    "hum": 65.00,
    "hsuelo": 72.00,
    "ph": 6.20
  }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | `IoT-node-26.001` |
| `fw` | string | Versión firmware |
| `uptime` | uint32 | ms desde arranque |
| `rssi` | int | Señal WiFi en dBm |
| `periodo_ms` | uint32 | Período actual configurado |
| `sensores.temp` | float | Temperatura aire °C (HDC1080) |
| `sensores.hum` | float | Humedad relativa % (HDC1080) |
| `sensores.hsuelo` | float | Humedad suelo % (GPIO36) |
| `sensores.ph` | float | pH solución (GPIO34) |

---

#### `cultivo/indoor/hierbabuena/alerta`
Publicado **de forma asíncrona e inmediata** cuando una variable supera un umbral por tiempo sostenido. **No respeta el período de telemetría.**

```json
{
  "id": "IoT-node-26.001",
  "uptime": 1800000,
  "variable": "ph",
  "valor": 3.10,
  "umbral_min": 5.50,
  "umbral_max": 7.50,
  "duracion_ms": 300000,
  "nivel": "LEVE"
}
```

| `nivel` | Tiempo fuera de rango | Acción recomendada |
|---|---|---|
| `LEVE` | 5 minutos | Log + notificación push suave |
| `MEDIA` | 20 minutos | Notificación prioritaria + flag en DB |
| `GRAVE` | 1 hora | Alerta crítica urgente |

---

#### `cultivo/indoor/hierbabuena/status`
Heartbeat cada **60 segundos**. También es el topic del LWT.

```json
{ "id": "IoT-node-26.001", "online": true, "uptime": 3600000, "periodo": 300000, "fw": "1.1.0" }
```

**LWT (desconexión inesperada):**
```json
{"id": "IoT-node-26.001", "online": false}
```

---

### 4.2 Raspberry Pi → ESP32 (publicar en la RPi)

#### `cultivo/indoor/hierbabuena/cmd`
Canal de comandos webhook-style. El ESP32 está suscrito permanentemente y ejecuta el comando de inmediato.

| Comando | Payload | Descripción |
|---|---|---|
| `set_periodo` | `{"cmd":"set_periodo","valor":3600000}` | Cambia ritmo de telemetría (ms, mín 5000) |
| `set_umbral` | `{"cmd":"set_umbral","variable":"ph","min":5.5,"max":7.5}` | Ajusta umbrales. Variables: `temp`,`hum`,`hsuelo`,`ph` |
| `set_nocturno` | `{"cmd":"set_nocturno","activo":true}` | Modo noche en ciclos de riego |
| `set_riego` | `{"cmd":"set_riego","encendido":true}` | Fuerza válvula + bomba ON/OFF |
| `get_status` | `{"cmd":"get_status"}` | Solicita status inmediato |
| `reset` | `{"cmd":"reset"}` | Reinicia el ESP32 |

---

## 5. Umbrales de alerta — valores por defecto del firmware

| Variable | Mín | Máx |
|---|---|---|
| `temp` | 10.0 °C | 35.0 °C |
| `hum` | 30 % | 90 % |
| `hsuelo` | 20 % | 95 % |
| `ph` | 5.5 | 7.5 |

Modificables en runtime con `set_umbral`. Se pierden al reiniciar (no persisten en NVS aún).

---

## 6. Comportamiento asíncrono de alertas

```
ESP32 lee sensores cada 5s
  Para cada variable:
    fuera de rango? NO → acumulador = 0
    fuera de rango? SÍ → acumulador += 5000ms
      acum ≥  5min → publica nivel LEVE
      acum ≥ 20min → publica nivel MEDIA
      acum ≥  1h   → publica nivel GRAVE

→ La alerta se publica AUNQUE el período de telemetría sea 1 hora.
→ El topic de alerta es independiente del topic de telemetría.
→ La Raspberry debe estar suscrita a alerta en todo momento.
```

---

## 7. Cadencia de mensajes esperados

| Topic | Frecuencia |
|---|---|
| `telemetria` | Cada `periodo_ms` (default 5min, configurable) |
| `status` | Cada 60s siempre |
| `alerta` | Esporádico — solo si hay anomalía sostenida |
| `cmd` (recibido) | Esporádico — solo cuando la RPi lo envía |

---

## 8. Schemas SQL para la base de datos local

```sql
CREATE TABLE IF NOT EXISTS telemetria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    node_id     TEXT,
    temp        REAL,
    hum         REAL,
    hsuelo      REAL,
    ph          REAL,
    rssi        INTEGER,
    uptime      INTEGER,
    periodo_ms  INTEGER,
    subido_nube INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alertas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    node_id     TEXT,
    variable    TEXT,
    valor       REAL,
    umbral_min  REAL,
    umbral_max  REAL,
    duracion_ms INTEGER,
    nivel       TEXT,
    notificado  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS status_nodo (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       TEXT NOT NULL,
    node_id  TEXT,
    online   INTEGER,
    fw       TEXT,
    periodo  INTEGER
);
```

---

## 9. Ejemplo mínimo de servicio Python

```python
"""
agw_fog_service.py — Fog service para Raspberry Pi VitalCrop
pip install paho-mqtt
"""
import json, sqlite3, datetime
import paho.mqtt.client as mqtt

BROKER      = "localhost"
PORT        = 1883
TOPIC_TEL   = "cultivo/indoor/hierbabuena/telemetria"
TOPIC_ALERT = "cultivo/indoor/hierbabuena/alerta"
TOPIC_STATUS= "cultivo/indoor/hierbabuena/status"
TOPIC_CMD   = "cultivo/indoor/hierbabuena/cmd"

db = sqlite3.connect("agw_fog.db", check_same_thread=False)

def init_db():
    db.executescript("""
    CREATE TABLE IF NOT EXISTS telemetria (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, node_id TEXT,
        temp REAL, hum REAL, hsuelo REAL, ph REAL,
        rssi INTEGER, uptime INTEGER, periodo_ms INTEGER, subido_nube INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS alertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, node_id TEXT,
        variable TEXT, valor REAL, umbral_min REAL, umbral_max REAL,
        duracion_ms INTEGER, nivel TEXT, notificado INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS status_nodo (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT,
        node_id TEXT, online INTEGER, fw TEXT, periodo INTEGER);
    """)

def on_connect(client, userdata, flags, rc):
    print(f"[MQTT] Conectado rc={rc}")
    client.subscribe(TOPIC_TEL)
    client.subscribe(TOPIC_ALERT)
    client.subscribe(TOPIC_STATUS)

def on_message(client, userdata, msg):
    topic   = msg.topic
    data    = json.loads(msg.payload.decode())
    ts      = datetime.datetime.utcnow().isoformat()

    if topic == TOPIC_TEL:
        s = data.get("sensores", {})
        db.execute(
            "INSERT INTO telemetria (ts,node_id,temp,hum,hsuelo,ph,rssi,uptime,periodo_ms) VALUES (?,?,?,?,?,?,?,?,?)",
            (ts, data["id"], s.get("temp"), s.get("hum"), s.get("hsuelo"),
             s.get("ph"), data.get("rssi"), data.get("uptime"), data.get("periodo_ms")))
        db.commit()
        print(f"[TEL] temp={s.get('temp')} hum={s.get('hum')} hsuelo={s.get('hsuelo')} ph={s.get('ph')}")

    elif topic == TOPIC_ALERT:
        db.execute(
            "INSERT INTO alertas (ts,node_id,variable,valor,umbral_min,umbral_max,duracion_ms,nivel) VALUES (?,?,?,?,?,?,?,?)",
            (ts, data["id"], data["variable"], data["valor"],
             data["umbral_min"], data["umbral_max"], data["duracion_ms"], data["nivel"]))
        db.commit()
        notify(data)

    elif topic == TOPIC_STATUS:
        db.execute(
            "INSERT INTO status_nodo (ts,node_id,online,fw,periodo) VALUES (?,?,?,?,?)",
            (ts, data.get("id"), data.get("online", True), data.get("fw"), data.get("periodo")))
        db.commit()
        if not data.get("online", True):
            print("[CRÍTICO] Nodo desconectado — LWT recibido")

def notify(alerta: dict):
    """Implementar: Telegram, push, email, webhook, etc."""
    nivel = alerta["nivel"]
    var   = alerta["variable"]
    val   = alerta["valor"]
    dur   = alerta["duracion_ms"] // 60000
    print(f"[ALERTA {nivel}] {var}={val} fuera de rango por {dur} min")
    # Ejemplo Telegram:
    # requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
    #               json={"chat_id": CHAT_ID, "text": f"⚠️ [{nivel}] {var}={val}"})

def send_command(cmd: dict):
    """Publicar un comando al ESP32"""
    client.publish(TOPIC_CMD, json.dumps(cmd))
    print(f"[CMD→ESP32] {cmd}")

def upload_to_cloud():
    """Llamar periódicamente (cron / APScheduler)"""
    rows = db.execute("SELECT * FROM telemetria WHERE subido_nube=0 LIMIT 500").fetchall()
    if not rows:
        return
    # → Enviar a tu API / Firebase / InfluxDB cloud / AWS IoT
    ids = [r[0] for r in rows]
    db.execute(f"UPDATE telemetria SET subido_nube=1 WHERE id IN ({','.join('?'*len(ids))})", ids)
    db.commit()
    print(f"[CLOUD] {len(rows)} registros subidos")

# --- Main ---
init_db()
client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect(BROKER, PORT, keepalive=60)
client.loop_forever()
```

---

## 10. Servicio systemd

```ini
# /etc/systemd/system/agw-fog.service
[Unit]
Description=VitalCrop AGW Fog Service
After=network.target mosquitto.service

[Service]
ExecStart=/usr/bin/python3 /home/pi/agw_fog_service.py
WorkingDirectory=/home/pi
Restart=always
RestartSec=5
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable agw-fog
sudo systemctl start agw-fog
sudo journalctl -u agw-fog -f
```

---

## 11. Comandos de diagnóstico en Raspberry Pi

```bash
# Ver todos los mensajes en tiempo real
mosquitto_sub -h localhost -t "cultivo/#" -v

# Cambiar período de telemetría a 1 hora
mosquitto_pub -h localhost -t "cultivo/indoor/hierbabuena/cmd" \
  -m '{"cmd":"set_periodo","valor":3600000}'

# Ajustar umbral de pH
mosquitto_pub -h localhost -t "cultivo/indoor/hierbabuena/cmd" \
  -m '{"cmd":"set_umbral","variable":"ph","min":5.5,"max":7.5}'

# Pedir status inmediato
mosquitto_pub -h localhost -t "cultivo/indoor/hierbabuena/cmd" \
  -m '{"cmd":"get_status"}'

# Forzar riego ON
mosquitto_pub -h localhost -t "cultivo/indoor/hierbabuena/cmd" \
  -m '{"cmd":"set_riego","encendido":true}'

# Activar modo noche
mosquitto_pub -h localhost -t "cultivo/indoor/hierbabuena/cmd" \
  -m '{"cmd":"set_nocturno","activo":true}'

# Ver clientes MQTT conectados
mosquitto_sub -h localhost -t '$SYS/broker/clients/connected' -C 1
```

---

## 12. Checklist de implementación

- [ ] Configurar hotspot WiFi (`hostapd` + `dhcpcd`, IP `10.42.0.1`)
- [ ] Instalar y configurar Mosquitto (puerto 1883, `allow_anonymous true`)
- [ ] Verificar con `mosquitto_sub -t 'cultivo/#' -v` que llegan mensajes del ESP32
- [ ] Crear base de datos SQLite con los 3 schemas
- [ ] Implementar `agw_fog_service.py` (suscriptor + persistencia)
- [ ] Implementar `notify()` con el canal elegido (Telegram / push / webhook)
- [ ] Implementar `upload_to_cloud()` apuntando al endpoint de nube
- [ ] Implementar scheduler para `upload_to_cloud()` (cron o APScheduler)
- [ ] Registrar servicio en systemd y habilitar arranque automático
- [ ] Probar comando `set_periodo` y verificar que el ESP32 cambia ritmo
- [ ] Probar alerta: ajustar umbral de pH a 6.99–7.00 y esperar 5min

---

## 13. Notas críticas para el agente

1. **Dos clientes MQTT simultáneos**: el ESP32 abre **dos conexiones TCP** al broker (`agw-hydro-pub-01` y `agw-hydro-sub-01`). Mosquitto los acepta sin configuración adicional.

2. **El período de telemetría es dinámico**: no asumir cadencia fija. Usar timestamps reales al guardar en DB.

3. **Alertas son adicionales a telemetría**: independientes. La Raspberry debe procesar ambos flujos en paralelo.

4. **LWT**: si el ESP32 se cae abruptamente (corte de luz, crash), Mosquitto publica automáticamente `{"id":"IoT-node-26.001","online":false}` en `status`. La Raspberry debe detectarlo y alertar.

5. **Deduplicación de alertas**: actualmente el firmware publica alerta en **cada ciclo de 5s** mientras la variable siga fuera de rango y pasado el umbral de tiempo. La Raspberry debe deduplicar por `(variable, nivel)` para no spamear notificaciones.

6. **Auth MQTT**: cuando se active, descomentar `MQTT_USER/PASS` en `config.h` del ESP32 y recompilar. En Mosquitto: `allow_anonymous false` + `password_file`.

7. **Timestamp real**: el ESP32 usa `millis()` (uptime), no tiempo real. La Raspberry debe agregar el timestamp UTC real al persistir en DB.
