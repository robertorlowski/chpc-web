// Zamiana stanu z chmury na komendy RS-485 do CHPC. Kontrakt operacji: CLAUDE.md, punkt 7;
// semantyka trybów: docs/server-driven-refactor-2026-09-20.md, punkt 6. Od 1.2.0 tryb pracy
// MANUAL / AUTO / OFF i jedna temperatura od–do (bez podziału CO/CWU i bez przekaźników),
// wymuszenie przy produkcji PV według konfiguracji pompy (pv_force).
#include <operation_controller.hpp>

#include <cmath>

namespace {
// CHPC ignores a setpoint or delta above these limits (T_SETPOINT_MAX and
// T_DELTA_MAX in its firmware), so such a value is not sent again.
constexpr double CHPC_SETPOINT_MAX = 50.0;
constexpr double CHPC_DELTA_MAX = 30.0;
// CHPC prints one decimal, so the reported difference of two values can be
// off by 0.1.
constexpr double REPORTED_TEMPERATURE_TOLERANCE = 0.11;

bool reportedDiffers(double reported, double wanted)
{
  return std::fabs(reported - wanted) > REPORTED_TEMPERATURE_TOLERANCE;
}
}

OperationController::OperationController(CommandSink &commands, long pvForceThreshold)
  : commands(commands), pvForceThreshold(pvForceThreshold)
{
}

void OperationController::applyServerPatch(const ServerOperationState &patch)
{
  // Maintenance actions run in every controller mode and are not kept: the
  // server sends each one once.
  // Uwaga: main.cpp (applyServerOperation) przekazuje operację tylko w trybie
  // CLOUD, więc w praktyce akcje działają wyłącznie w CLOUD.
  if (patch.errorReset.present && patch.errorReset.value)
    commands.enqueuePriority(SERIAL_OPERATION::HP_ERROR_RESET);
  if (patch.restart.present && patch.restart.value) {
    commands.enqueuePriority(SERIAL_OPERATION::HP_RESTART);
    // CHPC forgets its non-persistent state (forced pumps, force start), so
    // everything is sent again with the next server operation.
    resetScheduledState();
  }

  if (localMode != ControllerMode::CLOUD) return;

  ServerOperationState accepted = patch;
  accepted.errorReset = {};
  accepted.restart = {};
  if (!hasServerOperationValues(accepted)) return;

  DeviceSettings nextPreferences = prefs;
  if (accepted.workMode.present) nextPreferences.workMode = accepted.workMode.value;
  if (accepted.tempMin.present) nextPreferences.tempMin = accepted.tempMin.value;
  if (accepted.tempMax.present) nextPreferences.tempMax = accepted.tempMax.value;
  if (accepted.pvForce.present) nextPreferences.pvForce = accepted.pvForce.value;
  if (accepted.pvDtu.present) nextPreferences.pvDtu = accepted.pvDtu.value;
  if (accepted.tankLiters.present) nextPreferences.tankLiters = accepted.tankLiters.value;
  if (accepted.copPause.present) nextPreferences.copPause = accepted.copPause.value;

  if (nextPreferences.tempMin > nextPreferences.tempMax) {
    preferenceValidationErrors++;
    accepted.tempMin.present = false;
    accepted.tempMax.present = false;
    nextPreferences.tempMin = prefs.tempMin;
    nextPreferences.tempMax = prefs.tempMax;
  }

  if (!hasServerOperationValues(accepted)) return;

  bool serverModeChanged = accepted.workMode.present
    && (!desired.workMode.present || desired.workMode.value != accepted.workMode.value);

  mergeServerOperation(desired, accepted);
  prefs = nextPreferences;
  cloudStateReady = true;

  if (serverModeChanged) {
    modeChanged = true;
    if (prefs.workMode == WORK_MODE::OFF) {
      // Przejście na OFF wyłącza pompy, chyba że ta sama operacja każe którąś włączyć;
      // potem w OFF działają ręczne zmiany pomp z aplikacji (CHPC przyjmuje 0x09/0x0A w każdym stanie).
      if (!accepted.hotPump.present) { desired.hotPump.present = true; desired.hotPump.value = false; }
      if (!accepted.coldPump.present) { desired.coldPump.present = true; desired.coldPump.value = false; }
      scheduleOffSequence(desired.hotPump.value, desired.coldPump.value);
    }
  }

  reconcile();
}

void OperationController::setControllerMode(ControllerMode mode)
{
  if (localMode == mode) return;

  localMode = mode;
  modeChanged = true;
  retryPending = false;

  switch (localMode) {
    case ControllerMode::OFF:
      scheduleOffSequence();
      break;

    case ControllerMode::CLOUD:
      resetScheduledState();
      if (cloudStateReady) reconcile();
      break;

    case ControllerMode::MANUAL:
      // grzanie na ostatniej temperaturze od–do z chmury, bez wymuszenia z chmury
      resetScheduledState();
      reconcile();
      break;
  }
}

void OperationController::updatePv(const PV &newPv)
{
  pv = newPv;
  if (localMode == ControllerMode::CLOUD && cloudStateReady && prefs.pvForce) reconcile();
}

