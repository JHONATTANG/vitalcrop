// ============================================================
//  CONFIGURACIÓN — AGW HydroNode (IoT-node-26.001)
//  Edita aquí los valores para tu entorno
// ============================================================

#ifndef CONFIG_H
#define CONFIG_H

// ------------------------------------------------------------
//  Identidad del dispositivo
// ------------------------------------------------------------
#define DEVICE_ID         "IoT-node-26.001"
#define DEVICE_TYPE       "hydro"
#define FIRMWARE_VERSION  "1.2.0"

// ------------------------------------------------------------
//  Red WiFi
// ------------------------------------------------------------
#define WIFI_SSID         "CULTIVO_INDOOR_WIFI"
#define WIFI_PASS         "hierbabuena2026"

// ------------------------------------------------------------
//  MQTT Broker (IP de la Raspberry Pi en la red hotspot)
// ------------------------------------------------------------
#define MQTT_BROKER       "10.42.0.1"
#define MQTT_PORT         1883

// Keepalive de 20 s (antes 60). Motivo: el AP de la Raspberry no puede
// limpiar por si mismo las estaciones que desaparecen sin desasociarse
// (SME en firmware Broadcom, MCD §7.21). El vigilante del AP detecta esas
// entradas fantasma por ausencia de trafico entrante; un keepalive corto
// garantiza que un nodo VIVO siempre genere rx en menos de 20 s y nunca
// sea confundido con uno caido.
#define MQTT_KEEPALIVE    20

// MQTT Autenticación — POR AHORA DESACTIVADA
// Para activarla en el futuro:
//   1. Editar /etc/mosquitto/mosquitto.conf en la Raspberry:
//        allow_anonymous false
//        password_file /etc/mosquitto/passwd
//   2. Crear usuario:  mosquitto_passwd -c /etc/mosquitto/passwd esp32_hydro
//   3. Descomentar las dos líneas siguientes y usarlas en mqttClient.connect()
// #define MQTT_USER  "esp32_hydro"
// #define MQTT_PASS  "mqtt_password_hydro"

// IDs únicos de cliente MQTT (uno por socket)
#define MQTT_CLIENT_ID_PUB  "agw-hydro-pub-01"   // Publicador  (telemetría + alertas)
#define MQTT_CLIENT_ID_SUB  "agw-hydro-sub-01"   // Suscriptor  (comandos Raspberry)

// ------------------------------------------------------------
//  Topics MQTT
// ------------------------------------------------------------
// Nodo → Raspberry
#define TOPIC_TELEMETRIA  "cultivo/indoor/hierbabuena/telemetria"
#define TOPIC_ALERTA      "cultivo/indoor/hierbabuena/alerta"
#define TOPIC_STATUS      "cultivo/indoor/hierbabuena/status"
// Raspberry → Nodo
#define TOPIC_CMD         "cultivo/indoor/hierbabuena/cmd"

// LWT (Last Will Testament): se publica si el nodo se desconecta sin avisar
#define LWT_PAYLOAD       "{\"id\":\"" DEVICE_ID "\",\"online\":false}"

// ------------------------------------------------------------
//  Servidor HTTP de control (plano de control independiente de MQTT)
// ------------------------------------------------------------
//  Existe para no depender de MQTT: si el broker falla o la suscripción
//  se cae, el nodo sigue siendo controlable por HTTP desde la red del AP.
//    GET  http://<ip>/estado    → estado completo del nodo
//    GET  http://<ip>/modulos   → lista de módulos y su estado
//    POST http://<ip>/modulo    → {"modulo":"telemetria","activo":true}
//    POST http://<ip>/cmd       → mismo payload que el topic MQTT cmd
#define HTTP_CONTROL_PORT   80

// ------------------------------------------------------------
//  Intervalos (ms)
// ------------------------------------------------------------
#define INTERVAL_SENSOR         5000UL    // Lectura de sensores (interno, no cambia)
#define INTERVAL_TELEMETRY      10000UL   // Publicación hacia Raspberry (default)
#define INTERVAL_STATUS         60000UL   // Heartbeat de estado del nodo
#define INTERVAL_MODULE_CHECK   1000UL    // Cada cuánto una tarea mira su flag

// ------------------------------------------------------------
//  Módulos activables en caliente
// ------------------------------------------------------------
//  TODAS las tareas se crean siempre; cada una consulta su flag en cada
//  ciclo y no hace nada si está apagada. Así se activan y desactivan
//  funciones sin recompilar ni reiniciar.
//
//  Valores por defecto = TODO APAGADO. El nodo arranca conectando solo
//  al WiFi y levantando los dos planos de control (HTTP y MQTT-sub).
//  Se enciende lo que se quiera probar, de uno en uno.
//
//  Los cambios se guardan en NVS y sobreviven al reinicio.
//  Para volver a estos valores:  {"cmd":"reset_modulos"}
#define DEFAULT_MOD_TELEMETRIA   false   // Publicar telemetría
#define DEFAULT_MOD_STATUS       false   // Heartbeat cada 60 s
#define DEFAULT_MOD_ALERTAS      false   // Monitor de umbrales
#define DEFAULT_MOD_SENSOR_HDC   false   // HDC1080 (temp + humedad)
#define DEFAULT_MOD_SENSOR_SUELO false   // Humedad de sustrato (GPIO36)
#define DEFAULT_MOD_SENSOR_PH    false   // pH (GPIO34) — retirado del alcance
#define DEFAULT_MOD_ACTUADORES   false   // Ciclos de riego
#define DEFAULT_MOD_SIMULACION   false   // Valores sintéticos sin hardware

