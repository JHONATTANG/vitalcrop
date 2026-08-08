#include "ota.h"
#include "logger.h"
#include "../config.h"

void OTA::setup() {
    if (!OTA_ENABLED) return;

    ArduinoOTA.setHostname(DEVICE_ID);
    ArduinoOTA.setPassword(OTA_PASSWORD);

    ArduinoOTA.onStart([]() {
        String type;
        if (ArduinoOTA.getCommand() == U_FLASH) {
            type = "sketch";
        } else { // U_SPIFFS
            type = "filesystem";
        }
        Logger::info("OTA", "Start updating " + type);
    });
    
    ArduinoOTA.onEnd([]() {
        Logger::info("OTA", "\nEnd");
    });
    
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
    });
    
    ArduinoOTA.onError([](ota_error_t error) {
        Logger::error("OTA", String("Error: ") + error);
        if (error == OTA_AUTH_ERROR) {
            Logger::error("OTA", "Auth Failed");
        } else if (error == OTA_BEGIN_ERROR) {
            Logger::error("OTA", "Begin Failed");
        } else if (error == OTA_CONNECT_ERROR) {
            Logger::error("OTA", "Connect Failed");
        } else if (error == OTA_RECEIVE_ERROR) {
            Logger::error("OTA", "Receive Failed");
        } else if (error == OTA_END_ERROR) {
            Logger::error("OTA", "End Failed");
        }
    });

    ArduinoOTA.begin();
    Logger::info("OTA", "OTA Initialized");
}

void OTA::loop() {
    if (OTA_ENABLED) {
        ArduinoOTA.handle();
    }
}
