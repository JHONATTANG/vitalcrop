#include "ec_sensor.h"
#include "../utils/logger.h"
#include "../node_config.h"

EcSensor::EcSensor(uint8_t pin) : _pin(pin), _ecValue(0.0), _voltage(0.0) {}

bool EcSensor::begin() {
    pinMode(_pin, INPUT);
    _healthy = true;
    Logger::info("EC", "EC sensor initialized on pin " + String(_pin));
    return true;
}

bool EcSensor::read() {
    int raw = analogRead(_pin);
    _voltage = raw * (3.3 / 4095.0);
    
    // Simple linear calibration with factor k
    _ecValue = _voltage * activeConfig.ec_calib_k;
    
    if (_ecValue < 0.0) _ecValue = 0.0;
    
    _healthy = true;
    return true;
}

float EcSensor::getValue() {
    return _ecValue;
}

String EcSensor::getJson() {
    if (!_healthy) return "\"ec\":null";
    return String("\"ec\":") + String(_ecValue, 2);
}
