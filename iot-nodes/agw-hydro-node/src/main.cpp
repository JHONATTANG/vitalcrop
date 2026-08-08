/*
 * ============================================================
 *  AGW — Nodo HIDROPÓNICO (IoT-node-26.001)
 *  Firmware v1.2.0 / Arduino + PlatformIO / ESP32 DevKit v1
 * ============================================================
 *
 *  NOVEDAD v1.2.0 — Módulos activables en caliente
 *  ------------------------------------------------------------
 *  Todas las tareas se crean siempre, pero cada una consulta un flag
 *  antes de trabajar. Los flags se cambian en caliente por DOS canales
 *  independientes, sin recompilar ni reiniciar:
 *
 *     1. HTTP  →  POST http://<ip>/modulo  {"modulo":"telemetria","activo":true}
 *     2. MQTT  →  cultivo/indoor/hierbabuena/cmd
 *                 {"cmd":"set_modulo","modulo":"telemetria","activo":true}
 *
 *  Que sean dos canales es deliberado: si el broker MQTT cae o la
 *  suscripción se pierde, el nodo sigue siendo controlable por HTTP.
 *
 *  Por defecto TODO arranca apagado (config.h). El nodo solo conecta al
 *  WiFi y levanta los dos planos de control. Se enciende lo que se quiera
 *  probar, de uno en uno. Los flags se guardan en NVS y sobreviven al
 *  reinicio; `{"cmd":"reset_modulos"}` vuelve a los valores por defecto.
 *
 *  LOS MODULOS SON TAMBIEN UN MECANISMO DE AHORRO DE ENERGIA
 *  ------------------------------------------------------------
 *  Un modulo apagado no es solo "silencio": es consumo que no ocurre.
 *  Cada tarea inactiva deja de despertar la CPU, de muestrear el ADC,
 *  de mover el bus I2C y de transmitir por radio. En un nodo alimentado
 *  por bateria, encender solo lo que ese nodo necesita es la primera
 *  palanca de ahorro, antes incluso de tocar el modo de energia del WiFi.
 *
 *  Coste aproximado por modulo (ESP32-D0WD-V3 @240 MHz):
 *      telemetria    ~2 mA medios   (radio en cada publicacion)
 *      status        ~1 mA medios   (heartbeat cada 60 s)
 *      alertas       ~3 mA          (evalua cada 5 s, CPU activa)
 *      sensor_hdc    ~2 mA          (I2C cada 5 s)
 *      sensor_suelo  ~3 mA          (ADC cada 5 s)
 *      sensor_ph     ~5 mA          (10 muestras ADC + ordenacion)
 *      actuadores    ~2 mA + reles  (los reles dominan: 20-70 mA c/u)
 *      ahorro_wifi   -90 mA         (nivel 1: modem sleep, MCD §12)
 *
 *  Con todo apagado salvo los planos de control y ahorro_wifi activo,
 *  el nodo ronda los 25-30 mA. Con todo encendido y sin ahorro, supera
 *  los 140 mA. Es una diferencia de 5x decidible en caliente, sin
 *  recompilar y sin tocar el hardware.
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ClosedCube_HDC1080.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include "esp_system.h"
#include "nvs_flash.h"
#include "config.h"

// ============================================================
//  MÓDULOS ACTIVABLES
// ============================================================
struct Modulos {
    bool telemetria;
    bool status;
    bool alertas;
    bool sensor_hdc;
    bool sensor_suelo;
    bool sensor_ph;
    bool actuadores;
    bool simulacion;
    bool ahorro_wifi;
    bool test_valvulas;
};

static Modulos mods = {
    DEFAULT_MOD_TELEMETRIA,
    DEFAULT_MOD_STATUS,
    DEFAULT_MOD_ALERTAS,
    DEFAULT_MOD_SENSOR_HDC,
    DEFAULT_MOD_SENSOR_SUELO,
    DEFAULT_MOD_SENSOR_PH,
    DEFAULT_MOD_ACTUADORES,
    DEFAULT_MOD_SIMULACION,
    DEFAULT_MOD_AHORRO_WIFI,
    DEFAULT_MOD_TEST_VALVULAS
};

// ============================================================
//  RELÉS — una sola puerta para toda la logica de salida
// ============================================================
/*  Centralizar la polaridad aqui evita el error clasico de tener
 *  digitalWrite(pin, LOW) repartidos por el codigo y no saber si eso
 *  enciende o apaga. Cambiar RELE_ACTIVO_BAJO en config.h invierte
 *  todo el sistema de golpe.                                          */
inline void releOn(uint8_t pin)  { digitalWrite(pin, RELE_ACTIVO_BAJO ? LOW  : HIGH); }
inline void releOff(uint8_t pin) { digitalWrite(pin, RELE_ACTIVO_BAJO ? HIGH : LOW ); }

static const uint8_t PINES_RELE[4]   = { PIN_SAL1, PIN_SAL2, PIN_SAL3, PIN_SAL4 };
static const char*   NOMBRES_RELE[4] = { "Valvula HIDROPONIA",
                                         "Valvula TIERRA",
                                         "MOTOBOMBA",
                                         "AMBIENTE (ventilador+luz)" };
//  Alias aceptados por los comandos, en el mismo orden que PINES_RELE
static const char*   ALIAS_RELE[4]   = { "hidroponia", "tierra", "bomba", "ambiente" };

//  Estado actual de cada salida, para poder consultarlo sin leer el GPIO
static bool estado_salida[4] = { false, false, false, false };

void salidaSet(uint8_t idx, bool encendida) {
    if (idx >= 4) return;
    estado_salida[idx] = encendida;
    if (encendida) releOn(PINES_RELE[idx]);
    else           releOff(PINES_RELE[idx]);
}

void relesTodosOff() {
    for (uint8_t i = 0; i < 4; i++) salidaSet(i, false);
}

/*  Resuelve "1".."4" o un alias ("bomba", "hidroponia"...) a indice 0..3.
 *  Devuelve -1 si no se reconoce.                                       */
int8_t salidaIndice(const char* ref) {
    if (ref == nullptr || *ref == '\0') return -1;
    if (ref[0] >= '1' && ref[0] <= '4' && ref[1] == '\0') return ref[0] - '1';
    for (uint8_t i = 0; i < 4; i++)
        if (!strcasecmp(ref, ALIAS_RELE[i])) return i;
    return -1;
}

void imprimirSalidas() {
    Serial.println("+-----------------------------------------------+");
    Serial.println("|  SALIDAS                                      |");
    Serial.println("+---+--------+----------------------------+-----+");
    for (uint8_t i = 0; i < 4; i++)
        Serial.printf("| %d | GPIO%-2d | %-26s | %-3s |\n",
                      i + 1, PINES_RELE[i], NOMBRES_RELE[i],
                      estado_salida[i] ? "ON" : "off");
    Serial.println("+---+--------+----------------------------+-----+");
}

Preferences prefs;

// ============================================================
//  OBJETOS GLOBALES
// ============================================================
SemaphoreHandle_t xMutexDatos;
SemaphoreHandle_t xMutexMqttPub;

WiFiClient   espClientPub;
PubSubClient clientPub(espClientPub);   // Publicador: telemetría, alertas, status

WiFiClient   espClientSub;
PubSubClient clientSub(espClientSub);   // Suscriptor: comandos desde la Raspberry

WebServer httpServer(HTTP_CONTROL_PORT);

ClosedCube_HDC1080 hdc1080;
bool hdcIniciado = false;

// --- Lecturas ---
float temperatura_HDC = 0.0f;
float humedad_HDC     = 0.0f;
float humedad_suelo   = 0.0f;
float ph_g            = 0.0f;

