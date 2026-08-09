# MCD — Master Context Document · VitalCrop AGW

> **Documento maestro de contexto.** Es la única fuente de verdad del proyecto.
> Si el código y este documento se contradicen, **gana el código** — y entonces
> hay que actualizar este documento en la misma sesión.
>
> **No leas este archivo directamente al empezar una sesión.** Empieza por
> [`SESSION_START.md`](./SESSION_START.md), que te dice qué secciones del MCD
> cargar según la fase en la que estés.

> ### ⚠️ Premisa de partida (2026-08-02)
> **Nada está desplegado.** No hay Vercel, no hay hosting de la API, no hay hosting
> del frontend, no hay repositorio git. El proyecto arranca desde cero en local.
>
> **La única infraestructura real es la base de datos Neon**, que está operativa,
> con esquema aplicado y verificada. Todo lo demás corre en la máquina de
> desarrollo o está por construirse.
>
> Cualquier URL de despliegue que aparezca en documentación antigua
> (`agw-cloud-api.vercel.app`, `soberania.it.noxumsoluciones.com`, `api.vitalcrop.io`)
> **no existe**. Ignórala.

| | |
|---|---|
| **Proyecto** | VitalCrop AGW — Prototipo IoT modular para monitoreo y control de cultivo |
| **Contexto académico** | Proyecto de grado radicado — Ingeniería en Telecomunicaciones, Universidad Distrital Francisco José de Caldas |
| **Empresa** | Noxum Soluciones |
| **Eje evaluativo real** | **Análisis de telecomunicaciones**: latencia, pérdida de paquetes, disponibilidad del gateway, estabilidad del enlace MQTT |
| **Última actualización del MCD** | 2026-08-02 (Fase 1) |
| **Versión del MCD** | 1.0 |

---

## Índice

