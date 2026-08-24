/*
 * ============================================================
 *  AGW — Nodo HIDROPÓNICO (IoT-node-26.001)
 *  Firmware v2.3.0 / Arduino + PlatformIO / ESP32 DevKit v1
 * ============================================================
 *
 *  NOVEDAD v2.3.0 — Lo que el nodo no contaba
 *  ------------------------------------------------------------
 *  · /estado publica ya los cuatro tiempos de hidroponia. Sin ellos el
 *    gateway no podia verificar la cadencia y hubo que cronometrar la
 *    bomba desde fuera para descubrir que regaba 300 s en vez de 180.
 *
 *  · Eventos de riego en su propio topic (.../evento), al abrir y al
 *    cerrar cada ciclo, con la duracion REAL. No van con la telemetria
 *    a proposito: la telemetria esta a 5 min y un ciclo dura 3, asi que
 *    algunos ciclos no apareceran en ninguna trama periodica.
 *
 *  · Calibracion de la sonda TDS por MQTT y HTTP:
 *        {"cmd":"cal_cero"}            sonda al aire y seca
 *        {"cmd":"cal_tds","ppm":350}   contra solucion patron
 *    Antes solo existia por consola serie, asi que calibrar exigia ir
 *    con un cable a una sonda que se consulta por red.
 *
 *  · La conductividad tiene cadencia propia (prog.ec_cada_s, 60 s por
 *    defecto). La sonda vive sumergida y leerla cada 5 s la excitaba
 *    17.000 veces al dia sin ganar resolucion.
 *
 *  NOVEDAD v2.2.0 — El nodo, ya en produccion
 *  ------------------------------------------------------------
 *  · Los modulos arrancan ENCENDIDOS. Ver config.h: el arranque de
 *    fabrica es el cultivo funcionando, no el banco de pruebas.
 *
 *  · Cadencia de hidroponia del cultivo: de dia 5 min de riego y 10 de
 *    descanso (4 riegos/hora); de noche 5 y 55 (1 riego/hora).
 *
 *  · Apagar la luz UN DIA sin desmontar el fotoperiodo:
 *        {"cmd":"luz","encendida":false}     o   `luz off` por consola
 *    El veto caduca solo al llegar hora_luz_off, asi que manana la luz
 *    enciende a su hora sin que nadie rearme nada. Antes esto se hacia
 *    apagando el modulo `ambiente`, que no vuelve solo: la luz se
 *    quedaba apagada hasta que alguien se acordaba.
 *
 *  · BUFFER MQTT. PubSubClient trae 256 bytes y no avisa cuando algo no
 *    cabe. El nodo tenia dos averias simultaneas por esto: el status
 *    (~700 B) no se publicaba nunca, y el set_programa del gateway
 *    (~290 B) se descartaba al entrar mientras el set_hora, mas corto,
 *    si pasaba. Resultado: hora correcta y programa equivocado, sin un
 *    solo mensaje de error en ninguno de los dos lados.
 *
 *  NOVEDAD v2.1.0 — Llenado de tierra por sensor de nivel
 *  ------------------------------------------------------------
 *  REGLA DEL CULTIVO: la tierra se llena de agua hasta que el sensor de
 *  nivel acusa la llegada del agua, y eso se repite cada N dias. N vale
 *  10 de fabrica y se cambia en caliente, sin recompilar ni reflashear:
 *
 *      {"cmd":"set_programa","tierra_cada_dias":9}     por MQTT o HTTP
 *      tierra 9                                        por consola serie
 *
 *  El valor persiste en NVS y al cambiarlo se recalcula la fecha del
 *  proximo llenado, para que bajar de 10 a 8 dias se note ya en el ciclo
 *  en curso y no en el siguiente.
 *
 *  Llenado bajo peticion, para el primer llenado y para las pruebas:
 *
 *      {"cmd":"llenar_tierra"}                cuenta como el riego del ciclo
 *      {"cmd":"llenar_tierra","prueba":true}  llena sin tocar el calendario
 *      {"cmd":"medir_ec"}                     conductividad puntual
 *
 *  El corte lo decide el sensor y no un temporizador: el volumen que
 *  admite el sustrato cambia con lo seco que este y con lo que hayan
 *  crecido las raices. Hay dos condiciones de corte —caida relativa a la
 *  referencia del llenado y umbral absoluto de agua— y un tope de tiempo
 *  por si el sensor se averia. Cada llenado registra la EC antes y
 *  despues, y publica un status en cuanto termina.
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
 *  Desde la v2.1.0 los valores de fabrica son los de PRODUCCION: riego,
 *  ambiente y sensores arrancan encendidos (config.h). Solo quedan fuera
 *  simulacion, test_valvulas y el pH retirado. Los flags se guardan en
 *  NVS y sobreviven al reinicio, asi que reflashear NO reactiva nada: la
 *  NVS conserva lo que hubiera. `{"cmd":"reset_modulos"}` es lo que
 *  vuelve a los valores por defecto.
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
#include <time.h>
#include <sys/time.h>   // settimeofday()
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
    bool riego_hidro;
    bool riego_tierra;
    bool ambiente;
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
    DEFAULT_MOD_RIEGO_HIDRO,
    DEFAULT_MOD_RIEGO_TIERRA,
    DEFAULT_MOD_AMBIENTE,
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

// ============================================================
//  PROGRAMA DE CULTIVO — lo empuja la Raspberry, vive en NVS
// ============================================================
/*  REPARTO DE RESPONSABILIDADES
 *  La Pi lleva el calendario y decide CUANDO toca cada cosa. El ESP32
 *  guarda el plan y lo EJECUTA, incluso si la Pi desaparece. Asi el
 *  cultivo sobrevive a una caida del gateway.                          */
struct Programa {
    uint8_t  hora_luz_on;
    uint8_t  hora_luz_off;
    uint32_t hidro_riego_dia_s;
    uint32_t hidro_descanso_dia_s;
    uint32_t hidro_riego_noche_s;
    uint32_t hidro_descanso_noche_s;
    uint16_t tierra_cada_dias;
    uint8_t  tierra_hora;
    uint32_t telemetria_s;
    uint32_t ec_cada_s;
};

static Programa prog = {
    PROG_HORA_LUZ_ON,            PROG_HORA_LUZ_OFF,
    PROG_HIDRO_RIEGO_DIA_S,      PROG_HIDRO_DESCANSO_DIA_S,
    PROG_HIDRO_RIEGO_NOCHE_S,    PROG_HIDRO_DESCANSO_NOCHE_S,
    PROG_TIERRA_CADA_DIAS,       PROG_TIERRA_HORA,
    PROG_TELEMETRIA_S,           PROG_EC_CADA_S
};

// --- Reloj: el ESP32 no tiene RTC, la hora la envia la Pi ---
volatile bool   hora_valida     = false;
volatile time_t ultimo_contacto = 0;   // epoch del ultimo mensaje del gateway

// --- Riego de tierra: dos relojes ---
//  Con hora valida manda el calendario que envia la Pi.
//  Sin ella manda `seg_desde_riego_tierra`, un contador propio que el
//  nodo incrementa por su cuenta. Asi el riego de tierra ocurre igual
//  aunque la Raspberry no aparezca nunca.
volatile time_t   proximo_riego_tierra   = 0;   // epoch, 0 = sin programar
volatile time_t   ultimo_riego_tierra    = 0;
volatile uint32_t seg_desde_riego_tierra = 0;   // contador autonomo

// --- Llenado de tierra bajo peticion ---
//  Un llenado manual NO puede ejecutarse dentro del callback de MQTT ni
//  del handler HTTP: dura hasta 10 minutos y bloquearia el keepalive del
//  broker, que es de 20 s. El comando solo deja la peticion aqui y la
//  tarea de riego, que ya vive en su propio hilo, la recoge.
volatile bool solicitud_llenado    = false;
volatile bool solicitud_reprograma = true;   // ¿cuenta para el calendario?

// --- Resultado del ultimo llenado, para el status y el informe ---
volatile uint32_t ult_llenado_s       = 0;   // duracion en segundos
volatile bool     ult_llenado_sensor  = false;  // ¿corto el sensor o el reloj?
volatile int      ult_llenado_raw_ini = 0;
volatile int      ult_llenado_raw_fin = 0;
float ec_antes_llenado   = 0.0f;   // uS/cm justo antes de abrir la valvula
float ec_despues_llenado = 0.0f;   // uS/cm justo despues de cerrarla

// --- Estado de ejecucion, se reporta en el status ---
volatile bool regando_hidro  = false;
volatile bool regando_tierra = false;
volatile bool luz_encendida  = false;
volatile bool huerfano       = false;   // sin noticias del gateway

// --- Nivel de log (0=silencio … 4=depuracion) ---
volatile uint8_t log_nivel = LOG_NIVEL_DEF;

// --- Estado de los enclavamientos de seguridad ---
//  Las variables viven aqui, con el resto del estado global; las
//  funciones que las evaluan estan mas abajo, donde ya tienen a mano
//  hayAgua() y las lecturas de sensores.
volatile uint32_t bomba_encendida_desde = 0;   // millis(), 0 = apagada
volatile uint32_t fin_ultimo_riego      = 0;   // millis()
volatile bool     luz_cortada_por_calor = false;

// --- Veto manual de la luz, valido para UNA jornada ---
//  Apagar la luz un dia concreto sin desmontar el fotoperiodo. El veto
//  caduca solo al llegar la hora de apagado, asi que al dia siguiente la
//  luz vuelve a encenderse a su hora sin que nadie tenga que acordarse
//  de rearmarla. Olvidarse de rearmarla es justo lo que pasaba cuando
//  esto se hacia apagando el modulo `ambiente`: la luz no volvia nunca.
//
//  Se persiste en NVS: un reinicio a media tarde no debe reencender una
//  luz que se apago a proposito.
volatile bool   luz_vetada      = false;
volatile time_t veto_luz_hasta  = 0;   // epoch de caducidad, 0 = sin fecha

// Diagnostico del keepalive MQTT: cuenta cuantas veces seguidas no se
// pudo ejecutar clientPub.loop() por no conseguir el mutex.
volatile uint8_t  loops_omitidos = 0;

// --- Riego manual: gana sobre los ciclos automaticos ---
//  Los tiempos de ciclo ya no viven aqui: los define el struct Programa,
//  que empuja la Raspberry y persiste en NVS.
volatile bool RIEGO_FORZADO = false;

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
/*  Los logs pasan por un filtro de nivel para poder dejar el nodo mudo
 *  en produccion. Un ESP32 instalado en un invernadero no tiene nadie
 *  mirando el puerto serie, y escribir en un UART sin receptor consume
 *  CPU y bloquea la tarea mientras se vacia el buffer.                 */
#define LOG_SILENCIO 0
#define LOG_ERROR    1
#define LOG_WARN     2
#define LOG_INFO     3
#define LOG_DEBUG    4

void logError(const char* tag, const char* msg) {
    if (log_nivel >= LOG_ERROR)
        Serial.printf("[%8lu][ERROR] %-10s %s\n", millis(), tag, msg);
}
void logWarn(const char* tag, const char* msg) {
    if (log_nivel >= LOG_WARN)
        Serial.printf("[%8lu][WARN ] %-10s %s\n", millis(), tag, msg);
}
void logInfo(const char* tag, const char* msg) {
    if (log_nivel >= LOG_INFO)
        Serial.printf("[%8lu][INFO ] %-10s %s\n", millis(), tag, msg);
}
void logInfoF(const char* tag, const char* fmt, ...) {
    if (log_nivel < LOG_INFO) return;
    char buf[320];
    va_list args; va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args); va_end(args);
    Serial.printf("[%8lu][INFO ] %-10s %s\n", millis(), tag, buf);
}
void logWarnF(const char* tag, const char* fmt, ...) {
    if (log_nivel < LOG_WARN) return;
    char buf[320];
    va_list args; va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args); va_end(args);
    Serial.printf("[%8lu][WARN ] %-10s %s\n", millis(), tag, buf);
}

