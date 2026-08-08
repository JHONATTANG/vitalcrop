#include <Arduino.h>
#include <unity.h>

void setUp(void) {
    // set stuff up here
}

void tearDown(void) {
    // clean stuff up here
}

void test_sensor_initialization(void) {
    // Basic connectivity test placeholder
    TEST_ASSERT_EQUAL(1, 1);
}

void setup() {
    delay(2000); // Give port time to open
    UNITY_BEGIN();
    RUN_TEST(test_sensor_initialization);
    UNITY_END();
}

void loop() {
    // Not used in PlatformIO tests usually
    delay(100);
}
