# SESSION_START — Inicializador de contexto · VitalCrop AGW

> **Este es el primer archivo que se lee en cada sesión.** No leas el MCD completo:
> este documento te dice exactamente qué cargar según lo que vayas a hacer hoy.

---

## ⚡ Arranque rápido (30 segundos)

**Copia y pega esto al agente al iniciar cualquier sesión:**

```
Lee SESSION_START.md y MCD.md §1, §2 y §8.
Estamos en la FASE <N>.
Objetivo de hoy: <objetivo>.
Antes de proponer cambios, confirma qué archivos vas a tocar según el mapa de la §8.
```

Sustituye `<N>` y `<objetivo>`. Nada más. El agente sabrá el resto.

---

## 📍 Estado actual del proyecto

| | |
|---|---|
| **Fase activa** | ✅ **FASE 1 CERRADA** · ✅ **FASE 2 — criterio de aceptación verificado** (falta desplegar el edge) |
| **Premisa** | **Nada está desplegado.** Sin Vercel, sin hosting, sin git. Operativos: base Neon + Raspberry adelgazada. |
| **Hecho en Fase 2** | Pi adelgazada (disco 89%→51%, arranque 63s→30s) · acceso blindado (Tailscale + watchdog HW + keepalive) · **AP hostapd + dnsmasq operativo** · **Mosquitto :1883** · contrato MQTT del edge realineado · firmware v1.2.0 con módulos en caliente |
| **Cadena validada** | ESP32 → WiFi → MQTT → broker. Telemetría `[OK]`, heartbeat, alertas y LWT confirmados |
| **Siguiente paso** | Pulir firmware (keepalive 20s, no publicar sin MQTT) + desplegar `edge_controller` en `/opt/agw-edge` → cierra Fase 2. Luego sensores (Fase 4) |
| **Acceso a la Pi** | `ssh rasp-jh@100.88.237.0` (Tailscale, desde cualquier red) — ver [`informe/SSH.md`](./informe/SSH.md) |
| **Última sesión** | 2026-08-02 — MCD + SESSION_START + diagnóstico; Supabase→Neon aplicada; `.env` de 4 capas; Supabase purgado del repo; Pi adelgazada y blindada; `informe/SSH.md` |

> 🔄 **Actualiza esta tabla al final de cada sesión.** Es lo primero que se lee la
> próxima vez.

---

## 📚 Qué es cada archivo

| Archivo | Qué es | Cuándo se lee |
|---|---|---|
| **`PROMPT_INIT.md`** | Resumen autocontenido para **arrancar una conversación nueva**. Trae un bloque listo para pegar | Al abrir un contexto desde cero |
| **`SESSION_START.md`** | Este archivo. Punto de entrada, estado actual, ritual de sesión | **Siempre, primero** |
| **`MCD.md`** | Master Context Document. Fuente de verdad: arquitectura, contratos, decisiones, deudas, mapa de fases | Por secciones, según la tabla de abajo |
| **`FASE1_RASPBERRY_DIAGNOSTICO.md`** | Comandos a ejecutar en la Raspberry y plantilla para pegar la salida | Fase 1 → Fase 2 |
| `iot-nodes/agw-hydro-node/RASPBERRY_PI_AGENT_CONTEXT.md` | Contrato MQTT detallado firmware↔Raspberry (fuente original del MCD §4.1) | Fases 2, 3 |
| `VITALCROP_Arquitectura_Paper.md` | Redacción académica de la arquitectura | Al escribir el documento de grado |

---

## 🎯 Cómo usar el MCD — qué leer según la fase

**No cargues el MCD entero.** Es largo y desperdicia contexto. Lee solo:

