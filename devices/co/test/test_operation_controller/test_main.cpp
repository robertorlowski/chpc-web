// Testy OperationController, parsera operacji i CopEstimator: scalanie
// operacji z chmury, brak powtórnych komend, tryby sterownika, sekwencja OFF,
// force z PV (pv_force), tryb lokalny ręczny, stary kontrakt w parserze, ponowne wysyłanie przy
// niezgodności raportu CHPC, szacunek COP (na bieżąco, pojemność, przerwa przy pompie CO kotła).
// Komendy zbiera RecordingSink zamiast SerialBus. pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <cop_estimator.hpp>
#include <operation_controller.hpp>
#include <operation_parser.hpp>
#include "../../src/cop_estimator.cpp"
#include "../../src/operation_controller.cpp"
#include "../../src/operation_parser.cpp"

namespace {
struct RecordedCommand {
  SERIAL_OPERATION operation;
  double value;
};

class RecordingSink : public CommandSink {
public:
  bool enqueue(SERIAL_OPERATION operation, double value = 0.0) override
  {
    return record(operation, value, false);
  }

  bool enqueuePriority(SERIAL_OPERATION operation, double value = 0.0) override
  {
    return record(operation, value, true);
  }

  bool record(SERIAL_OPERATION operation, double value, bool priority)
  {
    if (!acceptCommands) return false;
    if (count >= CAPACITY) return false;
    commands[count++] = {operation, value};
    priorities[count - 1] = priority;
    return true;
  }

  void clear()
  {
    count = 0;
  }

  static constexpr size_t CAPACITY = 32;
  RecordedCommand commands[CAPACITY]{};
  bool priorities[CAPACITY]{};
  size_t count = 0;
  bool acceptCommands = true;
};

ServerOperationState modePatch(WORK_MODE mode)
{
  ServerOperationState patch;
  patch.workMode.present = true;
  patch.workMode.value = mode;
  return patch;
}

ServerOperationState temperaturePatch(WORK_MODE mode, double minimum, double maximum)
{
  ServerOperationState patch = modePatch(mode);
  patch.tempMin.present = true;
  patch.tempMin.value = minimum;
  patch.tempMax.present = true;
  patch.tempMax.value = maximum;
  return patch;
}

bool wasSent(const RecordingSink &sink, SERIAL_OPERATION operation);
HeatPumpReport report(bool coOn, bool force, bool running);

void testRepeatedOperationDoesNotScheduleCommandsAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState patch = modePatch(WORK_MODE::AUTO);

  controller.applyServerPatch(patch);
  TEST_ASSERT_EQUAL_UINT32(3, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_ON, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_DOUBLE(45.0, sink.commands[1].value);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_DELTA_CO, sink.commands[2].operation);
  TEST_ASSERT_EQUAL_DOUBLE(10.0, sink.commands[2].value);

  sink.clear();
  controller.applyServerPatch(patch);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testEmptyPatchDoesNotApplyDefaults()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState empty;

  controller.applyServerPatch(empty);

  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testOnlyChangedServerFieldIsScheduled()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState patch = modePatch(WORK_MODE::AUTO);
  patch.hotPump.present = true;
  patch.hotPump.value = true;
  controller.applyServerPatch(patch);

  sink.clear();
  controller.applyServerPatch(patch);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  ServerOperationState changed;
  changed.hotPump.present = true;
  changed.hotPump.value = false;
  controller.applyServerPatch(changed);

  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_OFF,
    sink.commands[0].operation);
}