// --- Actuadores ---
volatile int  ESTADO_ACTUADORES           = HIGH;
int           tiempo_ciclo_riego          = 2000;
int           tiempo_ciclo_descanso       = 5000;
int           tiempo_ciclo_riego_noche    = 5000;
int           tiempo_ciclo_descanso_noche = 12500;
int           tiempo_descanso_ciclos      = 20000;
volatile int  DESCANSO_NOCTURNO           = LOW;
int           ciclos_riego                = 5;
volatile bool RIEGO_FORZADO               = false;

// --- Período de telemetría (configurable en caliente) ---
volatile uint32_t periodo_telemetria_ms = INTERVAL_TELEMETRY;

// --- Umbrales de alerta (configurables en caliente) ---
volatile float umbral_temp_min   = UMBRAL_TEMP_MIN;
volatile float umbral_temp_max   = UMBRAL_TEMP_MAX;
volatile float umbral_hum_min    = UMBRAL_HUM_MIN;
volatile float umbral_hum_max    = UMBRAL_HUM_MAX;
volatile float umbral_hsuelo_min = UMBRAL_HSUELO_MIN;
volatile float umbral_hsuelo_max = UMBRAL_HSUELO_MAX;
volatile float umbral_ph_min     = UMBRAL_PH_MIN;
volatile float umbral_ph_max     = UMBRAL_PH_MAX;

// --- Acumuladores de tiempo fuera de umbral (ms) ---
volatile uint32_t t_fuera_temp   = 0;
volatile uint32_t t_fuera_hum    = 0;
volatile uint32_t t_fuera_hsuelo = 0;
volatile uint32_t t_fuera_ph     = 0;

// ============================================================
//  LOGGER
// ============================================================
void logInfo(const char* tag, const char* msg)  { Serial.printf("[%8lu][INFO ] %-10s %s\n", millis(), tag, msg); }
void logWarn(const char* tag, const char* msg)  { Serial.printf("[%8lu][WARN ] %-10s %s\n", millis(), tag, msg); }
void logError(const char* tag, const char* msg) { Serial.printf("[%8lu][ERROR] %-10s %s\n", millis(), tag, msg); }
void logInfoF(const char* tag, const char* fmt, ...) {
    char buf[320];
    va_list args; va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args); va_end(args);
    Serial.printf("[%8lu][INFO ] %-10s %s\n", millis(), tag, buf);
}

// ============================================================
//  PERSISTENCIA DE MÓDULOS EN NVS
// ============================================================
void cargarModulos() {
    // Crear el namespace si no existe. Sin esto, el primer arranque tras
    // borrar la flash escupe "nvs_open failed: NOT_FOUND" — inofensivo,
    // pero ensucia el log justo cuando más se mira.
    prefs.begin(NVS_NAMESPACE, false);
    prefs.end();

    prefs.begin(NVS_NAMESPACE, true);   // solo lectura
    mods.telemetria   = prefs.getBool("telemetria",  DEFAULT_MOD_TELEMETRIA);
    mods.status       = prefs.getBool("status",      DEFAULT_MOD_STATUS);
    mods.alertas      = prefs.getBool("alertas",     DEFAULT_MOD_ALERTAS);
    mods.sensor_hdc   = prefs.getBool("sensor_hdc",  DEFAULT_MOD_SENSOR_HDC);
    mods.sensor_suelo = prefs.getBool("sensor_sue",  DEFAULT_MOD_SENSOR_SUELO);
    mods.sensor_ph    = prefs.getBool("sensor_ph",   DEFAULT_MOD_SENSOR_PH);
    mods.actuadores   = prefs.getBool("actuadores",  DEFAULT_MOD_ACTUADORES);
    mods.simulacion   = prefs.getBool("simulacion",  DEFAULT_MOD_SIMULACION);
    mods.ahorro_wifi  = prefs.getBool("ahorro_wifi", DEFAULT_MOD_AHORRO_WIFI);
    // test_valvulas NO se lee de NVS a proposito: es una prueba de banco.
    // Si sobreviviera al reinicio, un corte de luz dejaria las valvulas
    // haciendo barridos solas. Siempre arranca apagado.
    mods.test_valvulas = false;
    periodo_telemetria_ms = prefs.getUInt("periodo", INTERVAL_TELEMETRY);
    prefs.end();
}

void guardarModulos() {
    prefs.begin(NVS_NAMESPACE, false);  // lectura y escritura
    prefs.putBool("telemetria",  mods.telemetria);
    prefs.putBool("status",      mods.status);
    prefs.putBool("alertas",     mods.alertas);
    prefs.putBool("sensor_hdc",  mods.sensor_hdc);
    prefs.putBool("sensor_sue",  mods.sensor_suelo);
    prefs.putBool("sensor_ph",   mods.sensor_ph);
    prefs.putBool("actuadores",  mods.actuadores);
    prefs.putBool("simulacion",  mods.simulacion);
    prefs.putBool("ahorro_wifi", mods.ahorro_wifi);
    prefs.putUInt("periodo",     periodo_telemetria_ms);
    prefs.end();
}

void resetModulos() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.clear();
    prefs.end();
    mods = { DEFAULT_MOD_TELEMETRIA, DEFAULT_MOD_STATUS, DEFAULT_MOD_ALERTAS,
             DEFAULT_MOD_SENSOR_HDC, DEFAULT_MOD_SENSOR_SUELO, DEFAULT_MOD_SENSOR_PH,
             DEFAULT_MOD_ACTUADORES, DEFAULT_MOD_SIMULACION,
             DEFAULT_MOD_AHORRO_WIFI };
    periodo_telemetria_ms = INTERVAL_TELEMETRY;
    logWarn("MODULOS", "Restaurados a valores por defecto");
}

/* Cambia un módulo por nombre. Devuelve false si el nombre no existe. */
bool setModulo(const char* nombre, bool activo) {
    if      (!strcmp(nombre, "telemetria"))   mods.telemetria   = activo;
    else if (!strcmp(nombre, "status"))       mods.status       = activo;
    else if (!strcmp(nombre, "alertas"))      mods.alertas      = activo;
    else if (!strcmp(nombre, "sensor_hdc"))   mods.sensor_hdc   = activo;
    else if (!strcmp(nombre, "sensor_suelo")) mods.sensor_suelo = activo;
    else if (!strcmp(nombre, "sensor_ph"))    mods.sensor_ph    = activo;
    else if (!strcmp(nombre, "simulacion"))   mods.simulacion   = activo;

    // ── Actuadores y prueba de válvulas son mutuamente excluyentes ──
    //    Ambos escriben en los mismos cuatro pines. Si corrieran a la
    //    vez se pisarían y el comportamiento sería errático justo
    //    cuando más falta hace poder interpretarlo.
    else if (!strcmp(nombre, "actuadores")) {
        mods.actuadores = activo;
        if (activo && mods.test_valvulas) {
            mods.test_valvulas = false;
            relesTodosOff();
            logWarn("TEST", "Barrido detenido: se activaron los ciclos de riego");
        }
        if (!activo) relesTodosOff();
    }
    else if (!strcmp(nombre, "test_valvulas")) {
        mods.test_valvulas = activo;
        if (activo && mods.actuadores) {
            mods.actuadores = false;
            logWarn("TEST", "Ciclos de riego desactivados para no interferir");
        }
        relesTodosOff();   // siempre partir de un estado conocido
        logInfoF("TEST", "Barrido de valvulas %s", activo ? "INICIADO" : "detenido");
    }

    else if (!strcmp(nombre, "ahorro_wifi")) {
        mods.ahorro_wifi = activo;
        // Se aplica de inmediato sobre la radio, sin reiniciar
        WiFi.setSleep(activo);
        logInfoF("WIFI", "Modem sleep %s (consumo %s)",
                 activo ? "ACTIVADO" : "desactivado",
                 activo ? "~20-30 mA" : "~120 mA");
    }
    else return false;

    guardarModulos();
    logInfoF("MODULOS", "%s = %s", nombre, activo ? "ON" : "OFF");
    return true;
}

