#ifndef SENSOR_BASE_H
#define SENSOR_BASE_H

#include <Arduino.h>

class ISensor {
public:
    virtual bool begin() = 0;
    virtual bool read() = 0;         // Actualiza valores internos
    virtual float getValue() = 0;    // Retorna valor principal
    virtual String getJson() = 0;    // Retorna fragmento JSON
    virtual String getName() = 0;
    bool isHealthy() { return _healthy; }
protected:
    bool _healthy = false;
};

#endif // SENSOR_BASE_H
