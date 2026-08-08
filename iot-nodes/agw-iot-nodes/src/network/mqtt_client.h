#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <PubSubClient.h>
#include <vector>

typedef void (*MqttCallback)(char*, byte*, unsigned int);

class MqttClientClass {
public:
    MqttClientClass();
    void setup();
    void loop();
    void setCallback(MqttCallback callback);
    bool publish(const char* topic, const char* payload, bool retain = false);
    bool publishTelemetry(const char* payload); // handles offline storage
    bool isConnected();

private:
    void reconnect();
    unsigned long _lastReconnectAttempt = 0;
    unsigned long _reconnectBackoff = 5000; // ms
    
    // Offline storage for telemetry
    std::vector<String> _offlineQueue;
    const size_t MAX_OFFLINE_STORAGE = 50;
    
    void processOfflineQueue();
};

extern MqttClientClass MqttClient;

#endif // MQTT_CLIENT_H
