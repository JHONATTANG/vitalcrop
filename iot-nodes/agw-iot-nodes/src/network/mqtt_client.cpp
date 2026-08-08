#include "mqtt_client.h"
#include "../utils/logger.h"
#include "../config.h"
#include <WiFi.h>

WiFiClient _espClient;
PubSubClient _client(_espClient);

MqttClientClass MqttClient;

MqttClientClass::MqttClientClass() {}

void MqttClientClass::setup() {
    _client.setServer(MQTT_BROKER, MQTT_PORT);
    _client.setKeepAlive(MQTT_KEEPALIVE);
}

void MqttClientClass::setCallback(MqttCallback callback) {
    _client.setCallback(callback);
}

bool MqttClientClass::isConnected() {
    return _client.connected();
}

void MqttClientClass::loop() {
    if (!_client.connected()) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > _reconnectBackoff) {
            _lastReconnectAttempt = now;
            reconnect();
        }
    } else {
        _client.loop();
        processOfflineQueue();
    }
}

void MqttClientClass::reconnect() {
    if (WiFi.status() != WL_CONNECTED) return; // Need WiFi first
    
    Logger::info("MQTT", "Attempting MQTT connection...");
    
    String type = String(DEVICE_TYPE);
    type.toLowerCase();
    String lwtTopic = "agw/node/" + type + "/status";
    String lwtPayload = "{\"node_id\":\"" + String(DEVICE_ID) + "\",\"online\":false}";
    
    // Attempt to connect
    if (_client.connect(DEVICE_ID, MQTT_USER, MQTT_PASS, lwtTopic.c_str(), MQTT_QOS, true, lwtPayload.c_str())) {
        Logger::info("MQTT", "Connected to broker");
        _reconnectBackoff = 5000; // Reset backoff
        
        // Subscribe to commands and config
        String configTopic = "agw/node/" + type + "/config";
        String commandsTopic = "agw/gateway/commands";
        _client.subscribe(configTopic.c_str(), MQTT_QOS);
        _client.subscribe(commandsTopic.c_str(), MQTT_QOS);
        
        // Publish online status
        String onlinePayload = "{\"node_id\":\"" + String(DEVICE_ID) + "\",\"online\":true}";
        _client.publish(lwtTopic.c_str(), onlinePayload.c_str(), true);
    } else {
        Logger::error("MQTT", "Connection failed, rc=" + String(_client.state()));
        _reconnectBackoff *= 2; // Exponential backoff
        if (_reconnectBackoff > 60000) _reconnectBackoff = 60000; // Max 60s
    }
}

bool MqttClientClass::publish(const char* topic, const char* payload, bool retain) {
    if (_client.connected()) {
        return _client.publish(topic, payload, retain);
    }
    return false;
}

bool MqttClientClass::publishTelemetry(const char* payload) {
    String type = String(DEVICE_TYPE);
    type.toLowerCase();
    String topic = "agw/node/" + type + "/telemetry";
    
    if (_client.connected()) {
        return _client.publish(topic.c_str(), payload, false);
    } else {
        // Enqueue offline
        if (_offlineQueue.size() >= MAX_OFFLINE_STORAGE) {
            _offlineQueue.erase(_offlineQueue.begin()); // Remove oldest
        }
        _offlineQueue.push_back(String(payload));
        Logger::warn("MQTT", "Offline, telemetry queued. Count: " + String(_offlineQueue.size()));
        return false;
    }
}

void MqttClientClass::processOfflineQueue() {
    if (_offlineQueue.empty()) return;
    
    // Process one per loop iteration to avoid blocking
    String payload = _offlineQueue.front();
    String type = String(DEVICE_TYPE);
    type.toLowerCase();
    String topic = "agw/node/" + type + "/telemetry";
    
    if (_client.publish(topic.c_str(), payload.c_str(), false)) {
        _offlineQueue.erase(_offlineQueue.begin());
        Logger::info("MQTT", "Published queued telemetry. Remaining: " + String(_offlineQueue.size()));
    }
}
