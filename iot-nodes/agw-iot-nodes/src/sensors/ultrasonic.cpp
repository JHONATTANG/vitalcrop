#include "ultrasonic.h"
#include "../utils/logger.h"

UltrasonicSensor::UltrasonicSensor(uint8_t trigPin, uint8_t echoPin) 
    : _trigPin(trigPin), _echoPin(echoPin), _distance(0.0) {}

bool UltrasonicSensor::begin() {
    pinMode(_trigPin, OUTPUT);
    pinMode(_echoPin, INPUT);
    _healthy = true;
    Logger::info("USONIC", "Ultrasonic sensor initialized. Trig:" + String(_trigPin) + " Echo:" + String(_echoPin));
    return true;
}

bool UltrasonicSensor::read() {
    digitalWrite(_trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(_trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(_trigPin, LOW);

    long duration = pulseIn(_echoPin, HIGH, 30000); // 30ms timeout (~5 meters)
    if (duration == 0) {
        _healthy = false; // Timeout
        Logger::warn("USONIC", "Read timeout");
        return false;
    }

    _distance = (duration * 0.0343) / 2.0; // Distance in cm
    _healthy = true;
    return true;
}

float UltrasonicSensor::getValue() {
    return _distance;
}

String UltrasonicSensor::getJson() {
    if (!_healthy) return "\"water_level\":null";
    return String("\"water_level\":") + String(_distance, 2);
}
