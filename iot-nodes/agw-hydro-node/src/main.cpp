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
#include <Wire.h>
#include <ClosedCube_HDC1080.h>

// PubSubClient define su propio MQTT_KEEPALIVE de 15 s. El nuestro es de
// 20 s por el vigilante de estaciones fantasma del AP (config.h). Sin este
// undef el compilador avisa de redefinicion y el orden de los includes
// decidiria cual gana, que es justo el tipo de ambiguedad que no queremos
// en un parametro del que depende la deteccion de nodos caidos.
#include <PubSubClient.h>
#undef MQTT_KEEPALIVE
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
    bool sensor_ec;
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
    DEFAULT_MOD_TEST_VALVULAS,
    DEFAULT_MOD_SENSOR_EC
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
bool hdcPresente = false;

// --- Lecturas ---
float temperatura_HDC = 0.0f;
float humedad_HDC     = 0.0f;
float humedad_suelo   = 0.0f;
float ph_g            = 0.0f;

// --- Conductividad eléctrica ---
float ec_us_cm        = 0.0f;

// --- Valores crudos, imprescindibles para calibrar ---
int   suelo_raw       = 0;
int   ec_raw          = 0;
int   ph_raw          = 0;

// --- Nivel de agua en tierra: detector de umbral, no medidor ---
int   nivel_adc_seco  = NIVEL_ADC_SECO_DEF;
bool  hay_agua        = false;

// --- TDS: ajuste fino y ultimos valores medidos ---
float tds_k     = TDS_K_DEF;      // 1.0 = curva del fabricante sin corregir
float tds_mv_cero = TDS_MV_CERO_DEF;  // offset del cero, en mV
float tds_ppm   = 0.0f;
float tds_mv    = 0.0f;

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
    mods.sensor_ec    = prefs.getBool("sensor_ec",  DEFAULT_MOD_SENSOR_EC);
    periodo_telemetria_ms = prefs.getUInt("periodo", INTERVAL_TELEMETRY);
    nivel_adc_seco = prefs.getInt("niv_seco", NIVEL_ADC_SECO_DEF);
    tds_k       = prefs.getFloat("tds_k",    TDS_K_DEF);
    tds_mv_cero = prefs.getFloat("tds_cero", TDS_MV_CERO_DEF);
    prefs.end();
}

void guardarCalibracion() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putInt("niv_seco", nivel_adc_seco);
    prefs.putFloat("tds_k",    tds_k);
    prefs.putFloat("tds_cero", tds_mv_cero);
    prefs.end();
    logInfo("CAL", "Calibracion guardada en NVS");
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
    prefs.putBool("sensor_ec",   mods.sensor_ec);
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
    else if (!strcmp(nombre, "sensor_ec"))    mods.sensor_ec    = activo;
    else if (!strcmp(nombre, "sensor_nivel")) mods.sensor_suelo = activo;
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
    obj["sensor_ec"]     = mods.sensor_ec;
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
//  SENSORES — diagnóstico y calibración
// ============================================================

/*  Lectura promediada de un pin analógico.
 *  El ADC del ESP32 es notoriamente ruidoso: una sola muestra puede
 *  variar ±100 cuentas. Promediar estabiliza lo bastante para calibrar.  */
int leerADC(uint8_t pin) {
    uint32_t suma = 0;
    for (uint8_t i = 0; i < ADC_MUESTRAS; i++) {
        suma += analogRead(pin);
        delayMicroseconds(200);
    }
    return (int)(suma / ADC_MUESTRAS);
}

/*  Lectura del sensor de nivel. Encapsula la diferencia entre los dos
 *  modos para que el resto del código no tenga que saber cuál está en uso.
 *
 *  En modo digital se devuelve 0 o 4095 para que la misma variable
 *  `suelo_raw` sirva en ambos casos y las tablas no cambien de formato. */
