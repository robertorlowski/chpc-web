#pragma once

#include <cstdint>

// Szacunek COP zbiornika dla jednego cyklu pracy sprężarki (HPS 0→1→0):
// ciepło z przyrostu średniej temperatury zbiornika (Tho = góra, Ttarget =
// środek, dół szacowany) dzielone przez energię lt_pow. Od 1.2.0 (decyzje użytkownika 2026-10-04):
// pojemność zbiornika z konfiguracji pompy (tank_liters), wynik liczony na bieżąco przy każdym odczycie
// w trakcie pracy (nie dopiero po zatrzymaniu), temperatura startu = najniższa temperatura środka
// w cyklu (woda miesza się na początku pracy), a cykl, w którym pracowała pompa CO kotła (cop_pause:
// woda odpływa ze zbiornika), nie ma wyniku. Wynik trafia do pól telemetrii cop, cop_min, cop_max,
// cop_bottom_start. Bez zależności od Arduino.

enum class CopCycleEvent : uint8_t {
  NONE,
  STARTED,
  COMPLETED,
};

struct CopEstimate {
  bool valid = false;
  double minimum = 0.0;
  double maximum = 0.0;
  double estimated = 0.0;
  double startMiddleTemperature = 0.0;
  double endMiddleTemperature = 0.0;
  double startBottomTemperature = 0.0;
};

class CopEstimator {
public:
  // Wołane przy każdym odczycie CHPC; electricalEnergyWh = lt_pow,
  // cycleDurationSeconds = lt_hp_on; paused = pracuje pompa CO kotła (cykl bez wyniku).
  CopCycleEvent update(bool heatPumpRunning, double topTemperature,
    double middleTemperature, double electricalEnergyWh,
    uint32_t cycleDurationSeconds, bool paused = false);

  // Pojemność zbiornika [l]; wartości spoza 20–2000 są pomijane.
  void setTankLiters(double liters);
  double tankLiters() const { return tankLiters_; }

  bool cycleActive() const { return cycleActive_; }
  double currentMiddleTemperature() const { return endMiddleTemperature_; }
  // Wynik bieżący (w trakcie cyklu) albo końcowy (po zatrzymaniu).
  const CopEstimate &estimate() const { return estimate_; }

private:
  void startCycle(double topTemperature, double middleTemperature,
    double electricalEnergyWh);
  void computeEstimate();

  static constexpr double WATER_HEAT_CAPACITY_WH_PER_L_K = 1.163;
  static constexpr double DEFAULT_TANK_VOLUME_LITERS = 300.0;
  static constexpr uint32_t BOTTOM_ESTIMATE_WINDOW_SECONDS = 60;

  double tankLiters_ = DEFAULT_TANK_VOLUME_LITERS;
  bool wasRunning_ = false;
  bool cycleActive_ = false;
  bool paused_ = false;
  double startTopTemperature_ = 0.0;
  double startMiddleTemperature_ = 0.0;
  double startBottomTemperature_ = 0.0;
  double endTopTemperature_ = 0.0;
  double endMiddleTemperature_ = 0.0;
  double electricalEnergyWh_ = 0.0;
  CopEstimate estimate_{};
};