void OperationController::updateHeatPumpReport(const HeatPumpReport &report)
{
  bool resync = resyncPending;
  resyncPending = false;

  if (localMode == ControllerMode::OFF) {
    // CHPC keeps CO in EEPROM, so it can come back on from the pump itself.
    if (resync || report.coOn || report.force) scheduleOffSequence();
    return;
  }
  if (!controlling()) return;

  if (resync) {
    resetScheduledState();
  } else {
    WORK_MODE mode = effectiveMode();
    // HP.CO (zgoda na start sprężarki, 0x0C) ma być 1 w każdym trybie poza OFF.
    if (report.coOn != (mode != WORK_MODE::OFF)) lastHpCo = {};

    // CHPC accepts force only while idle and clears it on every stop.
    bool force;
    if (!report.running && wantedForce(mode, force) && report.force != force)
      lastScheduled.force = {};

    // A setpoint or delta frame lost on the shared bus would otherwise leave
    // CHPC on the limits of the previous mode for good.
    // Ramki giną, bo CHPC czyta z magistrali do 49 bajtów naraz i odrzuca
    // bufor, który nie zaczyna się od jego adresu (np. gdy komenda wpadnie
    // razem z końcówką odpowiedzi DTU). Porównanie: Tmax z do, Tmax − Tmin
    // z do − od, z tolerancją 0,11 °C. Także w OFF (temperatura dochodzi od razu).
    if (report.hasTemperatures) {
      const double maximum = prefs.tempMax;
      const double delta = prefs.tempMax - prefs.tempMin;
      if (maximum <= CHPC_SETPOINT_MAX && reportedDiffers(report.setpoint, maximum))
        lastSetpoint = {};
      if (delta <= CHPC_DELTA_MAX
        && reportedDiffers(report.setpoint - report.minimum, delta))
        lastDelta = {};
    }
  }
  reconcile();
}

void OperationController::heatPumpLost()
{
  resyncPending = true;
}

void OperationController::tick()
{
  if (!retryPending) return;
  if (controlling()) reconcile();
  if (localMode == ControllerMode::OFF) {
    retryPending = false;
    scheduleOffSequence();
  }
}

ControllerMode OperationController::controllerMode() const
{
  return localMode;
}

const DeviceSettings &OperationController::preferences() const
{
  return prefs;
}

const ServerOperationState &OperationController::serverState() const
{
  return desired;
}

bool OperationController::takeModeChanged()
{
  bool changed = modeChanged;
  modeChanged = false;
  return changed;
}

uint32_t OperationController::preferenceValidationErrorCount() const
{
  return preferenceValidationErrors;
}

bool OperationController::controlling() const
{
  return localMode == ControllerMode::MANUAL
    || (localMode == ControllerMode::CLOUD && cloudStateReady);
}

WORK_MODE OperationController::effectiveMode() const
{
  return localMode == ControllerMode::MANUAL ? WORK_MODE::MANUAL : prefs.workMode;
}

// False when nothing decides force yet. OFF: never. Wymuszenie PV (pv_force w konfiguracji pompy):
// produkcja ≥ progu wymusza start; poza tym force z chmury (lokalny MANUAL go nie używa).
bool OperationController::wantedForce(WORK_MODE mode, bool &force) const
{
  if (mode == WORK_MODE::OFF) {
    force = false;
    return true;
  }
  if (localMode == ControllerMode::MANUAL) return false;
  const bool pvWanted = prefs.pvForce && pv.pv_power && pv.total_power >= pvForceThreshold;
  if (pvWanted) {
    force = true;
    return true;
  }
  if (desired.force.present) {
    force = desired.force.value;
    return true;
  }
  if (prefs.pvForce) {
    force = false;
    return true;
  }
  return false;
}

bool OperationController::scheduleBool(ServerValue<bool> &last, bool value,
  SERIAL_OPERATION onOperation, SERIAL_OPERATION offOperation,
  bool always, bool priority)
{
  if (!always && last.present && last.value == value) return true;
  bool queued = priority
    ? commands.enqueuePriority(value ? onOperation : offOperation)
    : commands.enqueue(value ? onOperation : offOperation);
  if (!queued) {
    retryPending = true;
    return false;
  }
  last.present = true;
  last.value = value;
  return true;
}

bool OperationController::scheduleDouble(ServerValue<double> &last, double value,
  SERIAL_OPERATION operation)
{
  if (last.present && last.value == value) return true;
  if (!commands.enqueue(operation, value)) {
    retryPending = true;
    return false;
  }
  last.present = true;
  last.value = value;
  return true;
}

