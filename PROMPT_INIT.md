# PROMPT_INIT — Arranque de contexto · VitalCrop AGW

> **Qué es este archivo.** Un resumen autocontenido para iniciar una conversación
> nueva desde cero. Pega el bloque de la §0 y el agente sabrá dónde estamos sin
> tener que redescubrir nada.
>
> Estado al **2026-08-02, 21:15**. Sesión de ~6 horas.
> Documentos vivos: [`MCD.md`](./MCD.md) · [`SESSION_START.md`](./SESSION_START.md) ·
> [`informe/`](./informe/)

---

## 0. Bloque para pegar en un contexto nuevo

```
Proyecto VitalCrop AGW: prototipo IoT modular para monitoreo de cultivo.
Proyecto de grado de Ingeniería en Telecomunicaciones (U. Distrital Francisco
José de Caldas). Lo que se evalúa es ANÁLISIS DE TELECOMUNICACIONES: latencia,
pérdida de datos, disponibilidad del gateway y estabilidad del enlace MQTT.
El invernadero y el dashboard son el vehículo, no el objetivo.

Lee PROMPT_INIT.md completo, y de MCD.md las secciones §1, §2, §4, §8 y §12.
Luego dime en qué fase estamos y cuál es el siguiente paso concreto.

No asumas nada sobre despliegues: NO hay Vercel, NO hay hosting, NO hay repo git.
Solo existen la base Neon (operativa) y la Raspberry Pi (operativa).
```

---

## 1. Arquitectura en cinco capas

```
[1] SENSORES ──analógico/I2C──▶ [2] ESP32 ──WiFi 2.4GHz/MQTT:1883──▶ [3] RASPBERRY PI
                                                                          │
                                              Mosquitto + edge_controller + SQLite
                                                                          │
                                                                 eth0 → HTTPS
                                                                          ▼
                                          [5] FRONTEND ◀── [4] CLOUD API ──▶ Neon PostgreSQL
```

**Principio:** Fog Computing. La Raspberry mantiene el cultivo vivo aunque se caiga
internet. La nube es para histórico y acceso remoto, **no** para el lazo de control.

---

## 2. Estado real, capa por capa

| Capa | Componente | Estado |
|---|---|---|
| 1 | Sensores | ⚫ **No conectados.** HDC1080, capacitivo de sustrato y sonda pH sin cablear |
| 2 | ESP32 `agw-hydro-node` fw **1.2.0** | 🟢 **Operativo y validado.** Módulos activables en caliente por HTTP y MQTT, persistidos en NVS |
| 3 | Raspberry Pi 4 · AP + broker | 🟢 **Operativa.** hostapd + dnsmasq + Mosquitto, todo con arranque automático verificado tras reinicio |
| 3 | `edge_controller` | 🟡 **Código realineado, SIN desplegar** en la Pi |
| 4 | Cloud API (FastAPI) | 🟡 **Corre solo en local**, y las dependencias Python ni están instaladas en el PC |
| 4 | Neon PostgreSQL 18.4 | 🟢 **Operativa.** 6 tablas, 15 índices, semilla aplicada y verificada |
| 5 | Dashboard privado (Next.js 14) | 🟡 Construido, nunca ejecutado contra datos reales |
| 5 | Portal público educativo | ⚫ **No existe.** Requerido por el anteproyecto (ODS 2/8) |

---

## 3. Lo que se logró en esta sesión

### Fase 1 — Contexto y diagnóstico ✅

- `MCD.md` — documento maestro: contratos canónicos, decisiones justificadas,
  **24 deudas técnicas** priorizadas, plan de 6 fases, tabla de métricas
- `SESSION_START.md` — inicializador con 15 trampas conocidas
- `FASE1_RASPBERRY_DIAGNOSTICO.md` — script de diagnóstico de la Pi
- Prompts 03/04/05 eliminados tras absorber su contexto

### Migración de base de datos ✅

Supabase → **Neon PostgreSQL 18.4**. Supabase purgado por completo del repo (14
migraciones y todas las referencias en código y docs). Esquema consolidado en
`migrations/neon/001_init.sql`, aplicado y verificado. Runner `migrate.py` reescrito
con tabla `schema_migrations`, checksums e idempotencia.

**Tres credenciales hardcodeadas eliminadas** (`api/index.py`, `api/security.py`,
`migrate.py`). Ahora exigen `os.environ[...]` y fallan en frío si falta la variable.

`.env` generados para las 4 capas con reparto deliberado: la Raspberry **no** tiene
`DATABASE_URL`, el frontend **no** tiene `API_TOKEN`. `.gitignore` raíz creado — el
frontend no tenía ninguno y ya contenía secretos.

