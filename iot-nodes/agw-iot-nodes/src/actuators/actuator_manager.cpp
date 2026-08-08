#include "actuator_manager.h"
#include "../utils/logger.h"

ActuatorManagerClass ActuatorManager;

void ActuatorManagerClass::addActuator(IActuator* actuator) {
    _actuators.push_back(actuator);
}

void ActuatorManagerClass::begin() {
    for (auto actuator : _actuators) {
        actuator->begin();
    }
}

void ActuatorManagerClass::update() {
    for (auto actuator : _actuators) {
        actuator->update();
    }
}

void ActuatorManagerClass::activate(String name, unsigned long durationMs) {
    IActuator* act = getActuator(name);
    if (act) {
        act->activate(durationMs);
    } else {
        Logger::warn("ACT", "Actuator not found: " + name);
    }
}

void ActuatorManagerClass::deactivate(String name) {
    IActuator* act = getActuator(name);
    if (act) {
        act->deactivate();
    } else {
        Logger::warn("ACT", "Actuator not found: " + name);
    }
}

IActuator* ActuatorManagerClass::getActuator(String name) {
    for (auto actuator : _actuators) {
        if (actuator->getName() == name) {
            return actuator;
        }
    }
    return nullptr;
}

String ActuatorManagerClass::getJsonState() {
    String json = "\"actuators\":{";
    for (size_t i = 0; i < _actuators.size(); ++i) {
        json += "\"" + _actuators[i]->getName() + "\":";
        json += _actuators[i]->getState() ? "true" : "false";
        if (i < _actuators.size() - 1) json += ",";
    }
    json += "}";
    return json;
}
