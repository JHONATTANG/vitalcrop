#include "dht_sensor.h"
#include "../utils/logger.h"

DhtSensor::DhtSensor(uint8_t pin, uint8_t type) : _pin(pin), _type(type), _temp(NAN), _hum(NAN) {
    _dht = new DHT(_pin, _type);
}

bool DhtSensor::begin() {
    _dht->begin();
    _healthy = true;
    Logger::info("DHT", "DHT sensor initialized on pin " + String(_pin));
    return true;
}

bool DhtSensor::read() {
    float h = _dht->readHumidity();
    float t = _dht->readTemperature();
    if (isnan(h) || isnan(t)) {
        Logger::warn("DHT", "Failed to read from DHT sensor");
        _healthy = false;
        return false;
    }
    // Sanitizar valores de sensores (descartar lecturas fuera de rango físico)
    if (t < -40.0 || t > 80.0 || h < 0.0 || h > 100.0) {
        Logger::warn("DHT", "DHT reading out of range");
        return false;
    }
    _temp = t;
    _hum = h;
    _healthy = true;
    return true;
}

float DhtSensor::getValue() {
    return _temp;
}

float DhtSensor::getHumidity() {
    return _hum;
}

String DhtSensor::getJson() {
    if (!_healthy) return "\"temperature\":null,\"humidity\":null";
    return String("\"temperature\":") + String(_temp, 2) + ",\"humidity\":" + String(_hum, 2);
}