// ------------------------------------------------------------
//  Ahorro de energía del WiFi — nivel 1 (MCD §12)
// ------------------------------------------------------------
//  true  → modem sleep por DTIM. La radio duerme entre beacons y
//          despierta a escucharlos. Consumo ~120 mA → ~20-30 mA.
//          SIGUE RECIBIENDO comandos push: el AP (dtim_period=2)
//          almacena las tramas dirigidas a estaciones dormidas y
//          las entrega en el siguiente beacon. Coste: ~200 ms de
//          latencia descendente, despreciable frente al objetivo
//          de < 2 s extremo a extremo.
//
//  false → radio siempre activa. Latencia mínima y jitter mínimo.
//          Úsalo al medir latencia pura en la Fase 6, para que el
//          ahorro de energía no contamine la medida.
//
//  Conmutable en caliente: {"cmd":"set_modulo","modulo":"ahorro_wifi",...}
#define DEFAULT_MOD_AHORRO_WIFI  true

// Namespace de NVS donde se persisten los flags
#define NVS_NAMESPACE  "agw"

// ------------------------------------------------------------
//  Sistema de alertas — umbrales por defecto
// ------------------------------------------------------------
#define UMBRAL_TEMP_MIN       10.0f
#define UMBRAL_TEMP_MAX       35.0f
#define UMBRAL_HUM_MIN        30.0f
#define UMBRAL_HUM_MAX        90.0f
#define UMBRAL_HSUELO_MIN     20.0f
#define UMBRAL_HSUELO_MAX     95.0f
#define UMBRAL_PH_MIN          5.5f
#define UMBRAL_PH_MAX          7.5f

// Ventanas de tiempo para escalar el nivel de alerta
#define ALERTA_LEVE_MS       300000UL    //  5 minutos → LEVE
#define ALERTA_MEDIA_MS     1200000UL    // 20 minutos → MEDIA
#define ALERTA_GRAVE_MS     3600000UL    //  1 hora     → GRAVE

// ------------------------------------------------------------
//  Pines de hardware
// ------------------------------------------------------------
//  ⚠️ GPIO12 es pin de strapping (MTDI). En el arranque el ESP32 lo lee
//     para decidir el voltaje de la flash. Si el modulo de rele lo deja
//     en ALTO al encender, la placa PUEDE NO ARRANCAR. Si ves que no
//     bootea al conectar el circuito, mueve VA1 a GPIO25/26/33.
#define PIN_VA1           12    // Electroválvula A  ⚠️ strapping
#define PIN_VA2           13    // Motobomba A
#define PIN_VB1           14    // Electroválvula B
#define PIN_VB2           27    // Motobomba B

//  ⚠️ Solo ADC1 funciona con el WiFi encendido. GPIO34 y GPIO36 lo son.
//     Si añades otro sensor analogico usa GPIO32/33/35/39, nunca ADC2
//     (GPIO 0,2,4,12-15,25-27): devuelven basura con la radio activa.
#define PIN_SENSOR_WATER  36    // Humedad de sustrato (ADC1_CH0, solo entrada)
#define PIN_PH_SENSOR     34    // pH               (ADC1_CH6, solo entrada)

//  Bus I2C del HDC1080. Antes se usaban los de Wire por defecto de forma
//  implicita; declararlos evita sorpresas al cambiar de placa.
#define PIN_I2C_SDA       21
#define PIN_I2C_SCL       22

// ------------------------------------------------------------
//  Polaridad de los módulos de relé
// ------------------------------------------------------------
//  true  → activo-bajo: LOW cierra el relé. Es lo habitual en los
//          módulos de 5 V con optoacoplador que se venden para Arduino.
//  false → activo-alto: HIGH cierra el relé.
//
//  Si al probar ves el comportamiento invertido (relé cerrado cuando
//  deberia estar abierto), cambia este valor y recompila. No toques la
//  logica del programa: toda pasa por releOn()/releOff().
#define RELE_ACTIVO_BAJO  true

// ------------------------------------------------------------
//  Prueba de banco de válvulas
// ------------------------------------------------------------
//  Barrido secuencial: activa una salida, espera, la apaga, pasa a la
//  siguiente. Sirve para verificar cableado y relés sin sensores ni
//  logica de riego de por medio.
#define TEST_VALVULA_MS   5000UL   // Tiempo encendida cada válvula
#define TEST_PAUSA_MS     1000UL   // Pausa entre válvulas
#define DEFAULT_MOD_TEST_VALVULAS  false   // Apagado por seguridad

// OTA (ArduinoOTA — no activo aún, reservado)
#define OTA_PASSWORD      "ota_secure_password"

#endif // CONFIG_H