| Si vas a trabajar en… | Lee del MCD |
|---|---|
| **Cualquier cosa** (obligatorio) | §1 Qué es el sistema · §2 Arquitectura real · §8 Plan de fases |
| **Fase 2** — Raspberry, red, broker, systemd | §3.2 · §4.1 Contrato MQTT · §4.2 Contrato REST · §6.6 · §7.1 · §11 Perfil RPi |
| **Fase 3** — MQTT y datos simulados | §3.1 · §3.2 · §4.1 · §5.1 · §5.3 · §7.4 §7.8 §7.9 · §9 Métricas |
| **Fase 4** — Sensores reales | §3.1 · §4.1 · §6.4 pH · §7.11 |
| **Fase 5** — Web, API, portal público | §3.3 · §3.4 · §4.2 · §4.3 · §5.1 · §5.2 · §7.2 §7.6 §7.7 §7.10 §7.14 |
| **Fase 6** — Pruebas y analítica | §4.1 · §6.3 Nemotron · §9 Métricas · §7.15 |
| **Escribir el documento de grado** | §2 tabla de divergencias · §6 completo (justificaciones redactadas) · §9 |
| **Dudas sobre nombres, IDs, IPs** | §10 Glosario |

### Regla de oro

> Si el código contradice al MCD, **gana el código** — y hay que actualizar el MCD
> en esa misma sesión. El MCD desactualizado es peor que no tener MCD.

---

## 🗂️ Mapa de archivos por fase

Resumen ejecutable. El detalle está en `MCD.md` §8.

### Fase 2 — Raspberry Pi
```
agw-edge-raspberry/
├── scripts/slim_system.sh          ← NUEVO: adelgazar servicios (reversible)
├── scripts/restore_services.sh     ← NUEVO: revertir
├── scripts/setup_ap.sh             ← revisar contra el SO real
├── scripts/setup_mqtt.sh           ← revisar
├── system/hostapd/hostapd.conf     ← SSID CULTIVO_INDOOR_WIFI
├── system/dnsmasq/dnsmasq.conf     ← DHCP 10.42.0.10-50
├── system/mosquitto/mosquitto.conf ← puerto 1883
├── system/systemd/agw-edge.service ← arranque prioritario + Restart=always
├── edge_controller/config.yaml     ← ⚠️ puerto 1884 → 1883
├── edge_controller/mqtt/topics.py  ← ⚠️ realinear a cultivo/indoor/hierbabuena/*
├── edge_controller/mqtt/message_handler.py
├── edge_controller/rules/rules.yaml ← ⚠️ reglas de sensores inexistentes
└── edge_controller/cloud/*.py      ← ⚠️ apuntar a agw-cloud-api.vercel.app
.gitignore                          ← NUEVO
agw-cloud-api/api/index.py:56       ← ⚠️ eliminar credencial hardcodeada
```

### Fase 3 — MQTT con datos simulados
```
iot-nodes/agw-hydro-node/src/main.cpp     ← descomentar tareas MQTT, QoS 1, modo simulación
iot-nodes/agw-hydro-node/include/config.h ← flag SIMULATION_MODE
agw-edge-raspberry/edge_controller/storage/local_db.py
agw-edge-raspberry/edge_controller/mqtt/message_handler.py  ← dedup de alertas
agw-edge-raspberry/edge_controller/cloud/sync_telemetry.py  ← timestamp UTC + traducción de IDs
agw-cloud-api/migrations/014_*.sql        ← NUEVO: unificar IDs
iot-nodes/_archive/                       ← NUEVO: mover agw-iot-nodes y agw-soil-node
```

### Fase 4 — Sensores reales
```
iot-nodes/agw-hydro-node/src/main.cpp     ← HDC1080, humedad suelo, calibración, NVS
iot-nodes/agw-hydro-node/include/config.h ← curva de calibración del capacitivo
```

