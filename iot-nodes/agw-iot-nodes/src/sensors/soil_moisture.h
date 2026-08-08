#ifndef SOIL_MOISTURE_H
#define SOIL_MOISTURE_H

#include "sensor_base.h"

class SoilMoistureSensor : public ISensor {
public:
    SoilMoistureSensor(uint8_t pin);
    bool begin() override;
    bool read() override;
    float getValue() override;
    String getJson() override;
    String getName() override { return "SoilMoisture"; }

private:
    uint8_t _pin;
    float _moisture;
    // Calibration constants (example values, depend on sensor specific dry/wet readings)
    const int VAL_AIR = 4095;
    const int VAL_WATER = 1500;
};

#endif // SOIL_MOISTURE_H
