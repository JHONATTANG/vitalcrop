#ifndef SUBSCRIBER_H
#define SUBSCRIBER_H

#include <Arduino.h>

class MqttSubscriberClass {
public:
    static void handleMessage(char* topic, byte* payload, unsigned int length);
};

#endif // SUBSCRIBER_H
