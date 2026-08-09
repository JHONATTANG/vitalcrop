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
#define FIRMWARE_VERSION  "2.0.0"

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
#define DEFAULT_MOD_RIEGO_HIDRO  false   // Ciclos de riego de hidroponia
#define DEFAULT_MOD_RIEGO_TIERRA false   // Riego de tierra por calendario
#define DEFAULT_MOD_AMBIENTE     false   // Luz + ventilador por fotoperiodo
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

// ============================================================
//  PROGRAMA DE CULTIVO
// ============================================================
//  Todos estos valores los empuja la Raspberry por MQTT/HTTP y el nodo
//  los guarda en NVS. Los define aquí son solo el arranque de fábrica:
//  lo que vale es lo último que envió el gateway.
//
//  REPARTO DE RESPONSABILIDADES
//  La Pi lleva el calendario y decide CUANDO toca cada cosa. El ESP32
//  guarda el plan y lo EJECUTA, incluso si la Pi desaparece. Asi el
//  cultivo sobrevive a una caida del gateway, que es justo lo que exige
//  la continuidad operativa del proyecto.
//
//  El ESP32 no tiene reloj de tiempo real: la Pi le envia la hora al
//  conectar y la resincroniza periodicamente. Mientras no la tenga, el
//  nodo entra en MODO DEGRADADO (ver mas abajo).

// ------------------------------------------------------------
//  Fotoperiodo — rige la luz Y el modo dia/noche del riego
// ------------------------------------------------------------
#define PROG_HORA_LUZ_ON        6    // 06:00 enciende luz y ventilador
#define PROG_HORA_LUZ_OFF      20    // 20:00 apaga  → 14 h luz / 10 h oscuridad

// ------------------------------------------------------------
//  Riego de hidroponía — ciclos intermitentes
// ------------------------------------------------------------
//  De dia el cultivo transpira y consume, asi que se riega mas seguido.
//  De noche la demanda cae: ciclos espaciados bastan para mantener la
//  lamina de agua sin desperdiciar bombeo ni oxigenar de mas la raiz.
#define PROG_HIDRO_RIEGO_DIA_S      900   // 15 min bombeando
#define PROG_HIDRO_DESCANSO_DIA_S   900   // 15 min parada
#define PROG_HIDRO_RIEGO_NOCHE_S    600   // 10 min bombeando
#define PROG_HIDRO_DESCANSO_NOCHE_S 7200  //  2 h  parada

// ------------------------------------------------------------
//  Riego de tierra — por calendario, corte por sensor
// ------------------------------------------------------------
#define PROG_TIERRA_CADA_DIAS        15   // Periodicidad
#define PROG_TIERRA_HORA             7    // A las 07:00, con luz ya encendida

//  Umbral de CORTE: mucho mas sensible que NIVEL_DELTA_MIN.
//  Reportar "hay agua" puede esperar a que el sensor este bien mojado;
//  CORTAR el llenado no: hay que actuar en cuanto el agua asoma, o se
//  encharca. Por eso son dos constantes distintas y no una.
#define PROG_TIERRA_DELTA_CORTE     100   // cuentas de ADC

//  Corte de seguridad por tiempo. Si el sensor se averia y nunca
//  detecta, la valvula no puede quedarse abierta indefinidamente.
#define PROG_TIERRA_MAX_S           600   // 10 min como maximo absoluto

// ------------------------------------------------------------
//  Telemetría
// ------------------------------------------------------------
#define PROG_TELEMETRIA_S            60   // 1 min por defecto, ajustable
#define PROG_TELEMETRIA_MIN_S         5   // Suelo: por debajo satura la red
#define PROG_TELEMETRIA_MAX_S      3600   // Techo: 1 hora

// ------------------------------------------------------------
//  Contacto con el gateway
// ------------------------------------------------------------
//  Si pasan mas de PROG_SIN_GATEWAY_S sin recibir nada de la Pi, el
//  nodo se declara HUERFANO: sigue ejecutando el ultimo plan conocido
//  pero lo hace constar en el status, para que quede registrado que
//  esos datos se generaron sin supervision del gateway.
#define PROG_SIN_GATEWAY_S          900   // 15 min

// ============================================================
//  ENCLAVAMIENTOS DE SEGURIDAD
// ============================================================
//  Condiciones que el nodo comprueba por si mismo, SIEMPRE, hayan
//  llegado o no ordenes del gateway. Son el ultimo filtro entre una
//  configuracion equivocada y un invernadero inundado.
//
//  Un parametro mal enviado por la Pi, un JSON corrupto o un bug en el
//  scheduler no pueden traducirse en una bomba funcionando toda la
//  noche. El nodo desobedece si la orden es peligrosa.

//  La bomba nunca funciona mas de esto seguido, diga lo que diga el
//  programa. Protege el motor de trabajar en seco si el tanque se vacia.
#define SEG_MAX_BOMBA_CONTINUA_S   3600   // 1 hora

