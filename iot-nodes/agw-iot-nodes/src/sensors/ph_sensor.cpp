#include "ph_sensor.h"
#include "../utils/logger.h"
#include "../node_config.h"

PhSensor::PhSensor(uint8_t pin) : _pin(pin), _phValue(7.0), _voltage(0.0) {}

bool PhSensor::begin() {
    pinMode(_pin, INPUT);
    _healthy = true;
    Logger::info("pH", "pH sensor initialized on pin " + String(_pin));
    return true;
}

bool PhSensor::read() {
    int raw = analogRead(_pin);
    _voltage = raw * (3.3 / 4095.0);
    
    // Two point calibration using activeConfig (ph_calib_7_volts, ph_calib_4_volts)
    // Formula: pH = 7.0 + ((voltage7 - voltage) * 3.0 / (voltage4 - voltage7))
    float v7 = activeConfig.ph_calib_7_volts;
    float v4 = activeConfig.ph_calib_4_volts;
    
    if (abs(v4 - v7) < 0.01) {
        _phValue = 7.0; // Avoid devision by zero if uncalibrated properly
    } else {
        float slope = 3.0 / (v4 - v7);
        _phValue = 7.0 + ((v7 - _voltage) * slope);
    }
    
    if (_phValue < 0.0) _phValue = 0.0;
    if (_phValue > 14.0) _phValue = 14.0;
    
    _healthy = true;
    return true;
}

float PhSensor::getValue() {
    return _phValue;
}

String PhSensor::getJson() {
    if (!_healthy) return "\"ph\":null";
    return String("\"ph\":") + String(_phValue, 2);
}