// CO i force zawsze wyłączone; pompy według argumentów (lokalny OFF: obie wyłączone,
// work_mode OFF z chmury: stan żądany po przejściu na OFF).
void OperationController::scheduleOffSequence(bool hotPump, bool coldPump)
{
  scheduleBool(lastHpCo, false,
    SERIAL_OPERATION::SET_HP_CO_ON, SERIAL_OPERATION::SET_HP_CO_OFF, true, true);
  scheduleBool(lastScheduled.force, false,
    SERIAL_OPERATION::SET_HP_FORCE_ON, SERIAL_OPERATION::SET_HP_FORCE_OFF, true, true);
  scheduleBool(lastScheduled.hotPump, hotPump,
    SERIAL_OPERATION::SET_HOT_PUMP_ON, SERIAL_OPERATION::SET_HOT_PUMP_OFF, true, true);
  scheduleBool(lastScheduled.coldPump, coldPump,
    SERIAL_OPERATION::SET_COLD_PUMP_ON, SERIAL_OPERATION::SET_COLD_PUMP_OFF, true, true);
}

void OperationController::resetScheduledState()
{
  lastScheduled = {};
  lastHpCo = {};
  lastSetpoint = {};
  lastDelta = {};
}

// Porównuje stan żądany z ostatnio wysłanym i kolejkuje różnice w stałej
// kolejności: CO on/off, T zadana (0x04), delta (0x05), grzałka, pompy, force,
// moc, EEV. W work_mode OFF komendy wyłączające idą kolejką priorytetową.
// Lokalny MANUAL: CO, temperatury i pompy, bez force z chmury.
void OperationController::reconcile()
{
  if (!controlling()) return;
  retryPending = false;
  WORK_MODE mode = effectiveMode();

  scheduleBool(lastHpCo, mode != WORK_MODE::OFF,
    SERIAL_OPERATION::SET_HP_CO_ON, SERIAL_OPERATION::SET_HP_CO_OFF,
    false, mode == WORK_MODE::OFF);

  // Temperatury także w OFF (CHPC przyjmuje 0x04/0x05 bez zgody na pracę): zmiana z aplikacji
  // dochodzi od razu, a nie dopiero po wyjściu z OFF.
  scheduleDouble(lastSetpoint, prefs.tempMax, SERIAL_OPERATION::SET_T_SETPOINT_CO);
  scheduleDouble(lastDelta, prefs.tempMax - prefs.tempMin, SERIAL_OPERATION::SET_T_DELTA_CO);

  if (desired.sumpHeater.present)
    scheduleBool(lastScheduled.sumpHeater, desired.sumpHeater.value,
      SERIAL_OPERATION::SET_SUMP_HEATER_ON, SERIAL_OPERATION::SET_SUMP_HEATER_OFF);

  // W OFF pompy zostają wyłączone, dopóki chmura nie każe ich włączyć (ręcznie z aplikacji).
  const bool offHotPump = desired.hotPump.present && desired.hotPump.value;
  const bool offColdPump = desired.coldPump.present && desired.coldPump.value;

  if (mode == WORK_MODE::OFF) {
    scheduleBool(lastScheduled.coldPump, offColdPump,
      SERIAL_OPERATION::SET_COLD_PUMP_ON, SERIAL_OPERATION::SET_COLD_PUMP_OFF,
      false, !offColdPump);
  } else if (desired.coldPump.present) {
    scheduleBool(lastScheduled.coldPump, desired.coldPump.value,
      SERIAL_OPERATION::SET_COLD_PUMP_ON, SERIAL_OPERATION::SET_COLD_PUMP_OFF);
  }

  if (mode == WORK_MODE::OFF) {
    scheduleBool(lastScheduled.hotPump, offHotPump,
      SERIAL_OPERATION::SET_HOT_PUMP_ON, SERIAL_OPERATION::SET_HOT_PUMP_OFF,
      false, !offHotPump);
    scheduleBool(lastScheduled.force, false,
      SERIAL_OPERATION::SET_HP_FORCE_ON, SERIAL_OPERATION::SET_HP_FORCE_OFF,
      false, true);
  } else {
    if (desired.hotPump.present)
      scheduleBool(lastScheduled.hotPump, desired.hotPump.value,
        SERIAL_OPERATION::SET_HOT_PUMP_ON, SERIAL_OPERATION::SET_HOT_PUMP_OFF);

    bool force;
    if (wantedForce(mode, force))
      scheduleBool(lastScheduled.force, force,
        SERIAL_OPERATION::SET_HP_FORCE_ON, SERIAL_OPERATION::SET_HP_FORCE_OFF);
  }

  if (desired.workingWatt.present)
    scheduleDouble(lastScheduled.workingWatt, desired.workingWatt.value,
      SERIAL_OPERATION::SET_WORKING_WATT);

  // Maximum before minimum. CHPC moves the other limit when a new one would
  // cross it, so this order ends with the requested pair either way.
  if (desired.eevMaxPulseOpen.present)
    scheduleDouble(lastScheduled.eevMaxPulseOpen, desired.eevMaxPulseOpen.value,
      SERIAL_OPERATION::SET_EEV_MAXPULSES_OPEN);

  if (desired.eevMinPulseOpen.present)
    scheduleDouble(lastScheduled.eevMinPulseOpen, desired.eevMinPulseOpen.value,
      SERIAL_OPERATION::SET_EEV_MINWORKPOS);

  if (desired.eevSetpoint.present)
    scheduleDouble(lastScheduled.eevSetpoint, desired.eevSetpoint.value,
      SERIAL_OPERATION::SET_EEV_SETPOINT);
}