void testOffHasPriorityAndIsNotRepeated()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState running = modePatch(WORK_MODE::AUTO);
  running.force.present = true;
  running.force.value = true;
  running.hotPump.present = true;
  running.hotPump.value = true;
  controller.applyServerPatch(running);

  sink.clear();
  ServerOperationState off = modePatch(WORK_MODE::OFF);
  controller.applyServerPatch(off);

  TEST_ASSERT_EQUAL_UINT32(4, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_OFF, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_OFF, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_OFF, sink.commands[2].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_COLD_PUMP_OFF, sink.commands[3].operation);
  TEST_ASSERT_TRUE(sink.priorities[0]);
  TEST_ASSERT_TRUE(sink.priorities[1]);
  TEST_ASSERT_TRUE(sink.priorities[2]);
  TEST_ASSERT_TRUE(sink.priorities[3]);

  sink.clear();
  controller.applyServerPatch(off);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testPumpsCanBeForcedManuallyInOff()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::OFF));

  sink.clear();
  ServerOperationState hot;
  hot.hotPump.present = true;
  hot.hotPump.value = true;
  controller.applyServerPatch(hot);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_ON, sink.commands[0].operation);

  // kolejna odpowiedź chmury z tym samym "1" niczego nie powtarza
  sink.clear();
  controller.applyServerPatch(hot);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  ServerOperationState cold;
  cold.coldPump.present = true;
  cold.coldPump.value = true;
  controller.applyServerPatch(cold);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_COLD_PUMP_ON, sink.commands[0].operation);

  sink.clear();
  hot.hotPump.value = false;
  controller.applyServerPatch(hot);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_OFF, sink.commands[0].operation);
}

void testSwitchToOffKeepsPumpRequestedInSameOperation()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState running = modePatch(WORK_MODE::AUTO);
  running.coldPump.present = true;
  running.coldPump.value = true;
  controller.applyServerPatch(running);

  sink.clear();
  ServerOperationState off = modePatch(WORK_MODE::OFF);
  off.hotPump.present = true;
  off.hotPump.value = true;
  controller.applyServerPatch(off);

  TEST_ASSERT_EQUAL_UINT32(4, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_OFF, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_OFF, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_ON, sink.commands[2].operation);
  // zimna była włączona przed OFF, a ta operacja jej nie podaje: wyłączona
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_COLD_PUMP_OFF, sink.commands[3].operation);
}

void testPvForceFollowsConfiguration()
{
  RecordingSink sink;
  OperationController controller(sink, 2000);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  PV highProduction;
  highProduction.pv_power = true;
  highProduction.total_power = 2500;

  // bez pv_force produkcja PV nie wymusza startu
  sink.clear();
  controller.updatePv(highProduction);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  ServerOperationState config;
  config.pvForce.present = true;
  config.pvForce.value = true;
  controller.applyServerPatch(config);
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_HP_FORCE_ON));
}

void testLocalOffIsIndependentFromCloudWorkMode()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  sink.clear();

  controller.setControllerMode(ControllerMode::OFF);

  TEST_ASSERT_EQUAL_INT(static_cast<int>(ControllerMode::OFF),
    static_cast<int>(controller.controllerMode()));
  TEST_ASSERT_EQUAL_INT(WORK_MODE::AUTO, controller.preferences().workMode);
  TEST_ASSERT_EQUAL_UINT32(4, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_OFF, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_OFF, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HOT_PUMP_OFF, sink.commands[2].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_COLD_PUMP_OFF, sink.commands[3].operation);

  controller.applyServerPatch(modePatch(WORK_MODE::MANUAL));
  TEST_ASSERT_EQUAL_INT(WORK_MODE::AUTO, controller.preferences().workMode);
}

// Ręczny lokalnie (przycisk): grzanie na ostatniej temperaturze od–do z chmury, bez operacji z chmury
// i bez wymuszenia (także z PV).
void testLocalManualHeatsWithLastCloudTemperatures()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState heating = temperaturePatch(WORK_MODE::OFF, 30, 40);
  heating.pvForce.present = true;
  heating.pvForce.value = true;
  controller.applyServerPatch(heating);
  sink.clear();

  controller.setControllerMode(ControllerMode::MANUAL);
  // CO, temperatury i (po OFF z chmury) pompy wyłączone; bez wymuszenia
  TEST_ASSERT_FALSE(wasSent(sink, SERIAL_OPERATION::SET_HP_FORCE_ON));
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_ON, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_DOUBLE(40, sink.commands[1].value);
  TEST_ASSERT_EQUAL_DOUBLE(10, sink.commands[2].value);

  sink.clear();
  controller.applyServerPatch(temperaturePatch(WORK_MODE::AUTO, 20, 25));
  PV highProduction;
  highProduction.pv_power = true;
  highProduction.total_power = 5000;
  controller.updatePv(highProduction);
  controller.tick();
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
  TEST_ASSERT_EQUAL_DOUBLE(40, controller.preferences().tempMax);
}

