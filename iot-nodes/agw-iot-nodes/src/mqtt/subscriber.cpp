#include "subscriber.h"
#include "topics.h"
#include "../network/mqtt_client.h"
#include "../actuators/actuator_manager.h"
#include "../node_config.h"
#include "../config.h"
#include "../utils/logger.h"
#include <ArduinoJson.h>

void MqttSubscriberClass::handleMessage(char* topic, byte* payload, unsigned int length) {
    String msgTopic = String(topic);
    String msgPayload = "";
    for (unsigned int i = 0; i < length; i++) {
        msgPayload += (char)payload[i];
    }
    
    Logger::info("SUB", "Message arrived on topic: " + msgTopic);
    Logger::debug("SUB", "Payload: " + msgPayload);

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, msgPayload);
    if (error) {
        Logger::error("SUB", "deserializeJson() failed: " + String(error.c_str()));
        return;
    }

    if (msgTopic == MqttTopics::getCommandsTopic()) {
        const char* target = doc["target_node"];
        if (String(target) != String(DEVICE_ID)) {
            return; // Not for us
        }
        
        const char* cmd_id = doc["command_id"];
        const char* action = doc["action"];
        
        if (String(action) == "ACTIVATE_PUMP") {
            int duration = doc["params"]["duration_seconds"] | 0;
            ActuatorManager.activate("pump", duration * 1000);
            Logger::info("SUB", "Command ACTIVATE_PUMP executed");
        } else if (String(action) == "ACTIVATE_VALVE_1") {
            int duration = doc["params"]["duration_seconds"] | 0;
            ActuatorManager.activate("valve_1", duration * 1000);
            Logger::info("SUB", "Command ACTIVATE_VALVE_1 executed");
        } else if (String(action) == "ACTIVATE_VALVE_2") {
            int duration = doc["params"]["duration_seconds"] | 0;
            ActuatorManager.activate("valve_2", duration * 1000);
            Logger::info("SUB", "Command ACTIVATE_VALVE_2 executed");
        }
        
        // Responder ACK
        String ackPayload = "{\"command_id\":\"" + String(cmd_id) + "\",\"node_id\":\"" + String(DEVICE_ID) + "\",\"status\":\"EXECUTED\"}";
        MqttClient.publish(MqttTopics::getAlertsTopic().c_str(), ackPayload.c_str(), false);
    }
    else if (msgTopic == MqttTopics::getConfigTopic()) {
        if (doc.containsKey("ph_7")) activeConfig.ph_calib_7_volts = doc["ph_7"];
        if (doc.containsKey("ph_4")) activeConfig.ph_calib_4_volts = doc["ph_4"];
        if (doc.containsKey("ec_k")) activeConfig.ec_calib_k = doc["ec_k"];
        activeConfig.save();
        Logger::info("SUB", "Config updated and saved");
    }
}
