#pragma once

#include <domain_types.hpp>

// Struktury operacji z chmury (klucze obiektu `operation` z odpowiedzi
// /api/hp/add, CLAUDE.md, punkt 7) i raport stanu CHPC. `present` odróżnia
// brak pola w częściowej operacji od jawnego 0/false.
// Od 1.2.0: jedna temperatura od–do (temp_min, temp_max) zamiast par co_* i cwu_*,
// tryb MANUAL / AUTO / OFF, konfiguracja pompy (pv_force, pv_dtu, tank_liters) i cop_pause.

template <typename T>
struct ServerValue {
  bool present = false;
  T value{};
};

struct ServerOperationState {
  ServerValue<WORK_MODE> workMode;
  ServerValue<double> tempMin;
  ServerValue<double> tempMax;
  ServerValue<bool> sumpHeater;
  ServerValue<bool> coldPump;
  ServerValue<bool> hotPump;
  ServerValue<bool> force;
  ServerValue<double> workingWatt;
  ServerValue<double> eevMaxPulseOpen;
  ServerValue<double> eevMinPulseOpen;
  ServerValue<double> eevSetpoint;
  ServerValue<bool> pvForce;
  ServerValue<bool> pvDtu;
  ServerValue<double> tankLiters;
  ServerValue<bool> copPause;
  // One-shot actions: executed when received, never merged into the kept state.
  ServerValue<bool> errorReset;
  ServerValue<bool> restart;
};

// What CHPC reports back in its stats ("CO", "F", "HPS", "Tmax", "Tmin"),
// compared with what the controller wants so that a command CHPC missed is
// sent again.
struct HeatPumpReport {
  bool coOn = false;
  bool force = false;
  bool running = false;
  // CHPC reports its setpoint as Tmax and setpoint minus delta as Tmin.
  bool hasTemperatures = false;
  double setpoint = 0.0;
  double minimum = 0.0;
};

inline bool hasServerOperationValues(const ServerOperationState &state)
{
  return state.workMode.present
    || state.tempMin.present
    || state.tempMax.present
    || state.sumpHeater.present
    || state.coldPump.present
    || state.hotPump.present
    || state.force.present
    || state.workingWatt.present
    || state.eevMaxPulseOpen.present
    || state.eevMinPulseOpen.present
    || state.eevSetpoint.present
    || state.pvForce.present
    || state.pvDtu.present
    || state.tankLiters.present
    || state.copPause.present
    || state.errorReset.present
    || state.restart.present;
}

template <typename T>
inline void mergeServerValue(ServerValue<T> &target, const ServerValue<T> &patch)
{
  if (patch.present) target = patch;
}

inline void mergeServerOperation(
  ServerOperationState &target, const ServerOperationState &patch)
{
  mergeServerValue(target.workMode, patch.workMode);
  mergeServerValue(target.tempMin, patch.tempMin);
  mergeServerValue(target.tempMax, patch.tempMax);
  mergeServerValue(target.sumpHeater, patch.sumpHeater);
  mergeServerValue(target.coldPump, patch.coldPump);
  mergeServerValue(target.hotPump, patch.hotPump);
  mergeServerValue(target.force, patch.force);
  mergeServerValue(target.workingWatt, patch.workingWatt);
  mergeServerValue(target.eevMaxPulseOpen, patch.eevMaxPulseOpen);
  mergeServerValue(target.eevMinPulseOpen, patch.eevMinPulseOpen);
  mergeServerValue(target.eevSetpoint, patch.eevSetpoint);
  mergeServerValue(target.pvForce, patch.pvForce);
  mergeServerValue(target.pvDtu, patch.pvDtu);
  mergeServerValue(target.tankLiters, patch.tankLiters);
  mergeServerValue(target.copPause, patch.copPause);
}