void testInvalidTemperatureRangeIsIgnored()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  sink.clear();

  ServerOperationState invalid;
  invalid.tempMin.present = true;
  invalid.tempMin.value = 49;
  controller.applyServerPatch(invalid);

  TEST_ASSERT_EQUAL_DOUBLE(35, controller.preferences().tempMin);
  TEST_ASSERT_EQUAL_DOUBLE(45, controller.preferences().tempMax);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testRejectedQueueCommandIsRetried()
{
  RecordingSink sink;
  sink.acceptCommands = false;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  sink.acceptCommands = true;
  controller.tick();

  TEST_ASSERT_EQUAL_UINT32(3, sink.count);
}

void testOperationParserAcceptsTypedValues()
{
  JsonDocument document;
  deserializeJson(document,
    "{\"work_mode\":\"A\",\"force\":1,\"co_max\":46.6}");

  OperationParseResult parsed = parseServerOperation(document.as<JsonObjectConst>());

  TEST_ASSERT_EQUAL_UINT16(0, parsed.invalidValues);
  TEST_ASSERT_TRUE(parsed.state.workMode.present);
  TEST_ASSERT_EQUAL_INT(WORK_MODE::AUTO, parsed.state.workMode.value);
  TEST_ASSERT_TRUE(parsed.state.force.present);
  TEST_ASSERT_TRUE(parsed.state.force.value);
  // stary serwer: tryb A = AUTO, temperatura z pary co_*
  TEST_ASSERT_TRUE(parsed.state.tempMax.present);
  TEST_ASSERT_EQUAL_DOUBLE(47, parsed.state.tempMax.value);
}

void testOperationParserReadsNewContractAndOldCwuPair()
{
  JsonDocument fresh;
  deserializeJson(fresh, R"({"work_mode":"MANUAL","temp_min":"33","temp_max":"44","cwu_max":"50",)"
    R"("pv_force":"1","pv_dtu":"0","tank_liters":"200","cop_pause":"1","co_pomp":"1"})");
  OperationParseResult parsed = parseServerOperation(fresh.as<JsonObjectConst>());
  TEST_ASSERT_EQUAL_UINT16(0, parsed.invalidValues);
  TEST_ASSERT_EQUAL_INT(WORK_MODE::MANUAL, parsed.state.workMode.value);
  TEST_ASSERT_EQUAL_DOUBLE(33, parsed.state.tempMin.value);
  TEST_ASSERT_EQUAL_DOUBLE(44, parsed.state.tempMax.value);
  TEST_ASSERT_TRUE(parsed.state.pvForce.value);
  TEST_ASSERT_FALSE(parsed.state.pvDtu.value);
  TEST_ASSERT_EQUAL_DOUBLE(200, parsed.state.tankLiters.value);
  TEST_ASSERT_TRUE(parsed.state.copPause.value);

  // stary serwer, tryb CWU: ręczny z parą cwu_*
  JsonDocument old;
  deserializeJson(old, R"({"work_mode":"CWU","co_min":"30","co_max":"35","cwu_min":"40","cwu_max":"47"})");
  parsed = parseServerOperation(old.as<JsonObjectConst>());
  TEST_ASSERT_EQUAL_INT(WORK_MODE::MANUAL, parsed.state.workMode.value);
  TEST_ASSERT_EQUAL_DOUBLE(40, parsed.state.tempMin.value);
  TEST_ASSERT_EQUAL_DOUBLE(47, parsed.state.tempMax.value);
}