//  Tiempo minimo entre el fin de un riego y el inicio del siguiente.
//  Evita que una configuracion con descanso 0 encienda y apague el rele
//  continuamente, que lo destruiria en horas.
#define SEG_MIN_ENTRE_RIEGOS_S       30

//  Sobretemperatura: la lampara es la principal fuente de calor del
//  habitaculo. Si el aire se dispara se apaga aunque toque fotoperiodo,
//  y se reanuda al bajar. La histeresis evita el parpadeo del rele.
#define SEG_TEMP_CORTE_LUZ_C       38.0f
#define SEG_TEMP_REANUDAR_LUZ_C    34.0f

//  Si el sensor de nivel ya detecta agua ANTES de empezar el riego de
//  tierra, el sustrato sigue humedo del ciclo anterior: no se riega.
#define SEG_VERIFICAR_ANTES_RIEGO  true

// ============================================================
//  AUTONOMIA SIN GATEWAY
// ============================================================
//  El nodo lleva su propio contador de segundos desde el ultimo riego
//  de tierra. Con hora valida manda el calendario que envia la Pi; sin
//  ella, manda este contador. Asi el riego de tierra ocurre igual
//  aunque la Raspberry no aparezca nunca.
//
//  Se persiste en NVS cada hora: en un corte de luz se pierde como
//  mucho una hora de cuenta, despreciable frente a un ciclo de 15 dias.
//  Escribir mas a menudo desgastaria la flash sin ganar nada.
#define AUTO_GUARDAR_CONTADOR_S    3600   // Cada hora

// ------------------------------------------------------------
//  Nivel de log por el puerto serie
// ------------------------------------------------------------
//  0 = silencio total   (produccion: el nodo va sin cable serie)
//  1 = solo errores
//  2 = errores y avisos
//  3 = informativo      (por defecto, para banco)
//  4 = depuracion
//
//  Se cambia en caliente con {"cmd":"set_log","nivel":N} y persiste en
//  NVS. En produccion conviene 1: los errores siguen quedando en el
//  buffer serie por si alguien conecta un cable a diagnosticar.
#define LOG_NIVEL_DEF                 3

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
//  Mapa real del circuito (confirmado en banco):
//    Salida 1 → Electrovalvula HIDROPONIA  (llenado de los tubos NFT)
//    Salida 2 → Electrovalvula TIERRA      (riego del cultivo en sustrato)
//    Salida 3 → MOTOBOMBA                  (impulsa desde el tanque)
//    Salida 4 → AMBIENTE                   (ventilador + iluminacion)
#define PIN_SAL1          12    // Valvula hidroponia   ⚠️ strapping MTDI
#define PIN_SAL2          13    // Valvula tierra
#define PIN_SAL3          14    // Motobomba
#define PIN_SAL4          27    // Ventilador y luz

//  Alias por rol, para que el codigo se lea por funcion y no por numero
#define PIN_VALV_HIDRO    PIN_SAL1
#define PIN_VALV_TIERRA   PIN_SAL2
#define PIN_BOMBA         PIN_SAL3
#define PIN_AMBIENTE      PIN_SAL4

//  Nombres antiguos, conservados para no romper referencias existentes
#define PIN_VA1           PIN_SAL1
#define PIN_VA2           PIN_SAL2
#define PIN_VB1           PIN_SAL3
#define PIN_VB2           PIN_SAL4

//  ⚠️ Solo ADC1 funciona con el WiFi encendido. GPIO34 y GPIO36 lo son.
//     Si añades otro sensor analogico usa GPIO32/33/35/39, nunca ADC2
//     (GPIO 0,2,4,12-15,25-27): devuelven basura con la radio activa.
#define PIN_EC_SENSOR     33    // Conductividad electrica             (ADC1_CH5)
#define PIN_PH_SENSOR     34    // pH — retirado del alcance           (ADC1_CH6)

// ------------------------------------------------------------
//  Sensor de nivel de agua — CUIDADO CON EL PIN
// ------------------------------------------------------------
//  Cableado actual: GPIO4.
//
//  ⚠️ GPIO4 pertenece a ADC2, y ADC2 QUEDA INUTILIZABLE mientras el
//     WiFi esta activo: el controlador de radio se apodera de ese
//     bloque del conversor. analogRead() devuelve ceros o basura.
//     Por eso las lecturas salian 0 con ruido de +-45 cuentas.
//
//  Dos salidas:
//
//  A) RECOMENDADA — mover el cable a un pin de ADC1:
//        GPIO32  libre, ADC1_CH4, entrada/salida completa
//        GPIO36  libre, ADC1_CH0, solo entrada
//     Cambiar aqui el numero y recompilar. Lectura analogica real,
//     con variacion visible para calibrar.
//
//  B) SIN TOCAR EL CABLE — leer GPIO4 como entrada DIGITAL.
//     Para un detector de nivel es suficiente: la unica pregunta es
//     si el agua llego o no. Se pierde la lectura analogica, y el
//     umbral queda fijado por el hardware del chip (~1.4 V), sin
//     posibilidad de ajustarlo por software.
//     Activar con NIVEL_MODO_DIGITAL en true.
#define PIN_SENSOR_WATER    32   
#define NIVEL_MODO_DIGITAL  false   // true = digitalRead, false = analogRead