void modulosToJson(JsonObject obj) {
    obj["telemetria"]   = mods.telemetria;
    obj["status"]       = mods.status;
    obj["alertas"]      = mods.alertas;
    obj["sensor_hdc"]   = mods.sensor_hdc;
    obj["sensor_suelo"] = mods.sensor_suelo;
    obj["sensor_ph"]    = mods.sensor_ph;
    obj["actuadores"]   = mods.actuadores;
    obj["simulacion"]    = mods.simulacion;
    obj["ahorro_wifi"]   = mods.ahorro_wifi;
    obj["test_valvulas"] = mods.test_valvulas;
}

void imprimirModulos() {
    Serial.println("+---------------------------------------+");
    Serial.println("|  MODULOS                              |");
    Serial.println("+------------------+--------------------+");
    Serial.printf ("| telemetria       | %-18s |\n", mods.telemetria   ? "ON" : "off");
    Serial.printf ("| status           | %-18s |\n", mods.status       ? "ON" : "off");
    Serial.printf ("| alertas          | %-18s |\n", mods.alertas      ? "ON" : "off");
    Serial.printf ("| sensor_hdc       | %-18s |\n", mods.sensor_hdc   ? "ON" : "off");
    Serial.printf ("| sensor_suelo     | %-18s |\n", mods.sensor_suelo ? "ON" : "off");
    Serial.printf ("| sensor_ph        | %-18s |\n", mods.sensor_ph    ? "ON" : "off");
    Serial.printf ("| actuadores       | %-18s |\n", mods.actuadores   ? "ON" : "off");
    Serial.printf ("| simulacion       | %-18s |\n", mods.simulacion   ? "ON" : "off");
    Serial.printf ("| ahorro_wifi      | %-18s |\n", mods.ahorro_wifi  ? "ON (~25mA)" : "off (~120mA)");
    Serial.printf ("| test_valvulas    | %-18s |\n", mods.test_valvulas ? "ON (barrido)" : "off");
    Serial.printf ("| periodo telem.   | %-15lu ms |\n", periodo_telemetria_ms);
    Serial.println("+------------------+--------------------+");
}

// ============================================================
//  DIAGNÓSTICO
// ============================================================
void printResetReason() {
    esp_reset_reason_t r = esp_reset_reason();
    Serial.print("Motivo del reset: ");
    switch (r) {
        case ESP_RST_POWERON:  Serial.println("Power ON");        break;
        case ESP_RST_SW:       Serial.println("Software reset");  break;
        case ESP_RST_PANIC:    Serial.println("Panic/exception"); break;
        case ESP_RST_BROWNOUT: Serial.println("Brownout (!)");    break;
        case ESP_RST_WDT:      Serial.println("Watchdog");        break;
        default:               Serial.println("Otro");            break;
    }
}

void testESP() {
    vTaskDelay(1500 / portTICK_PERIOD_MS);
    Serial.println("\n================================================");
    Serial.println("  AGW HydroNode " DEVICE_ID "  fw " FIRMWARE_VERSION);
    Serial.println("================================================");
    printResetReason();
    Serial.printf("Modelo: %s | Cores: %d | CPU: %d MHz\n",
                  ESP.getChipModel(), ESP.getChipCores(), ESP.getCpuFreqMHz());
    Serial.printf("Flash: %d MB | Heap libre: %d bytes\n",
                  ESP.getFlashChipSize() / (1024 * 1024), ESP.getFreeHeap());
    Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());
    Serial.println(nvs_flash_init() == ESP_OK ? "NVS OK" : "NVS ERROR");
    Serial.println("================================================\n");
}

// ============================================================
//  MQTT — publicación thread-safe
// ============================================================
bool mqttPublish(const char* topic, const char* payload, bool retain = false) {
    bool ok = false;
    if (xSemaphoreTake(xMutexMqttPub, pdMS_TO_TICKS(1000)) == pdTRUE) {
        if (clientPub.connected()) ok = clientPub.publish(topic, payload, retain);
        xSemaphoreGive(xMutexMqttPub);
    }
    return ok;
}

void publicarStatus() {
    StaticJsonDocument<256> st;
    st["id"]      = DEVICE_ID;
    st["online"]  = true;
    st["uptime"]  = millis();
    st["periodo"] = periodo_telemetria_ms;
    st["fw"]      = FIRMWARE_VERSION;
    char buf[256];
    serializeJson(st, buf);
    mqttPublish(TOPIC_STATUS, buf, false);
}

// ============================================================
//  PROCESADOR DE COMANDOS — compartido por MQTT y HTTP
// ============================================================
/*  Devuelve un mensaje corto de resultado para que HTTP pueda
 *  responderlo al cliente. MQTT solo lo registra en el log.        */