// ============================================================
//  RELOJ — la hora la provee la Raspberry
// ============================================================
/*  El ESP32 no tiene RTC con bateria: al arrancar no sabe que hora es.
 *  La Pi le envia el epoch al conectar y lo resincroniza periodicamente.
 *  Entre sincronizaciones el nodo mantiene la cuenta con su propio
 *  oscilador, que deriva unos segundos al dia — irrelevante para
 *  decidir si son las 6 de la mañana.                                  */

void fijarHora(time_t epoch) {
    struct timeval tv = { .tv_sec = epoch, .tv_usec = 0 };
    settimeofday(&tv, nullptr);
    hora_valida = true;
    ultimo_contacto = epoch;

    struct tm t;
    localtime_r(&epoch, &t);
    logInfoF("RELOJ", "Hora fijada: %04d-%02d-%02d %02d:%02d:%02d",
             t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
             t.tm_hour, t.tm_min, t.tm_sec);
}

time_t ahora() { return hora_valida ? time(nullptr) : 0; }

int horaDelDia() {
    if (!hora_valida) return -1;
    time_t t = time(nullptr);
    struct tm tm_now;
    localtime_r(&t, &tm_now);
    return tm_now.tm_hour;
}

/*  Ventana de luz. Soporta que cruce medianoche (p.ej. 20 → 6), aunque
 *  el fotoperiodo actual de 14 h no lo necesite.                       */
bool esDeDia() {
    int h = horaDelDia();
    if (h < 0) return true;   // sin hora: se asume dia, ver MODO DEGRADADO
    if (prog.hora_luz_on <= prog.hora_luz_off)
        return h >= prog.hora_luz_on && h < prog.hora_luz_off;
    return h >= prog.hora_luz_on || h < prog.hora_luz_off;
}

/*  MODO DEGRADADO
 *  Sin hora valida no se pueden respetar horarios. En vez de detener el
 *  cultivo, el nodo asume permanentemente "de dia": riega con la cadencia
 *  diurna y mantiene la luz encendida. Es la opcion conservadora — un
 *  cultivo con exceso de luz y riego sobrevive; uno sin riego, no.
 *  El estado se reporta para que quede constancia de que esos datos se
 *  produjeron sin referencia horaria.                                  */
bool modoDegradado() { return !hora_valida; }


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
    mods.riego_hidro  = prefs.getBool("r_hidro",    DEFAULT_MOD_RIEGO_HIDRO);
    mods.riego_tierra = prefs.getBool("r_tierra",   DEFAULT_MOD_RIEGO_TIERRA);
    mods.ambiente     = prefs.getBool("ambiente",   DEFAULT_MOD_AMBIENTE);
    mods.simulacion   = prefs.getBool("simulacion",  DEFAULT_MOD_SIMULACION);
    mods.ahorro_wifi  = prefs.getBool("ahorro_wifi", DEFAULT_MOD_AHORRO_WIFI);
    // test_valvulas NO se lee de NVS a proposito: es una prueba de banco.
    // Si sobreviviera al reinicio, un corte de luz dejaria las valvulas
    // haciendo barridos solas. Siempre arranca apagado.
    mods.test_valvulas = false;
    mods.sensor_ec    = prefs.getBool("sensor_ec",  DEFAULT_MOD_SENSOR_EC);
    periodo_telemetria_ms = prefs.getUInt("periodo", PROG_TELEMETRIA_S * 1000UL);
    nivel_adc_seco = prefs.getInt("niv_seco", NIVEL_ADC_SECO_DEF);
    tds_k       = prefs.getFloat("tds_k",    TDS_K_DEF);
    tds_mv_cero = prefs.getFloat("tds_cero", TDS_MV_CERO_DEF);
    prefs.end();
}

// ============================================================
//  PROGRAMA — persistencia y validación
// ============================================================
/*  Todo valor que llega del gateway se acota antes de guardarse. Un
 *  parametro corrupto —un bug en la Pi, un JSON mal formado, un byte
 *  perdido en la red— no puede traducirse en una bomba encendida seis
 *  horas seguidas. El nodo es el ultimo responsable de su propio
 *  hardware, aunque obedezca al gateway.                              */
uint32_t acotar(uint32_t valor, uint32_t minimo, uint32_t maximo) {
    if (valor < minimo) return minimo;
    if (valor > maximo) return maximo;
    return valor;
}

void guardarPrograma() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putUChar("p_luz_on",   prog.hora_luz_on);
    prefs.putUChar("p_luz_off",  prog.hora_luz_off);
    prefs.putUInt ("p_hrd",      prog.hidro_riego_dia_s);
    prefs.putUInt ("p_hdd",      prog.hidro_descanso_dia_s);
    prefs.putUInt ("p_hrn",      prog.hidro_riego_noche_s);
    prefs.putUInt ("p_hdn",      prog.hidro_descanso_noche_s);
    prefs.putUShort("p_t_dias",  prog.tierra_cada_dias);
    prefs.putUChar("p_t_hora",   prog.tierra_hora);
    prefs.putUInt ("p_telem",    prog.telemetria_s);
    prefs.putUInt ("p_ec_cada",  prog.ec_cada_s);
    prefs.putULong("p_prox_tie", (uint32_t)proximo_riego_tierra);
    prefs.putULong("p_ult_tie",  (uint32_t)ultimo_riego_tierra);
    prefs.putUChar("p_log",      log_nivel);
    prefs.putUInt ("p_seg_tie",  seg_desde_riego_tierra);
    prefs.putBool ("p_veto_luz", luz_vetada);
    prefs.putULong("p_veto_has", (uint32_t)veto_luz_hasta);
    prefs.end();
}

void cargarPrograma() {
    prefs.begin(NVS_NAMESPACE, true);
    prog.hora_luz_on            = prefs.getUChar ("p_luz_on",  PROG_HORA_LUZ_ON);
    prog.hora_luz_off           = prefs.getUChar ("p_luz_off", PROG_HORA_LUZ_OFF);
    prog.hidro_riego_dia_s      = prefs.getUInt  ("p_hrd",     PROG_HIDRO_RIEGO_DIA_S);
    prog.hidro_descanso_dia_s   = prefs.getUInt  ("p_hdd",     PROG_HIDRO_DESCANSO_DIA_S);
    prog.hidro_riego_noche_s    = prefs.getUInt  ("p_hrn",     PROG_HIDRO_RIEGO_NOCHE_S);
    prog.hidro_descanso_noche_s = prefs.getUInt  ("p_hdn",     PROG_HIDRO_DESCANSO_NOCHE_S);
    prog.tierra_cada_dias       = prefs.getUShort("p_t_dias",  PROG_TIERRA_CADA_DIAS);
    prog.tierra_hora            = prefs.getUChar ("p_t_hora",  PROG_TIERRA_HORA);
    prog.telemetria_s           = prefs.getUInt  ("p_telem",   PROG_TELEMETRIA_S);
    prog.ec_cada_s              = prefs.getUInt  ("p_ec_cada", PROG_EC_CADA_S);
    proximo_riego_tierra        = (time_t)prefs.getULong("p_prox_tie", 0);
    ultimo_riego_tierra         = (time_t)prefs.getULong("p_ult_tie",  0);
    log_nivel                   = prefs.getUChar ("p_log",     LOG_NIVEL_DEF);
    seg_desde_riego_tierra      = prefs.getUInt  ("p_seg_tie", 0);
    luz_vetada                  = prefs.getBool  ("p_veto_luz", false);
    veto_luz_hasta              = (time_t)prefs.getULong("p_veto_has", 0);
    prefs.end();
}

