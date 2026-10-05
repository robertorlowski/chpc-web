// Implementacja szacunku COP zbiornika (opis w cop_estimator.hpp i w
// docs/server-driven-refactor-2026-09-20.md, „Estymacja COP zbiornika”).
#include "cop_estimator.hpp"

#include <algorithm>
#include <cmath>

constexpr double CopEstimator::WATER_HEAT_CAPACITY_WH_PER_L_K;
constexpr double CopEstimator::DEFAULT_TANK_VOLUME_LITERS;
constexpr uint32_t CopEstimator::BOTTOM_ESTIMATE_WINDOW_SECONDS;

namespace {
double tankAverageTemperature(double top, double middle, double bottom)
{
  // Trapezoidal integration over two equal-height halves of the tank.
  return (top + 2.0 * middle + bottom) / 4.0;
}
}

void CopEstimator::setTankLiters(double liters)
{
  if (std::isfinite(liters) && liters >= 20.0 && liters <= 2000.0) tankLiters_ = liters;
}

CopCycleEvent CopEstimator::update(bool heatPumpRunning,
  double topTemperature, double middleTemperature,
  double electricalEnergyWh, uint32_t cycleDurationSeconds, bool paused)
{
  if (!std::isfinite(topTemperature) || !std::isfinite(middleTemperature)) {
    return CopCycleEvent::NONE;
  }

  if (heatPumpRunning) {
    const bool started = !wasRunning_ || !cycleActive_;
    if (started) {
      startCycle(topTemperature, middleTemperature, electricalEnergyWh);
    } else {
      endTopTemperature_ = topTemperature;
      endMiddleTemperature_ = middleTemperature;
      electricalEnergyWh_ = std::max(electricalEnergyWh_, electricalEnergyWh);
      // Start cyklu = najniższa temperatura środka: na początku pracy woda się miesza i chwilowo stygnie.
      startMiddleTemperature_ = std::min(startMiddleTemperature_, middleTemperature);

      // Dół zbiornika nie ma czujnika: jego temperaturę przybliża najniższe
      // Tho z pierwszych 60 s cyklu.
      if (cycleDurationSeconds <= BOTTOM_ESTIMATE_WINDOW_SECONDS) {
        startBottomTemperature_ = std::min(startBottomTemperature_, topTemperature);
      }
    }
    // pompa CO kotła pracuje: ciepło odpływa ze zbiornika, cykl nie ma wyniku do końca
    if (paused) paused_ = true;
    computeEstimate();

    wasRunning_ = true;
    return started ? CopCycleEvent::STARTED : CopCycleEvent::NONE;
  }

  wasRunning_ = false;
  if (!cycleActive_) return CopCycleEvent::NONE;

  // The last running sample protects the endpoint against cooling immediately
  // after the compressor stops.
  endTopTemperature_ = std::max(endTopTemperature_, topTemperature);
  endMiddleTemperature_ = std::max(endMiddleTemperature_, middleTemperature);
  electricalEnergyWh_ = std::max(electricalEnergyWh_, electricalEnergyWh);
  if (paused) paused_ = true;
  computeEstimate();
  cycleActive_ = false;
  return CopCycleEvent::COMPLETED;
}

void CopEstimator::startCycle(double topTemperature, double middleTemperature,
  double electricalEnergyWh)
{
  cycleActive_ = true;
  paused_ = false;
  startTopTemperature_ = topTemperature;
  startMiddleTemperature_ = middleTemperature;
  startBottomTemperature_ = topTemperature;
  endTopTemperature_ = topTemperature;
  endMiddleTemperature_ = middleTemperature;
  electricalEnergyWh_ = std::max(0.0, electricalEnergyWh);
  estimate_ = {};
  estimate_.startMiddleTemperature = startMiddleTemperature_;
  estimate_.endMiddleTemperature = endMiddleTemperature_;
  estimate_.startBottomTemperature = startBottomTemperature_;
}

void CopEstimator::computeEstimate()
{
  const double startAverage = tankAverageTemperature(startTopTemperature_,
    startMiddleTemperature_, startBottomTemperature_);

  // Lower bound: the bottom layer did not warm up during the cycle.
  const double endAverageMinimum = tankAverageTemperature(endTopTemperature_,
    endMiddleTemperature_, startBottomTemperature_);

  // Upper bound: the bottom layer reached the middle sensor temperature.
  const double endBottomMaximum = std::max(startBottomTemperature_,
    endMiddleTemperature_);
  const double endAverageMaximum = tankAverageTemperature(endTopTemperature_,
    endMiddleTemperature_, endBottomMaximum);

  const double minimumDelta = std::max(0.0, endAverageMinimum - startAverage);
  const double maximumDelta = std::max(minimumDelta,
    endAverageMaximum - startAverage);

  estimate_ = {};
  estimate_.startMiddleTemperature = startMiddleTemperature_;
  estimate_.endMiddleTemperature = endMiddleTemperature_;
  estimate_.startBottomTemperature = startBottomTemperature_;

  if (paused_ || !std::isfinite(electricalEnergyWh_) || electricalEnergyWh_ <= 0.0
    || maximumDelta <= 0.0) {
    return;
  }

  const double minimumHeatWh = WATER_HEAT_CAPACITY_WH_PER_L_K * tankLiters_ * minimumDelta;
  const double maximumHeatWh = WATER_HEAT_CAPACITY_WH_PER_L_K * tankLiters_ * maximumDelta;

  estimate_.minimum = minimumHeatWh / electricalEnergyWh_;
  estimate_.maximum = maximumHeatWh / electricalEnergyWh_;
  estimate_.estimated = (estimate_.minimum + estimate_.maximum) / 2.0;
  estimate_.valid = std::isfinite(estimate_.estimated);
}