String procesarComando(const JsonDocument& doc) {
    const char* cmd = doc["cmd"] | "";

    // ── Activar / desactivar un módulo ───────────────────────
    if (!strcmp(cmd, "set_modulo")) {
        const char* modulo = doc["modulo"] | "";
        bool activo = doc["activo"] | false;
        if (setModulo(modulo, activo)) {
            imprimirModulos();
            return String("modulo ") + modulo + " = " + (activo ? "ON" : "OFF");
        }
        return String("ERROR: modulo desconocido: ") + modulo;
    }

    // ── Control manual de salidas ────────────────────────────
    //    Apaga los modos automáticos: si el barrido o los ciclos de riego
    //    siguieran corriendo, pisarían el estado que se acaba de fijar y
    //    la prueba manual sería ininterpretable.
    if (!strcmp(cmd, "set_salidas") || !strcmp(cmd, "salidas")) {
        mods.test_valvulas = false;
        mods.actuadores    = false;

        JsonArrayConst lista = doc["on"].as<JsonArrayConst>();
        for (uint8_t i = 0; i < 4; i++) salidaSet(i, false);

        String encendidas;
        for (JsonVariantConst v : lista) {
            int8_t idx = v.is<const char*>() ? salidaIndice(v.as<const char*>())
                                             : (int8_t)(v.as<int>() - 1);
            if (idx < 0 || idx > 3) continue;
            salidaSet(idx, true);
            if (encendidas.length()) encendidas += ", ";
            encendidas += NOMBRES_RELE[idx];
        }
        imprimirSalidas();
        return encendidas.length() ? ("encendidas: " + encendidas)
                                   : String("todas las salidas apagadas");
    }

    if (!strcmp(cmd, "salidas_off")) {
        mods.test_valvulas = false;
        mods.actuadores    = false;
        RIEGO_FORZADO      = false;
        relesTodosOff();
        imprimirSalidas();
        return "todas las salidas apagadas";
    }

    if (!strcmp(cmd, "set_salida")) {
        mods.test_valvulas = false;
        mods.actuadores    = false;

        const char* ref = doc["salida"] | doc["n"] | "";
        int8_t idx = salidaIndice(ref);
        if (idx < 0 && doc["n"].is<int>()) idx = (int8_t)(doc["n"].as<int>() - 1);
        if (idx < 0 || idx > 3)
            return String("ERROR: salida desconocida: ") + ref;

        bool activo = doc["activo"] | false;
        salidaSet(idx, activo);
        imprimirSalidas();
        return String(NOMBRES_RELE[idx]) + (activo ? " = ON" : " = off");
    }

    if (!strcmp(cmd, "get_salidas")) {
        imprimirSalidas();
        return "salidas impresas en serie";
    }

    // ── Consultar módulos ────────────────────────────────────
    if (!strcmp(cmd, "get_modulos")) {
        imprimirModulos();
        return "modulos impresos en serie";
    }

    // ── Restaurar valores por defecto ────────────────────────
    if (!strcmp(cmd, "reset_modulos")) {
        resetModulos();
        imprimirModulos();
        return "modulos restaurados";
    }

    // ── Período de telemetría ────────────────────────────────
    if (!strcmp(cmd, "set_periodo")) {
        uint32_t nuevo = doc["valor"] | 0;
        if (nuevo < 5000) return "ERROR: el minimo es 5000 ms";
        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            periodo_telemetria_ms = nuevo;
            xSemaphoreGive(xMutexDatos);
        }
        guardarModulos();
        logInfoF("CMD", "Periodo = %lu ms", nuevo);
        return String("periodo = ") + nuevo + " ms";
    }

    // ── Umbrales de alerta ───────────────────────────────────
    if (!strcmp(cmd, "set_umbral")) {
        const char* var = doc["variable"] | "";
        float mn = doc["min"] | -9999.0f;
        float mx = doc["max"] | -9999.0f;
        bool ok = true;
        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            if      (!strcmp(var, "temp"))   { if (mn > -9999) umbral_temp_min   = mn; if (mx > -9999) umbral_temp_max   = mx; }
            else if (!strcmp(var, "hum"))    { if (mn > -9999) umbral_hum_min    = mn; if (mx > -9999) umbral_hum_max    = mx; }
            else if (!strcmp(var, "hsuelo")) { if (mn > -9999) umbral_hsuelo_min = mn; if (mx > -9999) umbral_hsuelo_max = mx; }
            else if (!strcmp(var, "ph"))     { if (mn > -9999) umbral_ph_min     = mn; if (mx > -9999) umbral_ph_max     = mx; }
            else ok = false;
            xSemaphoreGive(xMutexDatos);
        }
        if (!ok) return String("ERROR: variable desconocida: ") + var;
        logInfoF("CMD", "Umbral %s = [%.2f, %.2f]", var, mn, mx);
        return String("umbral ") + var + " actualizado";
    }

    // ── Modo nocturno ────────────────────────────────────────
    if (!strcmp(cmd, "set_nocturno")) {
        bool activo = doc["activo"] | false;
        DESCANSO_NOCTURNO = activo ? HIGH : LOW;
        logInfoF("CMD", "Modo nocturno: %s", activo ? "ON" : "OFF");
        return String("nocturno = ") + (activo ? "ON" : "OFF");
    }

    // ── Forzar riego ─────────────────────────────────────────
    if (!strcmp(cmd, "set_riego")) {
        bool enc = doc["encendido"] | false;
        RIEGO_FORZADO = enc;
        ESTADO_ACTUADORES = enc ? LOW : HIGH;   // relés activo-bajo
        if (mods.actuadores) {
            digitalWrite(PIN_VA1, ESTADO_ACTUADORES);
            digitalWrite(PIN_VA2, ESTADO_ACTUADORES);
        }
        logInfoF("CMD", "Riego forzado: %s", enc ? "ON" : "OFF");
        return String("riego = ") + (enc ? "ON" : "OFF");
    }

    // ── Status inmediato ─────────────────────────────────────
    if (!strcmp(cmd, "get_status")) {
        publicarStatus();
        return "status publicado";
    }

    // ── Reinicio ─────────────────────────────────────────────
    if (!strcmp(cmd, "reset")) {
        logWarn("CMD", "Reinicio solicitado");
        vTaskDelay(500 / portTICK_PERIOD_MS);
        esp_restart();
    }

    return String("ERROR: comando desconocido: ") + cmd;
}

// ============================================================
//  MQTT — callback de comandos entrantes
// ============================================================
void mqttCallback(char* topic, byte* raw, unsigned int length) {
    String msg;
    msg.reserve(length + 1);
    for (unsigned int i = 0; i < length; i++) msg += (char)raw[i];
    logInfoF("MQTT-CMD", "[%s] %s", topic, msg.c_str());

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) {
        logError("MQTT-CMD", "JSON invalido, ignorado");
        return;
    }
    String res = procesarComando(doc);
    logInfoF("MQTT-CMD", "-> %s", res.c_str());
}

// ============================================================
//  SERVIDOR HTTP DE CONTROL
// ============================================================
void httpEnviarJson(int codigo, const JsonDocument& doc) {
    String out;
    serializeJsonPretty(doc, out);
    httpServer.send(codigo, "application/json", out);
}

void handleEstado() {
    StaticJsonDocument<768> doc;
    doc["id"]        = DEVICE_ID;
    doc["fw"]        = FIRMWARE_VERSION;
    doc["uptime_ms"] = millis();
    doc["heap"]      = ESP.getFreeHeap();
    doc["ip"]        = WiFi.localIP().toString();
    doc["rssi"]      = WiFi.RSSI();
    doc["ssid"]      = WiFi.SSID();
    doc["mqtt_pub"]  = clientPub.connected();
    doc["mqtt_sub"]  = clientSub.connected();
    doc["periodo_ms"] = periodo_telemetria_ms;

    JsonObject m = doc.createNestedObject("modulos");
    modulosToJson(m);

    JsonObject s = doc.createNestedObject("sensores");
    if (xSemaphoreTake(xMutexDatos, pdMS_TO_TICKS(200)) == pdTRUE) {
        s["temp"]   = temperatura_HDC;
        s["hum"]    = humedad_HDC;
        s["hsuelo"] = humedad_suelo;
        s["ph"]     = ph_g;
        xSemaphoreGive(xMutexDatos);
    }
    httpEnviarJson(200, doc);
}

void handleModulosGet() {
    StaticJsonDocument<384> doc;
    JsonObject m = doc.createNestedObject("modulos");
    modulosToJson(m);
    httpEnviarJson(200, doc);
}

/*  Interpreta el cuerpo de la peticion de forma tolerante.
 *
 *  El WebServer del ESP32 solo expone el argumento "plain" cuando el
 *  Content-Type NO es application/x-www-form-urlencoded. Un `curl -d`
 *  simple envia justamente ese tipo, y entonces el cuerpo aparece
 *  troceado en argumentos individuales. Aceptar ambas formas evita que
 *  la peticion falle por un detalle de cabecera:
 *
 *    curl -X POST http://ip/modulo -H "Content-Type: application/json" \
 *         -d '{"modulo":"simulacion","activo":true}'
 *    curl -X POST "http://ip/modulo?modulo=simulacion&activo=true"
 *    curl -X POST http://ip/modulo -d "modulo=simulacion&activo=true"
 */
bool leerPeticion(JsonDocument& doc) {
    // 1) Cuerpo JSON crudo
    if (httpServer.hasArg("plain")) {
        String body = httpServer.arg("plain");
        if (deserializeJson(doc, body) == DeserializationError::Ok) return true;
    }

    // 2) Argumentos sueltos (query string o formulario)
    bool alguno = false;
    for (int i = 0; i < httpServer.args(); i++) {
        String nombre = httpServer.argName(i);
        String valor  = httpServer.arg(i);
        if (nombre == "plain") continue;
        alguno = true;

        if (valor == "true" || valor == "1")        doc[nombre] = true;
        else if (valor == "false" || valor == "0")  doc[nombre] = false;
        else {
            // Numerico si lo parece, texto si no
            char* fin = nullptr;
            double num = strtod(valor.c_str(), &fin);
            if (fin && *fin == '\0' && valor.length() > 0) doc[nombre] = num;
            else doc[nombre] = valor;
        }
    }
    return alguno;
}

