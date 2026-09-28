#pragma once

#include <cstdint>

// Szacunek COP zbiornika 300 l dla jednego cyklu pracy sprężarki (HPS 0→1→0):
// ciepło z przyrostu średniej temperatury zbiornika (Tho = góra, Ttarget =
// środek, dół szacowany) dzielone przez energię lt_pow. Wynik trafia do pól
// telemetrii cop, cop_min, cop_max, cop_bottom_start. Bez zależności od Arduino.

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
  // cycleDurationSeconds = lt_hp_on. Wynik liczony dopiero po zatrzymaniu.
  CopCycleEvent update(bool heatPumpRunning, double topTemperature,
    double middleTemperature, double electricalEnergyWh,
    uint32_t cycleDurationSeconds);

  bool cycleActive() const { return cycleActive_; }
  double currentMiddleTemperature() const { return endMiddleTemperature_; }
  const CopEstimate &estimate() const { return estimate_; }

private:
  void startCycle(double topTemperature, double middleTemperature,
    double electricalEnergyWh);
  void completeCycle(double topTemperature, double middleTemperature,
    double electricalEnergyWh);

  static constexpr double WATER_HEAT_CAPACITY_WH_PER_L_K = 1.163;
  static constexpr double TANK_VOLUME_LITERS = 300.0;
  static constexpr uint32_t BOTTOM_ESTIMATE_WINDOW_SECONDS = 60;

  bool wasRunning_ = false;
  bool cycleActive_ = false;
  double startTopTemperature_ = 0.0;
  double startMiddleTemperature_ = 0.0;
  double startBottomTemperature_ = 0.0;
  double endTopTemperature_ = 0.0;
  double endMiddleTemperature_ = 0.0;
  double electricalEnergyWh_ = 0.0;
  CopEstimate estimate_{};
};
