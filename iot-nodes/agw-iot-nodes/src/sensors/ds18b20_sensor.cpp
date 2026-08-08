#include "ds18b20_sensor.h"
#include "../utils/logger.h"

Ds18b20Sensor::Ds18b20Sensor(uint8_t pin) : _pin(pin), _temp(NAN) {
    _oneWire = new OneWire(_pin);
    _sensors = new DallasTemperature(_oneWire);
}

bool Ds18b20Sensor::begin() {
    _sensors->begin();
    int count = _sensors->getDeviceCount();
    if (count > 0) {
        _healthy = true;
        Logger::info("DS18", "DS18B20 found " + String(count) + " devices on pin " + String(_pin));
        return true;
    }
    _healthy = false;
    Logger::warn("DS18", "No DS18B20 devices found on pin " + String(_pin));
    return false;
}

bool Ds18b20Sensor::read() {
    _sensors->requestTemperatures();
    float t = _sensors->getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C || t < -50.0 || t > 100.0) {
        _healthy = false;
        Logger::warn("DS18", "Failed to read correct temp from DS18B20");
        return false;
    }
    _temp = t;
    _healthy = true;
    return true;
}

float Ds18b20Sensor::getValue() {
    return _temp;
}

String Ds18b20Sensor::getJson() {
    if (!_healthy) return "\"water_temp\":null";
    return String("\"water_temp\":") + String(_temp, 2);
}