int leerNivelRaw() {
    if (NIVEL_MODO_DIGITAL) {
        int nivel = digitalRead(PIN_SENSOR_WATER);
        bool seco = NIVEL_DIGITAL_SECO_ALTO ? (nivel == HIGH) : (nivel == LOW);
        return seco ? 4095 : 0;
    }
    return leerADC(PIN_SENSOR_WATER);
}

/*  Detección de nivel de agua. No devuelve porcentaje a propósito: el
 *  sensor está fijo a la altura de "lleno", así que la única pregunta
 *  útil es si el agua ya lo alcanzó.
 *
 *  Al mojarse cae la resistencia y la lectura baja. Se exige una caída
 *  mínima respecto a la referencia en seco para no disparar por ruido
 *  o por humedad ambiental.                                             */
bool hayAgua(int raw) {
    if (NIVEL_MODO_DIGITAL) return raw < 2048;   // 0 = mojado, 4095 = seco
    return (nivel_adc_seco - raw) >= NIVEL_DELTA_MIN;
}

/*  Lectura del sensor TDS en milivoltios calibrados.
 *
 *  Se usa analogReadMilliVolts() y no analogRead(): el ADC del ESP32 no
 *  es lineal ni tiene exactamente 3.3 V de fondo de escala, y cada chip
 *  trae en eFuse su propia curva de calibración de fábrica. Convertir
 *  cuentas a voltios con una regla de tres introduce un error de hasta
 *  el 10 %, que aquí se traduce directamente en ppm equivocados.
 *
 *  Se toma la MEDIANA y no la media: la señal mostró picos aislados
 *  (saltos de 118 a 778 cuentas con la sonda quieta), y la mediana los
 *  descarta mientras que la media se los come.                          */
float leerTDSmV() {
    static uint16_t m[TDS_MUESTRAS];
    for (uint8_t i = 0; i < TDS_MUESTRAS; i++) {
        m[i] = (uint16_t)analogReadMilliVolts(PIN_EC_SENSOR);
        delayMicroseconds(400);
    }
    // Ordenación por inserción: con 32 elementos es más rápida que
    // cualquier algoritmo sofisticado y ocupa menos código.
    for (uint8_t i = 1; i < TDS_MUESTRAS; i++) {
        uint16_t v = m[i];
        int8_t j = i - 1;
        while (j >= 0 && m[j] > v) { m[j + 1] = m[j]; j--; }
        m[j + 1] = v;
    }
    return (m[TDS_MUESTRAS / 2 - 1] + m[TDS_MUESTRAS / 2]) / 2.0f;
}

/*  Curva del fabricante: voltaje compensado en temperatura → ppm.
 *  Devuelve TDS en ppm; la conductividad se obtiene dividiendo por el
 *  factor TDS/EC.                                                       */
float tdsDesdeVoltaje(float mv, float tempC) {
    // Restar el cero ANTES de la curva: el polinomio del fabricante
    // asume que 0 V equivale a 0 ppm, y nuestro modulo entrega un offset
    // constante que de otro modo se propaga a todas las lecturas.
    float mv_util = mv - tds_mv_cero;
    if (mv_util < 0.0f) mv_util = 0.0f;
    float v = mv_util / 1000.0f;
    float coef = 1.0f + TDS_COEF_TEMP * (tempC - TDS_TEMP_REF);
    if (coef < 0.1f) coef = 0.1f;          // evitar division absurda
    float vc = v / coef;                    // voltaje compensado a 25 °C
    float ppm = (133.42f * vc * vc * vc
               - 255.86f * vc * vc
               + 857.39f * vc) * TDS_FACTOR * tds_k;
    return ppm < 0.0f ? 0.0f : ppm;
}

/*  ppm → µS/cm. El factor TDS/EC es el mismo que usa la curva.          */
float ppmAMicroSiemens(float ppm) {
    return ppm / TDS_FACTOR;
}

/*  Recorre el bus I2C y lista lo que responda. Es la primera prueba que
 *  hay que hacer ante un sensor mudo: separa un problema de cableado de
 *  uno de software.                                                     */