void imprimirPrograma() {
    Serial.println();
    Serial.println("+-------------------------------------------------------------+");
    Serial.println("|  PROGRAMA DE CULTIVO                                        |");
    Serial.println("+-------------------------------------------------------------+");
    Serial.printf ("  Fotoperiodo    luz de %02d:00 a %02d:00  (%d h de luz)\n",
                   prog.hora_luz_on, prog.hora_luz_off,
                   (prog.hora_luz_off - prog.hora_luz_on + 24) % 24);
    Serial.printf ("  Hidroponia     dia:   %lu s riego / %lu s descanso\n",
                   prog.hidro_riego_dia_s, prog.hidro_descanso_dia_s);
    Serial.printf ("                 noche: %lu s riego / %lu s descanso\n",
                   prog.hidro_riego_noche_s, prog.hidro_descanso_noche_s);
    Serial.printf ("  Tierra         cada %u dias a las %02d:00 (ajustable: tierra <dias>)\n",
                   prog.tierra_cada_dias, prog.tierra_hora);
    Serial.printf ("                 se llena hasta que el nivel cae %d cuentas "
                   "(%d lecturas seguidas)\n",
                   PROG_TIERRA_DELTA_CORTE, PROG_TIERRA_CORTE_CONFIRMA);
    Serial.printf ("                 tope de seguridad %d s si el sensor no responde\n",
                   PROG_TIERRA_MAX_S);
    if (ult_llenado_s > 0)
        Serial.printf ("                 ultimo llenado: %lu s, corte por %s, "
                       "EC %.0f -> %.0f uS/cm\n",
                       (uint32_t)ult_llenado_s, ult_llenado_sensor ? "SENSOR" : "TIEMPO",
                       ec_antes_llenado, ec_despues_llenado);
    if (luz_vetada) {
        if (veto_luz_hasta > 0) {
            struct tm tv; localtime_r((const time_t*)&veto_luz_hasta, &tv);
            Serial.printf ("  LUZ APAGADA A MANO hasta %04d-%02d-%02d %02d:00"
                           "  ('luz on' la devuelve ya)\n",
                           tv.tm_year + 1900, tv.tm_mon + 1, tv.tm_mday, tv.tm_hour);
        } else {
            Serial.println("  LUZ APAGADA A MANO, sin fecha de caducidad (no habia hora valida)");
        }
    }
    Serial.printf ("  Telemetria     cada %lu s   |   conductividad cada %lu s\n",
                   prog.telemetria_s, prog.ec_cada_s);
    Serial.printf ("  Nivel de log   %u\n", log_nivel);
    Serial.println("+-------------------------------------------------------------+");
    if (hora_valida) {
        time_t t = time(nullptr);
        struct tm tm_now; localtime_r(&t, &tm_now);
        Serial.printf ("  Hora del nodo  %04d-%02d-%02d %02d:%02d:%02d  (%s)\n",
                       tm_now.tm_year + 1900, tm_now.tm_mon + 1, tm_now.tm_mday,
                       tm_now.tm_hour, tm_now.tm_min, tm_now.tm_sec,
                       esDeDia() ? "DIA" : "NOCHE");
        if (proximo_riego_tierra > 0) {
            struct tm tp; localtime_r((const time_t*)&proximo_riego_tierra, &tp);
            Serial.printf ("  Proximo riego de tierra: %04d-%02d-%02d %02d:00\n",
                           tp.tm_year + 1900, tp.tm_mon + 1, tp.tm_mday, tp.tm_hour);
        } else {
            Serial.println("  Riego de tierra por CONTADOR PROPIO (la Pi no envio fecha)");
        }
    } else {
        Serial.println("  SIN HORA VALIDA — modo degradado: se asume dia permanente");
        Serial.println("  La Raspberry deberia enviar {\"cmd\":\"set_hora\",\"epoch\":...}");
    }
    uint32_t faltan = (uint32_t)prog.tierra_cada_dias * 86400UL;
    faltan = seg_desde_riego_tierra >= faltan ? 0 : faltan - seg_desde_riego_tierra;
    Serial.printf ("  Contador autonomo de tierra: %lu h transcurridas, "
                   "faltan %lu h\n", seg_desde_riego_tierra / 3600, faltan / 3600);
    Serial.printf ("  Enclavamientos: luz por calor %s | corte bomba a los %d s\n",
                   luz_cortada_por_calor ? "ACTIVO" : "ok", SEG_MAX_BOMBA_CONTINUA_S);
    Serial.printf ("  Contacto con el gateway: %s\n",
                   huerfano ? "HUERFANO (sin noticias)" : "ok");
    Serial.println();
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
    prefs.putBool("r_hidro",     mods.riego_hidro);
    prefs.putBool("r_tierra",    mods.riego_tierra);
    prefs.putBool("ambiente",    mods.ambiente);
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
    // Campo por campo y no con lista de inicializacion: la lista se
    // quedaba en once de los trece miembros, asi que test_valvulas y
    // sensor_ec se ponian a false en vez de a su valor de fabrica. Con
    // los defaults en false no se notaba; ahora que sensor_ec arranca
    // encendido, un reset_modulos apagaria la conductividad sin decirlo.
    mods.telemetria    = DEFAULT_MOD_TELEMETRIA;
    mods.status        = DEFAULT_MOD_STATUS;
    mods.alertas       = DEFAULT_MOD_ALERTAS;
    mods.sensor_hdc    = DEFAULT_MOD_SENSOR_HDC;
    mods.sensor_suelo  = DEFAULT_MOD_SENSOR_SUELO;
    mods.sensor_ph     = DEFAULT_MOD_SENSOR_PH;
    mods.riego_hidro   = DEFAULT_MOD_RIEGO_HIDRO;
    mods.riego_tierra  = DEFAULT_MOD_RIEGO_TIERRA;
    mods.ambiente      = DEFAULT_MOD_AMBIENTE;
    mods.simulacion    = DEFAULT_MOD_SIMULACION;
    mods.ahorro_wifi   = DEFAULT_MOD_AHORRO_WIFI;
    mods.test_valvulas = DEFAULT_MOD_TEST_VALVULAS;
    mods.sensor_ec     = DEFAULT_MOD_SENSOR_EC;
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
    else if (!strcmp(nombre, "riego_hidro") || !strcmp(nombre, "riego_tierra")
          || !strcmp(nombre, "ambiente")) {
        if (!strcmp(nombre, "riego_hidro"))  mods.riego_hidro  = activo;
        if (!strcmp(nombre, "riego_tierra")) mods.riego_tierra = activo;
        if (!strcmp(nombre, "ambiente"))     mods.ambiente     = activo;
        if (activo && mods.test_valvulas) {
            mods.test_valvulas = false;
            relesTodosOff();
            logWarn("TEST", "Barrido detenido: se activo un modo automatico");
        }
    }
    else if (!strcmp(nombre, "test_valvulas")) {
        mods.test_valvulas = activo;
        if (activo && (mods.riego_hidro || mods.riego_tierra || mods.ambiente)) {
            mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;
            logWarn("TEST", "Modos automaticos desactivados para no interferir");
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
    obj["riego_hidro"]  = mods.riego_hidro;
    obj["riego_tierra"] = mods.riego_tierra;
    obj["ambiente"]     = mods.ambiente;
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
    Serial.printf ("| riego_hidro      | %-18s |\n", mods.riego_hidro  ? "ON" : "off");
    Serial.printf ("| riego_tierra     | %-18s |\n", mods.riego_tierra ? "ON" : "off");
    Serial.printf ("| ambiente         | %-18s |\n", mods.ambiente     ? "ON" : "off");
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
    // El buffer es local y no `static` a proposito: esta funcion la llaman
    // tres tareas distintas (el sensor de EC, el monitor y la consola). Con
    // un buffer compartido, dos lecturas simultaneas se pisaban las muestras
    // a media ordenacion y la mediana salia de una mezcla de ambas. Son 64
    // bytes de pila, que sobran incluso en la tarea mas ajustada.
    uint16_t m[TDS_MUESTRAS];
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

/*  Medida de conductividad AHORA, al margen del modulo sensor_ec.
 *
 *  La tarea periodica solo lee si su modulo esta encendido, y encenderlo
 *  arrastra telemetria continua. Para comprobar la EC en un momento
 *  concreto —antes y despues de un llenado, o para verificar la sonda—
 *  hace falta una medida puntual que no dependa de ese flag.
 *
 *  Publica el resultado en las mismas variables globales que la tarea,
 *  para que el status, /estado y la tabla de sensores muestren siempre lo
 *  ultimo medido, venga de donde venga.
 *
 *  Devuelve µS/cm.                                                      */
float medirECAhora() {
    // Con simulacion activa no se toca el hardware: devolver el valor
    // sintetico es lo unico honesto, y evita mezclar en la misma serie
    // lecturas reales con inventadas.
    if (mods.simulacion) return ec_us_cm;

    float tempC = (hdcPresente && temperatura_HDC > 0.0f)
                ? temperatura_HDC : TDS_TEMP_FALLBACK;
    float mv  = leerTDSmV();
    float ppm = tdsDesdeVoltaje(mv, tempC);
    float us  = ppmAMicroSiemens(ppm);

    if (xSemaphoreTake(xMutexDatos, pdMS_TO_TICKS(200)) == pdTRUE) {
        tds_mv   = mv;
        tds_ppm  = ppm;
        ec_raw   = (int)mv;
        ec_us_cm = us;
        xSemaphoreGive(xMutexDatos);
    }
    return us;
}

/*  CALIBRACION DE LA SONDA TDS
 *
 *  Estas dos funciones existen para que la consola serie y los comandos
 *  JSON hagan exactamente lo mismo. Antes la calibracion vivia escrita
 *  a mano dentro del parser de la consola, asi que solo se podia
 *  calibrar con el cable puesto: desde la Pi era inalcanzable, y el
 *  operador tenia que ir al invernadero con un portatil para ajustar
 *  una sonda que se consulta por MQTT.
 *
 *  Devuelven un texto de resultado, que es lo que HTTP responde al
 *  cliente y lo que la consola imprime.                               */

/*  Cero del modulo: sonda AL AIRE y SECA. Lo que mida en esas
 *  condiciones es el offset del amplificador mas el suelo del ADC, y
 *  hay que restarlo de toda lectura posterior.                        */
String calibrarCero() {
    float mv = leerTDSmV();

    // Un cero alto no es un cero: es una sonda mojada o dentro del
    // agua. Aceptarlo desplazaria TODAS las medidas futuras hacia
    // abajo, y el error seria constante y por tanto invisible.
    if (mv > 500.0f) {
        logWarnF("CAL", "%.0f mV es demasiado alto para un cero. Seca la sonda.", mv);
        char r[96];
        snprintf(r, sizeof(r), "ERROR: %.0f mV es demasiado alto. Sonda al aire y SECA.", mv);
        return String(r);
    }

    tds_mv_cero = mv;
    guardarCalibracion();
    logInfoF("CAL", "Cero fijado en %.0f mV", tds_mv_cero);

    char r[80];
    snprintf(r, sizeof(r), "cero fijado en %.0f mV (al aire deberia dar ~0 ppm)", tds_mv_cero);
    return String(r);
}

/*  Ajuste fino contra una solucion patron. NO es una calibracion de dos
 *  puntos: el modulo ya trae la curva del fabricante, y esto solo
 *  corrige una desviacion sistematica.                                */
String calibrarTDS(float ref_ppm) {
    if (ref_ppm <= 0.0f)
        return "ERROR: indica los ppm de la referencia. Ej: {\"cmd\":\"cal_tds\",\"ppm\":350}";

    float t = (hdcPresente && temperatura_HDC > 0.0f)
            ? temperatura_HDC : TDS_TEMP_FALLBACK;

    float k_previo = tds_k;
    tds_k = 1.0f;                        // medir sin la correccion vigente
    float mv    = leerTDSmV();
    float bruto = tdsDesdeVoltaje(mv, t);

    if (bruto < 1.0f) {
        tds_k = k_previo;                // deshacer: no se ha medido nada
        logWarn("CAL", "Lectura casi nula. La sonda esta en el agua?");
        return "ERROR: lectura casi nula. La sonda esta en la solucion?";
    }

    tds_k = ref_ppm / bruto;
    guardarCalibracion();
    logInfoF("CAL", "%.0f mV -> %.0f ppm sin corregir | referencia %.0f => k=%.4f",
             mv, bruto, ref_ppm, tds_k);
    if (tds_k < 0.5f || tds_k > 2.0f)
        logWarnF("CAL", "Correccion mayor del 100%% (k=%.3f). Revisa la referencia.", tds_k);

    char r[112];
    snprintf(r, sizeof(r), "k = %.4f  (%.0f mV -> %.0f ppm sin corregir, referencia %.0f)",
             tds_k, mv, bruto, ref_ppm);
    return String(r);
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
    // Los pines salen de las macros y no escritos a mano: la tabla decía
    // GPIO36 cuando el cable lleva tiempo en el 32, y una tabla de
    // diagnóstico que miente sobre el pin cuesta una tarde de sondeos.
    Serial.printf ("| Nivel agua      | GPIO%-2d | %-4s | ADC %-5d | %s\n",
                   PIN_SENSOR_WATER, mods.sensor_suelo ? "ON" : "off", suelo_raw,
                   hay_agua ? "HAY AGUA" : "seco");
    Serial.printf ("| Conductividad   | GPIO%-2d | %-4s | ADC %-5d | %.0f uS/cm\n",
                   PIN_EC_SENSOR, mods.sensor_ec ? "ON" : "off", ec_raw, ec_us_cm);
    Serial.printf ("| pH (retirado)   | GPIO%-2d | %-4s | ADC %-5d | %.2f\n",
                   PIN_PH_SENSOR, mods.sensor_ph ? "ON" : "off", ph_raw, ph_g);
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
//  ENCLAVAMIENTOS DE SEGURIDAD
// ============================================================
/*  Estas comprobaciones las hace el nodo SIEMPRE, hayan llegado o no
 *  ordenes del gateway. Son el ultimo filtro entre una configuracion
 *  equivocada y un invernadero inundado: el nodo desobedece si la orden
 *  es peligrosa, aunque venga de la Raspberry.                         */

/*  ¿Lleva la bomba demasiado tiempo seguido? Trabajar en seco si el
 *  tanque se vacia quema el motor en minutos.                          */
bool bombaExcedeTiempo() {
    if (bomba_encendida_desde == 0) return false;
    return (millis() - bomba_encendida_desde) > (SEG_MAX_BOMBA_CONTINUA_S * 1000UL);
}

/*  ¿Ha pasado el descanso minimo desde el ultimo riego? Un descanso de
 *  0 segundos haria conmutar el rele sin parar y lo destruiria en horas. */
bool descansoSuficiente() {
    if (fin_ultimo_riego == 0) return true;
    return (millis() - fin_ultimo_riego) > (SEG_MIN_ENTRE_RIEGOS_S * 1000UL);
}

/*  Sobretemperatura. La lampara es la principal fuente de calor del
 *  habitaculo; si el aire se dispara se apaga aunque toque fotoperiodo.
 *  La histeresis evita que el rele parpadee en el umbral.
 *
 *  Solo actua con lectura valida del HDC1080: sin sensor no se puede
 *  afirmar que haga calor, y apagar la luz por sospecha seria peor.    */
bool luzPermitidaPorTemperatura() {
    if (!hdcPresente || temperatura_HDC <= 0.0f) return true;

    if (!luz_cortada_por_calor && temperatura_HDC >= SEG_TEMP_CORTE_LUZ_C) {
        luz_cortada_por_calor = true;
        logWarnF("SEGURIDAD", "Temperatura %.1f C >= %.1f: se apaga la luz",
                 temperatura_HDC, SEG_TEMP_CORTE_LUZ_C);
    } else if (luz_cortada_por_calor && temperatura_HDC <= SEG_TEMP_REANUDAR_LUZ_C) {
        luz_cortada_por_calor = false;
        logInfoF("SEGURIDAD", "Temperatura %.1f C: se reanuda la luz", temperatura_HDC);
    }
    return !luz_cortada_por_calor;
}

/*  Momento en que termina la jornada de luz en curso, o la siguiente si
 *  ya paso. Es hasta cuando dura un veto manual de la luz.
 *
 *  Devuelve 0 sin hora valida: entonces el veto no puede caducar solo y
 *  se queda hasta que alguien vuelva a encender la luz a mano. Es la
 *  opcion conservadora — mejor una luz apagada de mas, que el operador
 *  ve enseguida, que una encendida toda la noche.                      */
time_t finDeJornadaDeLuz() {
    if (!hora_valida) return 0;

    time_t ahora_t = time(nullptr);
    struct tm t;
    localtime_r(&ahora_t, &t);
    t.tm_hour = prog.hora_luz_off;
    t.tm_min  = 0;
    t.tm_sec  = 0;

    time_t objetivo = mktime(&t);
    if (objetivo <= ahora_t) objetivo += 86400;   // ya paso hoy: manana
    return objetivo;
}

/*  Veto manual de la luz para la jornada en curso.
 *
 *  `encendida = false` la apaga hasta el proximo horario de apagado;
 *  `true` levanta el veto y devuelve el mando al fotoperiodo. El
 *  programa no se toca en ningun caso: manana la luz se enciende a su
 *  hora, que es justo lo que hace falta.
 *
 *  Antes esto se hacia apagando el modulo `ambiente`, y el modulo no
 *  vuelve solo: la luz se quedaba apagada hasta que alguien se
 *  acordaba. Un veto con fecha de caducidad no se olvida.              */
String vetarLuz(bool encendida) {
    if (encendida) {
        if (!luz_vetada) return "la luz ya la gobierna el fotoperiodo";
        luz_vetada     = false;
        veto_luz_hasta = 0;
        guardarPrograma();
        logInfo("AMBIENTE", "Veto levantado: manda el fotoperiodo");
        return "luz devuelta al fotoperiodo";
    }

    luz_vetada     = true;
    veto_luz_hasta = finDeJornadaDeLuz();
    guardarPrograma();

    if (veto_luz_hasta == 0) {
        logWarn("AMBIENTE", "Luz apagada a mano. SIN HORA VALIDA: el veto no "
                            "caduca solo, hay que encenderla a mano.");
        return "luz apagada (sin hora: no caduca sola)";
    }

    struct tm t;
    localtime_r((const time_t*)&veto_luz_hasta, &t);
    logInfoF("AMBIENTE", "Luz apagada a mano hasta las %02d:00 del %04d-%02d-%02d; "
                         "despues vuelve el fotoperiodo",
             t.tm_hour, t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);

    char msg[72];
    snprintf(msg, sizeof(msg), "luz apagada hasta %04d-%02d-%02d %02d:00",
             t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour);
    return String(msg);
}

/*  Caducidad del veto. La comprueba la tarea de ambiente en cada ciclo:
 *  al llegar la hora de apagado, el veto se levanta solo y la jornada
 *  siguiente arranca con el fotoperiodo intacto.                       */
void revisarCaducidadDelVeto() {
    if (!luz_vetada || veto_luz_hasta == 0 || !hora_valida) return;
    if (time(nullptr) < veto_luz_hasta) return;

    luz_vetada     = false;
    veto_luz_hasta = 0;
    guardarPrograma();
    logInfo("AMBIENTE", "El veto de luz caduco: manana enciende a su hora");
}

/*  ¿Toca regar la tierra?
 *
 *  Dos relojes, y basta con que uno diga que si:
 *    · Con hora valida: el calendario que envio la Pi.
 *    · Sin ella: el contador propio del nodo.
 *
 *  Este es el nucleo de la autonomia. La version anterior exigia hora
 *  valida Y fecha programada, asi que un nodo que nunca hablara con la
 *  Raspberry no regaba la tierra JAMAS.                                */
bool tocaRegarTierra() {
    if (hora_valida && proximo_riego_tierra > 0)
        return time(nullptr) >= proximo_riego_tierra;

    uint32_t intervalo = (uint32_t)prog.tierra_cada_dias * 86400UL;
    return seg_desde_riego_tierra >= intervalo;
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

/*  El status es el espejo del nodo en la Raspberry: con él, la Pi puede
 *  catalogar qué modos están activos, qué está ejecutándose ahora mismo
 *  y si el nodo sigue bajo su supervisión. Es lo que alimenta la vista
 *  de la aplicación web.                                                */
void publicarStatus() {
    // En el heap y no en la pila: esta función la llaman cinco tareas, y
    // la de riego de tierra es de las más justas de pila. Un documento de
    // 1 KB en la pila de esa tarea es lo que separa un status de un
    // desbordamiento silencioso justo después de regar.
    DynamicJsonDocument st(1536);
    st["id"]      = DEVICE_ID;
    st["online"]  = true;
    st["uptime"]  = millis();
    st["periodo"] = periodo_telemetria_ms;
    st["fw"]      = FIRMWARE_VERSION;
    st["rssi"]    = WiFi.RSSI();
    st["heap"]    = ESP.getFreeHeap();

    // Reloj y supervisión
    st["hora_valida"] = hora_valida;
    st["epoch"]       = (uint32_t)ahora();
    st["degradado"]   = modoDegradado();
    st["huerfano"]    = huerfano;
    st["es_dia"]      = esDeDia();

    // Qué está ocurriendo AHORA en el hardware
    JsonObject ej = st.createNestedObject("ejecutando");
    ej["riego_hidro"]  = regando_hidro;
    ej["riego_tierra"] = regando_tierra;
    ej["luz"]          = luz_encendida;
    ej["manual"]       = RIEGO_FORZADO;

    // Qué modos automáticos están habilitados
    JsonObject md = st.createNestedObject("modos");
    md["riego_hidro"]  = mods.riego_hidro;
    md["riego_tierra"] = mods.riego_tierra;
    md["ambiente"]     = mods.ambiente;
    md["ahorro_wifi"]  = mods.ahorro_wifi;

    JsonObject sg = st.createNestedObject("seguridad");
    sg["luz_cortada_calor"] = luz_cortada_por_calor;
    sg["bomba_excedida"]    = bombaExcedeTiempo();
    sg["loops_omitidos"]    = loops_omitidos;

    // Veto manual de la luz. Sin esto, la Pi vería la luz apagada en
    // pleno fotoperiodo y no podría distinguir una orden deliberada de
    // un relé averiado.
    st["luz_vetada"]     = luz_vetada;
    st["veto_luz_hasta"] = (uint32_t)veto_luz_hasta;

    st["seg_desde_riego_tierra"] = (uint32_t)seg_desde_riego_tierra;
    st["prox_riego_tierra"] = (uint32_t)proximo_riego_tierra;
    st["ult_riego_tierra"]  = (uint32_t)ultimo_riego_tierra;

    // Regla y resultado del último llenado de tierra. Va en el status y
    // no en la telemetría porque es un evento, no una medida periódica:
    // la Pi lo necesita para saber si el corte lo dio el sensor o el
    // reloj de seguridad, que es la diferencia entre un ciclo correcto y
    // uno en el que el sensor ha dejado de responder.
    JsonObject ti = st.createNestedObject("tierra");
    ti["cada_dias"]  = prog.tierra_cada_dias;
    ti["hora"]       = prog.tierra_hora;
    ti["ult_seg"]    = (uint32_t)ult_llenado_s;
    ti["corte"]      = ult_llenado_sensor ? "sensor" : "tiempo";
    ti["raw_ini"]    = ult_llenado_raw_ini;
    ti["raw_fin"]    = ult_llenado_raw_fin;
    ti["ec_antes"]   = round(ec_antes_llenado * 10) / 10.0;
    ti["ec_despues"] = round(ec_despues_llenado * 10) / 10.0;

    // Se comprueba el tamano en vez de confiar en que quepa: un status
    // truncado sigue siendo una cadena valida para serializeJson, pero
    // es JSON roto para quien lo recibe, y el gateway lo descartaria sin
    // decir por que. Mejor un aviso en el log del nodo.
    // Dos comprobaciones distintas, y hacen falta las dos: el documento
    // puede quedarse sin capacidad (y entonces ArduinoJson descarta
    // campos en silencio) o el texto puede no caber en el buffer (y
    // entonces sale JSON truncado, que el gateway descartaria sin
    // explicar por que).
    if (st.overflowed())
        logError("STATUS", "El status no cabe en su documento: faltan campos");

    char buf[1024];
    size_t escritos = serializeJson(st, buf, sizeof(buf));
    if (escritos >= sizeof(buf) - 1)
        logWarn("STATUS", "El status no cabe en el buffer: se publica truncado");

    mqttPublish(TOPIC_STATUS, buf, false);
}

// ============================================================
//  VIGILANCIA DE PILAS
// ============================================================
/*  Cuanto le quedo libre a cada tarea en su peor momento.
 *
 *  Un desbordamiento de pila en FreeRTOS no da un error legible: da un
 *  reinicio con un backtrace que hay que descifrar, o peor, corrupcion
 *  silenciosa de la tarea vecina. Y las tareas de este nodo cargan
 *  documentos JSON de 1 KB en la pila para publicar el status.
 *
 *  Dimensionar "a ojo" y esperar a que falle no es una opcion cuando el
 *  firmware se sube una sola vez. Esto expone la marca de agua en
 *  /estado: si alguna tarea baja de unos cientos de bytes, se ve antes
 *  de que reviente y se corrige con un numero en setup().
 *
 *  En ESP-IDF tanto el tamano de xTaskCreate como esta marca van en
 *  BYTES, asi que los dos numeros se comparan directamente.           */
struct TareaVigilada { const char* nombre; TaskHandle_t handle; uint32_t pedidos; };

static TareaVigilada tareas_vigiladas[] = {
    { "mqtt",       nullptr, 8192 },
    { "http",       nullptr, 8192 },
    { "status",     nullptr, 4096 },
    { "consola",    nullptr, 4096 },
    { "riego-tie",  nullptr, 4096 },
    { "riego-hid",  nullptr, 3072 },
    { "ambiente",   nullptr, 2560 },
    { "ec",         nullptr, 2560 },
};
static const uint8_t N_TAREAS_VIGILADAS =
    sizeof(tareas_vigiladas) / sizeof(tareas_vigiladas[0]);

// ============================================================
//  EVENTOS DE RIEGO
// ============================================================
/*  Un ciclo de riego que empieza y termina es un EVENTO, no una medida
 *  periodica, y por eso va por su propio topic y no con la telemetria.
 *
 *  La diferencia importa: la telemetria esta a 5 minutos y un ciclo de
 *  hidroponia dura 3. Publicarlo con la telemetria significaria que
 *  algunos ciclos no aparecerian en ningun sitio, y el gateway no
 *  podria decir cuanto se rego ayer sin inventarselo a partir de
 *  muestras sueltas.
 *
 *  Se publica al abrir y al cerrar. El de cierre lleva la duracion
 *  real, que es el dato que permite comprobar que el nodo ejecuto lo
 *  que decia el programa — hasta ahora habia que cronometrarlo desde
 *  fuera con un script.                                              */
void publicarEventoRiego(const char* circuito, const char* fase,
                         const char* modo, uint32_t segundos) {
    StaticJsonDocument<256> ev;
    ev["id"]       = DEVICE_ID;
    ev["evento"]   = "riego";
    ev["circuito"] = circuito;          // "hidroponia" | "tierra"
    ev["fase"]     = fase;              // "inicio" | "fin"
    ev["modo"]     = modo;              // "dia" | "noche"
    ev["epoch"]    = (uint32_t)ahora();
    ev["uptime"]   = millis();

    // Nombres distintos a proposito. En "inicio" el numero es lo que el
    // programa dice que va a durar; en "fin" es lo que duro de verdad,
    // que puede ser menos si el ciclo se corto. Llamar a los dos
    // `segundos` invitaba a sumarlos juntos y contar el doble.
    if (segundos) {
        if (!strcmp(fase, "fin")) ev["segundos"]    = segundos;
        else                      ev["programado_s"] = segundos;
    }

    char buf[256];
    serializeJson(ev, buf);
    mqttPublish(TOPIC_EVENTO, buf, false);
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

    // ── Reloj: la Pi envía la hora ───────────────────────────
    if (!strcmp(cmd, "set_hora")) {
        uint32_t epoch = doc["epoch"] | 0UL;
        // 1.7e9 ≈ 2023. Por debajo es una hora sin sentido: mejor
        // seguir en modo degradado que ejecutar horarios equivocados.
        if (epoch < 1700000000UL) return "ERROR: epoch invalido";
        fijarHora((time_t)epoch);
        return String("hora fijada: ") + epoch;
    }

    // ── Programa de cultivo ──────────────────────────────────
    //  Se acepta parcial: la Pi puede enviar solo lo que cambia.
    if (!strcmp(cmd, "set_programa")) {
        if (doc.containsKey("hora_luz_on"))
            prog.hora_luz_on  = acotar(doc["hora_luz_on"]  | 6, 0, 23);
        if (doc.containsKey("hora_luz_off"))
            prog.hora_luz_off = acotar(doc["hora_luz_off"] | 20, 0, 23);
        if (doc.containsKey("hidro_riego_dia_s"))
            prog.hidro_riego_dia_s = acotar(doc["hidro_riego_dia_s"] | 900, 10, 21600);
        if (doc.containsKey("hidro_descanso_dia_s"))
            prog.hidro_descanso_dia_s = acotar(doc["hidro_descanso_dia_s"] | 900, 10, 86400);
        if (doc.containsKey("hidro_riego_noche_s"))
            prog.hidro_riego_noche_s = acotar(doc["hidro_riego_noche_s"] | 600, 10, 21600);
        if (doc.containsKey("hidro_descanso_noche_s"))
            prog.hidro_descanso_noche_s = acotar(doc["hidro_descanso_noche_s"] | 7200, 10, 86400);
        // Periodicidad del llenado de tierra. Es el parámetro que más se
        // toca en operación —bajarlo a 8-9 días en calor, subirlo a 12-13
        // en invierno— así que se cambia en caliente y persiste en NVS.
        if (doc.containsKey("tierra_cada_dias")) {
            prog.tierra_cada_dias = acotar(doc["tierra_cada_dias"] | PROG_TIERRA_CADA_DIAS,
                                           PROG_TIERRA_DIAS_MIN, PROG_TIERRA_DIAS_MAX);
            // Recalcular la fecha ya programada sobre el nuevo intervalo.
            // Sin esto, bajar de 10 a 8 días no adelantaba nada: el
            // próximo llenado seguía clavado donde lo dejó el anterior y
            // el cambio no se notaba hasta el ciclo siguiente.
            if (ultimo_riego_tierra > 0)
                proximo_riego_tierra = ultimo_riego_tierra +
                                       (time_t)prog.tierra_cada_dias * 86400L;
        }
        if (doc.containsKey("tierra_hora"))
            prog.tierra_hora = acotar(doc["tierra_hora"] | 7, 0, 23);
        if (doc.containsKey("telemetria_s")) {
            prog.telemetria_s = acotar(doc["telemetria_s"] | 60,
                                       PROG_TELEMETRIA_MIN_S, PROG_TELEMETRIA_MAX_S);
            periodo_telemetria_ms = prog.telemetria_s * 1000UL;
        }
        if (doc.containsKey("ec_cada_s"))
            prog.ec_cada_s = acotar(doc["ec_cada_s"] | PROG_EC_CADA_S,
                                    PROG_EC_CADA_MIN_S, PROG_EC_CADA_MAX_S);
        if (doc.containsKey("proximo_riego_tierra"))
            proximo_riego_tierra = (time_t)(doc["proximo_riego_tierra"] | 0UL);

        guardarPrograma();
        imprimirPrograma();
        return "programa actualizado";
    }

    if (!strcmp(cmd, "get_programa")) {
        imprimirPrograma();
        return "programa impreso en serie";
    }

    // ── Nivel de log ─────────────────────────────────────────
    if (!strcmp(cmd, "set_log")) {
        log_nivel = acotar(doc["nivel"] | LOG_NIVEL_DEF, 0, 4);
        guardarPrograma();
        // Este mensaje se emite siempre, aunque se acabe de silenciar:
        // confirmar el cambio es lo último útil que puede decir el nodo.
        Serial.printf("[LOG] Nivel = %u%s\n", log_nivel,
                      log_nivel == 0 ? "  (silencio total)" : "");
        return String("log nivel = ") + log_nivel;
    }

    // ── Control manual de salidas ────────────────────────────
    //    Apaga los modos automáticos: si el barrido o los ciclos de riego
    //    siguieran corriendo, pisarían el estado que se acaba de fijar y
    //    la prueba manual sería ininterpretable.
    if (!strcmp(cmd, "set_salidas") || !strcmp(cmd, "salidas")) {
        mods.test_valvulas = false;
        mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;

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
        mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;
        RIEGO_FORZADO      = false;
        relesTodosOff();
        imprimirSalidas();
        return "todas las salidas apagadas";
    }

    if (!strcmp(cmd, "set_salida")) {
        mods.test_valvulas = false;
        mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;

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

    // ── Forzar riego ─────────────────────────────────────────
    if (!strcmp(cmd, "set_riego")) {
        bool enc = doc["encendido"] | false;
        RIEGO_FORZADO = enc;
        // Bomba + valvula de hidroponia. El manual gana sobre los ciclos
        // automaticos, que se apartan mientras dure.
        salidaSet(0, enc);
        salidaSet(2, enc);
        if (!enc) regando_hidro = false;
        logInfoF("CMD", "Riego manual: %s", enc ? "ON" : "OFF");
        return String("riego = ") + (enc ? "ON" : "OFF");
    }

    // ── Luz: apagarla por hoy sin desmontar el fotoperiodo ───
    //    {"cmd":"luz","encendida":false}  apaga hasta el fin de jornada
    //    {"cmd":"luz","encendida":true}   la devuelve al fotoperiodo
    //
    //    No confundir con set_modulo ambiente: eso apaga el automatismo
    //    entero y no vuelve solo. Esto caduca al llegar hora_luz_off, de
    //    modo que manana la luz enciende a su hora sin rearmar nada.
    if (!strcmp(cmd, "luz")) {
        if (!doc.containsKey("encendida"))
            return "ERROR: falta \"encendida\": true o false";
        return vetarLuz(doc["encendida"] | false);
    }

    // ── Llenado de tierra bajo petición ──────────────────────
    //    No se ejecuta aquí: un llenado dura hasta PROG_TIERRA_MAX_S
    //    (10 min) y este código corre dentro del callback de MQTT o del
    //    handler HTTP. Bloquearlos tanto tiraría la conexión con el
    //    broker, cuyo keepalive es de 20 s. Se deja la petición y la
    //    tarea de riego, que ya tiene su propio hilo, la recoge en 5 s.
    //
    //    {"cmd":"llenar_tierra"}                  cuenta como el riego del ciclo
    //    {"cmd":"llenar_tierra","prueba":true}    llena sin tocar el calendario
    if (!strcmp(cmd, "llenar_tierra") || !strcmp(cmd, "regar_tierra")) {
        if (regando_tierra)      return "ERROR: ya hay un llenado en curso";
        if (mods.test_valvulas)  return "ERROR: barrido de valvulas activo";
        if (RIEGO_FORZADO)       return "ERROR: riego manual activo, apagalo primero";

        bool prueba = doc["prueba"] | false;
        solicitud_reprograma = !prueba;
        solicitud_llenado    = true;
        logInfoF("CMD", "Llenado de tierra solicitado%s",
                 prueba ? " (PRUEBA: no reprograma el calendario)" : "");
        return prueba ? "llenado de PRUEBA en cola (no reprograma)"
                      : "llenado de tierra en cola";
    }

    // ── Calibracion de la sonda TDS, desde cualquier plano ───
    //    {"cmd":"cal_cero"}              sonda AL AIRE y seca
    //    {"cmd":"cal_tds","ppm":350}     contra una solucion patron
    //
    //    Antes solo existian como atajos de la consola serie, asi que
    //    calibrar exigia ir con un cable al invernadero para ajustar
    //    una sonda que se consulta por MQTT. Ahora los tres planos de
    //    control hacen lo mismo.
    if (!strcmp(cmd, "cal_cero")) return calibrarCero();

    if (!strcmp(cmd, "cal_tds"))  return calibrarTDS(doc["ppm"] | 0.0f);

    // ── Medida puntual de conductividad ──────────────────────
    //    Devuelve el valor en la respuesta HTTP, así que sirve para
    //    comprobar la sonda sin encender la telemetría continua.
    if (!strcmp(cmd, "medir_ec")) {
        float us = medirECAhora();
        char r[96];
        snprintf(r, sizeof(r), "EC = %.0f uS/cm  (%.0f ppm, %.0f mV)",
                 us, tds_ppm, tds_mv);
        logInfo("CMD", r);
        return String(r);
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
    // Cualquier mensaje del gateway cuenta como señal de vida suya
    if (hora_valida) ultimo_contacto = time(nullptr);
    huerfano = false;

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
    // ArduinoJson no falla cuando se le acaba la capacidad: descarta
    // campos y sigue. La respuesta sale bien formada, solo que
    // incompleta, y quien la lee no tiene forma de notarlo. Como el
    // gateway compara /estado contra su configuracion, un campo que
    // desaparece se leeria como "el nodo no lo reporta" en vez de como
    // el fallo que es.
    if (doc.overflowed())
        logError("HTTP", "El JSON no cabe en su documento: faltan campos. "
                         "Subir la capacidad en handleEstado.");

    String out;
    serializeJsonPretty(doc, out);
    httpServer.send(codigo, "application/json", out);
}

/*  Vista completa del nodo. Debe reflejar TODO lo que expone el status
 *  de MQTT: es el plano de control alternativo, y si muestra menos que
 *  MQTT deja de servir para diagnosticar cuando el broker falla —
 *  justo cuando más falta hace.                                       */
void handleEstado() {
    DynamicJsonDocument doc(3072);
    doc["id"]         = DEVICE_ID;
    doc["fw"]         = FIRMWARE_VERSION;
    doc["uptime_ms"]  = millis();
    doc["heap"]       = ESP.getFreeHeap();
    doc["ip"]         = WiFi.localIP().toString();
    doc["rssi"]       = WiFi.RSSI();
    doc["ssid"]       = WiFi.SSID();
    doc["mqtt_pub"]   = clientPub.connected();
    doc["mqtt_sub"]   = clientSub.connected();
    doc["periodo_ms"] = periodo_telemetria_ms;

    // Reloj y supervisión
    doc["hora_valida"] = hora_valida;
    doc["epoch"]       = (uint32_t)ahora();
    doc["degradado"]   = modoDegradado();
    doc["huerfano"]    = huerfano;
    doc["es_dia"]      = esDeDia();

    // Qué está ocurriendo AHORA en el hardware
    JsonObject ej = doc.createNestedObject("ejecutando");
    ej["riego_hidro"]  = regando_hidro;
    ej["riego_tierra"] = regando_tierra;
    ej["luz"]          = luz_encendida;
    ej["manual"]       = RIEGO_FORZADO;

    // Estado real de cada relé, por si el automático y la salida
    // discrepasen: eso siempre indica un problema.
    JsonArray sal = doc.createNestedArray("salidas");
    for (uint8_t i = 0; i < 4; i++) {
        JsonObject o = sal.createNestedObject();
        o["n"]      = i + 1;
        o["gpio"]   = PINES_RELE[i];
        o["rol"]    = ALIAS_RELE[i];
        o["estado"] = estado_salida[i];
    }

    JsonObject m = doc.createNestedObject("modulos");
    modulosToJson(m);

    JsonObject sg = doc.createNestedObject("seguridad");
    sg["luz_cortada_calor"] = luz_cortada_por_calor;
    sg["bomba_excedida"]    = bombaExcedeTiempo();
    sg["luz_vetada"]        = luz_vetada;
    sg["veto_luz_hasta"]    = (uint32_t)veto_luz_hasta;

    // Programa vigente. Se expone entero para poder comprobar de un
    // vistazo qué plan está ejecutando el nodo, que no tiene por qué ser
    // el que la Pi cree haberle enviado.
    JsonObject pr = doc.createNestedObject("programa");
    pr["hora_luz_on"]      = prog.hora_luz_on;
    pr["hora_luz_off"]     = prog.hora_luz_off;
    // Los cuatro tiempos de hidroponia. Sin ellos el gateway no podia
    // comprobar que el nodo ejecutara la cadencia configurada, y hubo
    // que cronometrar la bomba desde fuera para descubrir que iba a
    // 300 s en vez de a 180.
    pr["hidro_riego_dia_s"]      = prog.hidro_riego_dia_s;
    pr["hidro_descanso_dia_s"]   = prog.hidro_descanso_dia_s;
    pr["hidro_riego_noche_s"]    = prog.hidro_riego_noche_s;
    pr["hidro_descanso_noche_s"] = prog.hidro_descanso_noche_s;
    pr["ec_cada_s"]        = prog.ec_cada_s;
    pr["tierra_cada_dias"] = prog.tierra_cada_dias;
    pr["tierra_hora"]      = prog.tierra_hora;
    pr["telemetria_s"]     = prog.telemetria_s;
    pr["prox_riego_tierra"] = (uint32_t)proximo_riego_tierra;
    pr["seg_desde_tierra"]  = (uint32_t)seg_desde_riego_tierra;

    // Último llenado de tierra: cuánto duró, qué lo cortó y con qué
    // conductividad se regó.
    JsonObject ti = doc.createNestedObject("ult_llenado");
    ti["seg"]        = (uint32_t)ult_llenado_s;
    ti["corte"]      = ult_llenado_sensor ? "sensor" : "tiempo";
    ti["raw_ini"]    = ult_llenado_raw_ini;
    ti["raw_fin"]    = ult_llenado_raw_fin;
    ti["ec_antes"]   = ec_antes_llenado;
    ti["ec_despues"] = ec_despues_llenado;
    ti["en_curso"]   = regando_tierra;
    ti["pendiente"]  = solicitud_llenado;

    // Pila libre minima de cada tarea, en bytes. Si alguna se acerca a
    // cero hay que subir su tamano en setup() antes de que reinicie el
    // nodo sin decir por que.
    JsonObject pl = doc.createNestedObject("pilas");
    for (uint8_t i = 0; i < N_TAREAS_VIGILADAS; i++) {
        if (!tareas_vigiladas[i].handle) continue;
        pl[tareas_vigiladas[i].nombre] =
            (uint32_t)uxTaskGetStackHighWaterMark(tareas_vigiladas[i].handle);
    }

    JsonObject s = doc.createNestedObject("sensores");
    if (xSemaphoreTake(xMutexDatos, pdMS_TO_TICKS(200)) == pdTRUE) {
        s["temp"]      = temperatura_HDC;
        s["hum"]       = humedad_HDC;
        s["agua"]      = hay_agua;
        s["nivel_raw"] = suelo_raw;
        // Referencia en seco y umbrales: sin ellos, un nivel_raw suelto no
        // dice nada. Con ellos se ve por qué el nodo decide que hay agua.
        s["nivel_seco"]  = nivel_adc_seco;
        s["nivel_delta"] = NIVEL_DELTA_MIN;
        s["corte_delta"] = PROG_TIERRA_DELTA_CORTE;
        s["ec"]        = ec_us_cm;
        s["tds"]       = tds_ppm;
        s["ph"]        = ph_g;
        xSemaphoreGive(xMutexDatos);
    }

    // Aviso destacado: sin esto es fácil confundir valores sintéticos
    // con lecturas reales, como ya ocurrió una vez.
    if (mods.simulacion)
        doc["AVISO"] = "SIMULACION ACTIVA - los sensores son sinteticos";

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
        "<li>POST /cmd &nbsp;&nbsp;&nbsp; {\"cmd\":\"llenar_tierra\"}</li>"
        "<li>POST /cmd &nbsp;&nbsp;&nbsp; {\"cmd\":\"medir_ec\"}</li>"
        "<li>POST /cmd &nbsp;&nbsp;&nbsp; {\"cmd\":\"set_programa\",\"tierra_cada_dias\":10}</li>"
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

    // EL BUFFER, ANTES QUE NADA. PubSubClient trae 256 bytes y no avisa
    // cuando algo no cabe: al publicar devuelve false, y al RECIBIR se
    // come el paquete en silencio, sin llamar al callback.
    //
    // Con 256 bytes este nodo tenia dos averias invisibles a la vez:
    //   · El status (~700 B con el bloque de tierra) no se publicaba
    //     nunca. La Pi no podia saber cuando se rego ni si el corte lo
    //     dio el sensor. Se veian los datos de telemetria, que si caben,
    //     asi que el nodo parecia sano.
    //   · El set_programa del gateway (~290 B con los diez campos) se
    //     descartaba al entrar. El set_hora, mucho mas corto, si pasaba:
    //     el nodo tenia la hora correcta y el programa equivocado, que
    //     es la combinacion mas dificil de sospechar.
    //
    // 1 KB por cliente sobre ~160 KB de heap libre. El coste es
    // irrelevante al lado de lo que cuesta diagnosticar lo anterior.
    if (!clientPub.setBufferSize(MQTT_BUFFER_BYTES) ||
        !clientSub.setBufferSize(MQTT_BUFFER_BYTES))
        logError("MQTT", "No se pudo reservar el buffer: mensajes grandes se perderan");

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

        // clientPub.loop() es quien envía el PINGREQ del keepalive. Si se
        // salta varias veces seguidas, el broker da el nodo por muerto y
        // publica el LWT aunque el ESP32 esté perfectamente vivo.
        //
        // Antes el timeout era de 100 ms y el loop se omitía en silencio
        // cuando una publicación tenía el mutex tomado. Con keepalive de
        // 20 s bastan un par de omisiones para provocar la desconexión.
        if (xSemaphoreTake(xMutexMqttPub, pdMS_TO_TICKS(1500)) == pdTRUE) {
            clientPub.loop();
            xSemaphoreGive(xMutexMqttPub);
            loops_omitidos = 0;
        } else {
            loops_omitidos++;
            if (loops_omitidos == 3)
                logWarn("MQTT-PUB", "Loop omitido 3 veces: riesgo de perder el keepalive");
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
        // ¿Seguimos bajo supervisión del gateway? Si lleva demasiado
        // sin hablarnos, el nodo se declara huérfano: sigue ejecutando
        // el último plan, pero lo hace constar para que quede registrado
        // que esos datos se generaron sin supervisión.
        if (hora_valida && ultimo_contacto > 0) {
            bool antes = huerfano;
            huerfano = (time(nullptr) - ultimo_contacto) > PROG_SIN_GATEWAY_S;
            if (huerfano && !antes)
                logWarn("GATEWAY", "Sin noticias de la Raspberry. Modo huerfano: "
                                   "se mantiene el ultimo plan conocido.");
            if (!huerfano && antes)
                logInfo("GATEWAY", "Contacto restablecido");
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
        // Cadencia propia, no la de los demas sensores: la sonda vive
        // sumergida y excitarla cada 5 s desgasta los electrodos sin
        // ganar resolucion. La EC de un tanque no cambia en segundos.
        //
        // La espera va troceada para que un cambio de ec_cada_s se note
        // enseguida: con una sola vTaskDelay larga, pasar de 3600 a 60
        // no tendria efecto hasta una hora despues.
        //
        // Y con suelo: un 0 aqui seria vTaskDelay(0), o sea un bucle
        // cerrado martilleando el ADC y matando de hambre a las tareas
        // de menor prioridad. No deberia poder llegar un 0 —set_programa
        // acota y la NVS tiene default— pero esto se flashea una vez.
        uint32_t espera_s = prog.ec_cada_s ? prog.ec_cada_s : PROG_EC_CADA_S;
        for (uint32_t t = 0; t < espera_s; t += 5) {
            vTaskDelay(5000 / portTICK_PERIOD_MS);
            if (prog.ec_cada_s && prog.ec_cada_s < espera_s) break;  // lo bajaron
        }

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
                Serial.println("  LUZ");
                Serial.println("    luz off          apaga la luz SOLO por hoy (manana enciende sola)");
                Serial.println("    luz on           la devuelve al fotoperiodo ahora mismo");
                Serial.println();
                Serial.println("  TIERRA   se llena hasta que el sensor de nivel acusa el agua");
                Serial.println("    llenar           llena AHORA y cuenta como el riego del ciclo");
                Serial.println("    llenar prueba    llena AHORA sin tocar el calendario");
                Serial.println("    tierra <dias>    cada cuantos dias se llena (10 por defecto)");
                Serial.println("    ec               medida puntual de conductividad");
                Serial.println();
                Serial.println("  CALIBRACION");
                Serial.println("    cal nivel        fija la referencia en SECO");
                Serial.println("    cal cero         sonda AL AIRE y seca: fija el offset");
                Serial.println("    cal tds <ppm>    ajuste fino contra una referencia");
                Serial.println();
                Serial.println("  PRUEBAS");
                Serial.println("    test on | test off   barrido secuencial");
                Serial.println("    estado               tabla de modulos");
                Serial.println("    programa             plan de cultivo y hora");
                Serial.println("    log <0-4>            0=silencio 3=info 4=debug");
                Serial.println("    reset                reinicia el nodo");
                Serial.println("    {\"cmd\":\"...\"}        cualquier comando JSON");
                Serial.println();
            }
            else if (linea == "test on")  { setModulo("test_valvulas", true);  }
            else if (linea == "test off") { setModulo("test_valvulas", false); }
            else if (linea == "estado")   { imprimirModulos(); }
            else if (linea == "programa") { imprimirPrograma(); }
            else if (linea.startsWith("log ")) {
                StaticJsonDocument<64> d;
                d["cmd"] = "set_log"; d["nivel"] = linea.substring(4).toInt();
                Serial.println(procesarComando(d));
            }
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
            // Los atajos llaman a las mismas funciones que los comandos
            // JSON: una sola implementacion de la calibracion.
            else if (linea == "cal cero") { Serial.println(calibrarCero()); }
            else if (linea.startsWith("cal tds ")) {
                Serial.println(calibrarTDS(linea.substring(8).toFloat()));
            }
            else if (linea == "cal") { imprimirSensores(); }

            // ── Tierra: llenado y periodicidad ──────────────────
            //  Atajos de los comandos JSON equivalentes. Se pasa por
            //  procesarComando() y no por la tarea directamente para que
            //  los tres planos de control compartan las mismas
            //  comprobaciones: una sola puerta de entrada, un solo sitio
            //  donde arreglar un fallo.
            else if (linea == "llenar" || linea == "llenar tierra") {
                StaticJsonDocument<64> d;
                d["cmd"] = "llenar_tierra";
                Serial.println(procesarComando(d));
            }
            else if (linea == "llenar prueba" || linea == "llenar tierra prueba") {
                StaticJsonDocument<64> d;
                d["cmd"] = "llenar_tierra"; d["prueba"] = true;
                Serial.println(procesarComando(d));
            }
            // 'luz off' apaga solo la jornada de hoy; el fotoperiodo
            // sigue intacto y manana enciende a su hora.
            else if (linea == "luz off") { Serial.println(vetarLuz(false)); }
            else if (linea == "luz on")  { Serial.println(vetarLuz(true));  }
            else if (linea == "ec") {
                StaticJsonDocument<64> d;
                d["cmd"] = "medir_ec";
                Serial.println(procesarComando(d));
            }
            else if (linea.startsWith("tierra ")) {
                int dias = linea.substring(7).toInt();
                if (dias < PROG_TIERRA_DIAS_MIN || dias > PROG_TIERRA_DIAS_MAX) {
                    Serial.printf("[TIERRA] Indica los dias (%d-%d). Ej: tierra 9\n",
                                  PROG_TIERRA_DIAS_MIN, PROG_TIERRA_DIAS_MAX);
                } else {
                    StaticJsonDocument<64> d;
                    d["cmd"] = "set_programa"; d["tierra_cada_dias"] = dias;
                    Serial.println(procesarComando(d));
                    imprimirPrograma();
                }
            }

            // ── on / off con lista de salidas ───────────────────
            //    "off" a secas apaga todo; "off 3" solo esa.
            //    "on 1 3 4" enciende esas tres y apaga las demas.
            else if (linea == "off") {
                mods.test_valvulas = false;
                mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;
                RIEGO_FORZADO      = false;
                relesTodosOff();
                imprimirSalidas();
            }
            else if (linea.startsWith("on ") || linea.startsWith("off ")) {
                bool encender = linea.startsWith("on ");
                mods.test_valvulas = false;
                mods.riego_hidro = mods.riego_tierra = mods.ambiente = false;

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
/*  Espera troceada que se interrumpe si el módulo se apaga. Sin esto,
 *  detener el riego a mitad de un descanso de 2 horas exigiría esperar
 *  esas 2 horas — inaceptable para una orden manual.
 *  Devuelve false si hubo que abortar.                                 */
bool esperarSegundos(uint32_t segundos, volatile bool* seguir_activo) {
    uint32_t transcurrido = 0;
    const uint32_t PASO = 500;
    while (transcurrido < segundos * 1000UL) {
        if (seguir_activo && !(*seguir_activo)) return false;
        if (mods.test_valvulas) return false;   // la prueba de banco manda
        vTaskDelay(PASO / portTICK_PERIOD_MS);
        transcurrido += PASO;
    }
    return true;
}

// ============================================================
//  TAREA: Riego de hidroponía — ciclos intermitentes
// ============================================================
/*  Bombea durante N segundos y descansa M, con parámetros distintos
 *  para el día y la noche. De día la planta transpira y consume, así
 *  que se riega más seguido; de noche la demanda cae y ciclos
 *  espaciados bastan para mantener la lámina sin bombear de más.
 *
 *  Los cuatro tiempos los define la Raspberry y viven en NVS.          */
void tarea_riego_hidro(void* pv) {
    for (;;) {
        if (!mods.riego_hidro || mods.test_valvulas || RIEGO_FORZADO) {
            if (regando_hidro && !RIEGO_FORZADO) {
                salidaSet(0, false);   // válvula hidroponía
                salidaSet(2, false);   // motobomba
                regando_hidro = false;
            }
            vTaskDelay(INTERVAL_MODULE_CHECK / portTICK_PERIOD_MS);
            continue;
        }

        // Enclavamiento: respetar el descanso mínimo entre riegos
        if (!descansoSuficiente()) {
            vTaskDelay(1000 / portTICK_PERIOD_MS);
            continue;
        }

        // Ceder mientras se llena la tierra: con PROG_TIERRA_USA_BOMBA
        // las dos rutinas mandan sobre la MISMA motobomba, y al terminar
        // su fase de riego esta tarea la apagaría dejando el llenado de
        // tierra con la válvula abierta y sin agua, que acabaría cortando
        // por tiempo sin que nada explicara por qué.
        //
        // El reparto es cooperativo, no un mutex: la tierra espera a que
        // la hidroponía termine su ciclo y la hidroponía espera a que
        // acabe el llenado. Queda una ventana de milisegundos en la que
        // ambas podrían arrancar a la vez; el peor caso es un llenado que
        // corta por tiempo y lo deja escrito en el log.
        if (regando_tierra) {
            vTaskDelay(1000 / portTICK_PERIOD_MS);
            continue;
        }

        bool dia = esDeDia();
        uint32_t t_riego    = dia ? prog.hidro_riego_dia_s    : prog.hidro_riego_noche_s;
        uint32_t t_descanso = dia ? prog.hidro_descanso_dia_s : prog.hidro_descanso_noche_s;

        // Bomba y válvula juntas: sin presión no sube agua a los tubos
        salidaSet(2, true);
        salidaSet(0, true);
        regando_hidro = true;
        bomba_encendida_desde = millis();
        logInfoF("HIDRO", "Riego ON  (%s%s, %lu s)",
                 dia ? "dia" : "noche",
                 modoDegradado() ? ", degradado" : "", t_riego);
        publicarEventoRiego("hidroponia", "inicio", dia ? "dia" : "noche", t_riego);

        // Espera troceada vigilando el enclavamiento de tiempo máximo:
        // si el tanque se vacía, la bomba trabajaría en seco hasta
        // quemarse. Prefiero cortar y avisar.
        uint32_t transcurrido = 0;
        while (transcurrido < t_riego * 1000UL) {
            if (!mods.riego_hidro || mods.test_valvulas || RIEGO_FORZADO) break;
            if (bombaExcedeTiempo()) {
                logWarnF("SEGURIDAD", "Bomba lleva mas de %d s seguidos. Corte preventivo.",
                         SEG_MAX_BOMBA_CONTINUA_S);
                break;
            }
            vTaskDelay(500 / portTICK_PERIOD_MS);
            transcurrido += 500;
        }

        salidaSet(0, false);
        salidaSet(2, false);
        regando_hidro = false;
        bomba_encendida_desde = 0;
        fin_ultimo_riego = millis();
        logInfoF("HIDRO", "Riego OFF (%lu s regados, descanso %lu s)",
                 transcurrido / 1000, t_descanso);
        // La duracion REAL, no la programada: si el ciclo se corto antes
        // por el enclavamiento de la bomba o porque se apago el modulo,
        // el gateway tiene que enterarse de lo que ocurrio de verdad.
        publicarEventoRiego("hidroponia", "fin", dia ? "dia" : "noche",
                            transcurrido / 1000);

        esperarSegundos(t_descanso, &mods.riego_hidro);
    }
}

// ============================================================
//  TAREA: Riego de tierra — por calendario, corte por sensor
// ============================================================
/*  REGLA DEL CULTIVO
 *  La tierra se llena de agua hasta que el sensor de nivel acusa la
 *  llegada del agua, y eso se repite cada prog.tierra_cada_dias dias
 *  (10 de fabrica, ajustable en caliente entre 8 y 13 sin reflashear).
 *
 *  El corte lo decide el sensor, no un tiempo fijo: el volumen que admite
 *  el sustrato cambia con lo seco que este, con la temperatura y con lo
 *  que hayan crecido las raices. Un temporizador acertaria un dia y
 *  encharcaria al siguiente.
 *
 *  Hay ademas un corte por tiempo. Si el sensor se averia y nunca
 *  detecta, la valvula no puede quedarse abierta indefinidamente: en un
 *  cultivo real eso significa inundar el invernadero.                   */

/*  Un llenado completo, de abrir la valvula a cerrarla.
 *
 *  Vive fuera de la tarea porque hay dos caminos que llegan aqui —el
 *  calendario y la peticion manual— y duplicar la logica de corte en dos
 *  sitios es la forma segura de que uno de los dos se quede sin arreglar
 *  el dia que se cambie algo.
 *
 *    manual       la pidio un operador; no exige que el modulo
 *                 riego_tierra este encendido.
 *    reprogramar  el llenado cuenta como el riego del ciclo: pone a cero
 *                 los relojes y programa el siguiente. En false solo
 *                 llena, para probar sin descuadrar el calendario.      */
void ejecutarLlenadoTierra(bool manual, bool reprogramar) {
    int referencia = leerNivelRaw();

    // Enclavamiento: si el sensor ya acusa agua, el sustrato sigue
    // húmedo del ciclo anterior. Regar encharcaría y pudriría raíz.
    if (SEG_VERIFICAR_ANTES_RIEGO && hayAgua(referencia)) {
        if (manual) {
            // En el camino manual no se toca el calendario: el operador
            // pidió llenar, no dar el ciclo por hecho. Y si el sustrato
            // está seco de verdad, lo que falla es la referencia.
            logWarnF("TIERRA", "El sensor ya detecta agua (raw=%d, seco=%d): no se llena. "
                               "Si el sustrato esta seco, recalibra con cal nivel.",
                     referencia, nivel_adc_seco);
            return;
        }
        logWarn("TIERRA", "El sensor ya detecta agua: se omite este riego.");
        seg_desde_riego_tierra = 0;
        ultimo_riego_tierra = hora_valida ? time(nullptr) : 0;
        if (hora_valida && proximo_riego_tierra > 0)
            proximo_riego_tierra += (time_t)prog.tierra_cada_dias * 86400L;
        guardarPrograma();
        return;
    }

    // EC antes de abrir. Junto con la de después queda registrado qué
    // conductividad tenía el agua con la que se regó, que es justo el
    // dato que hay que poder enseñar cuando se discuta la nutrición.
    ec_antes_llenado = medirECAhora();

    logInfoF("TIERRA", "Iniciando llenado %s. Referencia del sensor: %d. EC previa: %.0f uS/cm",
             manual ? "MANUAL" : (hora_valida ? "por calendario"
                                              : "por contador propio (sin hora)"),
             referencia, ec_antes_llenado);

    salidaSet(1, true);            // válvula de tierra
    // La bomba solo si el agua no baja por gravedad (config.h). Primero la
    // válvula y luego la bomba: al revés, la bomba arrancaría un instante
    // contra el circuito cerrado.
    if (PROG_TIERRA_USA_BOMBA) {
        salidaSet(2, true);
        bomba_encendida_desde = millis();
    }
    regando_tierra = true;
    uint32_t transcurrido     = 0;
    uint8_t  confirmaciones   = 0;
    bool     corte_por_sensor = false;
    bool     corte_por_umbral = false;
    int      actual = referencia;

    while (transcurrido < PROG_TIERRA_MAX_S * 1000UL) {
        vTaskDelay(500 / portTICK_PERIOD_MS);
        transcurrido += 500;

        // El barrido de válvulas y el riego manual escriben en los mismos
        // relés: si alguno arranca a mitad del llenado, se cede.
        if (mods.test_valvulas || RIEGO_FORZADO) break;
        // Enclavamiento de la bomba: trabajar en seco si el tanque se
        // vacía la quema en minutos, y eso no espera al corte por tiempo
        // del llenado, que es diez veces más largo.
        if (PROG_TIERRA_USA_BOMBA && bombaExcedeTiempo()) {
            logWarn("TIERRA", "Corte: la bomba excedio su tiempo maximo continuo.");
            break;
        }
        // El llenado por calendario obedece a su módulo; el manual no,
        // porque su razón de ser es funcionar con el automático apagado.
        if (!manual && !mods.riego_tierra) break;

        actual = leerNivelRaw();

        // Dos condiciones independientes, y basta una:
        //   · Caída relativa a la referencia de este llenado. Es la
        //     sensible, la que corta en cuanto el agua asoma.
        //   · Umbral absoluto de "hay agua". Es la red de seguridad por
        //     si la referencia se tomó ya con el sensor algo mojado y la
        //     caída disponible se queda corta.
        // La resta va con signo: al mojarse la lectura BAJA. Con valor
        // absoluto, un pico de ruido hacia arriba cortaba el llenado y lo
        // anotaba como agua detectada.
        bool cayo   = (referencia - actual) >= PROG_TIERRA_DELTA_CORTE;
        bool umbral = hayAgua(actual);

        if (cayo || umbral) {
            if (++confirmaciones >= PROG_TIERRA_CORTE_CONFIRMA) {
                corte_por_sensor = true;
                corte_por_umbral = umbral;
                break;
            }
        } else {
            confirmaciones = 0;   // la racha tiene que ser seguida
        }
    }

    // Primero la bomba y después la válvula: cerrar la válvula con la
    // bomba en marcha es un golpe de ariete contra el circuito.
    if (PROG_TIERRA_USA_BOMBA) {
        salidaSet(2, false);
        bomba_encendida_desde = 0;
    }
    salidaSet(1, false);
    regando_tierra = false;

    if (corte_por_sensor)
        logInfoF("TIERRA", "Agua detectada por %s: %d -> %d (caida %d). Valvula cerrada.",
                 corte_por_umbral ? "umbral absoluto" : "caida relativa",
                 referencia, actual, referencia - actual);
    else
        logWarnF("TIERRA", "Corte por TIEMPO tras %lu s sin deteccion. "
                           "Revisar el sensor de nivel.", transcurrido / 1000);

    // EC después de cerrar, y resultado del llenado para el status.
    ec_despues_llenado  = medirECAhora();
    ult_llenado_s       = transcurrido / 1000;
    ult_llenado_sensor  = corte_por_sensor;
    ult_llenado_raw_ini = referencia;
    ult_llenado_raw_fin = actual;

    logInfoF("TIERRA", "Llenado completado en %lu s. EC %.0f -> %.0f uS/cm (delta %+.0f)",
             ult_llenado_s, ec_antes_llenado, ec_despues_llenado,
             ec_despues_llenado - ec_antes_llenado);

    // El anti-repiqueteo del relé se actualiza siempre: protege el
    // hardware, y eso no depende de si el llenado contaba o no.
    fin_ultimo_riego = millis();

    if (!reprogramar) {
        logWarn("TIERRA", "Llenado de PRUEBA: el calendario no se toca.");
    } else {
        // Se reinician AMBOS relojes: el calendario si hay hora, y el
        // contador propio siempre. Así el nodo queda consistente tanto si
        // recupera contacto con la Pi como si sigue solo.
        seg_desde_riego_tierra = 0;
        if (hora_valida) {
            ultimo_riego_tierra  = time(nullptr);
            proximo_riego_tierra = ultimo_riego_tierra +
                                   (time_t)prog.tierra_cada_dias * 86400L;
        }
        guardarPrograma();

        if (hora_valida && proximo_riego_tierra > 0) {
            struct tm t;
            localtime_r((const time_t*)&proximo_riego_tierra, &t);
            logInfoF("TIERRA", "Proximo llenado: %04d-%02d-%02d %02d:00  (cada %u dias)",
                     t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour,
                     prog.tierra_cada_dias);
        } else {
            logInfoF("TIERRA", "Proximo llenado en %u dias "
                               "(contador propio, sin hora)", prog.tierra_cada_dias);
        }
    }

    // Status inmediato: el llenado es el evento del ciclo que la Pi tiene
    // que poder registrar sin esperar al heartbeat de 60 s.
    publicarStatus();
}

void tarea_riego_tierra(void* pv) {
    bool espera_avisada = false;   // para no repetir el aviso cada 5 s

    for (;;) {
        vTaskDelay(5000 / portTICK_PERIOD_MS);

        // El contador propio avanza siempre, haya gateway o no. Es lo que
        // permite que la tierra se riegue aunque la Pi nunca aparezca.
        seg_desde_riego_tierra += 5;
        if (seg_desde_riego_tierra % AUTO_GUARDAR_CONTADOR_S < 5) guardarPrograma();

        // ── Petición manual: gana sobre el calendario ────────────
        //    Se atiende aquí y no en el propio comando porque un llenado
        //    puede durar 10 minutos: hacerlo dentro del callback de MQTT
        //    bloquearía el keepalive del broker, que es de 20 s.
        if (solicitud_llenado) {
            // Esperar a que la hidroponía suelte la motobomba, sin
            // consumir la petición: se reintenta cada 5 s. Cancelarla
            // aquí obligaría al operador a repetir el comando sin saber
            // por qué no pasó nada.
            if (regando_hidro) {
                if (!espera_avisada) {
                    logInfo("TIERRA", "Llenado en espera: la hidroponia esta bombeando.");
                    espera_avisada = true;
                }
                continue;
            }
            espera_avisada    = false;
            solicitud_llenado = false;
            bool reprogramar  = solicitud_reprograma;

            if (mods.test_valvulas || RIEGO_FORZADO)
                logWarn("TIERRA", "Llenado manual cancelado: el barrido de valvulas "
                                  "o el riego manual estan usando los reles.");
            else if (!descansoSuficiente())
                logWarn("TIERRA", "Llenado manual cancelado: no ha pasado el descanso "
                                  "minimo desde el ultimo riego.");
            else
                ejecutarLlenadoTierra(true, reprogramar);

            continue;
        }

        if (!mods.riego_tierra || mods.test_valvulas || RIEGO_FORZADO) continue;
        if (!tocaRegarTierra()) continue;
        // Igual que arriba: la hidroponía tiene la bomba. Se reintenta en
        // 5 s; el calendario sigue diciendo que toca, así que no se pierde.
        if (regando_hidro) continue;

        // Con hora válida se respeta además la franja horaria elegida.
        // Sin ella se riega en cuanto toque: mejor a deshora que nunca.
        if (hora_valida && horaDelDia() != (int)prog.tierra_hora) continue;

        ejecutarLlenadoTierra(false, true);
    }
}

// ============================================================
//  TAREA: Ambiente — luz e iluminación por fotoperiodo
// ============================================================
/*  Luz y ventilador comparten salida: la lámpara genera calor y el
 *  ventilador debe disiparlo mientras esté encendida.                  */
void tarea_ambiente(void* pv) {
    bool estado_previo = false;
    bool primera_vez = true;

    for (;;) {
        vTaskDelay(10000 / portTICK_PERIOD_MS);

        if (!mods.ambiente || mods.test_valvulas || RIEGO_FORZADO) {
            if (luz_encendida && !RIEGO_FORZADO) {
                salidaSet(3, false);
                luz_encendida = false;
            }
            // Olvidar el estado anterior. Sin esto, al reactivar el módulo
            // la comparación `debe_estar != estado_previo` daba falso y la
            // luz no volvía a encenderse: el módulo quedaba activo pero
            // inerte, sin ningún mensaje que lo delatara.
            primera_vez = true;
            estado_previo = false;
            continue;
        }

        // El veto manual dura una jornada y se levanta solo al llegar la
        // hora de apagado. Comprobarlo aquí, y no al recibir el comando,
        // es lo que hace que mañana la luz encienda sin que nadie tenga
        // que rearmar nada.
        revisarCaducidadDelVeto();

        // El fotoperiodo dice cuándo toca; el enclavamiento térmico y el
        // veto manual pueden vetarlo. La lámpara es la principal fuente
        // de calor y un habitáculo cerrado se dispara rápido.
        bool debe_estar = esDeDia() && luzPermitidaPorTemperatura() && !luz_vetada;

        // Reconciliación con el hardware: si alguien movió el relé por
        // comando manual, hay que devolverlo a lo que dicta el programa.
        // Antes solo se miraba el cambio lógico y la salida podía quedar
        // desincronizada del estado interno.
        if (debe_estar != estado_previo || primera_vez ||
            estado_salida[3] != debe_estar) {
            salidaSet(3, debe_estar);
            luz_encendida = debe_estar;
            estado_previo = debe_estar;
            primera_vez = false;
            logInfoF("AMBIENTE", "Luz y ventilador %s%s%s%s",
                     debe_estar ? "ON" : "OFF",
                     modoDegradado()       ? "  (sin hora: modo degradado)" : "",
                     luz_cortada_por_calor ? "  (corte por temperatura)"    : "",
                     luz_vetada            ? "  (apagada a mano por hoy)"   : "");
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
    cargarPrograma();
    imprimirModulos();
    imprimirPrograma();

    Serial.println("Control:  POST /modulo  {\"modulo\":\"telemetria\",\"activo\":true}");
    Serial.println("          POST /cmd     {\"cmd\":\"get_status\"}");
    Serial.println("MQTT:     " TOPIC_CMD "  {\"cmd\":\"set_modulo\",...}\n");

    // ── Planos de control: siempre activos ───────────────────
    xTaskCreate(tarea_wifi,          "wifi",       4096, NULL, 4, NULL);
    xTaskCreate(tarea_mqtt,          "mqtt",       8192, NULL, 3, &tareas_vigiladas[0].handle);
    xTaskCreate(tarea_http,          "http",       8192, NULL, 3, &tareas_vigiladas[1].handle);

    // ── Funciones: creadas siempre, gobernadas por sus flags ──
    xTaskCreate(tarea_telemetria,    "telemetria", 8192, NULL, 2, NULL);
    xTaskCreate(tarea_status,        "status",     4096, NULL, 2, &tareas_vigiladas[2].handle);
    xTaskCreate(tarea_alertas,       "alertas",    4096, NULL, 2, NULL);
    xTaskCreate(tarea_sensor_hdc,    "hdc1080",    3072, NULL, 1, NULL);
    xTaskCreate(tarea_sensor_suelo,  "suelo",      2560, NULL, 1, NULL);
    xTaskCreate(tarea_sensor_ph,     "ph",         2560, NULL, 1, NULL);
    xTaskCreate(tarea_sensor_ec,     "ec",         2560, NULL, 1, &tareas_vigiladas[7].handle);
    xTaskCreate(tarea_riego_hidro,   "riego-hid",  3072, NULL, 2, &tareas_vigiladas[5].handle);
    // 4096 y no 3072: esta tarea ahora publica el status al terminar un
    // llenado, y el documento JSON mas las llamadas de log no caben con
    // holgura en la pila anterior.
    xTaskCreate(tarea_riego_tierra,  "riego-tie",  4096, NULL, 2, &tareas_vigiladas[4].handle);
    xTaskCreate(tarea_ambiente,      "ambiente",   2560, NULL, 2, &tareas_vigiladas[6].handle);

    // ── Pruebas de banco ─────────────────────────────────────
    xTaskCreate(tarea_test_valvulas, "test-valv",  3072, NULL, 2, NULL);
    xTaskCreate(tarea_consola,       "consola",    4096, NULL, 1, &tareas_vigiladas[3].handle);
    xTaskCreate(tarea_monitor,       "monitor",    4096, NULL, 1, NULL);
}

void loop() {
    // Vacío a propósito: todo corre en tareas FreeRTOS
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