void testOperationParserRejectsInvalidValues()
{
  JsonDocument document;
  deserializeJson(document,
    "{\"work_mode\":\"UNKNOWN\",\"force\":2,\"working_watt\":30000}");

  OperationParseResult parsed = parseServerOperation(document.as<JsonObjectConst>());

  TEST_ASSERT_EQUAL_UINT16(3, parsed.invalidValues);
  TEST_ASSERT_FALSE(parsed.state.workMode.present);
  TEST_ASSERT_FALSE(parsed.state.force.present);
  TEST_ASSERT_FALSE(parsed.state.workingWatt.present);
}

void testOperationParserLimitsEevSetpoint()
{
  // 0 (wyczyszczone pole w aplikacji) dawało przegrzanie 0 °C zapisane w EEPROM CHPC
  const char *rejected[] = {"{\"eev_setpoint\":\"0\"}", "{\"eev_setpoint\":\"8.5\"}"};
  for (const char *json : rejected) {
    JsonDocument document;
    deserializeJson(document, json);
    OperationParseResult parsed = parseServerOperation(document.as<JsonObjectConst>());
    TEST_ASSERT_EQUAL_UINT16(1, parsed.invalidValues);
    TEST_ASSERT_FALSE(parsed.state.eevSetpoint.present);
  }

  JsonDocument document;
  deserializeJson(document, "{\"eev_setpoint\":\"2.5\"}");
  OperationParseResult parsed = parseServerOperation(document.as<JsonObjectConst>());
  TEST_ASSERT_TRUE(parsed.state.eevSetpoint.present);
  TEST_ASSERT_EQUAL_DOUBLE(2.5, parsed.state.eevSetpoint.value);
}

void testOffSendsTemperaturesAtOnce()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(temperaturePatch(WORK_MODE::AUTO, 30, 40));
  controller.applyServerPatch(modePatch(WORK_MODE::OFF));

  // zmiana temperatury w OFF idzie od razu
  sink.clear();
  controller.applyServerPatch(temperaturePatch(WORK_MODE::OFF, 32, 45));

  TEST_ASSERT_EQUAL_UINT32(2, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(45, sink.commands[0].value);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_DELTA_CO, sink.commands[1].operation);
  TEST_ASSERT_EQUAL_DOUBLE(13, sink.commands[1].value);
}

void testAutoPvChangesForceOnlyAtThresholdTransitions()
{
  RecordingSink sink;
  OperationController controller(sink, 2000);
  ServerOperationState pvForce = modePatch(WORK_MODE::AUTO);
  pvForce.pvForce.present = true;
  pvForce.pvForce.value = true;
  controller.applyServerPatch(pvForce);

  sink.clear();
  PV highProduction;
  highProduction.pv_power = true;
  highProduction.total_power = 2500;
  controller.updatePv(highProduction);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_ON,
    sink.commands[0].operation);

  sink.clear();
  controller.updatePv(highProduction);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  PV lowProduction;
  lowProduction.pv_power = false;
  lowProduction.total_power = 1500;
  controller.updatePv(lowProduction);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_OFF,
    sink.commands[0].operation);
}

void testPartialPatchPreservesPreviousServerValues()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState initial = modePatch(WORK_MODE::AUTO);
  initial.workingWatt.present = true;
  initial.workingWatt.value = 3500;
  controller.applyServerPatch(initial);

  sink.clear();
  ServerOperationState temperatureOnly;
  temperatureOnly.tempMax.present = true;
  temperatureOnly.tempMax.value = 46;
  controller.applyServerPatch(temperatureOnly);

  TEST_ASSERT_TRUE(controller.serverState().workingWatt.present);
  TEST_ASSERT_EQUAL_DOUBLE(3500, controller.serverState().workingWatt.value);
  TEST_ASSERT_EQUAL_UINT32(2, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO,
    sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(46, sink.commands[0].value);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_DELTA_CO,
    sink.commands[1].operation);
  TEST_ASSERT_EQUAL_DOUBLE(11, sink.commands[1].value);
}

