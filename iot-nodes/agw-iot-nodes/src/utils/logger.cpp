#include "logger.h"

LogLevel Logger::_currentLevel = LOG_LEVEL_DEBUG;

void Logger::init(unsigned long baudRate) {
    Serial.begin(baudRate);
    while (!Serial) { ; }
    info("LOGGER", "Logger initialized");
}

void Logger::setLevel(LogLevel level) {
    _currentLevel = level;
}

void Logger::log(LogLevel level, const char* tag, const char* message) {
    if (level < _currentLevel) return;
    
    const char* levelStr = "UNKN";
    switch(level) {
        case LOG_LEVEL_DEBUG: levelStr = "DEBUG"; break;
        case LOG_LEVEL_INFO:  levelStr = "INFO"; break;
        case LOG_LEVEL_WARN:  levelStr = "WARN"; break;
        case LOG_LEVEL_ERROR: levelStr = "ERROR"; break;
    }
    
    unsigned long ms = millis();
    Serial.printf("[%lu][%s] %s: %s\n", ms, levelStr, tag, message);
}

void Logger::debug(const char* tag, const char* message) { log(LOG_LEVEL_DEBUG, tag, message); }
void Logger::info(const char* tag, const char* message) { log(LOG_LEVEL_INFO, tag, message); }
void Logger::warn(const char* tag, const char* message) { log(LOG_LEVEL_WARN, tag, message); }
void Logger::error(const char* tag, const char* message) { log(LOG_LEVEL_ERROR, tag, message); }

void Logger::debug(const char* tag, String message) { log(LOG_LEVEL_DEBUG, tag, message.c_str()); }
void Logger::info(const char* tag, String message) { log(LOG_LEVEL_INFO, tag, message.c_str()); }
void Logger::warn(const char* tag, String message) { log(LOG_LEVEL_WARN, tag, message.c_str()); }
void Logger::error(const char* tag, String message) { log(LOG_LEVEL_ERROR, tag, message.c_str()); }

void Logger::secure_wipe(char* str) {
    if (!str) return;
    size_t len = strlen(str);
    for (size_t i=0; i<len; i++) str[i] = '\0';
}

void Logger::secure_wipe(String& str) {
    for (unsigned int i=0; i<str.length(); i++) str[i] = '\0';
    str = "";
}
