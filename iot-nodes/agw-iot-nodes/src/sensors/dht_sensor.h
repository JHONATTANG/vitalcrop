#ifndef DHT_SENSOR_H
#define DHT_SENSOR_H

#include "sensor_base.h"
#include <DHT.h>

class DhtSensor : public ISensor {
public:
    DhtSensor(uint8_t pin, uint8_t type = DHT22);
    bool begin() override;
    bool read() override;
    float getValue() override; // Returns temperature
    float getHumidity();
    String getJson() override;
    String getName() override { return "DHT22"; }

private:
    uint8_t _pin;
    uint8_t _type;
    DHT* _dht;
    float _temp;
    float _hum;
};

#endif // DHT_SENSOR_H