void escanearI2C() {
    Serial.println();
    Serial.printf("Escaneando I2C  (SDA=GPIO%d  SCL=GPIO%d)\n",
                  PIN_I2C_SDA, PIN_I2C_SCL);
    uint8_t encontrados = 0;
    for (uint8_t dir = 1; dir < 127; dir++) {
        Wire.beginTransmission(dir);
        if (Wire.endTransmission() == 0) {
            Serial.printf("  0x%02X  responde", dir);
            if (dir == HDC1080_ADDR) Serial.print("   <- HDC1080 esperado aqui");
            Serial.println();
            encontrados++;
        }
    }
    if (encontrados == 0) {
        Serial.println("  NADA EN EL BUS.");
        Serial.println("  Revisa: alimentacion 3.3V, GND comun, SDA/SCL sin cruzar,");
        Serial.println("  y resistencias de pull-up (muchos modulos ya las traen).");
    } else {
        Serial.printf("  %u dispositivo(s)\n", encontrados);
    }
    Serial.println();
}

/*  Verifica que el HDC1080 es realmente un HDC1080 leyendo sus IDs de
 *  fabricante y dispositivo. Que una direccion responda no garantiza que
 *  sea el chip correcto.                                                */
bool verificarHDC1080() {
    Wire.beginTransmission(HDC1080_ADDR);
    if (Wire.endTransmission() != 0) {
        logError("HDC1080", "No responde en 0x40");
        return false;
    }
    uint16_t fab = hdc1080.readManufacturerId();   // 0x5449 = Texas Instruments
    uint16_t dev = hdc1080.readDeviceId();         // 0x1050 = HDC1080
    logInfoF("HDC1080", "Fabricante=0x%04X  Dispositivo=0x%04X", fab, dev);
    if (fab == 0x5449 && dev == 0x1050) {
        logInfo("HDC1080", "Identificado correctamente");
        return true;
    }
    logWarn("HDC1080", "IDs inesperados: responde algo, pero no parece un HDC1080");
    return false;
}

volatile bool monitor_activo = false;

/*  Diagnóstico de un pin de ADC2 con el WiFi apagado temporalmente.
 *
 *  ADC2 y la radio comparten hardware: mientras el WiFi está activo,
 *  analogRead() sobre GPIO 0,2,4,12-15,25-27 devuelve ceros. No hay
 *  forma de sortearlo por software.
 *
 *  Para una prueba de banco sí se puede apagar la radio, medir y volver
 *  a encenderla. Se pierde la conexión durante esos segundos, pero a
 *  cambio se obtiene la lectura analógica real, que es lo único que
 *  permite decidir si el sensor sirve y dónde poner el umbral.          */