### Fase 5 — Web
```
agw-cloud-api/api/routers/alerts.py       ← NUEVO
agw-cloud-api/api/routers/commands.py     ← NUEVO
agw-cloud-api/migrations/014_*.sql        ← alertas + órdenes
agw-cloud-api/migrations/015_*.sql        ← portal público
agw-cloud-api/_archive/app/               ← mover backend huérfano
agw-frontend-dashboard/hooks/*.ts         ← conectar a endpoints reales
agw-frontend-dashboard/app/(public)/      ← NUEVO: portal educativo
agw-frontend-dashboard/components/charts/PhChart.tsx  ← retirar
agw-edge-raspberry/local_web/             ← NUEVO: web de contingencia
```

### Fase 6 — Pruebas y analítica
```
tests/telecom/                            ← NUEVO: latencia, pérdida, jitter, disponibilidad
agw-cloud-api/api/routers/ai.py           ← NUEVO: NVIDIA Nemotron
agw-cloud-api/tests/                      ← tests sobre api/ (el desplegado)
system/mosquitto/                         ← activar auth
RESULTADOS.md                             ← NUEVO
```

---

## ⚠️ Trampas conocidas — léelas antes de tocar código

1. **Hay DOS backends en `agw-cloud-api/`.** El vivo es `api/` (Vercel). `app/` es
   huérfano y no está desplegado. **No edites `app/` pensando que arreglas producción.**

2. **Hay DOS familias de migraciones.** El esquema real es `011`, `012`, `013`.
   `001-010` nunca se ejecutó en Supabase.

3. **Hay TRES proyectos de firmware.** El vivo es `agw-hydro-node`.
   `agw-iot-nodes` y `agw-soil-node` están muertos.

4. **Los topics MQTT no coinciden entre firmware y edge.** Gana el firmware:
   `cultivo/indoor/hierbabuena/*` en el puerto **1883** (el edge dice 1884: está mal).

5. **`node_id` significa cosas distintas según dónde estés.**
   En la API de nube: `node_id` = Raspberry (`FOG_RPI_HIERBABUENA_01`),
   `sensor_id` = ESP32 (`IoT-node-26.001`). En el firmware, `id` = ESP32.

6. **El firmware tiene las tareas MQTT comentadas** en `setup()` (`main.cpp` ~línea 520).
   Si "no llega nada al broker", empieza por ahí.

7. **El ESP32 no tiene reloj.** Manda `uptime` en milisegundos. El timestamp real lo
   pone la Raspberry.

8. **El proyecto no está en git.** Antes de hacer cambios grandes en la Raspberry,
   `git init`. Sin control de versiones no hay marcha atrás.

9. **El pH está retirado del alcance** (MCD §6.4), pero la columna y el código
   siguen ahí a propósito, como demostración de modularidad. No los borres.

10. **La IA es NVIDIA Nemotron**, no Gemini. El anteproyecto dice Gemini; está
    justificado el cambio en MCD §6.3.

11. **La base de datos es Neon, no Supabase** (migrado 2026-08-02). Cualquier
    referencia a Supabase en el código o en `migrations/001-013` es histórica. El
    esquema vivo es `migrations/neon/`.

12. **Dos endpoints de Neon, no son intercambiables.** El que tiene `-pooler` es
    PgBouncer en modo transacción: úsalo desde la API. El directo (sin `-pooler`)
    es para DDL y `psql`. **`asyncpg` no funciona contra el pooler** (usa prepared
    statements); `psycopg2` sí.

13. **Cambiar un valor en un `.env` casi nunca basta.** Hay valores que deben
    coincidir entre capas (SSID, puerto MQTT, topics, token del Fog, IDs). La tabla
    de correspondencias está en MCD §10.1. Si cambias uno solo, el sistema falla
    en silencio.

14. **Nada está desplegado.** Las URLs `agw-cloud-api.vercel.app`,
    `soberania.it.noxumsoluciones.com` y `api.vitalcrop.io` aparecen en documentos
    y código antiguos pero **no existen**. La API corre en `http://localhost:8000`.

