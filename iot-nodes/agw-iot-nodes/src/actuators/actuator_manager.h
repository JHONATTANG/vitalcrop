#ifndef ACTUATOR_MANAGER_H
#define ACTUATOR_MANAGER_H

#include "actuator_base.h"
#include <vector>

class ActuatorManagerClass {
public:
    void addActuator(IActuator* actuator);
    void begin();
    void update();
    void activate(String name, unsigned long durationMs = 0);
    void deactivate(String name);
    IActuator* getActuator(String name);
    String getJsonState();

private:
    std::vector<IActuator*> _actuators;
};

extern ActuatorManagerClass ActuatorManager;

#endif // ACTUATOR_MANAGER_H