### Fase 2 — Raspberry Pi ✅ (criterio verificado)

| Métrica | Antes | Después |
|---|---|---|
| Disco usado | 89 % (779 MB libres) | **51 % (3.3 GB libres)** |
| RAM en uso | 385 MiB | **215 MiB** |
| Arranque | 63.6 s | **29.4 s** |
| Servicios corriendo | 23 | 12 |
| Reconexión remota tras reinicio | 3-6 min | **inmediata** |

- Purgados chromium, firefox, VLC, escritorio completo y 227 dependencias
- Swapfile de 1.85 GB neutralizado (`Mechanism=zram`)
- **AP `CULTIVO_INDOOR_WIFI`** con hostapd + dnsmasq, IP fija `10.42.0.1`, reserva
  DHCP por MAC
- **Mosquitto** en `:1883` con persistencia y `Restart=always`
- **Blindaje de acceso:** Tailscale + watchdog por hardware (BCM2835, 15 s) +
  keepalive + suspensión enmascarada
- Todo reversible con `/root/restore_services.sh`

### Fase 3 — parcialmente validada ✅

**La cadena ESP32 → WiFi → MQTT → broker funciona.** Verificado con hardware real:
telemetría `[OK]`, heartbeat cada 60 s, alertas escalando por umbral, y **LWT
capturado** al desconectar el nodo de golpe.

### Firmware ESP32 v1.2.0 ✅

Reescrito. Todas las tareas se crean siempre, cada una gobernada por un flag
consultado en caliente. **Dos planos de control independientes** — si MQTT cae, HTTP
sigue funcionando:

```bash
curl -X POST "http://10.42.0.26/modulo?modulo=simulacion&activo=true"
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_modulo","modulo":"telemetria","activo":true}'
```

Módulos: `telemetria` `status` `alertas` `sensor_hdc` `sensor_suelo` `sensor_ph`
`actuadores` `simulacion`. Persistidos en NVS.

Añadido además: tarea de heartbeat (no existía pese a estar en el contrato), LWT
registrado correctamente, riego forzado con efecto real, modo simulación con paseo
aleatorio acotado, y endurecimiento de la reconexión WiFi.

### Edge controller realineado ✅ (en el repo)

Cuatro fallos silenciosos corregidos:

| Fallo | Consecuencia |
|---|---|
| Topics `agw/node/+/*` en puerto **1884** | El gateway no recibía nada. Sin error, solo silencio |
| POST **por lotes** a `/api/iot/telemetry`, endpoint inexistente | Nada llegaba a la base |
| Reglas leían sensores **planos**; el firmware los manda en `sensores{}` | Ninguna regla disparaba nunca |
| `set_mqtt_publish_callback` **nunca se invocaba** | El riego automático estaba inerte |

Nuevo `mqtt/normalize.py` traduce entre los tres vocabularios del sistema. Añadidos:
deduplicación de alertas, detección de LWT, filtrado de valores fuera de rango y
medición de latencia por petición.

---

## 4. Identificadores y accesos

| Concepto | Valor |
|---|---|
| Acceso a la Pi | `ssh rasp-jh@100.88.237.0` (Tailscale, desde cualquier red) |
| IP LAN de la Pi | `192.168.20.4` · MAC `dc:a6:32:90:de:f1` |
| Gateway lógico | `FOG_RPI_HIERBABUENA_01` |
| Nodo ESP32 | `IoT-node-26.001` · MAC `38:18:2B:8A:12:7C` · IP fija `10.42.0.26` |
| Red del cultivo | SSID `CULTIVO_INDOOR_WIFI` · WPA2-CCMP · canal 6 · AP en `10.42.0.1` |
| Topics MQTT | `cultivo/indoor/hierbabuena/{telemetria,alerta,status,cmd}` |
| Base de datos | Neon PostgreSQL 18.4, `neondb`, tabla `telemetria_indoor` |
| API en local | `http://localhost:8000` · docs en `/docs` |

**Secretos:** en los `.env` de cada capa, cubiertos por `.gitignore`. Correspondencias
entre capas en `MCD.md` §10.1.

---

## 5. Requisito nuevo: semáforo de energía del WiFi

**Pendiente de diseñar. Está detallado en `MCD.md` §12.**

Hoy el nodo mantiene la radio a plena potencia: **~120 mA constantes**. Sobre fuente
es irrelevante, pero el anteproyecto plantea nodos a batería, y con ese consumo una
18650 de 3000 mAh no llega a un día.

