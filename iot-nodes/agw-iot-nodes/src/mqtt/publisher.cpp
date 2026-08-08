#include "publisher.h"
#include "topics.h"
#include "../network/mqtt_client.h"
#include "../actuators/actuator_manager.h"
#include "../config.h"
#include "../utils/logger.h"
#include <WiFi.h>

MqttPublisherClass MqttPublisher;

void MqttPublisherClass::init() {}

void MqttPublisherClass::addSensor(ISensor* sensor) {
    _sensors.push_back(sensor);
}

void MqttPublisherClass::publishTelemetry() {
    String payload = "{";
    payload += "\"node_id\":\"" + String(DEVICE_ID) + "\",";
    payload += "\"device_type\":\"" + String(DEVICE_TYPE) + "\",";
    // Usually timestamp is injected by gateway, but we'll include a placeholder or local uptime
    // In production we would sync time via NTP
    payload += "\"uptime_ms\":" + String(millis()) + ",";
    
    // Sensors
    payload += "\"sensors\":{";
    for (size_t i = 0; i < _sensors.size(); ++i) {
        payload += _sensors[i]->getJson();
        if (i < _sensors.size() - 1) payload += ",";
    }
    payload += "},";

    // Actuators
    payload += ActuatorManager.getJsonState() + ",";

    // Metadata
    payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"";
    payload += "}";

    MqttClient.publishTelemetry(payload.c_str());
    Logger::info("PUB", "Telemetry queued/published");
}

void MqttPublisherClass::publishStatus() {
    String payload = "{";
    payload += "\"node_id\":\"" + String(DEVICE_ID) + "\",";
    payload += "\"online\":true,";
    payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"uptime_ms\":" + String(millis()) + ",";
    payload += "\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"";
    payload += "}";

    MqttClient.publish(MqttTopics::getStatusTopic().c_str(), payload.c_str(), true);
    Logger::info("PUB", "Status published");
}
