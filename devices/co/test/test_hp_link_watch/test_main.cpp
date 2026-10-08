// Testy HeatPumpLinkWatch: kiedy uznać, że CHPC przestał odpowiadać (3 kolejne odczyty bez odpowiedzi), żeby
// telemetria nie niosła w kółko starych temperatur. Uruchamianie: pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <hp_link_watch.hpp>

void setUp() {}
void tearDown() {}

void testFirstReadAfterBootIsNotAMiss()
{
  HeatPumpLinkWatch watch;
  TEST_ASSERT_FALSE(watch.onReadScheduled(false));
  TEST_ASSERT_EQUAL_UINT8(0, watch.missedReads());
}

void testSingleLostFrameDoesNotClearData()
{
  HeatPumpLinkWatch watch;
  watch.onReadScheduled(false);
  TEST_ASSERT_FALSE(watch.onReadScheduled(true)); // jedna zgubiona odpowiedź
  watch.onResponse();
  TEST_ASSERT_EQUAL_UINT8(0, watch.missedReads());
  TEST_ASSERT_FALSE(watch.lost());
}

void testThreeMissesInARowMarkTheLinkLost()
{
  HeatPumpLinkWatch watch;
  TEST_ASSERT_FALSE(watch.onReadScheduled(true));
  TEST_ASSERT_FALSE(watch.onReadScheduled(true));
  TEST_ASSERT_TRUE(watch.onReadScheduled(true));
  TEST_ASSERT_TRUE(watch.lost());
}

void testStaysLostWhileCHPCKeepsSilent()
{
  HeatPumpLinkWatch watch;
  for (int i = 0; i < 40; i++) watch.onReadScheduled(true);
  TEST_ASSERT_TRUE(watch.lost());
  TEST_ASSERT_TRUE(watch.onReadScheduled(true));
}

void testAnyResponseRestoresTheLink()
{
  HeatPumpLinkWatch watch;
  for (int i = 0; i < 5; i++) watch.onReadScheduled(true);
  TEST_ASSERT_TRUE(watch.lost());
  watch.onResponse();
  TEST_ASSERT_FALSE(watch.lost());
  TEST_ASSERT_EQUAL_UINT8(0, watch.missedReads());
  // po powrocie znów trzeba trzech kolejnych braków odpowiedzi
  TEST_ASSERT_FALSE(watch.onReadScheduled(true));
  TEST_ASSERT_FALSE(watch.onReadScheduled(true));
  TEST_ASSERT_TRUE(watch.onReadScheduled(true));
}

void testCounterDoesNotWrapAround()
{
  HeatPumpLinkWatch watch;
  for (int i = 0; i < 1000; i++) watch.onReadScheduled(true);
  TEST_ASSERT_EQUAL_UINT8(255, watch.missedReads());
  TEST_ASSERT_TRUE(watch.lost());
}

int runAllTests()
{
  UNITY_BEGIN();
  RUN_TEST(testFirstReadAfterBootIsNotAMiss);
  RUN_TEST(testSingleLostFrameDoesNotClearData);
  RUN_TEST(testThreeMissesInARowMarkTheLinkLost);
  RUN_TEST(testStaysLostWhileCHPCKeepsSilent);
  RUN_TEST(testAnyResponseRestoresTheLink);
  RUN_TEST(testCounterDoesNotWrapAround);
  return UNITY_END();
}

#ifdef ARDUINO
void setup()
{
  delay(2000);
  runAllTests();
}

void loop()
{
}
#else
int main()
{
  return runAllTests();
}
#endif