**La tensión:** para recibir un comando por push hay que mantener la asociación y el
socket TCP abiertos, lo que exige radio activa. Apagar la radio ahorra energía pero
rompe el canal descendente. No se puede tener todo.

| Nivel | Mecanismo | Consumo | ¿Recibe comandos? | Latencia ↓ |
|---|---|---|---|---|
| 0 (actual) | Radio siempre activa | ~120 mA | Sí, inmediato | < 100 ms |
| **1** | Modem sleep por DTIM | **~20-30 mA** | **Sí** | ~200 ms |
| 2 | Modem sleep agresivo | ~5-15 mA | Sí | 1-3 s |
| 3 | Light sleep | ~2-5 mA | Sí, con TCP afinado | 1-3 s |
| 4 | Deep sleep con ciclo de trabajo | ~10 µA | No en tiempo real | = período de despertar |

**El nivel 1 es fruta madura:** una línea (`WiFi.setSleep(true)`), consumo a la
cuarta parte, **conserva el push**. El AP ya tiene `dtim_period=2`, que es lo que
hace que hostapd almacene tramas para estaciones dormidas.

**El «webhook» con deep sleep sí es posible**, mediante **sesión MQTT persistente**:
suscribirse con `clean_session=false` y **QoS 1** hace que Mosquitto **encole** los
comandos publicados mientras el nodo duerme y los entregue en la reconexión. El
broker ya está listo (`max_queued_messages 10000`, `persistence true`).

> ⚠️ **Bloqueo:** `PubSubClient` conecta **siempre** con `cleanSession=true` y **no
> publica con QoS 1**. No soporta ninguna de las dos piezas. Por eso el ahorro de
> energía (deuda 7.24) y el QoS 1 (deuda 7.22) son **la misma decisión**: cambiar de
> librería a `AsyncMqttClient` o `esp-mqtt` del IDF.

**Cuatro efectos colaterales a resolver** (detalle en §12.5): un nodo dormido parece
muerto ante el LWT · las alertas dejan de ser asíncronas · contamina las métricas de
la Fase 6 y hay que reportarlas por separado · empeora el fantasma de estación del
AP, y con ciclos frecuentes el dongle USB pasaría de opcional a necesario.

**Nota de contradicción:** este requisito choca con dos decisiones ya tomadas —
`WiFi.setSleep(false)` en el firmware y `powersave 2 (disable)` en el AP— puestas a
propósito para eliminar latencia y jitter. Hay que revisarlas, no ignorarlas.

---

## 6. Pendiente, en orden

1. **Desplegar `edge_controller`** en `/opt/agw-edge` con venv y systemd
   `Restart=always`. Cierra la Fase 2. Instalar en la Pi: `paho-mqtt`, `aiosqlite`,
   `httpx`, `structlog`, `pyyaml`, `pydantic`, `asyncio-mqtt`
2. **Validar Fase 3a** — MQTT → SQLite con `AGW_CLOUD_ENABLED=false`. **No requiere
   el ESP32**: se puede simular con `mosquitto_pub` según el contrato de `MCD.md` §4.1
3. **Decidir dónde vive la Cloud API** — Vercel (recomendado, `vercel.json` listo) o
   temporalmente en la Pi (funciona ya, pero pone `DATABASE_URL` en el gateway)
4. **Validar Fase 3b** — SQLite → Neon, incluida la recuperación tras corte de internet
5. **Pulir firmware:** `MQTT_KEEPALIVE` 60→20 s, no publicar sin MQTT,
   `WiFi.setSleep(true)` (nivel 1 de ahorro)
6. **Fase 4 — sensores.** ⚠️ Al conectar el HDC1080 hay que **fijar los pines I2C en
   `config.h`**: hoy usa los de `Wire` por defecto (GPIO21 SDA / GPIO22 SCL) de forma
   implícita. Y recalibrar el capacitivo: el `map(raw, 3800, 1200, 0, 100)` actual es
   un valor heredado sin verificar
7. **Decidir QoS 1 + librería MQTT** (deudas 7.22 y 7.24 juntas)
8. **Fase 5 — web:** endpoints de alertas y comandos, portal público, archivar el
   backend huérfano `agw-cloud-api/app/`
9. **Fase 6 — métricas.** Instrumentar `MCD.md` §9

---

## 7. Trampas que cuestan horas si se olvidan

1. **Dos backends** en `agw-cloud-api/`: el vivo es `api/`, `app/` es huérfano y su
   esquema no existe en la base.