/* POST|GET /modulo   {"modulo":"telemetria","activo":true} */
void handleModuloPost() {
    StaticJsonDocument<256> in;
    if (!leerPeticion(in)) {
        httpServer.send(400, "application/json",
                        "{\"error\":\"falta modulo y activo\"}");
        return;
    }
    const char* modulo = in["modulo"] | "";
    bool activo = in["activo"] | false;

    StaticJsonDocument<384> out;
    if (!setModulo(modulo, activo)) {
        out["error"] = String("modulo desconocido: ") + modulo;
        httpEnviarJson(404, out);
        return;
    }
    imprimirModulos();
    out["ok"] = true;
    JsonObject m = out.createNestedObject("modulos");
    modulosToJson(m);
    httpEnviarJson(200, out);
}

/* POST|GET /cmd   mismo payload que el topic MQTT de comandos */
void handleCmdPost() {
    StaticJsonDocument<512> in;
    if (!leerPeticion(in)) {
        httpServer.send(400, "application/json", "{\"error\":\"cuerpo vacio\"}");
        return;
    }
    String res = procesarComando(in);
    logInfoF("HTTP-CMD", "-> %s", res.c_str());

    StaticJsonDocument<256> out;
    out["resultado"] = res;
    httpEnviarJson(res.startsWith("ERROR") ? 400 : 200, out);
}

void handleRaiz() {
    String html =
        "<!doctype html><meta charset=utf-8>"
        "<title>AGW HydroNode</title>"
        "<h2>AGW HydroNode " DEVICE_ID "</h2>"
        "<p>fw " FIRMWARE_VERSION "</p><ul>"
        "<li>GET  /estado</li>"
        "<li>GET  /modulos</li>"
        "<li>POST /modulo &nbsp; {\"modulo\":\"telemetria\",\"activo\":true}</li>"
        "<li>POST /cmd &nbsp;&nbsp;&nbsp; {\"cmd\":\"get_status\"}</li>"
        "</ul>";
    httpServer.send(200, "text/html", html);
}

// ============================================================
//  TAREA: WiFi (siempre activa)
// ============================================================
void tarea_wifi(void* pv) {
    // Arranque limpio de la radio. Es imprescindible: al reiniciarse el
    // ESP32 sin desasociarse (reset por DTR del monitor serie, corte de
    // luz, watchdog), el AP conserva la asociación anterior de esta MAC
    // con su clave de sesión vieja. El nodo vuelve con nonce nuevo, el
    // handshake no cuadra y aparece un bucle de AUTH_EXPIRE hasta que el
    // AP expira la entrada por su cuenta.
    //
    //   persistent(false) → no guardar credenciales en NVS de la radio
    //   disconnect(true,true) → apagar radio y borrar la config previa
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true, true);
    vTaskDelay(300 / portTICK_PERIOD_MS);

    WiFi.setAutoReconnect(true);
    WiFi.setSleep(mods.ahorro_wifi);   // nivel 1 de ahorro (MCD §12)
    WiFi.setHostname(DEVICE_ID);

    uint8_t fallos = 0;

    for (;;) {
        if (WiFi.status() != WL_CONNECTED) {
            logInfoF("WIFI", "Conectando a '%s' (intento %u) ...",
                     WIFI_SSID, fallos + 1);

            // Desasociación explícita antes de cada reintento: obliga al AP
            // a soltar cualquier estado residual de esta estación.
            WiFi.disconnect(false, false);
            vTaskDelay(200 / portTICK_PERIOD_MS);
            WiFi.begin(WIFI_SSID, WIFI_PASS);

            int intentos = 0;
            while (WiFi.status() != WL_CONNECTED && intentos < 30) {
                vTaskDelay(500 / portTICK_PERIOD_MS);
                Serial.print(".");
                intentos++;
            }
            Serial.println();

            if (WiFi.status() == WL_CONNECTED) {
                fallos = 0;
                // Reaplicar tras cada (re)conexion: la pila WiFi del ESP32
                // reinicia el modo de energia al asociarse.
                WiFi.setSleep(mods.ahorro_wifi);
                logInfoF("WIFI", "CONECTADO  IP=%s  GW=%s  RSSI=%d dBm  canal=%d  ahorro=%s",
                         WiFi.localIP().toString().c_str(),
                         WiFi.gatewayIP().toString().c_str(),
                         WiFi.RSSI(), WiFi.channel(),
                         mods.ahorro_wifi ? "ON" : "off");
                logInfoF("WIFI", "Control HTTP en  http://%s/",
                         WiFi.localIP().toString().c_str());
            } else {
                fallos++;
                logError("WIFI", "Fallo de conexion");

                // Tras varios fallos seguidos, reinicio completo de la pila
                // WiFi. Resuelve estados internos corruptos que un simple
                // reintento no limpia.
                if (fallos >= 3) {
                    logWarn("WIFI", "Reiniciando la pila WiFi por completo");
                    WiFi.disconnect(true, true);
                    WiFi.mode(WIFI_OFF);
                    vTaskDelay(1000 / portTICK_PERIOD_MS);
                    WiFi.mode(WIFI_STA);
                    WiFi.setSleep(mods.ahorro_wifi);
                    WiFi.setHostname(DEVICE_ID);
                    fallos = 0;
                }
                vTaskDelay(5000 / portTICK_PERIOD_MS);
            }
        }
        vTaskDelay(2000 / portTICK_PERIOD_MS);
    }
}

