#ifndef DS18B20_SENSOR_H
#define DS18B20_SENSOR_H

#include "sensor_base.h"
#include <OneWire.h>
#include <DallasTemperature.h>

class Ds18b20Sensor : public ISensor {
public:
    Ds18b20Sensor(uint8_t pin);
    bool begin() override;
    bool read() override;
    float getValue() override;
    String getJson() override;
    String getName() override { return "DS18B20"; }

private:
    uint8_t _pin;
    OneWire* _oneWire;
    DallasTemperature* _sensors;
    float _temp;
};

#endif // DS18B20_SENSOR_H