void testEevMaximumIsSentBeforeMinimum()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));

  sink.clear();
  ServerOperationState limits;
  limits.eevMinPulseOpen.present = true;
  limits.eevMinPulseOpen.value = 65;
  limits.eevMaxPulseOpen.present = true;
  limits.eevMaxPulseOpen.value = 80;
  controller.applyServerPatch(limits);

  TEST_ASSERT_EQUAL_UINT32(2, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_EEV_MAXPULSES_OPEN,
    sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(80, sink.commands[0].value);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_EEV_MINWORKPOS,
    sink.commands[1].operation);
  TEST_ASSERT_EQUAL_DOUBLE(65, sink.commands[1].value);

  sink.clear();
  ServerOperationState minimumOnly;
  minimumOnly.eevMinPulseOpen.present = true;
  minimumOnly.eevMinPulseOpen.value = 40;
  controller.applyServerPatch(minimumOnly);

  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_EEV_MINWORKPOS,
    sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(40, sink.commands[0].value);
}

void testMaintenanceActionsAreSentOnceAndNotKept()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));

  sink.clear();
  ServerOperationState reset;
  reset.errorReset.present = true;
  reset.errorReset.value = true;
  controller.applyServerPatch(reset);

  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::HP_ERROR_RESET, sink.commands[0].operation);
  TEST_ASSERT_TRUE(sink.priorities[0]);
  TEST_ASSERT_FALSE(controller.serverState().errorReset.present);

  // The next ordinary operation does not repeat the action.
  sink.clear();
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  // A second request is a new action and is sent again.
  controller.applyServerPatch(reset);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
}

void testRestartResendsTheWholeStateAfterwards()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState running = modePatch(WORK_MODE::AUTO);
  running.hotPump.present = true;
  running.hotPump.value = true;
  controller.applyServerPatch(running);

  sink.clear();
  ServerOperationState restart;
  restart.restart.present = true;
  restart.restart.value = true;
  controller.applyServerPatch(restart);

  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::HP_RESTART, sink.commands[0].operation);

  // CHPC lost its forced pumps, so the same operation is sent in full again.
  sink.clear();
  controller.applyServerPatch(running);
  TEST_ASSERT_TRUE(sink.count >= 4);
  bool hotPumpSent = false;
  for (size_t index = 0; index < sink.count; index++) {
    if (sink.commands[index].operation == SERIAL_OPERATION::SET_HOT_PUMP_ON) hotPumpSent = true;
  }
  TEST_ASSERT_TRUE(hotPumpSent);
}

HeatPumpReport report(bool coOn, bool force, bool running)
{
  HeatPumpReport result;
  result.coOn = coOn;
  result.force = force;
  result.running = running;
  return result;
}

bool wasSent(const RecordingSink &sink, SERIAL_OPERATION operation)
{
  for (size_t index = 0; index < sink.count; index++) {
    if (sink.commands[index].operation == operation) return true;
  }
  return false;
}

void testCoReportedOffIsSentAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));

  // CHPC missed the command, e.g. it was disconnected at the time.
  sink.clear();
  controller.updateHeatPumpReport(report(false, false, false));
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_ON, sink.commands[0].operation);

  sink.clear();
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testCloudOffKeepsCoOff()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::OFF));

  sink.clear();
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_CO_OFF, sink.commands[0].operation);
  TEST_ASSERT_TRUE(sink.priorities[0]);
}

void testForceIsSentAgainOnlyWhileIdle()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState patch = modePatch(WORK_MODE::AUTO);
  patch.force.present = true;
  patch.force.value = true;
  controller.applyServerPatch(patch);

  // Running without force is a normal start; CHPC would ignore force anyway.
  sink.clear();
  controller.updateHeatPumpReport(report(true, false, true));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  // CHPC cleared force when it stopped.
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_HP_FORCE_ON, sink.commands[0].operation);
}