// ============================================================
//  TAREA: HTTP de control (siempre activa)
// ============================================================
void tarea_http(void* pv) {
    while (WiFi.status() != WL_CONNECTED) vTaskDelay(500 / portTICK_PERIOD_MS);

    httpServer.on("/",        HTTP_GET,  handleRaiz);
    httpServer.on("/estado",  HTTP_GET,  handleEstado);
    httpServer.on("/modulos", HTTP_GET,  handleModulosGet);
    // POST es lo semanticamente correcto, pero GET tambien se acepta para
    // poder operar el nodo desde la barra de direcciones de un navegador.
    httpServer.on("/modulo",  HTTP_POST, handleModuloPost);
    httpServer.on("/modulo",  HTTP_GET,  handleModuloPost);
    httpServer.on("/cmd",     HTTP_POST, handleCmdPost);
    httpServer.on("/cmd",     HTTP_GET,  handleCmdPost);
    httpServer.begin();
    logInfoF("HTTP", "Servidor de control escuchando en el puerto %d", HTTP_CONTROL_PORT);

    for (;;) {
        httpServer.handleClient();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// ============================================================
//  TAREA: MQTT (siempre activa — es el otro plano de control)
// ============================================================
void tarea_mqtt(void* pv) {
    while (WiFi.status() != WL_CONNECTED) vTaskDelay(500 / portTICK_PERIOD_MS);

    clientPub.setServer(MQTT_BROKER, MQTT_PORT);
    clientPub.setKeepAlive(MQTT_KEEPALIVE);
    clientSub.setServer(MQTT_BROKER, MQTT_PORT);
    clientSub.setKeepAlive(MQTT_KEEPALIVE);
    clientSub.setCallback(mqttCallback);

    uint32_t ultimoIntento = 0;

    for (;;) {
        if (WiFi.status() != WL_CONNECTED) {
            vTaskDelay(2000 / portTICK_PERIOD_MS);
            continue;
        }

        // Reintentar como mucho cada 5 s para no saturar el broker
        if ((!clientPub.connected() || !clientSub.connected()) &&
            (millis() - ultimoIntento > 5000)) {
            ultimoIntento = millis();

            if (!clientPub.connected()) {
                if (xSemaphoreTake(xMutexMqttPub, pdMS_TO_TICKS(2000)) == pdTRUE) {
                    // El LWT se registra aquí: si el nodo cae sin despedirse,
                    // Mosquitto publica {"online":false} en el topic de status.
                    bool ok = clientPub.connect(MQTT_CLIENT_ID_PUB, NULL, NULL,
                                                TOPIC_STATUS, 0, false, LWT_PAYLOAD);
                    xSemaphoreGive(xMutexMqttPub);
                    if (ok) logInfoF("MQTT-PUB", "Conectado a %s:%d", MQTT_BROKER, MQTT_PORT);
                    else    logInfoF("MQTT-PUB", "Fallo rc=%d", clientPub.state());
                }
            }

            if (!clientSub.connected()) {
                if (clientSub.connect(MQTT_CLIENT_ID_SUB)) {
                    clientSub.subscribe(TOPIC_CMD);
                    logInfoF("MQTT-SUB", "Conectado y suscrito a %s", TOPIC_CMD);
                } else {
                    logInfoF("MQTT-SUB", "Fallo rc=%d", clientSub.state());
                }
            }
        }

        if (xSemaphoreTake(xMutexMqttPub, pdMS_TO_TICKS(100)) == pdTRUE) {
            clientPub.loop();
            xSemaphoreGive(xMutexMqttPub);
        }
        clientSub.loop();
        vTaskDelay(50 / portTICK_PERIOD_MS);
    }
}

// ============================================================
//  TAREA: Telemetría
// ============================================================
void tarea_telemetria(void* pv) {
    for (;;) {
        // Sin modulo activo o sin MQTT no se publica: sin conexion la trama
        // se pierde igualmente, y solo ensucia el log con [FALLO] y rssi=0.
        if (!mods.telemetria || !clientPub.connected()) {
            vTaskDelay(INTERVAL_MODULE_CHECK / portTICK_PERIOD_MS);
            continue;
        }

        float t, h, hs, ph;
        uint32_t periodo;
        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            t = temperatura_HDC; h = humedad_HDC;
            hs = humedad_suelo;  ph = ph_g;
            periodo = periodo_telemetria_ms;
            xSemaphoreGive(xMutexDatos);
        }

        StaticJsonDocument<512> doc;
        doc["id"]         = DEVICE_ID;
        doc["fw"]         = FIRMWARE_VERSION;
        doc["uptime"]     = millis();
        doc["rssi"]       = WiFi.RSSI();
        doc["periodo_ms"] = periodo;

        // Solo se incluyen los sensores que REALMENTE estan produciendo datos.
        // Un sensor apagado publicaba antes un 0, y el gateway no podia
        // distinguir "sensor inactivo" de "0 grados reales": disparaba las
        // reglas de suelo seco y temperatura baja sobre datos inexistentes.
        // Omitir el campo deja que el edge lo lea como null y lo ignore.
        JsonObject s = doc.createNestedObject("sensores");
        if (mods.sensor_hdc || mods.simulacion) {
            s["temp"] = round(t * 100) / 100.0;
            s["hum"]  = round(h * 100) / 100.0;
        }
        if (mods.sensor_suelo || mods.simulacion) {
            s["hsuelo"] = round(hs * 100) / 100.0;
        }
        if (mods.sensor_ph || mods.simulacion) {
            s["ph"] = round(ph * 100) / 100.0;
        }

        char payload[512];
        serializeJson(doc, payload);

        bool ok = mqttPublish(TOPIC_TELEMETRIA, payload);
        logInfoF("TELEMETRIA", "%s  [%s]", payload, ok ? "OK" : "FALLO");

        // Espera troceada: permite apagar el módulo o bajar el período
        // sin tener que aguantar el ciclo completo.
        uint32_t transcurrido = 0;
        while (transcurrido < periodo && mods.telemetria) {
            vTaskDelay(500 / portTICK_PERIOD_MS);
            transcurrido += 500;
            if (xSemaphoreTake(xMutexDatos, pdMS_TO_TICKS(10)) == pdTRUE) {
                periodo = periodo_telemetria_ms;
                xSemaphoreGive(xMutexDatos);
            }
        }
    }
}

// ============================================================
//  TAREA: Heartbeat de estado
// ============================================================
void tarea_status(void* pv) {
    for (;;) {
        if (!mods.status || !clientPub.connected()) {
            vTaskDelay(INTERVAL_MODULE_CHECK / portTICK_PERIOD_MS);
            continue;
        }
        publicarStatus();
        logInfo("STATUS", "Heartbeat publicado");

        uint32_t transcurrido = 0;
        while (transcurrido < INTERVAL_STATUS && mods.status) {
            vTaskDelay(500 / portTICK_PERIOD_MS);
            transcurrido += 500;
        }
    }
}

// ============================================================
//  TAREA: Monitor de alertas
// ============================================================
void tarea_alertas(void* pv) {
    const uint32_t CHECK_MS = INTERVAL_SENSOR;

    for (;;) {
        vTaskDelay(CHECK_MS / portTICK_PERIOD_MS);
        if (!mods.alertas) continue;

        float t, h, hs, ph;
        float t_mn, t_mx, h_mn, h_mx, hs_mn, hs_mx, ph_mn, ph_mx;

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            t  = temperatura_HDC;   h  = humedad_HDC;
            hs = humedad_suelo;     ph = ph_g;
            t_mn  = umbral_temp_min;   t_mx  = umbral_temp_max;
            h_mn  = umbral_hum_min;    h_mx  = umbral_hum_max;
            hs_mn = umbral_hsuelo_min; hs_mx = umbral_hsuelo_max;
            ph_mn = umbral_ph_min;     ph_mx = umbral_ph_max;
            xSemaphoreGive(xMutexDatos);
        }

        auto evaluar = [&](const char* nombre, float valor, float vmin, float vmax,
                           volatile uint32_t &acum) {
            if (valor < vmin || valor > vmax) {
                acum += CHECK_MS;
            } else {
                acum = 0;
                return;
            }

            const char* nivel = nullptr;
            if      (acum >= ALERTA_GRAVE_MS) nivel = "GRAVE";
            else if (acum >= ALERTA_MEDIA_MS) nivel = "MEDIA";
            else if (acum >= ALERTA_LEVE_MS)  nivel = "LEVE";
            else return;

            StaticJsonDocument<384> doc;
            doc["id"]          = DEVICE_ID;
            doc["uptime"]      = millis();
            doc["variable"]    = nombre;
            doc["valor"]       = round(valor * 100) / 100.0;
            doc["umbral_min"]  = vmin;
            doc["umbral_max"]  = vmax;
            doc["duracion_ms"] = acum;
            doc["nivel"]       = nivel;

            char buf[384];
            serializeJson(doc, buf);
            bool ok = mqttPublish(TOPIC_ALERTA, buf);
            logInfoF("ALERTA", "[%s] %s=%.2f durante %lu ms  [%s]",
                     nivel, nombre, valor, acum, ok ? "OK" : "FALLO");
        };

        // Solo se evalúa una variable si su sensor está realmente
        // produciendo datos. Sin este filtro, un sensor apagado publica 0
        // permanentemente, el acumulador nunca se resetea y a los 5 min
        // llegan alertas fantasma — que es justo lo que ocurrió en la
        // primera prueba de enlace.
        bool hay_hdc   = mods.sensor_hdc   || mods.simulacion;
        bool hay_suelo = mods.sensor_suelo || mods.simulacion;
        bool hay_ph    = mods.sensor_ph    || mods.simulacion;

        if (hay_hdc) {
            evaluar("temp", t, t_mn, t_mx, t_fuera_temp);
            evaluar("hum",  h, h_mn, h_mx, t_fuera_hum);
        } else {
            t_fuera_temp = 0;
            t_fuera_hum  = 0;
        }

        if (hay_suelo) evaluar("hsuelo", hs, hs_mn, hs_mx, t_fuera_hsuelo);
        else           t_fuera_hsuelo = 0;

        if (hay_ph) evaluar("ph", ph, ph_mn, ph_mx, t_fuera_ph);
        else        t_fuera_ph = 0;
    }
}

