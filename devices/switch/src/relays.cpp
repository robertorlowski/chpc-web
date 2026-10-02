// Implementacja relays.hpp. Czasy w millis(); różnice liczone na uint32_t, więc
// przepełnienie licznika po 49 dniach nie psuje odliczania.
#include <relays.hpp>

#include <cstring>

const char *relayModeName(RelayMode mode)
{
  switch (mode) {
  case RelayMode::Schedule: return "schedule";
  case RelayMode::On: return "on";
  case RelayMode::Timer: return "timer";
  case RelayMode::Off: return "off";
  default: return "";
  }
}

RelayMode relayModeFromName(const char *name)
{
  if (!name) return RelayMode::Unknown;
  if (strcmp(name, "schedule") == 0) return RelayMode::Schedule;
  if (strcmp(name, "on") == 0) return RelayMode::On;
  if (strcmp(name, "timer") == 0) return RelayMode::Timer;
  if (strcmp(name, "off") == 0) return RelayMode::Off;
  return RelayMode::Unknown;
}

RelayBank::RelayBank(uint8_t count) : count_(count > MAX_RELAYS ? MAX_RELAYS : count) {}

bool RelayBank::setOn(uint8_t index, bool on, uint32_t nowMs)
{
  Relay &relay = relays_[index];
  if (relay.on == on) return false;
  relay.on = on;
  relay.changedMs = nowMs;
  return true;
}

uint32_t RelayBank::remainingMs(uint8_t index, uint32_t nowMs) const
{
  const Relay &relay = relays_[index];
  if (!relay.on || !relay.timed) return 0;
  const int32_t left = static_cast<int32_t>(relay.offAtMs - nowMs);
  return left > 0 ? static_cast<uint32_t>(left) : 0;
}

bool RelayBank::applyCloud(uint8_t index, bool on, uint32_t offAfterS, RelayMode mode, uint32_t nowMs)
{
  if (index >= count_) return false;
  Relay &relay = relays_[index];
  if (relay.pending) return false;
  relay.mode = mode;
  relay.timed = on && offAfterS > 0;
  relay.offAtMs = relay.timed ? nowMs + offAfterS * 1000UL : 0;
  return setOn(index, on, nowMs);
}

bool RelayBank::applyLocal(uint8_t index, RelayMode mode, uint32_t minutes, bool cloudOnline, uint32_t nowMs)
{
  if (index >= count_ || mode == RelayMode::Unknown) return false;
  if (mode == RelayMode::Timer && minutes == 0) return false;
  Relay &relay = relays_[index];
  relay.pending = true;
  relay.pendingMode = mode;
  relay.pendingSeq = nextSeq_++;
  relay.mode = mode;
  switch (mode) {
  case RelayMode::On:
    relay.timed = false;
    return setOn(index, true, nowMs);
  case RelayMode::Off:
    relay.timed = false;
    return setOn(index, false, nowMs);
  case RelayMode::Timer:
    relay.timed = true;
    relay.offAtMs = nowMs + minutes * 60000UL;
    return setOn(index, true, nowMs);
  default:
    // Schedule: stan poda chmura; bez niej nie wiadomo, czy harmonogram ma teraz okno
    if (cloudOnline) return false;
    relay.timed = false;
    return setOn(index, false, nowMs);
  }
}

uint32_t RelayBank::pendingMinutes(uint8_t index, uint32_t nowMs) const
{
  const uint32_t left = remainingMs(index, nowMs);
  const uint32_t minutes = (left + 59999UL) / 60000UL;
  return minutes > 0 ? minutes : 1;
}

void RelayBank::confirmPending(uint8_t index, uint32_t seq)
{
  if (index < count_ && relays_[index].pending && relays_[index].pendingSeq == seq) relays_[index].pending = false;
}

bool RelayBank::anyPending() const
{
  for (uint8_t index = 0; index < count_; index++) {
    if (relays_[index].pending) return true;
  }
  return false;
}

uint32_t RelayBank::update(uint32_t nowMs)
{
  uint32_t changed = 0;
  for (uint8_t index = 0; index < count_; index++) {
    Relay &relay = relays_[index];
    if (relay.on && relay.timed && static_cast<int32_t>(nowMs - relay.offAtMs) >= 0) {
      relay.timed = false;
      // koniec włączenia na czas: w chmurze tryb wraca do harmonogramu
      if (relay.mode == RelayMode::Timer) relay.mode = RelayMode::Schedule;
      if (setOn(index, false, nowMs)) changed |= 1UL << index;
    }
  }
  return changed;
}
