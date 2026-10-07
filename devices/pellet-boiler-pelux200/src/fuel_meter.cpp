// Licznik spalonego pelletu: opis w fuel_meter.hpp.
#include <fuel_meter.hpp>

void FuelMeter::onSensorData(const EcomaxFloat &consumptionKgPerHour, uint32_t nowMs)
{
  if (!consumptionKgPerHour.present) return;
  if (hasLast_) {
    const uint32_t elapsed = nowMs - lastMs_;
    // ujemne albo absurdalne zużycie (np. 0xFF w ramce) nie liczy się
    const float kgPerHour = consumptionKgPerHour.value;
    if (elapsed < MAX_GAP_MS && kgPerHour > 0 && kgPerHour < 100) {
      grams_ += static_cast<double>(kgPerHour) * 1000.0 * elapsed / 3600000.0;
    }
  }
  hasLast_ = true;
  lastMs_ = nowMs;
}
