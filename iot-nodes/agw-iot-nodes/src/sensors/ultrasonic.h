#ifndef ULTRASONIC_H
#define ULTRASONIC_H

#include "sensor_base.h"

class UltrasonicSensor : public ISensor {
public:
    UltrasonicSensor(uint8_t trigPin, uint8_t echoPin);
    bool begin() override;
    bool read() override;
    float getValue() override;
    String getJson() override;
    String getName() override { return "HC-SR04"; }

private:
    uint8_t _trigPin;
    uint8_t _echoPin;
    float _distance;
};

#endif // ULTRASONIC_H
