#ifndef ACTUATOR_BASE_H
#define ACTUATOR_BASE_H

#include <Arduino.h>

class IActuator {
public:
    virtual void begin() = 0;
    virtual void activate(unsigned long durationMs = 0) = 0; // 0 = indefinite
    virtual void deactivate() = 0;
    virtual void update() = 0; // Check timers
    virtual bool getState() = 0;
    virtual String getName() = 0;
};

#endif // ACTUATOR_BASE_H