// ============================================================
//  SIMULACIÓN — paseo aleatorio acotado
// ============================================================
/*  Genera valores plausibles sin hardware conectado. Permite validar
 *  toda la cadena (MQTT → broker → edge → nube) antes de tener sensores. */
float paseo(float actual, float paso, float minimo, float maximo) {
    float delta = ((float)(esp_random() % 2001) / 1000.0f - 1.0f) * paso;
    float v = actual + delta;
    if (v < minimo) v = minimo;
    if (v > maximo) v = maximo;
    return v;
}

// ============================================================
//  TAREA: Sensor HDC1080 (temperatura y humedad)
// ============================================================
void tarea_sensor_hdc(void* pv) {
    for (;;) {
        vTaskDelay(INTERVAL_SENSOR / portTICK_PERIOD_MS);

        if (mods.simulacion) {
            if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
                if (temperatura_HDC == 0.0f) temperatura_HDC = 23.0f;
                if (humedad_HDC     == 0.0f) humedad_HDC     = 62.0f;
                temperatura_HDC = paseo(temperatura_HDC, 0.4f, 18.0f, 30.0f);
                humedad_HDC     = paseo(humedad_HDC,     1.5f, 45.0f, 80.0f);
                xSemaphoreGive(xMutexDatos);
            }
            continue;
        }

        if (!mods.sensor_hdc) continue;

        if (!hdcIniciado) {
            hdc1080.begin(0x40);
            hdcIniciado = true;
            logInfo("HDC1080", "Inicializado en 0x40");
            vTaskDelay(500 / portTICK_PERIOD_MS);
        }

        float temp = hdc1080.readTemperature();
        float hum  = hdc1080.readHumidity();

        // Sin sensor en el bus, el HDC1080 devuelve NaN o valores absurdos
        if (isnan(temp) || temp < -40 || temp > 100) {
            logWarn("HDC1080", "Lectura invalida — sensor desconectado?");
            continue;
        }

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            temperatura_HDC = temp;
            humedad_HDC     = hum;
            xSemaphoreGive(xMutexDatos);
        }
        logInfoF("HDC1080", "temp=%.2f C  hum=%.2f %%", temp, hum);
    }
}

// ============================================================
//  TAREA: Humedad de sustrato
// ============================================================
void tarea_sensor_suelo(void* pv) {
    pinMode(PIN_SENSOR_WATER, INPUT);
    for (;;) {
        vTaskDelay(INTERVAL_SENSOR / portTICK_PERIOD_MS);

        if (mods.simulacion) {
            if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
                if (humedad_suelo == 0.0f) humedad_suelo = 68.0f;
                humedad_suelo = paseo(humedad_suelo, 1.2f, 25.0f, 92.0f);
                xSemaphoreGive(xMutexDatos);
            }
            continue;
        }

        if (!mods.sensor_suelo) continue;

        // Calibración provisional: 3800 = seco al aire, 1200 = en agua.
        // Debe recalibrarse con el sustrato real en la Fase 4.
        int raw = analogRead(PIN_SENSOR_WATER);
        int pct = constrain(map(raw, 3800, 1200, 0, 100), 0, 100);

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            humedad_suelo = pct;
            xSemaphoreGive(xMutexDatos);
        }
        logInfoF("SUELO", "raw=%d -> %d %%", raw, pct);
    }
}

// ============================================================
//  TAREA: pH  (retirado del alcance — MCD §6.4)
// ============================================================
/*  El código se conserva completo a propósito: reactivar el pH es
 *  conectar la sonda, calibrarla y encender el módulo. Eso demuestra la
 *  modularidad que propone el proyecto, en lugar de borrar el camino.   */
void tarea_sensor_ph(void* pv) {
    pinMode(PIN_PH_SENSOR, INPUT);
    for (;;) {
        vTaskDelay(INTERVAL_SENSOR / portTICK_PERIOD_MS);

        if (mods.simulacion) {
            if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
                if (ph_g == 0.0f) ph_g = 6.3f;
                ph_g = paseo(ph_g, 0.08f, 5.2f, 7.6f);
                xSemaphoreGive(xMutexDatos);
            }
            continue;
        }

        if (!mods.sensor_ph) continue;

        // Mediana recortada de 10 muestras para filtrar ruido del ADC
        int buf[10];
        for (int i = 0; i < 10; i++) {
            buf[i] = analogRead(PIN_PH_SENSOR);
            vTaskDelay(10 / portTICK_PERIOD_MS);
        }
        for (int i = 0; i < 9; i++)
            for (int j = i + 1; j < 10; j++)
                if (buf[i] > buf[j]) { int tmp = buf[i]; buf[i] = buf[j]; buf[j] = tmp; }

        float avg = 0;
        for (int i = 2; i < 8; i++) avg += buf[i];
        avg /= 6.0f;

        float v_esp  = avg * (3.3f / 4095.0f);
        float v_real = (0.97f * v_esp) + 0.197f;
        float ph     = constrain(-5.70f * v_real + 21.93f, 0.0f, 14.0f);

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            ph_g = ph;
            xSemaphoreGive(xMutexDatos);
        }
        logInfoF("PH", "ph=%.2f", ph);
    }
}

// ============================================================
//  TAREA: Prueba de banco — barrido secuencial de válvulas
// ============================================================
/*  Enciende una salida, la mantiene TEST_VALVULA_MS, la apaga, pausa y
 *  pasa a la siguiente. En bucle.
 *
 *  Es una prueba de continuidad eléctrica: verifica cableado, módulo de
 *  relés y alimentación, sin sensores ni lógica de riego de por medio.
 *  Si un relé no conmuta aquí, el problema es físico y no tiene sentido
 *  seguir depurando software.
 *
 *  Solo se activa una salida a la vez, a propósito: si el circuito no
 *  aguanta la corriente de dos bobinas simultáneas, esta prueba no lo
 *  provoca.                                                            */
void tarea_test_valvulas(void* pv) {
    for (;;) {
        if (!mods.test_valvulas) {
            vTaskDelay(INTERVAL_MODULE_CHECK / portTICK_PERIOD_MS);
            continue;
        }

        Serial.println();
        logInfo("TEST", "===== Barrido de valvulas =====");

        for (uint8_t i = 0; i < 4 && mods.test_valvulas; i++) {
            relesTodosOff();

            salidaSet(i, true);
            logInfoF("TEST", "[%d/4] GPIO%-2d  %-26s  ON", i + 1,
                     PINES_RELE[i], NOMBRES_RELE[i]);

            // Espera troceada: permite abortar el barrido en menos de
            // medio segundo si se apaga el módulo a mitad del ciclo.
            uint32_t t = 0;
            while (t < TEST_VALVULA_MS && mods.test_valvulas) {
                vTaskDelay(250 / portTICK_PERIOD_MS);
                t += 250;
            }

            salidaSet(i, false);
            logInfoF("TEST", "[%d/4] GPIO%-2d  %-26s  off", i + 1,
                     PINES_RELE[i], NOMBRES_RELE[i]);

            t = 0;
            while (t < TEST_PAUSA_MS && mods.test_valvulas) {
                vTaskDelay(100 / portTICK_PERIOD_MS);
                t += 100;
            }
        }

        relesTodosOff();
        if (mods.test_valvulas) logInfo("TEST", "Ciclo completo, reiniciando");
    }
}

// ============================================================
//  TAREA: Consola serie — tercer plano de control
// ============================================================
/*  Acepta los mismos comandos JSON que MQTT y HTTP, escritos directamente
 *  en el monitor serie. Existe para pruebas de banco: permite operar el
 *  nodo sin WiFi, sin broker y sin la Raspberry encendida.
 *
 *  Acepta ademas dos atajos, porque escribir JSON a mano en el monitor
 *  es incomodo:
 *      test on / test off   → barrido de valvulas
 *      estado               → imprime la tabla de modulos               */