1. [Qué es este sistema en una página](#1-qué-es-este-sistema-en-una-página)
2. [Arquitectura real (no la del papel)](#2-arquitectura-real-no-la-del-papel)
3. [Inventario de componentes y estado real](#3-inventario-de-componentes-y-estado-real)
4. [Contratos del sistema](#4-contratos-del-sistema)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Decisiones de diseño y justificaciones formales](#6-decisiones-de-diseño-y-justificaciones-formales)
7. [Deuda técnica y conflictos abiertos](#7-deuda-técnica-y-conflictos-abiertos)
8. [Plan de fases y mapa de archivos](#8-plan-de-fases-y-mapa-de-archivos)
9. [Métricas de telecomunicaciones a capturar](#9-métricas-de-telecomunicaciones-a-capturar)
10. [Glosario e identificadores canónicos](#10-glosario-e-identificadores-canónicos)

---

## 1. Qué es este sistema en una página

Una cadena de cinco eslabones. Cada fase del proyecto valida un eslabón:

```
[1] SENSORES/ACTUADORES  ──analógico/I2C/GPIO──▶  [2] NODO ESP32
                                                       │
                                                  WiFi 2.4GHz privado
                                                  MQTT/TCP 1883
                                                       ▼
                                              [3] RASPBERRY PI (Fog Gateway)
                                                  ├─ Broker Mosquitto
                                                  ├─ Servicio suscriptor + SQLite buffer
                                                  ├─ Motor de reglas local (autonomía sin internet)
                                                  └─ Uploader a nube
                                                       │
                                                  Ethernet → Internet
                                                  HTTPS REST
                                                       ▼
                                              [4] CLOUD API (FastAPI en Vercel)
                                                       │
                                                  PostgreSQL (Supabase)
                                                       ▼
                                              [5] FRONTEND (Next.js)
                                                  ├─ Dashboard privado (JWT + OTP)
                                                  └─ Portal público educativo (pendiente)
```

**Principio arquitectónico:** *Fog / Edge Computing*. La Raspberry Pi debe mantener
el cultivo vivo aunque se caiga internet. La nube es para histórico, analítica y
acceso remoto — **no** para el lazo de control.

---

## 2. Arquitectura real (no la del papel)

El anteproyecto radicado describe un stack que **no es el que existe**. Esta tabla
es el contraste oficial. Cada divergencia tiene justificación en la §6.

| Capa | Anteproyecto radicado | Implementación real | ¿Se cambia? |
|---|---|---|---|
| Nodo IoT | ESP32 | ESP32 DevKit v1 (Arduino + PlatformIO + FreeRTOS) | ✅ Coincide |
| Protocolo IoT | MQTT | MQTT (PubSubClient, QoS 0 actualmente) | ✅ Coincide |
| Gateway físico | Raspberry Pi 4 | Raspberry Pi (modelo por confirmar en Fase 1) | ⚠️ Confirmar modelo |
| Broker | Mosquitto | Mosquitto | ✅ Coincide |
| Backend | **NestJS** | **FastAPI (Python)** | ❌ **Divergencia — justificada (§6.1)** |
| Base de datos | **MySQL** | **PostgreSQL 18.4 (Neon)** | ❌ **Divergencia — justificada (§6.2)** |
| Frontend | Next.js | Next.js 14 (App Router) | ✅ Coincide |
| IA | **Google Gemini API** | **NVIDIA Nemotron (open source)** | ❌ **Divergencia — justificada (§6.3)** |
| Variable pH | Medida y controlada | **Retirada del alcance** | ❌ **Retirada — justificada (§6.4)** |
| Hosting API | cPanel implícito | Vercel Serverless | ❌ Divergencia — justificada (§6.2) |
| URL pública | `soberania.it.noxumsoluciones.com` | Por definir (no obligatoria) | ⚠️ Abierto |

### 2.1 Topología física real

```
                    ┌─────────────────────────┐
   Internet ────eth0│                         │wlan0 (modo AP)
                    │     RASPBERRY PI        │  SSID: CULTIVO_INDOOR_WIFI
                    │     10.42.0.1           │  WPA2
                    │                         │  DHCP: 10.42.0.10–10.42.0.50
                    └─────────────────────────┘
                                 ▲
                                 │ WiFi 2.4 GHz (topología estrella)
                    ┌────────────┼────────────┐
                    │            │            │
              ESP32 nodo 1  ESP32 nodo 2   ESP32 nodo N
              10.42.0.1x    10.42.0.1y      ...
```

La Raspberry actúa como **doble interfaz**: `eth0` hacia internet (o el router de
la casa), `wlan0` levantando el punto de acceso privado del cultivo. Los ESP32
**nunca** ven internet directamente — todo pasa por el gateway. Esto es
deliberado: aísla el segmento IoT y permite medir el enlace de forma controlada.

> **Estado actual:** la Raspberry está conectada por Ethernet y se accede por
> consola vía Raspberry Pi Connect. El modo AP en `wlan0` **aún no está
> configurado** — es trabajo de la Fase 2.

---

## 3. Inventario de componentes y estado real

Leyenda: 🟢 funcional y probado · 🟡 escrito pero sin probar · 🔴 roto/desalineado · ⚫ no existe

### 3.1 `iot-nodes/` — Firmware ESP32

| Ruta | Estado | Notas |
|---|---|---|
| `agw-hydro-node/` | 🟡 | **Este es el proyecto canónico.** Firmware v1.1.0, `IoT-node-26.001`. Compila (hay build en `.pio/`). |
| `agw-hydro-node/src/main.cpp` | 🔴 | **En `setup()` (líneas ~520-527) casi todas las tareas están comentadas.** Solo corren `rutina_actuadores` y `rutina_monitor_alertas`. MQTT pub, MQTT sub, HDC1080, humedad de suelo y pH están **desactivados**. Es el bloqueo #1 de la Fase 3. |
| `agw-hydro-node/include/config.h` | 🟢 | Contrato completo: SSID, broker `10.42.0.1:1883`, topics, umbrales, pines. |
| `agw-hydro-node/RASPBERRY_PI_AGENT_CONTEXT.md` | 🟢 | **Documento clave.** Contrato MQTT completo firmware↔Raspberry. Fuente de la §4.1. |
| `agw-hydro-node/src/main.cpp.txt`, `main.cppg.txt` | 🔴 | Backups sueltos, ruido. Borrar. |
| `agw-iot-nodes/` | 🔴 | Scaffolding modular (sensors/, actuators/, mqtt/, network/) generado por prompt, **nunca integrado ni compilado**. Usa otro contrato de topics. Candidato a archivar. |
| `agw-soil-node/` | 🔴 | 598 líneas, mismo problema. Candidato a archivar. |

**Decisión:** `agw-hydro-node` es el único firmware vivo. `agw-iot-nodes` y
`agw-soil-node` se archivan (no se borran todavía: contienen drivers de sensores
—DS18B20, EC, ultrasónico— reutilizables en la Fase 4).

### 3.2 `agw-edge-raspberry/` — Gateway Fog

| Ruta | Estado | Notas |
|---|---|---|
| `edge_controller/main.py` | 🟡 | Orquestador asyncio con manejo de señales POSIX. Bien escrito. **Nunca ejecutado en la Raspberry.** |
| `edge_controller/config.yaml` | 🔴 | **Broker en puerto 1884 y host `127.0.0.1`.** El firmware publica al 1883. Desalineado. |
| `edge_controller/mqtt/topics.py` | 🔴 | Usa `agw/node/+/telemetry`. **El firmware usa `cultivo/indoor/hierbabuena/telemetria`.** Incompatible — ver §7.1. |
| `edge_controller/rules/rules.yaml` | 🔴 | Reglas para sensores que no existen (`electrical_conductivity`, `water_temperature`) y para tipos `SOIL`/`HYDRO` que no coinciden con el nodo único real. |
| `edge_controller/storage/schema.sql` | 🟡 | Buffer SQLite (WAL) razonable: `telemetry_buffer`, `local_alerts`, `node_status`. Reutilizable. |
| `edge_controller/cloud/*` | 🟡 | Apunta a `https://api.vitalcrop.io` con endpoints `/api/iot/telemetry` — **la API real es `https://agw-cloud-api.vercel.app` con `/api/telemetria`.** Desalineado. |
| `scripts/setup_ap.sh`, `setup_mqtt.sh`, `setup_system.sh` | 🟡 | Sin verificar contra el SO real de la Raspberry. |
| `system/hostapd/`, `dnsmasq/`, `mosquitto/`, `systemd/` | 🟡 | Plantillas de configuración. Base útil para la Fase 2. |

**Diagnóstico:** el edge fue generado a partir de un prompt distinto al del
firmware. Es un **esqueleto de buena calidad con el contrato equivocado**. La
Fase 2 lo realinea, no lo reescribe.

### 3.3 `agw-cloud-api/` — Gateway lógico

**Hay dos backends distintos en la misma carpeta.** Esto es la mayor fuente de
confusión del repo.

| Ruta | Estado | Notas |
|---|---|---|
| **`api/`** (entrypoint activo) | 🟡 | **Este es el backend vivo del proyecto, pero NO está desplegado en ningún lado.** Corre en local: `uvicorn api.index:app --reload --host 0.0.0.0 --port 8000`. FastAPI + psycopg2 síncrono contra el endpoint *pooled* de Neon. |
| `api/index.py` | 🟢 | `GET /`, `GET /api/health`, `POST /api/telemetria`, `GET /api/telemetria/{node_id}`. Auth por **Bearer estático** (`API_TOKEN`) para el Fog Node. |
| `api/index.py`, `api/security.py`, `migrate.py` | 🟢 | Credenciales hardcodeadas **eliminadas el 2026-08-02**. Ahora exigen `os.environ[...]` y fallan en frío si falta la variable. |
| `migrate.py` | 🟢 | Reescrito como runner de migraciones con tabla `schema_migrations`, checksums e idempotencia. `python migrate.py --status`. |
| `api/routers/auth.py` | 🟢 | Login **passwordless por OTP de 6 dígitos vía SMTP** → emite JWT. Tablas `users` + `auth_codes`. |
| `api/routers/users.py` | 🟢 | `GET/PUT /api/users/me` |
| `api/routers/devices.py` | 🟢 | CRUD de `gateways` y `edge_nodes` bajo JWT del usuario. |
| **`app/`** (FastAPI completo) | 🔴 | Backend paralelo: async SQLAlchemy, modelos `iot_devices`/`telemetry`/`commands`/`alerts`, middleware de rate-limit, tests. **No está desplegado y su esquema de DB no existe en Supabase.** |
| `app/main.py`, `app/routers/*`, `app/models/*` | 🔴 | Código huérfano. Ver §7.2. |
| `tests/` | 🔴 | Prueban `app/`, no `api/`. Es decir: **el código desplegado no tiene tests.** |
| `migrations/001-010` | 🔴 | Esquema del backend `app/`. Nunca ejecutado. Linaje Supabase. |
| `migrations/011-013` | ⚫ | Linaje Supabase. **Ya no son la fuente de verdad** tras la migración a Neon. Histórico. |
| `migrations/neon/001_init.sql` | 🟢 | **Esquema canónico. Aplicado y verificado en Neon el 2026-08-02.** Consolida 012+013, sin dependencias de Supabase, con los IDs corregidos según §10. |
| `docker-compose.yml`, `Dockerfile` | 🟡 | Para `app/`. Sin uso actual. |

### 3.4 `agw-frontend-dashboard/` — Interfaz

| Ruta | Estado | Notas |
|---|---|---|
| Next.js 14 App Router, TS, Tailwind, TanStack Query, ECharts, Zustand | 🟡 | Estructura completa y coherente. |
| `app/(auth)/login`, `app/(dashboard)/{dashboard,devices,alerts,commands}` | 🟡 | Páginas construidas. Compiladas al menos una vez (hay `.next/`). |
| `lib/api.ts` | 🟡 | Axios con JWT desde cookie `jwt`, redirect a `/login` en 401. Apunta a `https://agw-cloud-api.vercel.app`. |
| `hooks/useTelemetry.ts`, `useDevices.ts`, `useAlerts.ts`, `useCommands.ts` | 🟡 | **Consumen endpoints que no existen en el backend desplegado** (`/api/iot/*`, alertas, comandos). Solo `/api/telemetria/{node_id}` existe. |
| `components/charts/PhChart.tsx` | 🔴 | Debe retirarse con la variable pH (§6.4). |
| Portal público educativo | ⚫ | **No existe.** Requerido por el anteproyecto (ODS 2/8). Alcance de la Fase 5. |
| `.next/` versionado | 🔴 | Build artifacts en el repo. Debe ir a `.gitignore`. |

### 3.5 Lo que NO existe todavía

- ⚫ Portal público educativo (cultivos, puntos de cultivo, servicios, historias)
- ⚫ Página web local de contingencia en la Raspberry (para operar sin internet)
- ⚫ Endpoints de comandos y alertas en la nube (el frontend los llama, el backend no los sirve)
- ⚫ Tabla de órdenes en la nube que la Raspberry consulte periódicamente
- ⚫ Integración de NVIDIA Nemotron
- ⚫ Cualquier instrumentación de métricas de red (latencia, pérdida, jitter) — **y es el eje evaluativo del proyecto**
- ⚫ Control de versiones: **el proyecto no es un repositorio git.** Ver §7.5.

---

## 4. Contratos del sistema

> Estos contratos son **normativos**. Cualquier código que los contradiga está mal
> y debe corregirse — no al revés.

### 4.1 Contrato MQTT (ESP32 ↔ Raspberry Pi) — CANÓNICO

Se adopta el contrato del **firmware real** (`agw-hydro-node`), porque es el que
está flasheado en hardware físico. El edge controller se adapta a él.

| Parámetro | Valor |
|---|---|
| Broker | `10.42.0.1` puerto `1883` |
| Keepalive | 60 s |
| Auth | Anónima (Fase 2-3) → usuario/password (Fase 6) |
| QoS actual | 0 — **debe subirse a 1 en Fase 3** (el anteproyecto compromete QoS 1) |
| Clientes por nodo | **2 conexiones TCP**: `agw-hydro-pub-01` (publica) y `agw-hydro-sub-01` (suscribe) |

**Topics — ESP32 → Raspberry (la Pi se suscribe):**

| Topic | Cadencia | Payload |
|---|---|---|
| `cultivo/indoor/hierbabuena/telemetria` | cada `periodo_ms` (default 300000 = 5 min, configurable en runtime) | ver abajo |
| `cultivo/indoor/hierbabuena/status` | cada 60 s. También es el topic del **LWT** | `{"id","online","uptime","periodo","fw"}` |
| `cultivo/indoor/hierbabuena/alerta` | **asíncrono** — independiente del período de telemetría | ver abajo |

```jsonc
// telemetria
{
  "id": "IoT-node-26.001",
  "fw": "1.1.0",
  "uptime": 3600000,        // ms desde arranque (millis(), NO tiempo real)
  "rssi": -65,              // dBm — métrica de calidad de enlace
  "periodo_ms": 300000,
  "sensores": { "temp": 24.50, "hum": 65.00, "hsuelo": 72.00, "ph": 6.20 }
}

// alerta
{
  "id": "IoT-node-26.001", "uptime": 1800000,
  "variable": "hsuelo", "valor": 12.0,
  "umbral_min": 20.0, "umbral_max": 95.0,
  "duracion_ms": 300000,
  "nivel": "LEVE"           // LEVE 5min | MEDIA 20min | GRAVE 1h fuera de rango
}

// LWT (publicado por Mosquitto si el nodo se cae sin avisar)
{ "id": "IoT-node-26.001", "online": false }
```

**Topics — Raspberry → ESP32 (la Pi publica):**

`cultivo/indoor/hierbabuena/cmd`

| Comando | Payload |
|---|---|
| `set_periodo` | `{"cmd":"set_periodo","valor":3600000}` — mínimo 5000 ms |
| `set_umbral` | `{"cmd":"set_umbral","variable":"hsuelo","min":20,"max":95}` |
| `set_nocturno` | `{"cmd":"set_nocturno","activo":true}` |
| `set_riego` | `{"cmd":"set_riego","encendido":true}` |
| `get_status` | `{"cmd":"get_status"}` |
| `reset` | `{"cmd":"reset"}` |

**Reglas de implementación no negociables:**

1. El ESP32 **no tiene reloj real**. Envía `uptime` (millis). La Raspberry **debe**
   estampar el timestamp UTC al persistir.
2. El período de telemetría es **dinámico**. Nunca asumir cadencia fija al analizar datos.
3. Las alertas se publican en **cada ciclo de 5 s** mientras la variable siga fuera
   de rango. La Raspberry **debe deduplicar** por `(variable, nivel)`.
4. Los umbrales cambiados por `set_umbral` **se pierden al reiniciar el ESP32**
   (no persisten en NVS). Pendiente de mejora.
5. La Raspberry debe estar suscrita a `alerta` **permanentemente**, no en polling.

### 4.2 Contrato REST (Raspberry Pi → Cloud API) — CANÓNICO

| | |
|---|---|
| Base URL | `https://agw-cloud-api.vercel.app` |
| Auth | `Authorization: Bearer <API_TOKEN>` (token estático compartido con el Fog Node) |

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/` | Health raíz |
| `GET` | `/api/health` | Health + latencia de DB + estado del pooler |
| `POST` | `/api/telemetria` | **Ingesta desde la Raspberry** |
| `GET` | `/api/telemetria/{node_id}` | Últimos 50 registros |

```jsonc
// POST /api/telemetria — body
{
  "node_id": "FOG_RPI_HIERBABUENA_01",   // ID del GATEWAY (Raspberry), no del ESP32
  "sensor_id": "IoT-node-26.001",        // ID del NODO ESP32
  "temperatura": 24.5,                   // opcional, -40..100
  "humedad_ambiente": 65.0,              // opcional, 0..100
  "humedad_suelo": 72.0,                 // opcional, 0..100
  "ph": 6.2,                             // opcional, 0..14 — RETIRADO del flujo (§6.4)
  "estado_actuadores": "{\"bomba\":\"ON\"}"  // texto/JSON serializado, ≤255
}
```

⚠️ **Trampa de nomenclatura:** en la nube, `node_id` = Raspberry y `sensor_id` = ESP32.
En el firmware, `id` = ESP32. La Raspberry hace la traducción. Documentado aquí para
que nadie lo confunda otra vez.

### 4.3 Contrato REST (Frontend → Cloud API)

| Método | Endpoint | Auth | Estado |
|---|---|---|---|
| `POST` | `/api/auth/request-code` | — | 🟢 Envía OTP de 6 dígitos por SMTP |
| `POST` | `/api/auth/verify-code` | — | 🟢 Devuelve JWT |
| `GET`/`PUT` | `/api/users/me` | JWT | 🟢 |
| `POST`/`GET`/`PUT`/`DELETE` | `/api/devices/...` (gateways) | JWT | 🟢 |
| `POST`/`GET`/`PUT`/`DELETE` | `/api/devices/{gateway_uuid}/nodes` | JWT | 🟢 |
| `GET` | `/api/telemetria/{node_id}` | Bearer estático ⚠️ | 🟢 pero **usa el token del Fog, no el JWT del usuario** — inconsistencia a resolver |
| — | Alertas | — | ⚫ No existe (el frontend lo llama) |
| — | Comandos | — | ⚫ No existe (el frontend lo llama) |

---

## 5. Modelo de datos

### 5.1 Esquema canónico — Neon PostgreSQL 18.4

Definido por `migrations/neon/001_init.sql` (consolida los antiguos `012` + `013`
de linaje Supabase, corrigiendo los identificadores según §10).

| | |
|---|---|
| Proveedor | **Neon** (`us-east-2`, AWS) — migrado desde Supabase el 2026-08-02 |
| Versión | PostgreSQL **18.4** |
| Base | `neondb` · usuario `neondb_owner` |
| Endpoint *pooled* | `ep-summer-fog-ay8ylq5y-pooler.c-5.us-east-2.aws.neon.tech` — **usar desde la función serverless** |
| Endpoint directo | `ep-summer-fog-ay8ylq5y.c-5.us-east-2.aws.neon.tech` — **solo para DDL / psql** |
| TLS | `sslmode=require&channel_binding=require` |
| Latencia de conexión medida | ~800 ms pooled / ~710 ms directo (cold) desde Colombia |
| `gen_random_uuid()` | Nativo (PG13+). **No requiere `pgcrypto`** |
| **Estado** | ✅ **Operativa.** 6 tablas, 15 índices, semilla aplicada y verificada el 2026-08-02 |

**Verificación ejecutada el 2026-08-02:**

```
TABLAS: auth_codes(5) · edge_nodes(6) · gateways(5)
        schema_migrations(3) · telemetria_indoor(9) · users(4)
ÍNDICES: 15
SEMILLA: user=jhonattan.gonzalez.38@gmail.com
         gateway=FOG_RPI_HIERBABUENA_01
         edge_node=IoT-node-26.001 (HIDROPONIA)
INSERT de telemetría          -> OK (id=1, created_at estampado por la DB)
CHECK temperatura=999         -> rechazado correctamente (CheckViolation)
telemetria_indoor             -> 0 filas (prueba revertida)
```

**Es el único componente del sistema que está realmente operativo hoy.**

> ⚠️ **PgBouncer en modo transacción** (el endpoint `-pooler`) no soporta
> *prepared statements*. `psycopg2` funciona sin problema; **`asyncpg` no**. Por eso
> el runner de migraciones y la API usan psycopg2. El backend huérfano `app/`
> (async SQLAlchemy + asyncpg) fallaría contra el pooler — un motivo más para
> archivarlo (§7.2).

```
users                          gateways                      edge_nodes
┌──────────────────┐          ┌────────────────────┐        ┌──────────────────────┐
│ id UUID PK       │◄────1:N──│ id UUID PK         │◄──1:N──│ id UUID PK           │
│ email UNIQUE     │          │ user_id FK→users   │        │ gateway_id FK→gateways│
│ full_name        │          │ gateway_id VARCHAR │        │ sensor_id VARCHAR    │
│ created_at       │          │ alias              │        │ node_type            │
└────────┬─────────┘          │ created_at         │        │   CHECK IN           │
         │                    │ UNIQUE(user_id,    │        │   ('TIERRA',         │
         │ 1:N                │        gateway_id) │        │    'HIDROPONIA')     │
         ▼                    └────────────────────┘        │ alias                │
┌──────────────────┐                                        │ UNIQUE(gateway_id,   │
│ auth_codes       │                                        │        sensor_id)    │
│ id UUID PK       │                                        └──────────────────────┘
│ user_id FK       │
│ otp_code VARCHAR(6)│         telemetria_indoor  ⚠️ NO tiene FK — se une por strings
│ expires_at       │         ┌──────────────────────────────────┐
│ used BOOLEAN     │         │ id BIGINT IDENTITY PK            │
└──────────────────┘         │ created_at TIMESTAMPTZ           │
                             │ node_id VARCHAR   → gateways.gateway_id (lógico)
                             │ sensor_id VARCHAR → edge_nodes.sensor_id (lógico)
                             │ temperatura REAL                 │
                             │ humedad_ambiente REAL            │
                             │ humedad_suelo REAL               │
                             │ ph REAL          ← quedará NULL  │
                             │ estado_actuadores VARCHAR        │
                             └──────────────────────────────────┘
```

**Índices activos:** `telemetria_indoor_created_at_idx (created_at DESC)`,
`telemetria_indoor_node_sensor_idx (node_id, sensor_id)`,
`auth_codes_user_used_idx (user_id, used)`, `gateways_user_id_idx`, `edge_nodes_gateway_id_idx`.

**Semilla real en producción:**
- Usuario: `jhonattan.gonzalez.38@gmail.com`
- Gateway: `FOG_RPI_HIERBABUENA_01` — "Broker Principal - Vital Crop AGW"
- Nodos: `ESP32_TIERRA_01` (TIERRA), `ESP32_HIDROPONIA_01` (HIDROPONIA)

⚠️ **Conflicto de IDs:** la semilla usa `ESP32_TIERRA_01`/`ESP32_HIDROPONIA_01`,
pero el firmware real se identifica como `IoT-node-26.001`. Hay que unificar en la
Fase 3 — ver §10.

**Debilidades conocidas de este esquema:**
- `telemetria_indoor` no tiene FK a `edge_nodes` → no hay integridad referencial.
- No hay tabla de **alertas** ni de **comandos/órdenes** en la nube, pese a que el
  anteproyecto compromete "recibir órdenes revisando una tabla de órdenes".
- No hay tabla para el **portal público** (cultivos, ubicaciones, servicios).
- No hay particionado ni política de retención para series temporales.

### 5.2 Esquema huérfano — `migrations/001-010`

Define `iot_devices`, `telemetry` (particionada por año), `device_commands`,
`alerts`, vistas y RLS. **Nunca se ejecutó en Supabase.** Es un diseño *mejor* que
el desplegado (particionado, RLS multi-tenant, enums), pero adoptarlo implica
migrar datos y reescribir `api/`. Ver decisión pendiente §7.2.

### 5.3 Esquema local — SQLite en la Raspberry

`agw-edge-raspberry/edge_controller/storage/schema.sql` define `telemetry_buffer`,
`local_alerts`, `node_status` con WAL. El documento
`RASPBERRY_PI_AGENT_CONTEXT.md` propone otro (`telemetria`, `alertas`,
`status_nodo`). **A unificar en Fase 2** — se recomienda quedarse con el de
`schema.sql` por el índice `(synced, created_at)` que es exactamente lo que el
uploader necesita.

---

## 6. Decisiones de diseño y justificaciones formales

> Redactadas para poder copiarse tal cual al documento de grado.

### 6.1 FastAPI en lugar de NestJS

**Decisión:** se mantiene el gateway lógico en FastAPI (Python 3.11).

**Justificación técnica:**
1. **Homogeneidad de lenguaje en la cadena de datos.** El gateway físico
   (Raspberry Pi) opera en Python con `paho-mqtt`. Usar Python también en la nube
   elimina la duplicación de los modelos de validación del payload de telemetría:
   los esquemas Pydantic del contrato REST son directamente reutilizables en el
   servicio del edge, reduciendo la superficie de error de serialización — que en
   un sistema de telecomunicaciones es una fuente real de pérdida de datos.
2. **Compatibilidad con ejecución serverless.** El despliegue en Vercel exige
   arranque en frío rápido y conexiones de base de datos por petición. FastAPI
   sobre `psycopg2` contra el *Transaction Pooler* de Supabase (puerto 6543)
   satisface ese modelo. NestJS sobre Node exige un runtime persistente o una
   adaptación no trivial, y el proyecto no dispone de servidor dedicado.
3. **Costo de infraestructura nulo.** El objetivo declarado del proyecto es
   democratizar tecnología de bajo costo. El stack actual opera en capa gratuita.
4. **Foco evaluativo.** El aporte disciplinar del trabajo es el **análisis de
   telecomunicaciones** (latencia extremo a extremo, pérdida de datagramas,
   disponibilidad del gateway, comportamiento del enlace MQTT ante degradación).
   El framework del backend es una decisión de implementación, no una variable
   experimental: no altera ninguna de las métricas evaluadas.

**Riesgo asumido:** divergencia formal con el documento radicado. Se mitiga
declarándola explícitamente en el capítulo de metodología.

### 6.2 PostgreSQL en lugar de MySQL/cPanel — y Neon en lugar de Supabase

**Decisión (a):** el motor es PostgreSQL, no MySQL.

1. **Requisito de series temporales.** La telemetría es una serie temporal de alta
   cardinalidad. PostgreSQL ofrece particionado declarativo por rango de tiempo e
   índices BRIN, que MySQL sobre hosting compartido cPanel no expone.
2. **Pooling compatible con serverless.** El modelo de despliegue elegido abre una
   conexión por petición. Un *connection pooler* en modo transacción es una
   restricción dura, y el ecosistema PostgreSQL (PgBouncer) lo resuelve de forma
   estándar.
3. **Costo.** Capa gratuita suficiente para el prototipo BETA.

**Decisión (b):** el proveedor es **Neon**, no Supabase (migrado el 2026-08-02).

1. **Separación de cómputo y almacenamiento con suspensión automática.** La
   arquitectura de Neon desacopla el cómputo del almacenamiento y suspende el
   cómputo cuando no hay actividad. Para un prototipo cuya telemetría llega cada 5
   minutos, esto reduce el consumo de recursos a lo efectivamente utilizado —
   coherente con el principio de bajo costo del proyecto.
2. **Superficie de dependencia menor.** Supabase acopla base de datos,
   autenticación, almacenamiento de archivos y RLS en una sola plataforma. El
   sistema solo necesita PostgreSQL: la autenticación ya se resuelve con JWT + OTP
   en la capa de aplicación (§4.3). Neon entrega PostgreSQL puro, lo que reduce el
   *vendor lock-in* y hace el esquema portable a cualquier PostgreSQL estándar —
   requisito relevante para un proyecto que aspira a replicarse a escala nacional.
3. **Versión del motor más reciente.** PostgreSQL 18.4, frente a la versión 15 que
   ofrecía el proyecto anterior.
4. **Ramificación de bases de datos.** Neon permite crear *branches* de la base
   completa, lo que habilita ejecutar las pruebas destructivas de la Fase 6 sobre
   una copia sin arriesgar los datos del prototipo en producción.

**Consecuencia técnica registrada:** el esquema quedó libre de construcciones
propias de Supabase (`auth.uid()`, `auth.role()`, dependencia de `pgcrypto`). El
aislamiento por usuario se aplica en la capa de API mediante el JWT, no con RLS de
motor. Es una decisión consciente: hace el esquema portable, a costa de que la
autorización deje de estar respaldada por la base de datos. Se documenta como
riesgo aceptado en §7.16.

### 6.3 NVIDIA Nemotron en lugar de Google Gemini API

**Decisión:** el componente de IA se implementa con modelos **NVIDIA Nemotron
(open source)**, con posibilidad de usar varias APIs/modelos de la familia para
tareas distintas.

**Justificación:**
1. **Coherencia con el principio de soberanía tecnológica.** El proyecto se
   fundamenta en eliminar la dependencia de proveedores extranjeros y licencias
   privativas (§ Impacto Esperado del anteproyecto). Un modelo de pesos abiertos es
   consistente con ese principio; una API propietaria cerrada lo contradice.
2. **Posibilidad de despliegue local o en el borde.** Un modelo abierto puede, a
   futuro, ejecutarse en infraestructura propia, alineándose con la arquitectura
   Fog: la inteligencia puede acercarse al cultivo en lugar de depender de un
   servicio remoto.
3. **Especialización por tarea.** Al disponer de varios modelos de la familia se
   pueden asignar según carga: uno pequeño para clasificación de alertas y
   redacción de recomendaciones agronómicas en el borde, uno mayor para el análisis
   de series históricas y generación de contenido educativo del portal público.
4. **Trazabilidad y reproducibilidad académica.** Los pesos abiertos permiten que
   el trabajo sea reproducible por terceros, requisito deseable en un proyecto de grado.

**Usos previstos (Fase 6):** clasificación y priorización de alertas, generación de
recomendaciones agronómicas en lenguaje natural, resumen de tendencias de
telemetría, y contenido del portal educativo.

### 6.4 Retiro de la variable pH

**Decisión:** el pH se **retira del alcance experimental**. El sensor no se cablea,
la tarea `sensor_ph` del firmware permanece deshabilitada, y el campo `ph` de
`telemetria_indoor` queda `NULL` (la columna **no se elimina**, para no romper el
esquema desplegado ni la API).

**Justificación:**
1. **Imposibilidad de calibración y mantenimiento válidos.** Una sonda de pH
   requiere calibración periódica con soluciones buffer certificadas (pH 4.01 /
   7.00), almacenamiento en solución de KCl y recalibración por deriva. El
   prototipo no dispone de operación manual sostenida que garantice esas
   condiciones durante la ventana de pruebas.
2. **Riesgo de invalidar los resultados.** Una sonda descalibrada produce lecturas
   con error sistemático. Publicar mediciones de pH no trazables comprometería la
   validez de todo el conjunto de datos, incluidas las variables que sí están bien
   caracterizadas.
3. **Alineación con el objetivo disciplinar.** El objetivo general evalúa
   "adquisición, procesamiento y gestión de datos en tiempo real" y la "viabilidad
   técnica como sistema de monitoreo". Ese objetivo se cumple íntegramente con
   temperatura, humedad relativa y humedad de sustrato. El eje evaluado es el
   desempeño de la **cadena de telecomunicaciones**, no la agronomía de la solución
   nutritiva.
4. **Preservación de la modularidad.** El retiro es una decisión de configuración,
   no de arquitectura. El pipeline —driver, campo en el payload MQTT, columna en la
   base de datos, umbral de alerta— permanece implementado y documentado. Reactivar
   el pH requiere conectar la sonda, calibrarla y descomentar una línea. Esto
   **demuestra** la modularidad que el proyecto propone como aporte, en lugar de
   contradecirla.

**Variables finales del prototipo:**

| Variable | Sensor | Unidad | Estado |
|---|---|---|---|
| Temperatura del aire | HDC1080 (I2C) | °C | ✅ Activa |
| Humedad relativa | HDC1080 (I2C) | % | ✅ Activa |
| Humedad de sustrato | Capacitivo (GPIO36, ADC) | % | ✅ Activa |
| RSSI del enlace | ESP32 WiFi | dBm | ✅ Activa — **métrica de telecomunicaciones** |
| pH | Sonda analógica (GPIO34) | — | ⏸️ Implementada, deshabilitada |
| Conductividad eléctrica | — | — | ⏸️ Driver existe en `agw-iot-nodes`, sin cablear |

**Impacto en el objetivo específico 1:** debe reformularse. Redacción propuesta:

> *"Diseñar y ensamblar un prototipo modular que integra una red de sensores para
> las variables críticas de temperatura, humedad relativa y humedad de sustrato,
> junto a actuadores para el control hídrico en un ambiente controlado, dejando
> implementada y documentada la ruta de extensión para variables de solución
> nutritiva (pH y conductividad eléctrica) como demostración de la modularidad del
> sistema."*

### 6.5 Contrato MQTT del firmware como canónico

**Decisión:** ante el conflicto entre `cultivo/indoor/hierbabuena/*` (firmware) y
`agw/node/+/*` (edge controller), gana el firmware.

**Justificación:** el firmware está flasheado en hardware físico y su contrato está
formalmente documentado en `RASPBERRY_PI_AGENT_CONTEXT.md`. El edge controller
nunca se ha ejecutado. Cambiar software no probado es de menor riesgo que
recompilar y reflashear hardware. Además, el namespace del firmware es semántico
(`cultivo/{ubicacion}/{especie}/{canal}`) y escala mejor a múltiples cultivos que
el namespace del edge (`agw/node/{tipo}/{canal}`), que asume un tipo fijo de nodo.

### 6.6 Raspberry Pi como Access Point (no como cliente WiFi)

**Decisión:** `eth0` = uplink a internet; `wlan0` = punto de acceso privado del cultivo.

**Justificación:**
1. **Aislamiento del segmento IoT.** Los nodos no alcanzan internet directamente:
   toda la telemetría atraviesa el gateway. Es la definición de una arquitectura Fog.
2. **Independencia de infraestructura de terceros.** El sistema debe operar en
   zonas rurales sin router WiFi. La Raspberry provee su propia red.
3. **Control experimental del enlace.** Al ser dueños del AP se pueden medir con
   precisión RSSI, pérdida y latencia del segmento inalámbrico, y provocar
   degradación controlada para las pruebas de la Fase 6 — que es exactamente lo que
   el proyecto debe evaluar.
4. **Continuidad ante caída de WAN.** Si se cae `eth0`, el segmento `wlan0` y el
   broker siguen operando: el cultivo se mantiene.

---

## 7. Deuda técnica y conflictos abiertos

| # | Conflicto | Severidad | Resolución | Fase |
|---|---|---|---|---|
| 7.1 | ~~Topics MQTT incompatibles entre firmware y edge~~ | ✅ **Resuelto 2026-08-02** | Realineados `topics.py`, `config.yaml`, `message_handler.py`, `rules.yaml`, `sync_telemetry.py`, `sync_commands.py`, `config_loader.py`. Nuevo `mqtt/normalize.py` traduce firmware↔interno↔nube. Corregido además: el uploader posteaba lotes a `/api/iot/telemetry` (inexistente) en vez de registros sueltos a `/api/telemetria`; el motor de reglas leía sensores planos en vez de `sensores{}`; `set_mqtt_publish_callback` nunca se invocaba, así que el riego automático estaba inerte | — |
| 7.2 | **Dos backends** en `agw-cloud-api` (`api/` desplegado vs `app/` huérfano) y **dos familias de migraciones** (001-010 vs 011-013) | 🔴 Alta | Decidir: archivar `app/` + `001-010`, o migrar a ese esquema. **Recomendación: archivar `app/`, y portar de `001-010` solo lo que falta (alertas, comandos) como migraciones 014+** | 5 |
| 7.3 | ~~Credenciales hardcodeadas en `api/index.py`, `api/security.py`, `migrate.py`~~ | ✅ **Resuelto 2026-08-02** | Eliminados los fallbacks; ahora `os.environ[...]` obligatorio. La instancia de Supabase quedó abandonada — **conviene eliminarla del proveedor** para que la credencial filtrada deje de tener valor | — |
| 7.4 | **Firmware con tareas comentadas** — MQTT y sensores desactivados en `setup()` | 🔴 Bloqueante | Reactivar en orden controlado durante la Fase 3 | 3 |
| 7.5 | **El proyecto no está bajo control de versiones** (no es un repo git) | 🔴 Alta | `.gitignore` raíz creado el 2026-08-02 (cubre `.env`, `.next/`, `.pio/`, `node_modules/`, `*.db`). Falta `git init` | 2 |
| 7.16 | Sin RLS: la autorización por usuario vive solo en la capa de API | 🟠 Media | Riesgo aceptado al migrar a Neon (§6.2). Cualquier endpoint que olvide filtrar por `user_id` expone datos de otros usuarios. Mitigar con revisión de los routers y tests | 5 |
| 7.17 | ~~Base de datos Neon vacía~~ | ✅ **Resuelto 2026-08-02** | `migrations/neon/001_init.sql` aplicado y verificado | — |
| 7.18 | **Nada está desplegado.** No hay Vercel, no hay hosting de la API ni del frontend | 🟠 Media — **decisión consciente** | Todo corre en local contra la base Neon real. El despliegue se hará más adelante; no bloquea las Fases 2-4 | 5 |
| 7.19 | La Raspberry no puede alcanzar la API mientras esta corra en `localhost` del PC | 🟠 Media | En Fase 3: levantar uvicorn con `--host 0.0.0.0` y apuntar `AGW_CLOUD_BASE_URL` a la IP LAN del PC. O trabajar con `AGW_CLOUD_ENABLED=false` y solo buffer local | 3 |
| 7.20 | **Dependencias Python no instaladas en el PC de desarrollo** (`fastapi` ausente). La API nunca se ha ejecutado en local | 🟠 Media | `cd agw-cloud-api && pip install -r requirements.txt`. El cargador `api/_env.py` ya está verificado; falta arrancar uvicorn y probar `/api/health` | 2 |
| 7.21 | **El SME del AP reside en el firmware Broadcom** (`device_ap_sme=1`): hostapd no puede limpiar estaciones que desaparecen sin desasociarse. Un nodo que se reinicia queda 105 s sin poder reasociar | 🟠 Media — **mitigado** | `scripts/agw-ap-watchdog.sh` + timer cada 45 s detectan la entrada fantasma por asimetría rx/tx y emiten `hostapd_cli deauthenticate`. Documentado en `informe/RASPBERRY_SETUP.md` §4.4. Mejora opcional: dongle WiFi USB Realtek/MediaTek | 6 |
| 7.22 | **PubSubClient no puede publicar con QoS 1** — su `publish()` es QoS 0 y punto. El anteproyecto compromete QoS 1 | 🟠 Media | Cambiar de librería MQTT en el firmware (AsyncMqttClient o esp-mqtt de IDF), o justificar QoS 0 midiendo la pérdida real. Sustituye a la deuda 7.9 | 3 |
| 7.23 | El firmware publica telemetría aunque no haya WiFi ni MQTT (`rssi:0`, `[FALLO]`) | 🟡 Baja | Condicionar `tarea_telemetria` y `tarea_status` a `clientPub.connected()` | 4 |
| 7.25 | **`ec` y `tds` no llegan a la nube.** El firmware los publica y el edge los persiste en SQLite, pero `telemetria_indoor` no tiene esas columnas | 🟠 Media | Migración `neon/002_*.sql` añadiendo `ec_us_cm REAL` y `tds_ppm REAL`, y mapearlas en `normalize.to_cloud_payload()` | 5 |
| 7.26 | **Compensación de temperatura del TDS usa el HDC1080, que mide aire, no la solución.** La conductividad varía ~2 %/°C | 🟡 Baja — **limitación declarada** | Añadir una sonda DS18B20 sumergida. Debe constar como limitación al reportar resultados de EC | 6 |
| 7.24 | **Sin gestión de energía del WiFi.** El nodo mantiene la radio a plena potencia permanentemente (~120 mA). Insostenible para nodos a batería | 🟠 Media — **requisito nuevo** | Ver §12: escalera de cuatro niveles de ahorro. El nivel 4 (deep sleep con sesión persistente) exige cambiar de librería MQTT, así que se decide junto con la deuda 7.22 | 4 |
| 7.6 | Frontend llama endpoints inexistentes (`/api/iot/*`, alertas, comandos) | 🟠 Media | Crear los endpoints o ajustar los hooks | 5 |
| 7.7 | `GET /api/telemetria/{node_id}` usa Bearer estático, no el JWT del usuario | 🟠 Media | Unificar auth; el dashboard no debe conocer el token del Fog | 5 |
| 7.8 | **IDs inconsistentes**: firmware `IoT-node-26.001` vs semilla DB `ESP32_TIERRA_01` | 🟠 Media | Unificar según §10 | 3 |
| 7.9 | QoS 0 en el firmware; el anteproyecto compromete QoS 1 | 🟠 Media | Subir a QoS 1 y medir el impacto en latencia (dato valioso para el paper) | 3 |
| 7.10 | Sin tabla de órdenes en la nube; el anteproyecto la compromete | 🟠 Media | Migración 014 + endpoint + poller en la Raspberry | 5 |
| 7.11 | Umbrales no persisten en NVS del ESP32 | 🟡 Baja | Implementar persistencia NVS | 4 |
| 7.12 | Tres proyectos de firmware, dos muertos | 🟡 Baja | Archivar `agw-iot-nodes` y `agw-soil-node` en `_archive/` | 3 |
| 7.13 | `.next/` y `.pio/` versionados | 🟡 Baja | `.gitignore` | 2 |
| 7.14 | Sin página web local de contingencia en la Raspberry | 🟡 Baja | Requerida por el anteproyecto | 5 |
| 7.15 | Tests solo cubren el backend huérfano | 🟡 Baja | Tests sobre `api/` | 6 |

---

## 8. Plan de fases y mapa de archivos

### Fase 1 — Contexto y diagnóstico · ✅ EN CURSO

**Objetivo:** establecer la fuente de verdad y conocer la Raspberry antes de tocarla.

| Acción | Archivos |
|---|---|
| Crear documento maestro | `MCD.md` ← este archivo |
| Crear inicializador de sesión | `SESSION_START.md` |
| Crear guía de diagnóstico de hardware | `FASE1_RASPBERRY_DIAGNOSTICO.md` |
| Eliminar prompts obsoletos | ~~`03_prompt_cloud_api.md`~~, ~~`04_prompt_database_supabase.md`~~, ~~`05_prompt_frontend_dashboard.md`~~ |

**Salida esperada:** el usuario ejecuta los comandos de diagnóstico en la Raspberry
y pega la salida. Con eso se llena la §11 del MCD (Perfil de la Raspberry) y se
desbloquea la Fase 2.

---

### Fase 2 — Configuración de la Raspberry Pi · ⬜ BLOQUEADA por el diagnóstico

**Objetivo:** convertir la Raspberry en un gateway dedicado, mínimo y auto-recuperable.

| Bloque | Archivos a modificar |
|---|---|
| Adelgazar el sistema (desactivar GUI, Bluetooth, impresión, avahi…) con **reversibilidad** | Nuevo: `agw-edge-raspberry/scripts/slim_system.sh` + `restore_services.sh` |
| Punto de acceso WiFi `CULTIVO_INDOOR_WIFI` en `wlan0` | `system/hostapd/hostapd.conf`, `system/dnsmasq/dnsmasq.conf`, `scripts/setup_ap.sh` |
| Broker Mosquitto en `:1883` | `system/mosquitto/mosquitto.conf`, `scripts/setup_mqtt.sh` |
| **Realinear el contrato MQTT** (deuda 7.1) | `edge_controller/mqtt/topics.py`, `edge_controller/config.yaml`, `edge_controller/mqtt/message_handler.py`, `edge_controller/rules/rules.yaml` |
| Apuntar el uploader a la API real | `edge_controller/cloud/cloud_client.py`, `sync_telemetry.py`, `sync_commands.py` |
| Arranque prioritario y recuperación tras corte de luz | `system/systemd/agw-edge.service` (+ `Restart=always`, `RestartSec`, `After=network-online.target`) |
| Control de versiones y seguridad | `.gitignore` (nuevo), rotar credencial (deuda 7.3) |

**Criterio de aceptación:** se corta la energía, se restablece, y en < 90 s el
broker está escuchando, el AP levantado y el servicio suscrito, sin intervención.

---

### Fase 3 — Prueba MQTT ESP32 ↔ Broker con datos simulados · ⬜

**Objetivo:** validar el eslabón inalámbrico y la persistencia, **sin sensores**.

| Bloque | Archivos a modificar |
|---|---|
| Reactivar tareas MQTT en el firmware (deuda 7.4) | `iot-nodes/agw-hydro-node/src/main.cpp` — descomentar `publishTelemetry` y `rutina_mqtt_receiver` |
| Modo simulación: valores sintéticos sin hardware | `iot-nodes/agw-hydro-node/include/config.h` (flag `SIMULATION_MODE`), `src/main.cpp` |
| Subir a QoS 1 (deuda 7.9) | `src/main.cpp` |
| Persistencia local | `edge_controller/storage/local_db.py`, `storage/schema.sql` |
| Deduplicación de alertas | `edge_controller/mqtt/message_handler.py` |
| Traducción de IDs firmware→nube y estampado UTC | `edge_controller/cloud/sync_telemetry.py` |
| Unificar IDs (deuda 7.8) | `config.h`, migración `014_*.sql` |
| Archivar firmware muerto (deuda 7.12) | `iot-nodes/_archive/` |

**Criterio de aceptación:** telemetría simulada del ESP32 aparece en
`telemetria_indoor` de Supabase con timestamp correcto. Se desconecta el ESP32 y el
LWT se registra. Se corta internet, se acumula en SQLite, se restablece y se vacía
el buffer sin pérdida.

---

### Fase 4 — Integración de sensores reales · ⬜

| Bloque | Archivos |
|---|---|
| Reactivar HDC1080 y humedad de suelo | `src/main.cpp` (`rutina_temperatura_humedad`, `sensor_humedad_suelo`) |
| Calibración del sensor capacitivo (el `map(3800,1200,...)` actual es un valor supuesto) | `src/main.cpp`, documentar curva en el MCD |
| Actuadores: validar `rutina_actuadores` con relés reales, revisar lógica activo-bajo | `src/main.cpp`, `include/config.h` |
| Persistencia de umbrales en NVS (deuda 7.11) | `src/main.cpp` |

---

### Fase 5 — Web: dashboard privado + portal público · ⬜

| Bloque | Archivos |
|---|---|
| Resolver el conflicto de backends (deuda 7.2) | `agw-cloud-api/app/` → `_archive/`, `migrations/001-010` → `_archive/` |
| Endpoints faltantes: alertas, comandos/órdenes (deudas 7.6, 7.10) | `api/routers/alerts.py` (nuevo), `api/routers/commands.py` (nuevo), `migrations/014_*.sql` |
| Unificar autenticación (deuda 7.7) | `api/index.py`, `api/security.py` |
| Conectar hooks del dashboard a endpoints reales | `hooks/useTelemetry.ts`, `useDevices.ts`, `useAlerts.ts`, `useCommands.ts` |
| Retirar UI de pH | `components/charts/PhChart.tsx`, `components/devices/SensorReadings.tsx` |
| **Portal público educativo** (nuevo) | `app/(public)/` — cultivos, puntos de cultivo, servicios, historias + `migrations/015_*.sql` |
| Web local de contingencia en la Raspberry (deuda 7.14) | `agw-edge-raspberry/local_web/` (nuevo) |

---

### Fase 6 — Pruebas exhaustivas y analítica · ⬜

| Bloque | Archivos |
|---|---|
| Instrumentación de métricas de red | Nuevo: `tests/telecom/` |
| Batería de pruebas de latencia, pérdida, disponibilidad, jitter | Nuevo: `tests/telecom/` |
| Autenticación MQTT (usuario/password, y evaluar TLS) | `system/mosquitto/`, `include/config.h` |
| Integración NVIDIA Nemotron | Nuevo: `agw-cloud-api/api/routers/ai.py` |
| Tests sobre el backend desplegado (deuda 7.15) | `agw-cloud-api/tests/` |
| Redacción de resultados | Nuevo: `RESULTADOS.md` |

---

## 9. Métricas de telecomunicaciones a capturar

**Esta es la sección más importante del proyecto para la carrera.** Todo lo demás
es la infraestructura que permite medir esto. Se instrumenta desde la Fase 3 — no
al final.

| Métrica | Definición operacional | Punto de medición | Objetivo |
|---|---|---|---|
| **Latencia extremo a extremo** | `created_at` en Supabase − instante de publicación en el ESP32 | Requiere sincronizar relojes: la Pi estampa `t_rx` al recibir MQTT y lo envía a la nube | < 2 s con WAN estable |
| **Latencia del segmento MQTT** | `t_rx` (Pi) − `t_pub` (ESP32) | Servicio suscriptor en la Pi | < 200 ms |
| **Latencia de subida a nube** | `t_http_response` − `t_http_request` | `cloud_client.py` | < 1.5 s |
| **Pérdida de mensajes** | `(esperados − recibidos) / esperados`, donde esperados se deriva de `uptime` y `periodo_ms` | Contador en la Pi | < 1 % con QoS 1 |
| **Disponibilidad del gateway** | `uptime_broker / tiempo_total` | `systemd` + `journalctl` | > 99 % |
| **Tiempo de recuperación (MTTR)** | Desde corte de energía hasta primer mensaje persistido | Cronómetro + logs | < 90 s |
| **RSSI del enlace** | Campo `rssi` de cada trama de telemetría | Ya viene en el payload | > −70 dBm |
| **Jitter** | Desviación estándar del intervalo entre llegadas consecutivas | Análisis sobre `telemetria_indoor` | por caracterizar |
| **Integridad tras desconexión WAN** | Registros en buffer SQLite vs registros que llegan a Supabase al restablecer | Fase 3 | 100 % |
| **Impacto de QoS** | Latencia y pérdida con QoS 0 vs QoS 1 | Prueba A/B | dato para el paper |

**Nota de diseño:** para medir latencia extremo a extremo hace falta que el ESP32
tenga noción de tiempo real. Opciones: (a) la Pi le envía la hora por MQTT al
conectarse, (b) el ESP32 usa NTP contra la Pi. **Recomendación: (b)** — instalar
`chrony`/`systemd-timesyncd` como servidor NTP en la Pi y que el ESP32 sincronice
por `configTime()`. Se decide en Fase 3.

---

## 10. Glosario e identificadores canónicos

| Concepto | Identificador canónico | Dónde vive |
|---|---|---|
| Gateway físico (Raspberry) | `FOG_RPI_HIERBABUENA_01` | `gateways.gateway_id`, campo `node_id` de la API |
| Nodo ESP32 hidropónico | `IoT-node-26.001` | `config.h:DEVICE_ID`, campo `sensor_id` de la API |
| SSID de la red privada | `CULTIVO_INDOOR_WIFI` | `config.h`, `hostapd.conf` |
| IP del gateway | `10.42.0.1` | `config.h`, `dhcpcd.conf` |
| Namespace MQTT | `cultivo/indoor/hierbabuena/{telemetria,alerta,status,cmd}` | `config.h`, `topics.py` |
| API (local — no hay despliegue) | `http://localhost:8000` · docs en `/docs` | frontend `.env`, `cloud_client.py` |
| Base de datos | **Neon PostgreSQL 18.4**, base `neondb`, tabla `telemetria_indoor` | `migrations/neon/001_init.sql` |

### 10.1 Mapa de archivos `.env` por capa

| Capa | Archivo | Secretos que contiene | Dónde debe existir también |
|---|---|---|---|
| 2 · ESP32 | `iot-nodes/agw-hydro-node/include/config.h` | SSID + passphrase del AP | Compilado en el binario |
| 3 · Raspberry | `agw-edge-raspberry/.env` | `AGW_CLOUD_API_KEY`, `AGW_AP_PASSPHRASE` | `/opt/agw-edge/.env` con `chmod 600` |
| 4 · Cloud API | `agw-cloud-api/.env` | `DATABASE_URL`, `API_TOKEN`, `JWT_SECRET`, SMTP | **Dashboard de Vercel** |
| 5 · Frontend | `agw-frontend-dashboard/.env` | `NEXTAUTH_SECRET` | Dashboard de despliegue |

**Valores que DEBEN coincidir entre capas — si divergen, el sistema se rompe en silencio:**

| Valor | Capa 2 (ESP32) | Capa 3 (Raspberry) | Capa 4 (API) |
|---|---|---|---|
| SSID de la red | `config.h: WIFI_SSID` | `AGW_AP_SSID` | — |
| Passphrase WiFi | `config.h: WIFI_PASS` | `AGW_AP_PASSPHRASE` | — |
| IP del broker | `config.h: MQTT_BROKER` | `AGW_AP_IP` | — |
| Puerto MQTT | `config.h: MQTT_PORT` = 1883 | `AGW_MQTT_PORT` = 1883 | — |
| Topics MQTT | `config.h: TOPIC_*` | `AGW_TOPIC_*` | — |
| Token del Fog | — | `AGW_CLOUD_API_KEY` | `API_TOKEN` |
| ID del gateway | — | `AGW_GATEWAY_ID` | `gateways.gateway_id` |
| ID del nodo | `config.h: DEVICE_ID` | traducido a `sensor_id` | `edge_nodes.sensor_id` |

**Lo que cada capa NO debe tener, por diseño:**
- La Raspberry **no** tiene `DATABASE_URL`. Si el gateway físico se ve
  comprometido, la base de datos no queda expuesta.
- El frontend **no** tiene `DATABASE_URL` ni `API_TOKEN`. Solo el JWT del usuario.
- Nada sensible va en variables `NEXT_PUBLIC_*`: se incrustan en el bundle y son
  visibles en el navegador.

**Pendiente de decisión (Fase 3):** la semilla de la base de datos registra
`ESP32_TIERRA_01` y `ESP32_HIDROPONIA_01`, que no existen en hardware. El nodo real
es `IoT-node-26.001`. Se recomienda **mantener `IoT-node-26.001` como identidad del
hardware** y actualizar la semilla, en lugar de reflashear el firmware.

**Vocabulario:**

- **Fog / Edge Computing** — procesamiento cerca del origen del dato. Aquí: la Raspberry.
- **LWT (Last Will and Testament)** — mensaje que el broker publica automáticamente
  si un cliente se desconecta sin despedirse. Es el mecanismo de detección de caída de nodo.
- **QoS 0 / 1** — *at most once* / *at least once*. QoS 1 garantiza entrega con
  posible duplicado; exige deduplicación en el receptor.
- **Transaction Pooler** — puerto 6543 de Supabase, modo transacción, obligatorio
  para funciones serverless.
- **OTP passwordless** — el login del dashboard: código de 6 dígitos por correo, sin contraseña.

---

## 11. Perfil de la Raspberry Pi

> ✅ **Completado 2026-08-02.** Diagnóstico ejecutado y sistema adelgazado.
> Guía de acceso remoto: [`informe/SSH.md`](./informe/SSH.md)

### 11.1 Hardware y sistema

| Dato | Valor |
|---|---|
| Modelo | **Raspberry Pi 4 Model B Rev 1.2** · 64-bit |
| RAM | 3.7 GiB · **~200 MiB en uso** tras adelgazar (antes 385 MiB) |
| Swap | `zram0` 2 GB **en RAM** · swapfile en disco eliminado |
| Almacenamiento | 6.9 GB (`/dev/sda2`, **arranca desde USB**, no microSD) |
| Sistema | **Debian 13 (Trixie)** · kernel `6.18.34+rpt-rpi-v8` |
| Gestor de red | **NetworkManager** (`dhcpcd` inactivo) → el AP se hace con `nmcli` |
| Temperatura / throttling | 39.4 °C · `throttled=0x0` — alimentación y refrigeración sanas |
| Hostname / usuario | `rasp-jh` / `rasp-jh` |

### 11.2 Red

| Interfaz | Estado |
|---|---|
| `eth0` | `192.168.20.4/24` (DHCP) · MAC `dc:a6:32:90:de:f1` · uplink a internet |
| `wlan0` | **DOWN, libre** · sin perfiles en conflicto |
| Tailscale | `100.88.237.0` — **IP fija, accesible desde cualquier red** |

**Soporte de Access Point: ✅ confirmado.** `iw list` reporta `* AP` entre los
modos soportados. País regulatorio `CO`. No hace falta dongle USB.

`nmcli connection show` solo lista `Wired connection 1` y `lo` — **no existe el
perfil `netplan wlan0-thania`** que se temía. `wlan0` está limpio para el AP.

### 11.3 Adelgazamiento aplicado

| Métrica | Antes | Después |
|---|---|---|
| Disco usado | 89 % (779 MB libres) | **~70 %** |
| RAM en uso | 385 MiB | **~200 MiB** |
| Arranque | 63.6 s | **~30 s** |
| Servicios corriendo | 23 | 12 |

Purgado: chromium, firefox, VLC, thonny, rpi-imager, firmware de chips ajenos,
todo el escritorio (Xorg, lightdm, labwc, wayvnc, mesa, llvm) + 227 dependencias.
Swapfile `/var/swap` neutralizado con `Mechanism=zram` en `/etc/rpi/swap.conf`.
Journal limitado a 50 MB. Target por defecto → `multi-user.target`.

Reversible con `/root/restore_services.sh`.

### 11.4 Blindaje de acceso

| Capa | Detalle |
|---|---|
| Watchdog hardware | BCM2835, timeout 15 s — la Pi se reinicia sola si el kernel se cuelga |
| Keepalive | `agw-keepalive.timer` cada 2 min: repara red y `rpi-connect` |
| Reintentos de red | `connection.autoconnect-retries = 0` (infinitos) |
| Vías de acceso | Tailscale (principal) · SSH LAN · Pi Connect (lento pero funciona) |

> ⚠️ **`rpi-connect` corre como servicio de usuario con `Linger=yes`.** Consultar
> su estado con `sudo` da un falso negativo. Ejecutar `rpi-connect status` como
> `rasp-jh`.

> ⚠️ **No desactivar `wpa_supplicant`.** Parece prescindible al no usar WiFi
> cliente, pero NetworkManager lo necesita para levantar el AP.

### 11.5 Lecciones registradas

1. **Desactivar `NetworkManager-wait-online` dejó la Pi inaccesible.** Los
   servicios que necesitan red arrancaban antes de que existiera. Revertido. En un
   gateway remoto, 8 s de arranque no valen la fiabilidad.
2. **Purgar `linux-image-*-rpi-2712` directamente instala una versión más nueva**
   — hay que purgar el metapaquete `linux-image-rpi-2712`, no la imagen.
3. **El swapfile se recreaba porque `Mechanism=auto` elige `zram+file`**, usando
   `/var/swap` como *writeback* de zram. No es swap activo, por eso `swapon` no lo
   mostraba.
4. **Pi Connect tarda minutos por timeouts de WebRTC**, no por fallos locales. El
   servicio arranca correctamente; falla la negociación NAT. Por eso Tailscale.

### 11.6 Estado de la Fase 2

- [x] AP `CULTIVO_INDOOR_WIFI` persistente en `wlan0` con IP fija `10.42.0.1` — **hostapd + dnsmasq**, no NetworkManager (ver `informe/RASPBERRY_SETUP.md` §4.4)
- [x] Mosquitto en `:1883` con `allow_anonymous true`
- [x] Realinear el contrato MQTT del edge (deuda 7.1) — hecho en el repo
- [x] Enmascarar `sleep.target` y desactivar el powersave del WiFi
- [x] `apt upgrade` aplicado
- [x] Mitigación del fantasma de estación (deuda 7.21)
- [ ] Desplegar `edge_controller` en `/opt/agw-edge` con servicio systemd `Restart=always`

### 11.7 Criterio de aceptación de la Fase 2 — VERIFICADO 2026-08-02

> *"Se corta la energía, se restablece, y en menos de 90 s el AP está levantado,
> Mosquitto escuchando y el servicio suscrito, sin intervención manual."*

Prueba ejecutada con reinicio completo de la Raspberry:

```
up 1 min
agw-ap-ip / hostapd / dnsmasq / mosquitto  →  active
wlan0    10.42.0.1/24
ssid     CULTIVO_INDOOR_WIFI · type AP · canal 6
:1883    escuchando
ESP32    asociado en segundos, sin retardo por estación fantasma
```

✅ **Cumplido** para el AP y el broker. Queda el servicio del edge, que aún no está
desplegado en la Pi.

**Observación relevante para la Fase 6:** el retardo de 105 s por estación fantasma
(§7.21) **no aplica al escenario de corte de energía**, porque al reiniciarse la
Raspberry hostapd arranca sin estado previo. Solo afecta al reinicio aislado del
nodo. Es una distinción que hay que documentar al medir disponibilidad: el peor caso
teórico y el peor caso operativo no coinciden.

---

## 12. Gestión de energía del WiFi — el «semáforo» del nodo

> **Requisito añadido el 2026-08-02.** Está en §12 y no en §6 porque es una decisión
> **pendiente**, no tomada. Y porque contradice dos decisiones que ya tomamos:
> `WiFi.setSleep(false)` en el firmware y `powersave 2 (disable)` en el AP, ambas
> puestas a propósito para eliminar latencia y jitter (§9).

### 12.1 El problema

Hoy el nodo mantiene la radio a plena potencia de forma permanente: unos **120 mA
continuos**. Sobre fuente de alimentación es irrelevante, pero el anteproyecto
plantea nodos que *«podrán tener conexión independiente o dependiente a una
batería, de acuerdo del espacio en donde sean instalados»*. Con 120 mA constantes,
una batería 18650 de 3000 mAh dura menos de un día. No es viable.

### 12.2 La tensión de fondo

Para **recibir** un comando por push, el nodo necesita mantener la asociación WiFi
y el socket TCP abiertos. Eso exige radio activa. Apagar la radio ahorra energía
pero rompe el canal descendente.

No se puede tener las dos cosas a la vez. Hay que elegir dónde ponerse en la
escalera, y **eso depende de la fuente de alimentación de cada nodo** — lo cual
encaja con la modularidad que propone el proyecto: el mismo firmware, distinto
nivel de ahorro según el despliegue.

### 12.3 Escalera de cuatro niveles

| Nivel | Mecanismo | Consumo medio | ¿Recibe comandos? | Latencia descendente |
|---|---|---|---|---|
| **0** — actual | Radio siempre activa (`setSleep(false)`) | ~120 mA | Sí, inmediato | < 100 ms |
| **1** | Modem sleep por DTIM (`WIFI_PS_MIN_MODEM`) | ~20-30 mA | **Sí** | hasta 1 DTIM (~200 ms) |
| **2** | Modem sleep agresivo (`WIFI_PS_MAX_MODEM`, `listen_interval` alto) | ~5-15 mA | Sí | hasta N × DTIM (1-3 s) |
| **3** | Light sleep: CPU detenida, radio despierta con el beacon | ~2-5 mA | Sí, con TCP afinado | 1-3 s |
| **4** | Deep sleep con ciclo de trabajo | ~10 µA dormido | **No en tiempo real** | = período de despertar |

**El nivel 1 es fruta madura.** Reduce el consumo a la cuarta parte, **conserva el
push de comandos**, y el coste en latencia (~200 ms) es despreciable frente al
objetivo de < 2 s extremo a extremo. Se activa con una línea:
`WiFi.setSleep(true)`. El AP ya tiene `dtim_period=2`, que es lo que hace que
hostapd almacene las tramas destinadas a estaciones dormidas.

### 12.4 El nivel 4 y el «webhook» que pide el usuario

En deep sleep la asociación y el socket TCP se pierden. El nodo **no puede recibir
un push**. Pero sí se puede conseguir el efecto equivalente:

**Sesión MQTT persistente.** Si el nodo se suscribe con `clean_session = false` y
**QoS 1**, Mosquitto **encola** los mensajes publicados mientras duerme y los
entrega íntegros en la reconexión. El nodo despierta, se conecta, y recibe de golpe
todos los comandos pendientes. Funcionalmente es el webhook que se busca, con la
latencia acotada por el período de despertar.

El broker ya está preparado: `max_queued_messages 10000` y `persistence true` en
`/etc/mosquitto/conf.d/agw.conf`.

> ⚠️ **Bloqueo técnico:** `PubSubClient` **siempre** conecta con
> `cleanSession = true` y **no puede publicar con QoS 1** (deuda 7.22). No soporta
> ninguna de las dos piezas que el nivel 4 necesita. Por eso 7.22 y 7.24 son la
> **misma decisión**: cambiar de librería MQTT en el firmware.
>
> Candidatas: `AsyncMqttClient` (asíncrona, QoS 1, sesión persistente) o
> `esp-mqtt` del ESP-IDF (la más completa, integrada con el gestor de energía del
> chip).

### 12.5 Efectos colaterales a resolver

1. **Un nodo dormido parece muerto.** El heartbeat de 60 s y el LWT lo darían por
   caído. Solución: publicar un `status` **retenido** con `proximo_despertar` antes
   de dormir, y alargar el keepalive MQTT por encima del período de sueño para que
   el LWT no salte por diseño. Hay que distinguir *dormido* de *caído*.
2. **Las alertas dejan de ser asíncronas.** Hoy una alerta se publica en cuanto se
   detecta. Dormido, se retrasa hasta el siguiente despertar. Para el cultivo eso
   puede ser inaceptable: hay que definir qué variables justifican despertar
   inmediatamente (interrupción por umbral en hardware) y cuáles pueden esperar.
3. **Contamina las métricas de la Fase 6.** La latencia de un nodo con ciclo de
   trabajo no es comparable con la de un nodo siempre activo. **Deben reportarse
   como escenarios separados**, no promediarse. Es más: medir el mismo nodo en los
   niveles 0, 1 y 4 y tabular consumo frente a latencia es exactamente el tipo de
   resultado que aporta valor al trabajo.
4. **El fantasma de estación empeora.** Un nodo que despierta y duerme se asocia y
   desasocia constantemente, y cada desaparición no anunciada deja un residuo en el
   firmware del AP (§7.21). Con ciclos frecuentes, el vigilante de 45 s puede no dar
   abasto. Si se va al nivel 4, el dongle USB pasa de opcional a necesario.

### 12.6 Ruta recomendada

1. **Ahora, coste casi nulo:** `WiFi.setSleep(true)` → nivel 1. Medir consumo y
   latencia antes y después. Ya es un resultado publicable.
2. **Fase 4:** añadir un módulo `ahorro_energia` al sistema de flags en caliente,
   para conmutar niveles por HTTP/MQTT sin recompilar.
3. **Fase 6:** decidir la librería MQTT (junto con QoS 1) e implementar el nivel 4
   solo si se va a defender el caso de nodo a batería.

---

## Historial de cambios del MCD

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-08-02 | 1.0 | Creación. Auditoría completa del repo, contratos canónicos, 6 decisiones justificadas, 15 deudas técnicas, plan de 6 fases. |
| 2026-08-02 | 1.2 | **Premisa de partida corregida: nada desplegado.** Se elimina el supuesto de que existían Vercel, API pública y repositorio. `.env` reapuntados a local. Migración `neon/001_init.sql` **aplicada y verificada**: 6 tablas, 15 índices, semilla, CHECK constraints probados. Deuda 7.17 cerrada; nuevas 7.18 (sin despliegue) y 7.19 (alcanzabilidad LAN Pi↔API). Fase 1 cerrada. |
| 2026-08-02 | 1.1 | **Migración Supabase → Neon PostgreSQL 18.4.** §5.1 reescrita con datos verificados contra el servidor. §6.2 ampliada con la justificación del cambio de proveedor. Deuda 7.3 (credenciales hardcodeadas) resuelta en `api/index.py`, `api/security.py` y `migrate.py`. Nuevas deudas 7.16 (sin RLS), 7.17 (base vacía), 7.18 (Vercel sin actualizar). Nueva §10.1: mapa de `.env` por capa y tabla de valores que deben coincidir entre capas. `.env` generados para las 4 capas + `.gitignore` raíz. |
