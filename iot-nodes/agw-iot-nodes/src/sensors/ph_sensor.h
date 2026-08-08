#ifndef PH_SENSOR_H
#define PH_SENSOR_H

#include "sensor_base.h"

class PhSensor : public ISensor {
public:
    PhSensor(uint8_t pin);
    bool begin() override;
    bool read() override;
    float getValue() override;
    String getJson() override;
    String getName() override { return "pH"; }

private:
    uint8_t _pin;
    float _phValue;
    float _voltage;
};

#endif // PH_SENSOR_H
