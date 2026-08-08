#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>

class WiFiManagerClass {
public:
    static void setup();
    static void loop();
    static bool isConnected();

private:
    static unsigned long _lastReconnectAttempt;
    static unsigned long _reconnectBackoff;
};

#endif // WIFI_MANAGER_H