void tarea_consola(void* pv) {
    String linea;
    linea.reserve(160);

    vTaskDelay(3000 / portTICK_PERIOD_MS);
    Serial.println("[CONSOLA] Lista. Escribe 'ayuda' para ver los comandos.");

    for (;;) {
        while (Serial.available()) {
            char c = (char)Serial.read();

            if (c != '\n' && c != '\r') {
                if (linea.length() < 150) linea += c;
                continue;
            }
            if (linea.length() == 0) continue;

            linea.trim();
            logInfoF("CONSOLA", "> %s", linea.c_str());

            // ── Atajos ──────────────────────────────────────────
            if (linea == "ayuda" || linea == "help") {
                Serial.println();
                Serial.println("  SALIDAS   1=hidroponia  2=tierra  3=bomba  4=ambiente");
                Serial.println("    on 1 3 4        enciende esas y apaga el resto");
                Serial.println("    on bomba        tambien acepta el nombre");
                Serial.println("    off             apaga todas");
                Serial.println("    off 3           apaga solo esa");
                Serial.println("    salidas         tabla de salidas");
                Serial.println();
                Serial.println("  PRUEBAS");
                Serial.println("    test on | test off   barrido secuencial");
                Serial.println("    estado               tabla de modulos");
                Serial.println("    reset                reinicia el nodo");
                Serial.println("    {\"cmd\":\"...\"}        cualquier comando JSON");
                Serial.println();
            }
            else if (linea == "test on")  { setModulo("test_valvulas", true);  }
            else if (linea == "test off") { setModulo("test_valvulas", false); }
            else if (linea == "estado")   { imprimirModulos(); }
            else if (linea == "salidas")  { imprimirSalidas(); }
            else if (linea == "reset")    { esp_restart(); }

            // ── on / off con lista de salidas ───────────────────
            //    "off" a secas apaga todo; "off 3" solo esa.
            //    "on 1 3 4" enciende esas tres y apaga las demas.
            else if (linea == "off") {
                mods.test_valvulas = false;
                mods.actuadores    = false;
                RIEGO_FORZADO      = false;
                relesTodosOff();
                imprimirSalidas();
            }
            else if (linea.startsWith("on ") || linea.startsWith("off ")) {
                bool encender = linea.startsWith("on ");
                mods.test_valvulas = false;
                mods.actuadores    = false;

                // "on" parte de todo apagado; "off N" solo toca lo indicado
                if (encender) relesTodosOff();

                int desde = encender ? 3 : 4;   // saltar "on " u "off "
                int reconocidas = 0;
                while (desde < (int)linea.length()) {
                    int fin = linea.indexOf(' ', desde);
                    if (fin < 0) fin = linea.length();
                    String tok = linea.substring(desde, fin);
                    tok.trim();
                    if (tok.length()) {
                        int8_t idx = salidaIndice(tok.c_str());
                        if (idx >= 0) { salidaSet(idx, encender); reconocidas++; }
                        else logWarn("CONSOLA", (String("salida desconocida: ") + tok).c_str());
                    }
                    desde = fin + 1;
                }
                if (reconocidas == 0)
                    logWarn("CONSOLA", "Usa numeros 1-4 o nombres: hidroponia tierra bomba ambiente");
                imprimirSalidas();
            }
            // ── JSON completo ───────────────────────────────────
            else if (linea.startsWith("{")) {
                StaticJsonDocument<512> doc;
                if (deserializeJson(doc, linea) == DeserializationError::Ok) {
                    String res = procesarComando(doc);
                    logInfoF("CONSOLA", "-> %s", res.c_str());
                } else {
                    logError("CONSOLA", "JSON invalido");
                }
            }
            else {
                logWarn("CONSOLA", "Comando no reconocido. Escribe 'ayuda'.");
            }

            linea = "";
        }
        vTaskDelay(50 / portTICK_PERIOD_MS);
    }
}

// ============================================================
//  TAREA: Actuadores (ciclos de riego)
// ============================================================
void tarea_actuadores(void* pv) {
    auto encenderTodos = []() { for (uint8_t k = 0; k < 4; k++) releOn(PINES_RELE[k]); };

    int i = 0;
    for (;;) {
        // test_valvulas manda: si esta corriendo, esta tarea no toca nada
        if (!mods.actuadores || mods.test_valvulas) {
            vTaskDelay(INTERVAL_MODULE_CHECK / portTICK_PERIOD_MS);
            continue;
        }

        // El riego forzado por comando gana sobre el ciclo automático
        if (RIEGO_FORZADO) {
            encenderTodos();
            vTaskDelay(500 / portTICK_PERIOD_MS);
            continue;
        }

        int tcr = DESCANSO_NOCTURNO ? tiempo_ciclo_riego_noche    : tiempo_ciclo_riego;
        int tcd = DESCANSO_NOCTURNO ? tiempo_ciclo_descanso_noche : tiempo_ciclo_descanso;

        if (i < ciclos_riego) {
            encenderTodos();
            vTaskDelay(tcr / portTICK_PERIOD_MS);
            relesTodosOff();
            vTaskDelay(tcd / portTICK_PERIOD_MS);
            i++;
        } else {
            i = 0;
            vTaskDelay(tiempo_descanso_ciclos / portTICK_PERIOD_MS);
        }
    }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(300);

    xMutexDatos   = xSemaphoreCreateMutex();
    xMutexMqttPub = xSemaphoreCreateMutex();

    if (xMutexDatos == NULL || xMutexMqttPub == NULL) {
        Serial.println("FATAL: no se pudieron crear los mutexes");
        return;
    }

    // Los relés se configuran ANTES que nada. Un GPIO recién inicializado
    // queda en LOW, y con módulos activo-bajo eso cierra el relé: bomba y
    // electroválvulas arrancarían solas durante el arranque.
    for (uint8_t i = 0; i < 4; i++) {
        pinMode(PINES_RELE[i], OUTPUT);
        releOff(PINES_RELE[i]);
    }

    testESP();
    cargarModulos();
    imprimirModulos();

    Serial.println("Control:  POST /modulo  {\"modulo\":\"telemetria\",\"activo\":true}");
    Serial.println("          POST /cmd     {\"cmd\":\"get_status\"}");
    Serial.println("MQTT:     " TOPIC_CMD "  {\"cmd\":\"set_modulo\",...}\n");

    // ── Planos de control: siempre activos ───────────────────
    xTaskCreate(tarea_wifi,          "wifi",       4096, NULL, 4, NULL);
    xTaskCreate(tarea_mqtt,          "mqtt",       8192, NULL, 3, NULL);
    xTaskCreate(tarea_http,          "http",       8192, NULL, 3, NULL);

    // ── Funciones: creadas siempre, gobernadas por sus flags ──
    xTaskCreate(tarea_telemetria,    "telemetria", 8192, NULL, 2, NULL);
    xTaskCreate(tarea_status,        "status",     4096, NULL, 2, NULL);
    xTaskCreate(tarea_alertas,       "alertas",    4096, NULL, 2, NULL);
    xTaskCreate(tarea_sensor_hdc,    "hdc1080",    3072, NULL, 1, NULL);
    xTaskCreate(tarea_sensor_suelo,  "suelo",      2560, NULL, 1, NULL);
    xTaskCreate(tarea_sensor_ph,     "ph",         2560, NULL, 1, NULL);
    xTaskCreate(tarea_actuadores,    "actuadores", 2560, NULL, 2, NULL);

    // ── Pruebas de banco ─────────────────────────────────────
    xTaskCreate(tarea_test_valvulas, "test-valv",  3072, NULL, 2, NULL);
    xTaskCreate(tarea_consola,       "consola",    4096, NULL, 1, NULL);
}

void loop() {
    // Vacío a propósito: todo corre en tareas FreeRTOS
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
