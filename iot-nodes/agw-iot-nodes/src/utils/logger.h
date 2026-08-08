#ifndef LOGGER_H
#define LOGGER_H

#include <Arduino.h>

enum LogLevel {
    LOG_LEVEL_DEBUG,
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARN,
    LOG_LEVEL_ERROR
};

class Logger {
public:
    static void init(unsigned long baudRate = 115200);
    static void setLevel(LogLevel level);
    static void debug(const char* tag, const char* message);
    static void info(const char* tag, const char* message);
    static void warn(const char* tag, const char* message);
    static void error(const char* tag, const char* message);
    static void debug(const char* tag, String message);
    static void info(const char* tag, String message);
    static void warn(const char* tag, String message);
    static void error(const char* tag, String message);
    
    // Función para sobreescribir strings sensibles en RAM
    static void secure_wipe(char* str);
    static void secure_wipe(String& str);

private:
    static LogLevel _currentLevel;
    static void log(LogLevel level, const char* tag, const char* message);
};

#endif // LOGGER_H
