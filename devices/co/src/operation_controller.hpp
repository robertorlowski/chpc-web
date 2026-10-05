#pragma once

#include <command_sink.hpp>
#include <operation_types.hpp>

// Serce sterowania: trzyma stan żądany przez chmurę (`desired`) i ostatnio
// wysłany do pompy (`lastScheduled` itd.), a reconcile() dokłada do kolejki
// RS-485 tylko komendy, których wartość się zmieniła. Uwzględnia tryb
// sterownika (OFF/CLOUD/MANUAL), regułę OFF i wymuszenie przy produkcji PV.
// Od 1.2.0 bez przekaźników CO/CWU i z jedną temperaturą od–do.
// Bez zależności od Arduino: testy native i most E2E kompilują ten plik.
class OperationController {
public:
  explicit OperationController(CommandSink &commands, long pvForceThreshold = 2000);

  // Scala częściową operację z chmury (pola nieobecne zostają bez zmian).
  void applyServerPatch(const ServerOperationState &patch);
  // Zmiana trybu z przycisku; OFF od razu kolejkuje sekwencję bezpieczeństwa,
  // MANUAL grzeje na ostatniej temperaturze od–do z chmury.
  void setControllerMode(ControllerMode mode);
  // Nowy odczyt PV; przy wymuszeniu PV (pv_force) przelicza force.
  void updatePv(const PV &pv);
  // A command is only kept as sent, never confirmed, so the state CHPC reports
  // is checked against it and a difference is sent again. After
  // heatPumpLost() the next report resends the whole state.
  void updateHeatPumpReport(const HeatPumpReport &report);
  void heatPumpLost();
  // Ponawia komendy, których kolejka nie przyjęła (retryPending).
  void tick();

  ControllerMode controllerMode() const;
  const DeviceSettings &preferences() const;
  const ServerOperationState &serverState() const;
  // Flaga jednorazowa dla main.cpp: czy odświeżyć ekran trybu i telemetrię.
  bool takeModeChanged();
  uint32_t preferenceValidationErrorCount() const;

private:
  CommandSink &commands;
  long pvForceThreshold;
  DeviceSettings prefs;
  // desired: scalony stan z chmury. lastScheduled, lastHpCo, lastSetpoint,
  // lastDelta: wartość ostatnio przyjęta do kolejki; wyczyszczenie pola
  // (= {}) wymusza ponowne wysłanie komendy przy najbliższym reconcile().
  ServerOperationState desired;
  ServerOperationState lastScheduled;
  ServerValue<bool> lastHpCo;
  ServerValue<double> lastSetpoint;
  ServerValue<double> lastDelta;
  PV pv;
  ControllerMode localMode = ControllerMode::CLOUD;
  bool modeChanged = false;
  bool retryPending = false;
  // False do pierwszej niepustej operacji z chmury: wcześniej kontroler
  // w trybie CLOUD nie wysyła do pompy nic (nie zna work_mode).
  bool cloudStateReady = false;
  bool resyncPending = false;
  uint32_t preferenceValidationErrors = 0;

  // Kontroler steruje pompą: CLOUD po pierwszej operacji albo lokalny MANUAL.
  bool controlling() const;
  // Tryb, według którego idą komendy: lokalny MANUAL grzeje zawsze, CLOUD według chmury.
  WORK_MODE effectiveMode() const;
  void reconcile();
  void scheduleOffSequence(bool hotPump = false, bool coldPump = false);
  void resetScheduledState();
  bool wantedForce(WORK_MODE mode, bool &force) const;
  bool scheduleBool(ServerValue<bool> &last, bool value,
    SERIAL_OPERATION onOperation, SERIAL_OPERATION offOperation,
    bool always = false, bool priority = false);
  bool scheduleDouble(ServerValue<double> &last, double value,
    SERIAL_OPERATION operation);
};
