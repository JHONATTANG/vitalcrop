#ifndef NODE_CONFIG_H
#define NODE_CONFIG_H

#include <Arduino.h>
#include <Preferences.h>

struct NodeConfig {
    float ph_calib_7_volts = 2.0;    // Default calibration values
    float ph_calib_4_volts = 2.5;
    float ec_calib_k = 1.0;
    
    void load() {
        Preferences prefs;
        prefs.begin("agw_config", true);
        ph_calib_7_volts = prefs.getFloat("ph_7", 2.0);
        ph_calib_4_volts = prefs.getFloat("ph_4", 2.5);
        ec_calib_k = prefs.getFloat("ec_k", 1.0);
        prefs.end();
    }
    
    void save() {
        Preferences prefs;
        prefs.begin("agw_config", false);
        prefs.putFloat("ph_7", ph_calib_7_volts);
        prefs.putFloat("ph_4", ph_calib_4_volts);
        prefs.putFloat("ec_k", ec_calib_k);
        prefs.end();
    }
};

extern NodeConfig activeConfig;

#endif // NODE_CONFIG_H
