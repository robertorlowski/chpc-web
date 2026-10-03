// Implementacja bus_polarity.hpp. Czasy w millis(), różnice na uint32_t.
#include <bus_polarity.hpp>

void BusPolarity::onFrame(uint32_t nowMs)
{
  confirmed_ = true;
  sinceMs_ = nowMs;
  bytes_ = 0;
}

bool BusPolarity::update(uint32_t nowMs)
{
  if (!started_) {
    started_ = true;
    sinceMs_ = nowMs;
    return false;
  }
  const uint32_t limit = confirmed_ ? CONFIRMED_SWITCH_AFTER_MS : SWITCH_AFTER_MS;
  if (nowMs - sinceMs_ < limit) return false;
  // cisza na magistrali (kocioł wyłączony, odłączony przewód): polaryzacja bez zmian
  if (bytes_ < MIN_BYTES) {
    sinceMs_ = nowMs;
    bytes_ = 0;
    return false;
  }
  inverted_ = !inverted_;
  confirmed_ = false;
  switches_++;
  sinceMs_ = nowMs;
  bytes_ = 0;
  return true;
}