15. **La Raspberry no alcanza `localhost` del PC.** Para que el edge llegue a la
    API en Fase 3: levantar uvicorn con `--host 0.0.0.0` y poner la IP LAN del PC
    en `AGW_CLOUD_BASE_URL`. Mientras tanto, `AGW_CLOUD_ENABLED=false` deja al
    edge acumulando en el buffer SQLite, que es suficiente para probar MQTT.

---

## 🖥️ Cómo levantar el sistema en local

```bash
# 0) Dependencias — AÚN NO INSTALADAS (fastapi falta en el PC)
cd agw-cloud-api
pip install -r requirements.txt

# 1) Cloud API  →  http://localhost:8000/docs
cd agw-cloud-api
uvicorn api.index:app --reload --host 0.0.0.0 --port 8000
#    api/_env.py carga el .env solo. No hace falta exportar nada.

# 2) Frontend   →  http://localhost:3652
cd agw-frontend-dashboard
npm install    # solo la primera vez
npm run dev

# 3) Estado de la base de datos
cd agw-cloud-api
python migrate.py --status
```

---

## 🔁 Ritual de sesión

### Al abrir

1. Leer este archivo (§ Estado actual y § Trampas).
2. Leer las secciones del MCD que corresponden a la fase (tabla de arriba).
3. Declarar en voz alta: **"Estamos en la Fase N, el objetivo de hoy es X, voy a
   tocar estos archivos: …"** y esperar confirmación.

### Durante

- Un cambio → una verificación. No acumular cambios sin probar.
- Si aparece un conflicto nuevo, **anotarlo en `MCD.md` §7** con severidad y fase de
  resolución. No arreglarlo fuera de fase salvo que bloquee.
- Si una decisión cambia (tecnología, alcance, variable), **escribir la justificación
  en `MCD.md` §6**, no solo hacer el cambio. El documento de grado la va a necesitar.

### Al cerrar

1. Actualizar **§ Estado actual** de este archivo (fase, bloqueo, siguiente acción).
2. Actualizar `MCD.md` si cambió algún contrato, decisión o deuda.
3. Registrar la fecha en el historial de cambios del MCD.

---

## ✅ Definición de "fase terminada"

Una fase no está cerrada hasta que se cumple su criterio de aceptación **verificado
en hardware real**, no en teoría.

| Fase | Criterio de aceptación |
|---|---|
| **1** | MCD, SESSION_START y guía de diagnóstico existen. §11 del MCD llena con datos reales de la Raspberry. |
| **2** | Se corta la energía de la Raspberry, se restablece, y en **< 90 s** el AP está levantado, Mosquitto escuchando en `:1883` y el servicio suscrito — sin intervención manual. |
| **3** | Telemetría simulada del ESP32 llega a `telemetria_indoor` en Supabase con timestamp UTC correcto. Al desconectar el ESP32 se registra el LWT. Al cortar internet se acumula en SQLite y al restablecer se vacía **sin pérdida**. |
| **4** | Los tres sensores reales publican valores plausibles y calibrados. Los actuadores responden a `set_riego` desde la Raspberry. |
| **5** | El dashboard privado muestra telemetría real en tiempo real y envía órdenes que el ESP32 ejecuta. El portal público es navegable. |
| **6** | Tabla completa de métricas de MCD §9 con datos medidos, no estimados. `RESULTADOS.md` redactado. |

---

## 📌 Recordatorio del objetivo real

El proyecto es de **Ingeniería en Telecomunicaciones**. El invernadero, la
hierbabuena y el dashboard son el *vehículo*. Lo que se evalúa y se defiende es:

> **latencia, pérdida de datos, disponibilidad del gateway y estabilidad del enlace
> MQTT en una arquitectura Fog con conectividad intermitente.**

Cada fase debe dejar instrumentación que alimente la tabla de `MCD.md` §9. Si una
sesión termina sin poder medir nada nuevo, revisar si se está construyendo lo
correcto.