2. **Tres proyectos de firmware:** el vivo es `agw-hydro-node`. `agw-iot-nodes` y
   `agw-soil-node` están muertos.
3. **`node_id` significa cosas distintas.** En la nube: `node_id` = Raspberry,
   `sensor_id` = ESP32. En el firmware, `id` = ESP32. La traducción vive **solo** en
   `mqtt/normalize.py`.
4. **El ESP32 no tiene reloj.** Manda `uptime` en ms. El timestamp real lo estampa la
   Raspberry.
5. **`asyncpg` no funciona contra el pooler de Neon** (usa prepared statements).
   `psycopg2` sí. Dos endpoints: el `-pooler` para la API, el directo para DDL.
6. **`hostapd_cli` necesita `sudo`** (`ctrl_interface_group=0`).
7. **No desactivar `wpa_supplicant`.** NetworkManager lo necesita, aunque no uses
   WiFi cliente.
8. **`rpi-connect status` como `rasp-jh`, nunca con `sudo`.** Es servicio de usuario;
   con sudo da un falso negativo.
9. **Mosquitto 2.x aborta ante directivas duplicadas.** El archivo en `conf.d/` solo
   debe contener lo que no está en la base.
10. **Nada está desplegado.** Las URLs `agw-cloud-api.vercel.app`,
    `soberania.it.noxumsoluciones.com` y `api.vitalcrop.io` aparecen en docs
    antiguos y **no existen**.
11. **Los heredocs se corrompen al pegar en la consola de la Pi.** Usar `printf` en
    una línea, o `base64 -d`.

---

## 8. Hallazgos con valor para el documento de grado

Los cuatro están documentados con evidencia en `informe/RASPBERRY_SETUP.md`.

**1. El SME del AP reside en el firmware Broadcom de la Pi 4.** `hostapd -dd`
reveló `device_ap_sme=1`, `Station flush failed: ret=-14` y `RSN: PTK removal from
the driver failed`. Cuando un nodo desaparece sin desasociarse, el firmware conserva
su entrada en estado autorizado con la clave de sesión vieja, y rechaza toda
reasociación con `AUTH_EXPIRE`. hostapd ni se entera: el rechazo ocurre por debajo
suyo. Mitigado con `scripts/agw-ap-watchdog.sh`, que detecta el fantasma por
asimetría rx/tx (`rx=31, tx=807`) y emite `hostapd_cli deauthenticate`. **Medido:
recuperación automática en 105 s.**

Matiz importante: **ese retardo no aplica al corte de energía**, porque al
reiniciarse la Pi hostapd arranca sin estado previo. El peor caso teórico y el peor
caso operativo no coinciden — distinción que hay que explicitar al reportar
disponibilidad.

**2. Desactivar `NetworkManager-wait-online` dejó el gateway inaccesible** y hubo
que ir físicamente al equipo. En un nodo remoto, el orden determinista de arranque
vale más que 8 segundos de boot.

**3. El swapfile de RPi OS revive** porque `Mechanism=auto` elige `zram+file` y usa
`/var/swap` como *writeback* de zram. No es swap activo, y por eso `swapon` no lo
muestra mientras ocupa 1.85 GB de disco.

**4. Raspberry Pi Connect tarda de 10 s a 6 min** por timeouts del *data channel* de
WebRTC — fallo de negociación NAT, no del equipo. Resuelto con Tailscale.

---

## 9. Divergencias con el anteproyecto radicado

Todas justificadas técnicamente en `MCD.md` §6, redactadas para copiar al documento.

| Anteproyecto | Realidad | §  |
|---|---|---|
| NestJS | FastAPI | 6.1 |
| MySQL / cPanel | PostgreSQL / Neon | 6.2 |
| Google Gemini API | **NVIDIA Nemotron** (open source) | 6.3 |
| pH medido y controlado | **Retirado del alcance** | 6.4 |

El retiro del pH está argumentado por imposibilidad de calibración trazable, y
—esto es lo importante— **el pipeline completo se conserva implementado y
deshabilitado**. Reactivarlo es conectar la sonda y cambiar un flag. Eso *demuestra*
la modularidad que el proyecto propone, en lugar de contradecirla.

Incluye reformulación propuesta del objetivo específico 1.

---

## 10. Estado del hardware al cerrar

- **ESP32 desconectado.** Tiene `telemetria`, `status` y `alertas` encendidos en NVS:
  al volver a alimentarlo arrancará publicando solo, sin tocar nada.
- **Raspberry Pi encendida y accesible** por Tailscale, con AP y broker activos.
- **Sensores sin cablear.** Fase 4 pendiente de disponibilidad de hardware.
