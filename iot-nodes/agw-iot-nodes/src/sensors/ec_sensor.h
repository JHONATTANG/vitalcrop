#ifndef EC_SENSOR_H
#define EC_SENSOR_H

#include "sensor_base.h"

class EcSensor : public ISensor {
public:
    EcSensor(uint8_t pin);
    bool begin() override;
    bool read() override;
    float getValue() override;
    String getJson() override;
    String getName() override { return "EC"; }

private:
    uint8_t _pin;
    float _ecValue;
    float _voltage;
};

#endif // EC_SENSOR_H