void diagnosticoADC2(uint16_t segundos) {
    bool monitor_previo = monitor_activo;
    monitor_activo = false;   // no mezclar salidas durante la medida

    Serial.println();
    Serial.println("=========================================================");
    Serial.printf ("  DIAGNOSTICO ANALOGICO  GPIO%d  (%u s)\n",
                   PIN_SENSOR_WATER, segundos);
    Serial.println("  Apagando WiFi: ADC2 no funciona con la radio activa.");
    Serial.println("  Moja el sensor a mitad de la prueba y observa.");
    Serial.println("=========================================================");

    WiFi.disconnect(true, false);
    WiFi.mode(WIFI_OFF);
    vTaskDelay(600 / portTICK_PERIOD_MS);

    // Sin pull-up: queremos ver la señal que entrega el sensor, no la
    // que impone el ESP32.
    pinMode(PIN_SENSOR_WATER, INPUT);

    int minimo = 4095, maximo = 0;
    uint16_t muestras = segundos * 2;   // una cada 500 ms

    Serial.println("  seg |  ADC  | voltaje | digital | barra");
    Serial.println("  ----+-------+---------+---------+--------------------");

    for (uint16_t i = 0; i < muestras; i++) {
        int raw = 0;
        for (uint8_t k = 0; k < 8; k++) { raw += analogRead(PIN_SENSOR_WATER); delayMicroseconds(200); }
        raw /= 8;
        int dig = digitalRead(PIN_SENSOR_WATER);

        if (raw < minimo) minimo = raw;
        if (raw > maximo) maximo = raw;

        // Barra proporcional: la variación se ve mucho antes de forma
        // gráfica que leyendo columnas de números.
        char barra[21];
        int  n = map(raw, 0, 4095, 0, 20);
        for (int b = 0; b < 20; b++) barra[b] = (b < n) ? '#' : '.';
        barra[20] = '\0';

        Serial.printf("  %3u | %4d  |  %.2fV  |    %d    | %s\n",
                      i / 2, raw, raw * ADC_VREF / ADC_BITS, dig, barra);
        vTaskDelay(500 / portTICK_PERIOD_MS);
    }

    Serial.println("  ----+-------+---------+---------+--------------------");
    Serial.printf ("  Minimo=%d  Maximo=%d  Excursion=%d cuentas (%.2fV)\n",
                   minimo, maximo, maximo - minimo,
                   (maximo - minimo) * ADC_VREF / ADC_BITS);
    if (maximo - minimo < 200) {
        Serial.println("  >> SIN VARIACION APRECIABLE.");
        Serial.println("     El sensor no esta llegando al pin. Revisa:");
        Serial.println("       - alimentacion del modulo (3.3V) y GND comun");
        Serial.println("       - que el cable sea de la salida ANALOGICA (AO), no DO");
        Serial.println("       - continuidad del cable hasta GPIO4");
    } else {
        int umbral = (minimo + maximo) / 2;
        Serial.printf ("  >> Variacion detectada. Umbral sugerido: %d cuentas\n", umbral);
        Serial.println("     Mueve el sensor a GPIO32 y usa este valor para calibrar.");
    }
    Serial.println("=========================================================");

    // Restaurar el pin al modo de operación y reencender la radio
    pinMode(PIN_SENSOR_WATER, NIVEL_MODO_DIGITAL ? INPUT_PULLUP : INPUT);
    WiFi.mode(WIFI_STA);
    Serial.println("  WiFi reactivado, la tarea de red reconectara sola.");
    Serial.println();
    monitor_activo = monitor_previo;
}

