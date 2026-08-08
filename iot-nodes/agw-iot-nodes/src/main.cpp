#include <Arduino.h>
#include "config.h"
#include "node_config.h"
#include "utils/logger.h"
#include "utils/scheduler.h"
#include "utils/ota.h"
#include "network/wifi_manager.h"
#include "network/mqtt_client.h"
#include "actuators/actuator_manager.h"
#include "actuators/relay_actuator.h"
#include "mqtt/publisher.h"
#include "mqtt/subscriber.h"

// Sensors
#ifdef SOIL_NODE
#include "sensors/dht_sensor.h"
#include "sensors/soil_moisture.h"
#endif

#ifdef HYDRO_NODE
#include "sensors/ph_sensor.h"
#include "sensors/ec_sensor.h"
#include "sensors/ds18b20_sensor.h"
#include "sensors/ultrasonic.h"
#endif

NodeConfig activeConfig;

#ifdef SOIL_NODE
DhtSensor dht(PIN_DHT22);
SoilMoistureSensor soil(PIN_SOIL_MOISTURE);
#endif

#ifdef HYDRO_NODE
PhSensor ph(PIN_PH_SENSOR);
EcSensor ec(PIN_EC_SENSOR);
Ds18b20Sensor ds(PIN_DS18B20);
UltrasonicSensor ultrasonic(PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO);
#endif

RelayActuator pump(PIN_PUMP_RELAY, "pump", true);
RelayActuator valve1(PIN_VALVE1_RELAY, "valve_1", true);
RelayActuator valve2(PIN_VALVE2_RELAY, "valve_2", true);

void setupSensorsAndActuators() {
    ActuatorManager.addActuator(&pump);
    ActuatorManager.addActuator(&valve1);
    ActuatorManager.addActuator(&valve2);
    ActuatorManager.begin();

#ifdef SOIL_NODE
    dht.begin();
    soil.begin();
    MqttPublisher.addSensor(&dht);
    MqttPublisher.addSensor(&soil);
#endif

#ifdef HYDRO_NODE
    ph.begin();
    ec.begin();
    ds.begin();
    ultrasonic.begin();
    MqttPublisher.addSensor(&ph);
    MqttPublisher.addSensor(&ec);
    MqttPublisher.addSensor(&ds);
    MqttPublisher.addSensor(&ultrasonic);
#endif
}

void taskReadSensors() {
#ifdef SOIL_NODE
    dht.read();
    soil.read();
#endif
#ifdef HYDRO_NODE
    ph.read();
    ec.read();
    ds.read();
    ultrasonic.read();
#endif
}

void taskPublishTelemetry() {
    MqttPublisher.publishTelemetry();
}

void taskPublishStatus() {
    MqttPublisher.publishStatus();
}

void setup() {
    Logger::init(115200);
    Logger::info("SYS", "Starting VitalCrop AGW Node: " + String(DEVICE_ID));
    
    activeConfig.load();
    setupSensorsAndActuators();
    
    WiFiManagerClass::setup();
    MqttClient.setup();
    MqttClient.setCallback(MqttSubscriberClass::handleMessage);
    
    OTA::setup();
    Scheduler::init();
    
    Scheduler::addTask(taskReadSensors, SENSOR_READ_MS);
    Scheduler::addTask(taskPublishTelemetry, TELEMETRY_INTERVAL);
    Scheduler::addTask(taskPublishStatus, STATUS_INTERVAL);
}

void loop() {
    WiFiManagerClass::loop();
    MqttClient.loop();
    OTA::loop();
    ActuatorManager.update();
    Scheduler::update();
    delay(10); // Small delay to prevent watchdog issues
}
