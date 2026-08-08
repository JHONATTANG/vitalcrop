#ifndef TOPICS_H
#define TOPICS_H

#include <Arduino.h>
#include "../config.h"

class MqttTopics {
public:
    static String getDeviceType() {
        String type = String(DEVICE_TYPE);
        type.toLowerCase();
        return type;
    }

    static String getTelemetryTopic() {
        return "agw/node/" + getDeviceType() + "/telemetry";
    }

    static String getStatusTopic() {
        return "agw/node/" + getDeviceType() + "/status";
    }

    static String getAlertsTopic() {
        return "agw/node/" + getDeviceType() + "/alerts";
    }

    static String getConfigTopic() {
        return "agw/node/" + getDeviceType() + "/config";
    }

    static String getCommandsTopic() {
        return "agw/gateway/commands";
    }
};

#endif // TOPICS_H