void testForceIsNotCheckedBeforeServerSendsIt()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));

  sink.clear();
  controller.updateHeatPumpReport(report(true, true, false));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testLostHeatPumpGetsWholeStateBack()
{
  RecordingSink sink;
  OperationController controller(sink);
  ServerOperationState patch = modePatch(WORK_MODE::AUTO);
  patch.hotPump.present = true;
  patch.hotPump.value = true;
  controller.applyServerPatch(patch);

  sink.clear();
  controller.heatPumpLost();
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_HP_CO_ON));
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_T_SETPOINT_CO));
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_HOT_PUMP_ON));

  // Only the first report after the loss resends everything.
  sink.clear();
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testLocalOffTurnsCoOffAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.setControllerMode(ControllerMode::OFF);

  sink.clear();
  controller.updateHeatPumpReport(report(false, false, false));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  // CO switched back on at the pump itself.
  controller.updateHeatPumpReport(report(true, false, false));
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_HP_CO_OFF));
}

void testLocalManualResendsStateAfterLoss()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(modePatch(WORK_MODE::AUTO));
  controller.setControllerMode(ControllerMode::MANUAL);

  sink.clear();
  controller.heatPumpLost();
  controller.updateHeatPumpReport(report(false, false, false));
  TEST_ASSERT_TRUE(wasSent(sink, SERIAL_OPERATION::SET_HP_CO_ON));
}

HeatPumpReport temperatureReport(double setpoint, double minimum)
{
  HeatPumpReport result = report(true, false, false);
  result.hasTemperatures = true;
  result.setpoint = setpoint;
  result.minimum = minimum;
  return result;
}


void testLostDeltaIsSentAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(temperaturePatch(WORK_MODE::AUTO, 35, 45));

  // The case seen on 2026-09-26: the setpoint arrived, the delta frame did
  // not, so CHPC kept the CWU delta of 23 and reported Tmin 22.
  sink.clear();
  controller.updateHeatPumpReport(temperatureReport(45, 22));
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_DELTA_CO, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(10.0, sink.commands[0].value);

  sink.clear();
  controller.updateHeatPumpReport(temperatureReport(45, 35));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testLostSetpointIsSentAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(temperaturePatch(WORK_MODE::MANUAL, 25, 48));

  // Delta 23 already matches, only the setpoint of the previous mode is left.
  sink.clear();
  controller.updateHeatPumpReport(temperatureReport(45, 22));
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(48.0, sink.commands[0].value);
}

void testRoundedTemperaturesAreNotSentAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(temperaturePatch(WORK_MODE::AUTO, 35.25, 45.75));

  // CHPC prints one decimal.
  sink.clear();
  controller.updateHeatPumpReport(temperatureReport(45.8, 35.3));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

void testDeltaChpcRejectsIsNotSentAgain()
{
  RecordingSink sink;
  OperationController controller(sink);
  // Delta 35 is above the CHPC limit of 30, so CHPC keeps its old one.
  controller.applyServerPatch(temperaturePatch(WORK_MODE::AUTO, 10, 45));

  sink.clear();
  controller.updateHeatPumpReport(temperatureReport(45, 22));
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);
}

// W OFF temperatura od–do jest pilnowana jak w pozostałych trybach.
void testTemperaturesAreCheckedInOffMode()
{
  RecordingSink sink;
  OperationController controller(sink);
  controller.applyServerPatch(temperaturePatch(WORK_MODE::OFF, 25, 48));

  sink.clear();
  HeatPumpReport matching = temperatureReport(48, 25);
  matching.coOn = false;
  controller.updateHeatPumpReport(matching);
  TEST_ASSERT_EQUAL_UINT32(0, sink.count);

  HeatPumpReport offReport = temperatureReport(45, 22);
  offReport.coOn = false;
  controller.updateHeatPumpReport(offReport);
  TEST_ASSERT_EQUAL_UINT32(1, sink.count);
  TEST_ASSERT_EQUAL_INT(SERIAL_OPERATION::SET_T_SETPOINT_CO, sink.commands[0].operation);
  TEST_ASSERT_EQUAL_DOUBLE(48, sink.commands[0].value);
}