//  Con modulos resistivos la salida suele estar en alto en seco y caer
//  al mojarse. Si observas lo contrario, invierte este valor.
#define NIVEL_DIGITAL_SECO_ALTO  true

//  Bus I2C del HDC1080. Antes se usaban los de Wire por defecto de forma
//  implicita; declararlos evita sorpresas al cambiar de placa.
#define PIN_I2C_SDA       21
#define PIN_I2C_SCL       22
#define I2C_FREQ          100000UL   // 100 kHz: el HDC1080 no necesita mas
#define HDC1080_ADDR      0x40       // Fija en el chip, no configurable

// ------------------------------------------------------------
//  Sensor de NIVEL DE AGUA en tierra (resistivo)
// ------------------------------------------------------------
//  No mide porcentaje de humedad: un resistivo barato no tiene la
//  precisión ni la estabilidad para eso, y además se corroe.
//
//  Se usa como DETECTOR DE UMBRAL en una posición física fija. El
//  sensor está colocado a la altura de agua que se considera "lleno".
//  Mientras está seco el ADC da un valor alto y estable; en cuanto el
//  agua lo toca, la resistencia cae y el valor se desploma. Ese salto
//  es la señal de "nivel alcanzado, corta el llenado".
//
//  Calibración: con el sustrato SIN agua, ejecutar `cal nivel`. Eso
//  captura la referencia en seco. Cualquier caída mayor que
//  NIVEL_DELTA_MIN respecto a esa referencia se interpreta como agua.
#define NIVEL_ADC_SECO_DEF   3000   // Referencia en seco (se recalibra)
//  Medido en banco el 2026-08-09 con el sensor real:
//      seco al aire  ~4095 cuentas (3.30 V, saturado)
//      en agua       ~2500 cuentas (2.01 V)
//      excursion     ~1600 cuentas
//  Un umbral de 800 cae en el punto medio de esa excursion: exige que
//  el agua moje el sensor de verdad, y no dispara por humedad ambiental
//  ni por el ruido del ADC (que ronda las +-50 cuentas tras promediar).
#define NIVEL_DELTA_MIN       800   // Caída mínima para dar agua por detectada
#define ADC_MUESTRAS           16   // Promedio para bajar el ruido del ADC
#define MON_INTERVAL_MS      3000UL // Cadencia del monitor continuo
#define ADC_BITS             4095.0f
#define ADC_VREF                3.3f

// ------------------------------------------------------------
//  Sensor TDS analógico (sólidos disueltos totales)
// ------------------------------------------------------------
//  Hardware: modulo medidor TDS analogico tipo Gravity.
//
//  Estos modulos NO se calibran con dos puntos: el fabricante
//  caracteriza la sonda y publica una curva polinomica que convierte
//  voltaje a ppm directamente. Intentar una recta de dos puntos sobre
//  cuentas de ADC crudas ignora esa curva y da peores resultados.
//
//      TDS(ppm) = (133.42·V³ − 255.86·V² + 857.39·V) · 0.5
//
//  donde V es el voltaje compensado en temperatura. El 0.5 es el factor
//  de conversion TDS/EC habitual (algunos fabricantes usan 0.7).
//
//  La conductividad depende de la temperatura ~2 %/°C. Sin compensar,
//  la misma disolucion leeria distinto en un dia frio que en uno calido.
#define TDS_FACTOR            0.5f   // ppm por uS/cm. Cambiar a 0.7 si aplica
#define TDS_COEF_TEMP         0.02f  // 2 % por grado
#define TDS_TEMP_REF          25.0f  // Temperatura de referencia
#define TDS_MUESTRAS            32   // Se toma la MEDIANA, no la media
#define TDS_K_DEF             1.0f   // Ajuste fino contra una referencia

//  Offset del cero, en mV. Medido en banco: con la sonda al aire y seca
//  el modulo entrega 142 mV constantes, no 0. Parte es offset del
//  amplificador y parte es el suelo del ADC: con atenuacion de 11 dB el
//  ESP32 no resuelve por debajo de ~150 mV y aplana todo ahi.
//
//  Sin restarlo, agua destilada marcaria 68 ppm en vez de 0.
//  Se recalibra con `cal cero` teniendo la sonda al aire y SECA.
#define TDS_MV_CERO_DEF     142.0f

//  Techo util del ADC con 11 dB. Por encima la lectura se comprime y la
//  curva del fabricante deja de ser valida.
#define TDS_MV_TECHO       2400.0f

//  Temperatura de respaldo cuando el HDC1080 no está disponible.
//  ⚠️ El HDC1080 mide temperatura del AIRE, no de la solucion. Es una
//     aproximacion aceptable en un cultivo indoor donde ambos estan en
//     equilibrio, pero debe declararse como limitacion al reportar
//     resultados. Lo correcto seria una sonda DS18B20 sumergida.
#define TDS_TEMP_FALLBACK     25.0f

#define DEFAULT_MOD_SENSOR_EC  false

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