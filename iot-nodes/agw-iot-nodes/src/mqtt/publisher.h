#ifndef PUBLISHER_H
#define PUBLISHER_H

#include <Arduino.h>
#include <vector>
#include "../sensors/sensor_base.h"

class MqttPublisherClass {
public:
    void init();
    void addSensor(ISensor* sensor);
    void publishTelemetry();
    void publishStatus();

private:
    std::vector<ISensor*> _sensors;
};

extern MqttPublisherClass MqttPublisher;

#endif // PUBLISHER_H