void imprimirSensores() {
    Serial.println();
    Serial.println("+-----------------+--------+------+-----------+------------------+");
    Serial.println("| Sensor          | Pin    | Mod  | Crudo     | Valor            |");
    Serial.println("+-----------------+--------+------+-----------+------------------+");
    Serial.printf ("| HDC1080 temp    | I2C21  | %-4s | %-9s | %.2f C\n",
                   mods.sensor_hdc ? "ON" : "off",
                   hdcPresente ? "0x40 ok" : "SIN CHIP", temperatura_HDC);
    Serial.printf ("| HDC1080 humedad | I2C22  | %-4s | %-9s | %.2f %%\n",
                   mods.sensor_hdc ? "ON" : "off",
                   hdcPresente ? "0x40 ok" : "SIN CHIP", humedad_HDC);
    Serial.printf ("| Nivel agua      | GPIO36 | %-4s | ADC %-5d | %s\n",
                   mods.sensor_suelo ? "ON" : "off", suelo_raw,
                   hay_agua ? "HAY AGUA" : "seco");
    Serial.printf ("| Conductividad   | GPIO33 | %-4s | ADC %-5d | %.0f uS/cm\n",
                   mods.sensor_ec ? "ON" : "off", ec_raw, ec_us_cm);
    Serial.printf ("| pH (retirado)   | GPIO34 | %-4s | ADC %-5d | %.2f\n",
                   mods.sensor_ph ? "ON" : "off", ph_raw, ph_g);
    Serial.println("+-----------------+--------+------+-----------+------------------+");
    if (mods.simulacion)
        Serial.println("  >> SIMULACION ACTIVA: los valores son sinteticos, no del hardware <<");
    Serial.printf ("  Nivel: referencia seco=%d, umbral de caida=%d, actual=%d (delta %d)\n",
                   nivel_adc_seco, NIVEL_DELTA_MIN, suelo_raw,
                   nivel_adc_seco - suelo_raw);
    Serial.printf ("  TDS:   curva del fabricante · factor %.1f · k=%.3f · cero=%.0f mV\n",
                   TDS_FACTOR, tds_k, tds_mv_cero);
    if (tds_mv > TDS_MV_TECHO)
        Serial.printf ("         AVISO: %.0f mV supera el techo util del ADC (%.0f mV).\n"
                       "         Por encima la curva del fabricante pierde validez.\n",
                       tds_mv, TDS_MV_TECHO);
    Serial.printf ("         compensado a %.0f C usando %s\n", TDS_TEMP_REF,
                   hdcPresente ? "el HDC1080 (temp. del AIRE, no del agua)"
                               : "un valor fijo de 25 C");
    Serial.println();
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
            s["agua"]   = hay_agua;          // detector de nivel, no porcentaje
        }
        if (mods.sensor_ec || mods.simulacion) {
            s["ec"]  = round(ec_us_cm * 10) / 10.0;   // uS/cm
            s["tds"] = round(tds_ppm * 10) / 10.0;    // ppm
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
            hdc1080.begin(HDC1080_ADDR);
            vTaskDelay(200 / portTICK_PERIOD_MS);
            hdcPresente = verificarHDC1080();
            hdcIniciado = true;
            if (!hdcPresente) {
                logError("HDC1080", "No inicializado. Usa 'i2c' para escanear el bus.");
                // Reintentar mas tarde en vez de rendirse: el sensor puede
                // conectarse en caliente durante una prueba de banco.
                vTaskDelay(5000 / portTICK_PERIOD_MS);
                hdcIniciado = false;
                continue;
            }
        }

        float temp = hdc1080.readTemperature();
        float hum  = hdc1080.readHumidity();

        // Sin sensor en el bus el HDC1080 devuelve NaN o valores absurdos.
        // 125 C y 100 % son los topes del chip: por encima es lectura basura.
        if (isnan(temp) || temp < -40.0f || temp > 125.0f ||
            isnan(hum)  || hum  <   0.0f || hum  > 100.0f) {
            logWarn("HDC1080", "Lectura invalida — revisa cableado I2C");
            hdcPresente = false;
            hdcIniciado = false;
            vTaskDelay(3000 / portTICK_PERIOD_MS);
            continue;
        }

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            temperatura_HDC = temp;
            humedad_HDC     = hum;
            xSemaphoreGive(xMutexDatos);
        }
        logInfoF("HDC1080", "temp=%.2f C   hum=%.2f %%", temp, hum);
    }
}

// ============================================================
//  TAREA: Humedad de sustrato
// ============================================================
void tarea_sensor_suelo(void* pv) {
    // En modo digital conviene el pull-up interno: deja la entrada en un
    // estado conocido cuando la sonda esta al aire, en vez de flotando.
    pinMode(PIN_SENSOR_WATER, NIVEL_MODO_DIGITAL ? INPUT_PULLUP : INPUT);
    bool agua_previa = false;

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

        int raw = leerNivelRaw();
        bool agua = hayAgua(raw);

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            suelo_raw = raw;
            hay_agua  = agua;
            // Se publica como 0/100 y no como porcentaje interpolado: el
            // sensor es un detector de umbral, y fingir una escala continua
            // que no tiene daría una falsa sensación de precisión.
            humedad_suelo = agua ? 100.0f : 0.0f;
            xSemaphoreGive(xMutexDatos);
        }

        // Solo se registra el cambio de estado, no cada lectura: con
        // muestreo cada 5 s el log sería ilegible.
        if (agua != agua_previa) {
            logInfoF("NIVEL", "%s   raw=%d  (seco=%d  delta=%d)",
                     agua ? ">>> AGUA DETECTADA — cortar llenado" : "sin agua",
                     raw, nivel_adc_seco, nivel_adc_seco - raw);
            agua_previa = agua;
        }
    }
}

