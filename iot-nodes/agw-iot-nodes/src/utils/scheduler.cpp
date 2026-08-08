#include "scheduler.h"

Task Scheduler::_tasks[MAX_TASKS];
uint8_t Scheduler::_taskCount = 0;

void Scheduler::init() {
    _taskCount = 0;
}

bool Scheduler::addTask(TaskCallback callback, unsigned long interval) {
    if (_taskCount >= MAX_TASKS) return false;
    _tasks[_taskCount].interval = interval;
    _tasks[_taskCount].lastRun = millis();
    _tasks[_taskCount].callback = callback;
    _tasks[_taskCount].enabled = true;
    _taskCount++;
    return true;
}

void Scheduler::update() {
    unsigned long currentMillis = millis();
    for (uint8_t i = 0; i < _taskCount; i++) {
        if (_tasks[i].enabled) {
            if (currentMillis - _tasks[i].lastRun >= _tasks[i].interval) {
                _tasks[i].lastRun = currentMillis;
                _tasks[i].callback();
            }
        }
    }
}
