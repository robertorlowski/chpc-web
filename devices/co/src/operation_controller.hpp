#pragma once

#include <command_sink.hpp>
#include <operation_types.hpp>

// Serce sterowania: trzyma stan żądany przez chmurę (`desired`) i ostatnio
// wysłany do pompy (`lastScheduled` itd.), a reconcile() dokłada do kolejki
// RS-485 tylko komendy, których wartość się zmieniła. Uwzględnia tryb
// sterownika (OFF/CLOUD/MANUAL_*), regułę OFF, force z PV i przekaźniki CO/CWU.
// Bez zależności od Arduino: testy native i most E2E kompilują ten plik.
class OperationController {
public:
  explicit OperationController(CommandSink &commands, long pvForceThreshold = 2000);

  // Scala częściową operację z chmury (pola nieobecne zostają bez zmian).
  void applyServerPatch(const ServerOperationState &patch);
  // Zmiana trybu z przycisku; OFF od razu kolejkuje sekwencję bezpieczeństwa.
  void setControllerMode(ControllerMode mode);
  // Nowy odczyt PV; w work_mode PV przelicza force.
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
  bool coRelay() const;
  bool cwuRelay() const;
  // Flagi jednorazowe dla main.cpp: czy odświeżyć przekaźniki i ekran trybu.
  bool takeRelayChanged();
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
  bool coRelayState = false;
  bool cwuRelayState = false;
  bool relayChanged = false;
  bool modeChanged = false;
  bool retryPending = false;
  // False do pierwszej niepustej operacji z chmury: wcześniej kontroler
  // w trybie CLOUD nie wysyła do pompy nic (nie zna work_mode).
  bool cloudStateReady = false;
  bool resyncPending = false;
  // Ostatni tryb inny niż OFF: w OFF pompa dostaje jego parę temperatur (CO albo CWU),
  // żeby zmiana z aplikacji doszła od razu. Po starcie sterownika CWU.
  WORK_MODE lastHeatingMode = WORK_MODE::CWU;
  uint32_t preferenceValidationErrors = 0;

  void reconcile();
  void scheduleOffSequence(bool hotPump = false, bool coldPump = false);
  void resetScheduledState();
  void setRelayState(bool coEnabled, bool cwuEnabled);
  void updateRelayState(WORK_MODE mode);
  bool isCoMode(WORK_MODE mode) const;
  // Para temperatur dla trybu (w OFF: ostatniego trybu grzania): max i max − min.
  void temperaturesFor(WORK_MODE mode, double &maximum, double &delta) const;
  bool wantedForce(WORK_MODE mode, bool &force) const;
  bool scheduleBool(ServerValue<bool> &last, bool value,
    SERIAL_OPERATION onOperation, SERIAL_OPERATION offOperation,
    bool always = false, bool priority = false);
  bool scheduleDouble(ServerValue<double> &last, double value,
    SERIAL_OPERATION operation);
};