void testReportedTemperatureStringsAreParsed()
{
  // CHPC sends every value as a string; main.cpp relies on as<double>().
  JsonDocument document;
  deserializeJson(document, R"({"Tmax":"45.0","Tmin":"22.0"})");
  TEST_ASSERT_EQUAL_DOUBLE(45.0, document["Tmax"].as<double>());
  TEST_ASSERT_EQUAL_DOUBLE(22.0, document["Tmin"].as<double>());
}

void testOperationParserReadsEevMinimum()
{
  JsonDocument document;
  deserializeJson(document,
    "{\"eev_min_pulse_open\":\"45\",\"eev_max_pulse_open\":\"61\"}");

  OperationParseResult parsed = parseServerOperation(document.as<JsonObjectConst>());

  TEST_ASSERT_EQUAL_UINT16(0, parsed.invalidValues);
  TEST_ASSERT_TRUE(parsed.state.eevMinPulseOpen.present);
  TEST_ASSERT_EQUAL_DOUBLE(45, parsed.state.eevMinPulseOpen.value);
  TEST_ASSERT_TRUE(parsed.state.eevMaxPulseOpen.present);
  TEST_ASSERT_EQUAL_DOUBLE(61, parsed.state.eevMaxPulseOpen.value);
}

void testCopIsLiveAndCompletedAfterHeatPumpStops()
{
  CopEstimator estimator;

  TEST_ASSERT_EQUAL_INT(static_cast<int>(CopCycleEvent::STARTED),
    static_cast<int>(estimator.update(true, 40.0, 30.0, 100.0, 10)));
  TEST_ASSERT_FALSE(estimator.estimate().valid);

  // od 1.2.0 wynik na bieżąco w trakcie pracy
  estimator.update(true, 38.0, 35.0, 800.0, 40);
  estimator.update(true, 45.0, 40.0, 1500.0, 80);
  TEST_ASSERT_TRUE(estimator.estimate().valid);

  TEST_ASSERT_EQUAL_INT(static_cast<int>(CopCycleEvent::COMPLETED),
    static_cast<int>(estimator.update(false, 44.0, 41.0, 1600.0, 100)));

  const CopEstimate &estimate = estimator.estimate();
  TEST_ASSERT_TRUE(estimate.valid);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 38.0, estimate.startBottomTemperature);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 1.472, estimate.minimum);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 1.635, estimate.maximum);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 1.553, estimate.estimated);
}

void testCopBottomEstimateUsesOnlyStartupWindow()
{
  CopEstimator estimator;
  estimator.update(true, 40.0, 30.0, 0.0, 5);
  estimator.update(true, 36.0, 32.0, 200.0, 50);
  estimator.update(true, 30.0, 34.0, 400.0, 70);
  estimator.update(false, 42.0, 38.0, 1000.0, 100);

  TEST_ASSERT_DOUBLE_WITHIN(0.001, 36.0,
    estimator.estimate().startBottomTemperature);
}

// Start cyklu = najniższa temperatura środka; ciepło proporcjonalne do pojemności zbiornika.
void testCopUsesLowestMiddleTemperatureAndTankSize()
{
  CopEstimator big;
  CopEstimator small;
  small.setTankLiters(150);
  CopEstimator *estimators[] = {&big, &small};
  for (CopEstimator *estimator : estimators) {
    estimator->update(true, 40.0, 32.0, 100.0, 10);
    estimator->update(true, 39.0, 30.0, 400.0, 40);
    estimator->update(false, 45.0, 40.0, 1500.0, 100);
  }
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 30.0, big.estimate().startMiddleTemperature);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, big.estimate().estimated / 2.0, small.estimate().estimated);
  // poza zakresem 20–2000 l zostaje poprzednia pojemność
  small.setTankLiters(5);
  TEST_ASSERT_DOUBLE_WITHIN(0.001, 150.0, small.tankLiters());
}

