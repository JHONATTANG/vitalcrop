#ifndef RELAY_ACTUATOR_H
#define RELAY_ACTUATOR_H

#include "actuator_base.h"

class RelayActuator : public IActuator {
public:
    RelayActuator(uint8_t pin, String name, bool activeHigh = true);
    void begin() override;
    void activate(unsigned long durationMs = 0) override;
    void deactivate() override;
    void update() override;
    bool getState() override;
    String getName() override { return _name; }

private:
    uint8_t _pin;
    String _name;
    bool _activeHigh;
    bool _state;
    unsigned long _turnOffTime;
    bool _hasTimer;
};

#endif // RELAY_ACTUATOR_H