// ============================================================
//  TAREA: Conductividad eléctrica
// ============================================================
void tarea_sensor_ec(void* pv) {
    pinMode(PIN_EC_SENSOR, INPUT);
    for (;;) {
        vTaskDelay(INTERVAL_SENSOR / portTICK_PERIOD_MS);

        if (mods.simulacion) {
            if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
                if (ec_us_cm == 0.0f) ec_us_cm = 1600.0f;
                ec_us_cm = paseo(ec_us_cm, 40.0f, 800.0f, 2600.0f);
                xSemaphoreGive(xMutexDatos);
            }
            continue;
        }

        if (!mods.sensor_ec) continue;

        // Temperatura del HDC1080 si esta disponible; si no, la de
        // referencia. Sin compensar, la misma disolucion leeria distinto
        // segun el dia.
        float tempC = (hdcPresente && temperatura_HDC > 0.0f)
                    ? temperatura_HDC : TDS_TEMP_FALLBACK;

        float mv  = leerTDSmV();
        float ppm = tdsDesdeVoltaje(mv, tempC);
        float us  = ppmAMicroSiemens(ppm);

        if (xSemaphoreTake(xMutexDatos, portMAX_DELAY) == pdTRUE) {
            tds_mv   = mv;
            tds_ppm  = ppm;
            ec_raw   = (int)mv;
            ec_us_cm = us;
            xSemaphoreGive(xMutexDatos);
        }
        logInfoF("TDS", "%.0f mV @ %.1f C  ->  %.0f ppm  =  %.0f uS/cm",
                 mv, tempC, ppm, us);
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
        ph_raw = (int)avg;

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
//  TAREA: Monitor continuo de sensores
// ============================================================
/*  Imprime los valores crudos una vez por segundo, en una sola línea.
 *  Es la herramienta de calibración: permite meter la sonda en agua, o
 *  cambiar de solución patrón, y ver el número moverse en tiempo real
 *  sin tener que pedir la tabla una y otra vez.
 *
 *  Lee los pines directamente y no depende de los módulos de sensores,
 *  para poder diagnosticar hardware aunque todo lo demás esté apagado.  */

void tarea_monitor(void* pv) {
    bool aviso_sim_dado = false;

    for (;;) {
        if (!monitor_activo) {
            aviso_sim_dado = false;
            vTaskDelay(300 / portTICK_PERIOD_MS);
            continue;
        }

        // La simulación enmascara por completo los sensores reales: las
        // tareas toman su rama y ni siquiera inicializan el hardware.
        // Avisarlo aquí evita horas de diagnóstico sobre datos inventados.
        if (mods.simulacion && !aviso_sim_dado) {
            Serial.println();
            Serial.println("  ##############################################");
            Serial.println("  #  SIMULACION ACTIVA                         #");
            Serial.println("  #  La telemetria son valores sinteticos.     #");
            Serial.println("  #  Los sensores reales NO se estan leyendo.  #");
            Serial.println("  #  Apagala con:  sim off                     #");
            Serial.println("  ##############################################");
            Serial.println();
            aviso_sim_dado = true;
        }

        // El monitor lee el hardware SIEMPRE, aunque los módulos estén
        // apagados: es una herramienta de diagnóstico, no de operación.
        int nivel = leerNivelRaw();

        Serial.printf("[MON] nivel: %-5d", nivel);
        if (!NIVEL_MODO_DIGITAL)
            Serial.printf(" (%.2fV)", nivel * ADC_VREF / ADC_BITS);
        else
            Serial.printf(" (digital)");
        float mv_ec = leerTDSmV();
        float t_ref = (hdcPresente && temperatura_HDC > 0.0f)
                    ? temperatura_HDC : TDS_TEMP_FALLBACK;
        float ppm   = tdsDesdeVoltaje(mv_ec, t_ref);
        Serial.printf(" %-4s | tds: %4.0f mV%s -> %5.0f ppm (%5.0f uS/cm) | ",
                      hayAgua(nivel) ? "AGUA" : "seco",
                      mv_ec, mv_ec > TDS_MV_TECHO ? "!" : " ",
                      ppm, ppmAMicroSiemens(ppm));

        // Intentar levantar el HDC1080 aquí mismo si aún no responde: el
        // sensor puede conectarse en caliente durante una prueba de banco.
        if (!hdcPresente) {
            Wire.beginTransmission(HDC1080_ADDR);
            if (Wire.endTransmission() == 0) {
                hdc1080.begin(HDC1080_ADDR);
                delay(100);
                hdcPresente = true;
                hdcIniciado = true;
            }
        }

        if (hdcPresente) {
            float t = hdc1080.readTemperature();
            float h = hdc1080.readHumidity();
            if (!isnan(t) && t > -40.0f && t < 125.0f)
                 Serial.printf("hdc: %.2f C  %.1f %%\n", t, h);
            else { Serial.println("hdc: ERROR de lectura"); hdcPresente = false; }
        } else {
            Serial.println("hdc: NO RESPONDE en 0x40  (usa 'i2c')");
        }

        vTaskDelay(MON_INTERVAL_MS / portTICK_PERIOD_MS);
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
                Serial.println("  SENSORES");
                Serial.println("    sensores on|off  enciende/apaga los tres");
                Serial.println("    sensores         tabla con crudos y valores");
                Serial.println("    mon on | mon off monitor continuo (para calibrar)");
                Serial.println("    i2c              escanea el bus I2C");
                Serial.println("    adc2 [seg]       lee GPIO4 apagando el WiFi (def. 40 s)");
                Serial.println("    sim on | sim off valores sinteticos (enmascara el hardware)");
                Serial.println();
                Serial.println("  CALIBRACION");
                Serial.println("    cal nivel        fija la referencia en SECO");
                Serial.println("    cal cero         sonda AL AIRE y seca: fija el offset");
                Serial.println("    cal tds <ppm>    ajuste fino contra una referencia");
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

            // ── Sensores ────────────────────────────────────────
            else if (linea == "sensores") { imprimirSensores(); }
            else if (linea == "sim on")   { setModulo("simulacion", true);  imprimirModulos(); }
            else if (linea == "sim off")  { setModulo("simulacion", false); imprimirModulos(); }
            else if (linea == "i2c")      { escanearI2C(); }
            else if (linea == "adc2" || linea.startsWith("adc2 ")) {
                int seg = linea.length() > 5 ? linea.substring(5).toInt() : 40;
                if (seg < 5 || seg > 180) seg = 40;
                diagnosticoADC2((uint16_t)seg);
            }
            else if (linea == "mon on")   {
                monitor_activo = true;
                Serial.println("[MON] Monitor continuo ON — 'mon off' para parar");
            }
            else if (linea == "mon off")  {
                monitor_activo = false;
                Serial.println("[MON] Monitor detenido");
            }
            // Enciende los tres sensores de golpe, que es lo habitual al
            // empezar una sesion de pruebas.
            else if (linea == "sensores on") {
                setModulo("sensor_hdc",   true);
                setModulo("sensor_suelo", true);
                setModulo("sensor_ec",    true);
                imprimirModulos();
            }
            else if (linea == "sensores off") {
                setModulo("sensor_hdc",   false);
                setModulo("sensor_suelo", false);
                setModulo("sensor_ec",    false);
                imprimirModulos();
            }

            // ── Calibración ─────────────────────────────────────
            //  'cal nivel'        captura la referencia en seco
            //  'cal tds <ppm>'    ajusta k contra una referencia conocida
            else if (linea == "cal nivel") {
                nivel_adc_seco = leerNivelRaw();
                guardarCalibracion();
                Serial.printf("[CAL] Referencia en SECO = %d cuentas.\n", nivel_adc_seco);
                Serial.printf("      Se dara agua por detectada al bajar de %d.\n",
                              nivel_adc_seco - NIVEL_DELTA_MIN);
            }
            // Ajuste fino del TDS. NO es una calibracion de dos puntos:
            // el modulo ya trae la curva del fabricante. Esto solo corrige
            // una desviacion sistematica contra una referencia conocida.
            // 'cal cero' — sonda AL AIRE y SECA. Fija el offset del modulo.
            else if (linea == "cal cero") {
                float mv = leerTDSmV();
                if (mv > 500.0f) {
                    Serial.printf("[CAL] %.0f mV es demasiado alto para un cero.\n", mv);
                    Serial.println("      Seca la sonda y asegurate de que esta al aire.");
                } else {
                    tds_mv_cero = mv;
                    guardarCalibracion();
                    Serial.printf("[CAL] Cero fijado en %.0f mV.\n", tds_mv_cero);
                    Serial.println("      Al aire la lectura deberia dar ahora ~0 ppm.");
                }
            }
            else if (linea.startsWith("cal tds ")) {
                float ref = linea.substring(8).toFloat();
                if (ref <= 0.0f) {
                    Serial.println("[CAL] Indica los ppm de referencia. Ej: cal tds 350");
                } else {
                    float t = (hdcPresente && temperatura_HDC > 0.0f)
                            ? temperatura_HDC : TDS_TEMP_FALLBACK;
                    float k_previo = tds_k;
                    tds_k = 1.0f;                          // medir sin correccion
                    float mv    = leerTDSmV();
                    float bruto = tdsDesdeVoltaje(mv, t);
                    if (bruto < 1.0f) {
                        tds_k = k_previo;
                        Serial.println("[CAL] Lectura casi nula. Sonda en el agua?");
                    } else {
                        tds_k = ref / bruto;
                        guardarCalibracion();
                        Serial.printf("[CAL] %.0f mV -> %.0f ppm sin corregir\n", mv, bruto);
                        Serial.printf("      Referencia %.0f ppm  =>  k = %.4f\n", ref, tds_k);
                        if (tds_k < 0.5f || tds_k > 2.0f)
                            Serial.println("      AVISO: correccion mayor del 100 %. Revisa la referencia.");
                    }
                }
            }
            else if (linea == "cal") { imprimirSensores(); }

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
            // ── Marcador de prueba ──────────────────────────────
            //  Cualquier texto que no sea un comando se registra como
            //  etiqueta en el log. Sirve para anotar qué se está midiendo
            //  ("sal", "vinagre", "grifo") y poder separar despues los
            //  tramos de cada muestra sin adivinar por la hora.
            else {
                Serial.println();
                Serial.printf("========== MARCA: %s ==========\n", linea.c_str());
                Serial.printf("   t=%lu ms   (escribe 'ayuda' si buscabas un comando)\n",
                              millis());
                Serial.println();
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

    // Bus I2C con pines explicitos: la libreria del HDC1080 llamaria a
    // Wire.begin() sin argumentos y usaria los de la placa por defecto.
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);

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
    xTaskCreate(tarea_sensor_ec,     "ec",         2560, NULL, 1, NULL);
    xTaskCreate(tarea_actuadores,    "actuadores", 2560, NULL, 2, NULL);

    // ── Pruebas de banco ─────────────────────────────────────
    xTaskCreate(tarea_test_valvulas, "test-valv",  3072, NULL, 2, NULL);
    xTaskCreate(tarea_consola,       "consola",    4096, NULL, 1, NULL);
    xTaskCreate(tarea_monitor,       "monitor",    4096, NULL, 1, NULL);
}

void loop() {
    // Vacío a propósito: todo corre en tareas FreeRTOS
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
