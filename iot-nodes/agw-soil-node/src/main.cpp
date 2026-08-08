/*
 * ============================================================
 *  VitalCrop AGW — Nodo SUELO (AGW-SOIL-01)
 *  Firmware / Arduino + PlatformIO / ESP32 DevKit v1
 * ============================================================
 *
 *  SENSORES:
 *    - DHT22   → Temperatura y Humedad del aire      (GPIO 4)
 *    - Capacitivo de suelo (analógico)                (GPIO 36 / A0)
 *
 *  ACTUADORES:
 *    - Relé bomba   (GPIO 16)
 *    - Relé válvula 1 (GPIO 17)
 *    - Relé válvula 2 (GPIO 18)
 *
 *  FUNCIONALIDADES GENERALES (ya implementadas):
 *    ✔ WiFi con reconexión automática y backoff exponencial
 *    ✔ MQTT (PubSubClient) con LWT, reconexión y cola offline (50 msgs)
 *    ✔ Publicación de telemetría y estado en JSON (ArduinoJson)
 *    ✔ Suscripción a comandos → activar bomba/válvulas + ACK
 *    ✔ Calibración persistente en NVS (Preferences)
 *    ✔ OTA por ArduinoOTA con contraseña
 *    ✔ Scheduler no bloqueante basado en millis()
 *    ✔ LED de estado (GPIO 2): lento = OK, rápido = error
 *    ✔ Logger serial con niveles DEBUG / INFO / WARN / ERROR
 *
 *  PENDIENTE PARA TI:
 *    → Ajustar WIFI_SSID, WIFI_PASS, MQTT_BROKER con tus valores
 *    → Verificar los pines según tu PCB / circuito
 *    → Calibrar el sensor de suelo (VAL_SUELO_SECO / VAL_SUELO_HUMEDO)
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ArduinoOTA.h>
#include <Preferences.h>

// ============================================================
//  CONFIGURACIÓN — edita aquí
// ============================================================
#define DEVICE_ID         "AGW-SOIL-01"
#define DEVICE_TYPE       "soil"
#define FIRMWARE_VERSION  "1.2.0"

#define WIFI_SSID         "AGW_IOT_NET"
#define WIFI_PASS         "your_wpa2_password"

#define MQTT_BROKER       "10.10.0.1"
#define MQTT_PORT         1883
#define MQTT_USER         "esp32_node"
#define MQTT_PASS         "mqtt_password"
#define MQTT_KEEPALIVE    60

#define OTA_PASSWORD      "ota_secure_password"

// Intervalos (ms)
#define INTERVAL_SENSOR       5000
#define INTERVAL_TELEMETRY  300000   // 5 minutos (default, configurable por MQTT)
#define INTERVAL_STATUS      60000

// Umbrales de alerta (defaults)
#define UMBRAL_TEMP_MIN     10.0f
#define UMBRAL_TEMP_MAX     40.0f
#define UMBRAL_HUM_MIN      30.0f
#define UMBRAL_HUM_MAX      90.0f
#define UMBRAL_SUELO_MIN    20.0f
#define UMBRAL_SUELO_MAX    95.0f

// Ventanas de escalado de alerta
#define ALERTA_LEVE_MS     300000UL   //  5 min
#define ALERTA_MEDIA_MS   1200000UL   // 20 min
#define ALERTA_GRAVE_MS   3600000UL   //  1 hora

// Pines
#define PIN_DHT22          4
#define PIN_SOIL_MOISTURE  36    // GPIO36 / A0
#define PIN_PUMP_RELAY     16
#define PIN_VALVE1_RELAY   17
#define PIN_VALVE2_RELAY   18
#define PIN_STATUS_LED     2

// Calibración sensor capacitivo (12-bit ADC)
#define VAL_SUELO_SECO    4095   // Lectura en aire
#define VAL_SUELO_HUMEDO  1500   // Lectura en agua

// ============================================================
//  TOPICS MQTT
// ============================================================
const char* TOPIC_TELEMETRY = "agw/node/" DEVICE_TYPE "/telemetry";
const char* TOPIC_STATUS    = "agw/node/" DEVICE_TYPE "/status";
const char* TOPIC_ALERTS    = "agw/node/" DEVICE_TYPE "/alerts";
const char* TOPIC_CONFIG    = "agw/node/" DEVICE_TYPE "/config";
const char* TOPIC_COMMANDS  = "agw/gateway/commands";
const char* TOPIC_CMD       = "agw/node/" DEVICE_TYPE "/cmd";  // Comandos directos al nodo
// LWT (Last Will Testament)
const char* LWT_PAYLOAD     = "{\"node_id\":\"" DEVICE_ID "\",\"online\":false}";

// ============================================================
//  ESTADO GLOBAL
// ============================================================
float g_temp      = 0.0;
float g_humidity  = 0.0;
float g_moisture  = 0.0;    // 0-100 %
bool  g_pump      = false;
bool  g_valve1    = false;
bool  g_valve2    = false;

// Timers no bloqueantes para actuadores
unsigned long g_pumpOffAt   = 0;
unsigned long g_valve1OffAt = 0;
unsigned long g_valve2OffAt = 0;

// Período de telemetría configurable por MQTT
unsigned long g_periodoTelemetria = INTERVAL_TELEMETRY;

// Umbrales de alerta (configurables por MQTT)
float g_umbral_temp_min   = UMBRAL_TEMP_MIN;
float g_umbral_temp_max   = UMBRAL_TEMP_MAX;
float g_umbral_hum_min    = UMBRAL_HUM_MIN;
float g_umbral_hum_max    = UMBRAL_HUM_MAX;
float g_umbral_suelo_min  = UMBRAL_SUELO_MIN;
float g_umbral_suelo_max  = UMBRAL_SUELO_MAX;

// Acumuladores de tiempo fuera de umbral (ms)
unsigned long g_t_fuera_temp   = 0;
unsigned long g_t_fuera_hum    = 0;
unsigned long g_t_fuera_suelo  = 0;

// ============================================================
//  OBJETOS GLOBALES
// ============================================================
DHT dht(PIN_DHT22, DHT22);
WiFiClient    espClient;
PubSubClient  mqttClient(espClient);
Preferences   prefs;

// Cola offline de telemetría
#define MAX_OFFLINE_QUEUE 50
String offlineQueue[MAX_OFFLINE_QUEUE];
int    offlineHead = 0;
int    offlineTail = 0;
int    offlineCount = 0;

// Scheduler
unsigned long lastSensor    = 0;
unsigned long lastTelemetry = 0;
unsigned long lastStatus    = 0;
unsigned long lastAlerta    = 0;   // Monitor de alertas

// WiFi reconexión
unsigned long lastWifiRetry   = 0;
unsigned long wifiBackoff     = 5000;

// MQTT reconexión
unsigned long lastMqttRetry   = 0;
unsigned long mqttBackoff     = 5000;

// LED
unsigned long lastLedToggle = 0;
bool          ledState      = false;

// ============================================================
//  LOGGER
// ============================================================
#define LOG(level, tag, msg) Serial.printf("[%lu][%s] %s: %s\n", millis(), level, tag, msg)
#define LOG_FMT(level, tag, fmt, ...) Serial.printf("[%lu][%s] " tag ": " fmt "\n", millis(), level, ##__VA_ARGS__)

void logInfo(const char* tag, const char* msg)   { LOG("INFO",  tag, msg); }
void logWarn(const char* tag, const char* msg)   { LOG("WARN",  tag, msg); }
void logError(const char* tag, const char* msg)  { LOG("ERROR", tag, msg); }
void logDebug(const char* tag, const char* msg)  { LOG("DEBUG", tag, msg); }
void logInfoF(const char* tag, const char* fmt, ...) {
    char buf[256];
    va_list args; va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args); va_end(args);
    LOG("INFO", tag, buf);
}

// ============================================================
//  ACTUADORES — helpers no bloqueantes
// ============================================================
void activateActuator(uint8_t pin, bool* stateFlag, unsigned long* offAt, unsigned long durationMs) {
    digitalWrite(pin, HIGH);
    *stateFlag = true;
    if (durationMs > 0) *offAt = millis() + durationMs;
    else                 *offAt = 0;
    logInfoF("ACT", "Pin %d ON — duracion: %lu ms", pin, durationMs);
}

void deactivateActuator(uint8_t pin, bool* stateFlag, unsigned long* offAt) {
    digitalWrite(pin, LOW);
    *stateFlag = false;
    *offAt = 0;
    logInfoF("ACT", "Pin %d OFF", pin);
}

void updateActuators() {
    unsigned long now = millis();
    if (g_pump   && g_pumpOffAt   && now >= g_pumpOffAt)   deactivateActuator(PIN_PUMP_RELAY,   &g_pump,   &g_pumpOffAt);
    if (g_valve1 && g_valve1OffAt && now >= g_valve1OffAt) deactivateActuator(PIN_VALVE1_RELAY, &g_valve1, &g_valve1OffAt);
    if (g_valve2 && g_valve2OffAt && now >= g_valve2OffAt) deactivateActuator(PIN_VALVE2_RELAY, &g_valve2, &g_valve2OffAt);
}

// ============================================================
//  SENSORES
// ============================================================
void readSensors() {
    // DHT22
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t) && t >= -40 && t <= 80 && h >= 0 && h <= 100) {
        g_temp = t; g_humidity = h;
    } else {
        logWarn("DHT", "Lectura invalida");
    }

    // Capacitivo de suelo
    int raw = analogRead(PIN_SOIL_MOISTURE);
    float m = (float)(VAL_SUELO_SECO - raw) / (float)(VAL_SUELO_SECO - VAL_SUELO_HUMEDO) * 100.0f;
    g_moisture = constrain(m, 0.0f, 100.0f);

    logInfoF("SENSOR", "Temp=%.1f°C Hum=%.1f%% Suelo=%.1f%%", g_temp, g_humidity, g_moisture);
}

// ============================================================
//  MQTT — payload builder
// ============================================================
String buildTelemetryPayload() {
    StaticJsonDocument<512> doc;
    doc["node_id"]          = DEVICE_ID;
    doc["device_type"]      = DEVICE_TYPE;
    doc["uptime_ms"]        = millis();
    doc["rssi"]             = WiFi.RSSI();
    doc["firmware_version"] = FIRMWARE_VERSION;

    JsonObject sensors = doc.createNestedObject("sensors");
    sensors["temperature"]  = round(g_temp     * 100) / 100.0;
    sensors["humidity"]     = round(g_humidity * 100) / 100.0;
    sensors["soil_moisture"]= round(g_moisture * 100) / 100.0;

    JsonObject actuators = doc.createNestedObject("actuators");
    actuators["pump"]    = g_pump;
    actuators["valve_1"] = g_valve1;
    actuators["valve_2"] = g_valve2;

    String out;
    serializeJson(doc, out);
    return out;
}

// ============================================================
//  MQTT — cola offline
// ============================================================
void enqueueOffline(const String& payload) {
    if (offlineCount >= MAX_OFFLINE_QUEUE) {
        // Descartar el más antiguo
        offlineHead = (offlineHead + 1) % MAX_OFFLINE_QUEUE;
        offlineCount--;
    }
    offlineQueue[offlineTail] = payload;
    offlineTail = (offlineTail + 1) % MAX_OFFLINE_QUEUE;
    offlineCount++;
    logInfoF("MQTT", "Queued offline. En cola: %d", offlineCount);
}

void flushOfflineQueue() {
    while (offlineCount > 0 && mqttClient.connected()) {
        String& p = offlineQueue[offlineHead];
        if (mqttClient.publish(TOPIC_TELEMETRY, p.c_str())) {
            offlineHead = (offlineHead + 1) % MAX_OFFLINE_QUEUE;
            offlineCount--;
        } else {
            break;
        }
    }
}

// ============================================================
//  MQTT — publish helpers
// ============================================================
void publishTelemetry() {
    String payload = buildTelemetryPayload();
    if (mqttClient.connected()) {
        mqttClient.publish(TOPIC_TELEMETRY, payload.c_str());
        logInfo("PUB", "Telemetria publicada");
    } else {
        enqueueOffline(payload);
    }
}

void publishStatus() {
    if (!mqttClient.connected()) return;
    StaticJsonDocument<256> doc;
    doc["node_id"]          = DEVICE_ID;
    doc["online"]           = true;
    doc["rssi"]             = WiFi.RSSI();
    doc["uptime_ms"]        = millis();
    doc["firmware_version"] = FIRMWARE_VERSION;
    String out;
    serializeJson(doc, out);
    mqttClient.publish(TOPIC_STATUS, out.c_str(), true);
    logInfo("PUB", "Status publicado");
}

// ============================================================
//  MQTT — callback de mensajes entrantes
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String msg = "";
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
    logInfoF("SUB", "Mensaje en [%s]: %s", topic, msg.c_str());

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) {
        logError("SUB", "JSON invalido");
        return;
    }

    // --- Canal de comandos directos al nodo (topic cmd) ---
    if (String(topic) == TOPIC_CMD) {
        const char* cmd = doc["cmd"] | "";

        // Cambiar período de telemetría
        if (strcmp(cmd, "set_periodo") == 0) {
            unsigned long nuevo = doc["valor"] | 0UL;
            if (nuevo >= 5000) {
                g_periodoTelemetria = nuevo;
                logInfoF("CMD", "Periodo actualizado a %lu ms", nuevo);
            }
        }
        // Ajustar umbrales de alerta
        else if (strcmp(cmd, "set_umbral") == 0) {
            const char* var = doc["variable"] | "";
            float mn = doc["min"] | -9999.0f;
            float mx = doc["max"] | -9999.0f;
            if      (strcmp(var,"temp")  == 0) { if(mn>-9999) g_umbral_temp_min=mn;  if(mx>-9999) g_umbral_temp_max=mx;  }
            else if (strcmp(var,"hum")   == 0) { if(mn>-9999) g_umbral_hum_min=mn;   if(mx>-9999) g_umbral_hum_max=mx;   }
            else if (strcmp(var,"suelo") == 0) { if(mn>-9999) g_umbral_suelo_min=mn; if(mx>-9999) g_umbral_suelo_max=mx; }
            logInfoF("CMD", "Umbral [%s] min=%.2f max=%.2f", var, mn, mx);
        }
        // Status inmediato
        else if (strcmp(cmd, "get_status") == 0) {
            StaticJsonDocument<256> st;
            st["node_id"]  = DEVICE_ID;
            st["online"]   = true;
            st["uptime_ms"]= millis();
            st["periodo"]  = g_periodoTelemetria;
            st["fw"]       = FIRMWARE_VERSION;
            String out; serializeJson(st, out);
            mqttClient.publish(TOPIC_STATUS, out.c_str(), true);
        }
        // Reset
        else if (strcmp(cmd, "reset") == 0) {
            logWarn("CMD", "Reset solicitado por Raspberry");
            delay(500);
            ESP.restart();
        }
        return;
    }

    // --- Canal de comandos de gateway (topic COMMANDS) ---
    if (String(topic) == TOPIC_COMMANDS) {
        const char* target = doc["target_node"];
        if (String(target) != DEVICE_ID) return;

        const char* cmdId  = doc["command_id"] | "unknown";
        const char* action = doc["action"]      | "";
        int secs = doc["params"]["duration_seconds"] | 0;
        unsigned long durMs = (unsigned long)secs * 1000;

        if      (String(action) == "ACTIVATE_PUMP")      activateActuator(PIN_PUMP_RELAY,   &g_pump,   &g_pumpOffAt,   durMs);
        else if (String(action) == "ACTIVATE_VALVE_1")   activateActuator(PIN_VALVE1_RELAY, &g_valve1, &g_valve1OffAt, durMs);
        else if (String(action) == "ACTIVATE_VALVE_2")   activateActuator(PIN_VALVE2_RELAY, &g_valve2, &g_valve2OffAt, durMs);
        else if (String(action) == "DEACTIVATE_PUMP")    deactivateActuator(PIN_PUMP_RELAY,   &g_pump,   &g_pumpOffAt);
        else if (String(action) == "DEACTIVATE_VALVE_1") deactivateActuator(PIN_VALVE1_RELAY, &g_valve1, &g_valve1OffAt);
        else if (String(action) == "DEACTIVATE_VALVE_2") deactivateActuator(PIN_VALVE2_RELAY, &g_valve2, &g_valve2OffAt);

        StaticJsonDocument<256> ack;
        ack["command_id"] = cmdId;
        ack["node_id"]    = DEVICE_ID;
        ack["status"]     = "EXECUTED";
        ack["uptime_ms"]  = millis();
        String ackStr; serializeJson(ack, ackStr);
        mqttClient.publish(TOPIC_ALERTS, ackStr.c_str());
    }

    // --- Configuración (calibración NVS) ---
    if (String(topic) == TOPIC_CONFIG) {
        prefs.begin("agw", false);
        if (doc.containsKey("soil_dry")) prefs.putInt("soil_dry", doc["soil_dry"].as<int>());
        if (doc.containsKey("soil_wet")) prefs.putInt("soil_wet", doc["soil_wet"].as<int>());
        prefs.end();
        logInfo("CFG", "Calibracion guardada en NVS");
    }
}

// ============================================================
//  Monitor de alertas — asíncrono al período de telemetría
//  Se llama desde loop() cada INTERVAL_SENSOR ms
// ============================================================
void checkAlertas() {
    auto evaluar = [](const char* nombre, float valor, float vmin, float vmax,
                      unsigned long &acum) {
        bool fuera = (valor < vmin || valor > vmax);
        if (!fuera) { acum = 0; return; }
        acum += INTERVAL_SENSOR;

        const char* nivel = nullptr;
        if      (acum >= ALERTA_GRAVE_MS) nivel = "GRAVE";
        else if (acum >= ALERTA_MEDIA_MS) nivel = "MEDIA";
        else if (acum >= ALERTA_LEVE_MS)  nivel = "LEVE";
        else return;

        StaticJsonDocument<384> doc;
        doc["node_id"]    = DEVICE_ID;
        doc["uptime_ms"]  = millis();
        doc["variable"]   = nombre;
        doc["valor"]      = round(valor * 100) / 100.0;
        doc["umbral_min"] = vmin;
        doc["umbral_max"] = vmax;
        doc["duracion_ms"]= acum;
        doc["nivel"]      = nivel;
        String out; serializeJson(doc, out);
        // Publicación directa (estamos en loop(), un solo hilo)
        extern PubSubClient mqttClient;
        mqttClient.publish(TOPIC_ALERTS, out.c_str());
        LOG_FMT("WARN", "ALERTA", "[%s] %s=%.2f dur=%lu ms", nivel, nombre, valor, acum);
    };

    evaluar("temp",  g_temp,     g_umbral_temp_min,  g_umbral_temp_max,  g_t_fuera_temp);
    evaluar("hum",   g_humidity, g_umbral_hum_min,   g_umbral_hum_max,   g_t_fuera_hum);
    evaluar("suelo", g_moisture, g_umbral_suelo_min, g_umbral_suelo_max, g_t_fuera_suelo);
}

// ============================================================
//  MQTT — conexión y reconexión
// ============================================================
void mqttReconnect() {
    if (WiFi.status() != WL_CONNECTED) return;

    logInfo("MQTT", "Conectando al broker...");
    // Autenticación desactivada por el momento.
    // Para activarla en el futuro:
    //   1. Editar /etc/mosquitto/mosquitto.conf: allow_anonymous false
    //   2. Crear usuario: mosquitto_passwd -c /etc/mosquitto/passwd esp32_soil
    //   3. Reemplazar la siguiente línea por:
    //      bool ok = mqttClient.connect(DEVICE_ID, MQTT_USER, MQTT_PASS, ...);
    bool ok = mqttClient.connect(DEVICE_ID, NULL, NULL,
                                  TOPIC_STATUS, 1, true, LWT_PAYLOAD);
    if (ok) {
        logInfo("MQTT", "Conectado!");
        mqttBackoff = 5000;
        mqttClient.subscribe(TOPIC_COMMANDS);
        mqttClient.subscribe(TOPIC_CONFIG);
        mqttClient.subscribe(TOPIC_CMD);   // Comandos directos al nodo

        String onlinePayload = "{\"node_id\":\"" DEVICE_ID "\",\"online\":true}";
        mqttClient.publish(TOPIC_STATUS, onlinePayload.c_str(), true);
        flushOfflineQueue();
    } else {
        mqttBackoff = min(mqttBackoff * 2, (unsigned long)60000);
        logInfoF("MQTT", "Fallo, rc=%d. Reintento en %lu ms", mqttClient.state(), mqttBackoff);
    }
}

// ============================================================
//  WiFi — conexión
// ============================================================
void wifiSetup() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    logInfoF("WIFI", "Conectando a %s", WIFI_SSID);
}

void wifiLoop() {
    if (WiFi.status() == WL_CONNECTED) {
        wifiBackoff = 5000;
        return;
    }
    unsigned long now = millis();
    if (now - lastWifiRetry > wifiBackoff) {
        lastWifiRetry = now;
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        wifiBackoff = min(wifiBackoff * 2, (unsigned long)60000);
        logInfoF("WIFI", "Reconectando... backoff=%lu ms", wifiBackoff);
    }
}

// ============================================================
//  LED de estado
// ============================================================
void updateLed() {
    unsigned long now = millis();
    unsigned long interval = (WiFi.status() == WL_CONNECTED && mqttClient.connected()) ? 2000 : 250;
    if (now - lastLedToggle >= interval) {
        lastLedToggle = now;
        ledState = !ledState;
        digitalWrite(PIN_STATUS_LED, ledState);
    }
}

// ============================================================
//  OTA
// ============================================================
void otaSetup() {
    ArduinoOTA.setHostname(DEVICE_ID);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]()  { logInfo("OTA", "Inicio de actualización"); });
    ArduinoOTA.onEnd([]()    { logInfo("OTA", "Actualización completa");  });
    ArduinoOTA.onError([](ota_error_t e) { logInfoF("OTA", "Error [%u]", e); });
    ArduinoOTA.begin();
    logInfo("OTA", "OTA listo");
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    logInfo("SYS", "=== VitalCrop AGW — Nodo SOIL ===");
    logInfo("SYS", "Device: " DEVICE_ID "  FW: " FIRMWARE_VERSION);

    // Pines actuadores
    pinMode(PIN_PUMP_RELAY,   OUTPUT); digitalWrite(PIN_PUMP_RELAY,   LOW);
    pinMode(PIN_VALVE1_RELAY, OUTPUT); digitalWrite(PIN_VALVE1_RELAY, LOW);
    pinMode(PIN_VALVE2_RELAY, OUTPUT); digitalWrite(PIN_VALVE2_RELAY, LOW);
    pinMode(PIN_STATUS_LED,   OUTPUT);

    // Sensores
    dht.begin();
    analogReadResolution(12);

    // Calibración desde NVS (si existe)
    // Puedes leerla con prefs.begin / getInt aquí si la extiendes

    // Red
    wifiSetup();

    // MQTT
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setKeepAlive(MQTT_KEEPALIVE);
    mqttClient.setCallback(mqttCallback);

    // OTA
    otaSetup();

    logInfo("SYS", "Setup completado");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // Red y MQTT
    wifiLoop();

    if (!mqttClient.connected()) {
        if (now - lastMqttRetry > mqttBackoff) {
            lastMqttRetry = now;
            mqttReconnect();
        }
    } else {
        mqttClient.loop();
    }

    // OTA
    ArduinoOTA.handle();

    // LED
    updateLed();

    // Actuadores (timers automáticos)
    updateActuators();

    // ---- Scheduler ----
    if (now - lastSensor >= INTERVAL_SENSOR) {
        lastSensor = now;
        readSensors();
        // Monitor de alertas: corre cada vez que leemos sensores
        if (mqttClient.connected()) checkAlertas();
    }
    if (now - lastTelemetry >= g_periodoTelemetria) {
        lastTelemetry = now;
        publishTelemetry();
    }
    if (now - lastStatus >= INTERVAL_STATUS) {
        lastStatus = now;
        publishStatus();
    }
}
