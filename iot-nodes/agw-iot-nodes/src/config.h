#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// === DEVICE IDENTITY ===
#ifdef SOIL_NODE
  #define DEVICE_TYPE     "SOIL"
  #define DEVICE_ID       "AGW-SOIL-01"
#else
  #define DEVICE_TYPE     "HYDRO"
  #define DEVICE_ID       "AGW-HYDRO-01"
#endif

#define FIRMWARE_VERSION "1.2.0"

// === NETWORK ===
#define WIFI_SSID       "AGW_IOT_NET"
#define WIFI_PASS       "your_wpa2_password"
#define WIFI_RECONNECT_MS  5000

// === MQTT ===
#define MQTT_BROKER     "10.10.0.1"
#define MQTT_PORT       1883
#define MQTT_USER       "esp32_node"
#define MQTT_PASS       "mqtt_password"
#define MQTT_QOS        1
#define MQTT_KEEPALIVE  60

// === INTERVALS (ms) ===
#define TELEMETRY_INTERVAL  30000   // Publicar telemetría cada 30s
#define STATUS_INTERVAL     60000   // Publicar status cada 60s
#define SENSOR_READ_MS      5000    // Leer sensores cada 5s

// === OTA ===
#define OTA_ENABLED     true
#define OTA_PASSWORD    "CAMBIAR"   // real en SECRETOS.local.md

// === PIN MAPPING - SOIL NODE ===
#ifdef SOIL_NODE
  #define PIN_DHT22         4
  #define PIN_SOIL_MOISTURE A0   // GPIO36
  #define PIN_PUMP_RELAY    16
  #define PIN_VALVE1_RELAY  17
  #define PIN_VALVE2_RELAY  18
#endif

// === PIN MAPPING - HYDRO NODE ===
#ifdef HYDRO_NODE
  #define PIN_PH_SENSOR     A0   // GPIO36
  #define PIN_EC_SENSOR     A3   // GPIO39
  #define PIN_DS18B20       4
  #define PIN_ULTRASONIC_TRIG 5
  #define PIN_ULTRASONIC_ECHO 18
  #define PIN_PUMP_RELAY    16
  #define PIN_VALVE1_RELAY  17
  #define PIN_VALVE2_RELAY  19
#endif

#endif // CONFIG_H
