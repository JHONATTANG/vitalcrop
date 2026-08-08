#include "soil_moisture.h"
#include "../utils/logger.h"

SoilMoistureSensor::SoilMoistureSensor(uint8_t pin) : _pin(pin), _moisture(0.0) {}

bool SoilMoistureSensor::begin() {
    pinMode(_pin, INPUT);
    _healthy = true;
    Logger::info("SOIL", "Soil moisture sensor initialized on pin " + String(_pin));
    return true;
}

bool SoilMoistureSensor::read() {
    int raw = analogRead(_pin);
    // Convert 12-bit ADC value to percentage (0-100%)
    float m = map(raw, VAL_AIR, VAL_WATER, 0, 100);
    if (m < 0) m = 0;
    if (m > 100) m = 100;
    
    _moisture = m;
    _healthy = true;
    return true;
}

float SoilMoistureSensor::getValue() {
    return _moisture;
}

String SoilMoistureSensor::getJson() {
    if (!_healthy) return "\"soil_moisture\":null";
    return String("\"soil_moisture\":") + String(_moisture, 2);
}
