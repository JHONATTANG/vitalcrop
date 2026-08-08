#include "relay_actuator.h"
#include "../utils/logger.h"

RelayActuator::RelayActuator(uint8_t pin, String name, bool activeHigh) 
    : _pin(pin), _name(name), _activeHigh(activeHigh), _state(false), _hasTimer(false) {}

void RelayActuator::begin() {
    pinMode(_pin, OUTPUT);
    deactivate();
    Logger::info("ACT", "Relay " + _name + " initialized on pin " + String(_pin));
}

void RelayActuator::activate(unsigned long durationMs) {
    digitalWrite(_pin, _activeHigh ? HIGH : LOW);
    _state = true;
    
    if (durationMs > 0) {
        _hasTimer = true;
        _turnOffTime = millis() + durationMs;
        Logger::info("ACT", _name + " activated for " + String(durationMs) + "ms");
    } else {
        _hasTimer = false;
        Logger::info("ACT", _name + " activated indefinitely");
    }
}

void RelayActuator::deactivate() {
    digitalWrite(_pin, _activeHigh ? LOW : HIGH);
    _state = false;
    _hasTimer = false;
    Logger::info("ACT", _name + " deactivated");
}

void RelayActuator::update() {
    if (_state && _hasTimer) {
        if (millis() >= _turnOffTime) {
            deactivate();
            Logger::info("ACT", _name + " auto-deactivated by timer");
        }
    }
}

bool RelayActuator::getState() {
    return _state;
}
