#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <Arduino.h>

typedef void (*TaskCallback)();

struct Task {
    unsigned long interval;
    unsigned long lastRun;
    TaskCallback callback;
    bool enabled;
};

#define MAX_TASKS 10

class Scheduler {
public:
    static void init();
    static void update();
    static bool addTask(TaskCallback callback, unsigned long interval);

private:
    static Task _tasks[MAX_TASKS];
    static uint8_t _taskCount;
};

#endif
