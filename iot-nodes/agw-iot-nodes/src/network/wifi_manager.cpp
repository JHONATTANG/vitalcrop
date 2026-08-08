#include "wifi_manager.h"
#include "../utils/logger.h"
#include "../config.h"
#include <WiFi.h>

unsigned long WiFiManagerClass::_lastReconnectAttempt = 0;
unsigned long WiFiManagerClass::_reconnectBackoff = WIFI_RECONNECT_MS;

void WiFiManagerClass::setup() {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true);
    Logger::info("WIFI", "Connecting to " + String(WIFI_SSID));
    WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void WiFiManagerClass::loop() {
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > _reconnectBackoff) {
            _lastReconnectAttempt = now;
            Logger::warn("WIFI", "Disconnect detected, reconnecting...");
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASS);
            _reconnectBackoff *= 2; // Exponential backoff
            if (_reconnectBackoff > 60000) _reconnectBackoff = 60000;
        }
    } else {
        if (_reconnectBackoff > WIFI_RECONNECT_MS) {
            Logger::info("WIFI", "Connected. IP: " + WiFi.localIP().toString());
        }
        _reconnectBackoff = WIFI_RECONNECT_MS;
    }
}

bool WiFiManagerClass::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}