// Pompa CO kotła pracuje (cop_pause): cykl bez wyniku do końca, kolejny cykl liczony od nowa.
void testCopPausedCycleHasNoResult()
{
  CopEstimator estimator;
  estimator.update(true, 40.0, 30.0, 100.0, 10);
  estimator.update(true, 42.0, 35.0, 800.0, 40, true);
  estimator.update(true, 45.0, 40.0, 1500.0, 80);
  estimator.update(false, 44.0, 41.0, 1600.0, 100);
  TEST_ASSERT_FALSE(estimator.estimate().valid);

  estimator.update(true, 40.0, 30.0, 100.0, 10);
  estimator.update(true, 45.0, 40.0, 1500.0, 80);
  TEST_ASSERT_TRUE(estimator.estimate().valid);
}
}

int runAllTests()
{
  UNITY_BEGIN();
  RUN_TEST(testRepeatedOperationDoesNotScheduleCommandsAgain);
  RUN_TEST(testEmptyPatchDoesNotApplyDefaults);
  RUN_TEST(testOnlyChangedServerFieldIsScheduled);
  RUN_TEST(testOffHasPriorityAndIsNotRepeated);
  RUN_TEST(testPumpsCanBeForcedManuallyInOff);
  RUN_TEST(testOperationParserLimitsEevSetpoint);
  RUN_TEST(testOffSendsTemperaturesAtOnce);
  RUN_TEST(testSwitchToOffKeepsPumpRequestedInSameOperation);
  RUN_TEST(testAutoPvChangesForceOnlyAtThresholdTransitions);
  RUN_TEST(testPartialPatchPreservesPreviousServerValues);
  RUN_TEST(testPvForceFollowsConfiguration);
  RUN_TEST(testLocalOffIsIndependentFromCloudWorkMode);
  RUN_TEST(testLocalManualHeatsWithLastCloudTemperatures);
  RUN_TEST(testInvalidTemperatureRangeIsIgnored);
  RUN_TEST(testRejectedQueueCommandIsRetried);
  RUN_TEST(testOperationParserAcceptsTypedValues);
  RUN_TEST(testOperationParserRejectsInvalidValues);
  RUN_TEST(testOperationParserReadsNewContractAndOldCwuPair);
  RUN_TEST(testEevMaximumIsSentBeforeMinimum);
  RUN_TEST(testOperationParserReadsEevMinimum);
  RUN_TEST(testMaintenanceActionsAreSentOnceAndNotKept);
  RUN_TEST(testRestartResendsTheWholeStateAfterwards);
  RUN_TEST(testCoReportedOffIsSentAgain);
  RUN_TEST(testCloudOffKeepsCoOff);
  RUN_TEST(testForceIsSentAgainOnlyWhileIdle);
  RUN_TEST(testForceIsNotCheckedBeforeServerSendsIt);
  RUN_TEST(testLostHeatPumpGetsWholeStateBack);
  RUN_TEST(testLocalOffTurnsCoOffAgain);
  RUN_TEST(testLocalManualResendsStateAfterLoss);
  RUN_TEST(testLostDeltaIsSentAgain);
  RUN_TEST(testLostSetpointIsSentAgain);
  RUN_TEST(testRoundedTemperaturesAreNotSentAgain);
  RUN_TEST(testDeltaChpcRejectsIsNotSentAgain);
  RUN_TEST(testTemperaturesAreCheckedInOffMode);
  RUN_TEST(testReportedTemperatureStringsAreParsed);
  RUN_TEST(testCopIsLiveAndCompletedAfterHeatPumpStops);
  RUN_TEST(testCopBottomEstimateUsesOnlyStartupWindow);
  RUN_TEST(testCopUsesLowestMiddleTemperatureAndTankSize);
  RUN_TEST(testCopPausedCycleHasNoResult);
  return UNITY_END();
}

#ifdef ARDUINO
void setup()
{
  // The runner needs the serial link up before the first report.
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
