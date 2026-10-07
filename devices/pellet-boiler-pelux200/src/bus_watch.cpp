// Cisza regulatora i StartMaster: opis w bus_watch.hpp.
#include <bus_watch.hpp>

#include <econet.hpp>

void BusSilenceWatch::begin(uint32_t nowMs)
{
  lastFrameMs_ = nowMs;
  lastSentMs_ = 0;
  sentInSilence_ = 0;
}

void BusSilenceWatch::onFrame(const EcomaxFrame &frame, uint32_t nowMs)
{
  if (silent(nowMs)) {
    // koniec ciszy: zdarzenie z historią sprzed niej
    Event event;
    event.kind = EventKind::SILENCE;
    event.atMs = lastFrameMs_;
    event.durationMs = nowMs - lastFrameMs_;
    event.startMasterSent = sentInSilence_;
    event.wokeAfterStartMaster = sentInSilence_ > 0 && nowMs - lastSentMs_ <= WAKE_WINDOW_MS;
    event.beforeCount = static_cast<uint8_t>(historyCount_);
    for (size_t i = 0; i < historyCount_; i++) {
      event.before[i] = history_[(historyNext_ + HISTORY - historyCount_ + i) % HISTORY];
    }
    push(event);
  }
  if (frame.type == ECOMAX_FRAME_STOP_MASTER || frame.type == ECOMAX_FRAME_START_MASTER) {
    Event event;
    event.kind = EventKind::MASTER_FRAME;
    event.atMs = nowMs;
    event.type = frame.type;
    event.sender = frame.sender;
    event.recipient = frame.recipient;
    push(event);
  }
  history_[historyNext_].type = frame.type;
  history_[historyNext_].sender = frame.sender;
  historyNext_ = (historyNext_ + 1) % HISTORY;
  if (historyCount_ < HISTORY) historyCount_++;
  lastFrameMs_ = nowMs;
  sentInSilence_ = 0;
}

bool BusSilenceWatch::startMasterDue(uint32_t nowMs) const
{
  if (!silent(nowMs)) return false;
  return sentInSilence_ == 0 || nowMs - lastSentMs_ >= SILENCE_MS;
}

void BusSilenceWatch::onStartMasterSent(uint32_t nowMs)
{
  lastSentMs_ = nowMs;
  if (sentInSilence_ < UINT16_MAX) sentInSilence_++;
  startMasterTotal_++;
}

const BusSilenceWatch::Event &BusSilenceWatch::event(size_t index) const
{
  return events_[(eventNext_ + EVENTS - eventCount_ + index) % EVENTS];
}

void BusSilenceWatch::push(const Event &event)
{
  events_[eventNext_] = event;
  eventNext_ = (eventNext_ + 1) % EVENTS;
  if (eventCount_ < EVENTS) eventCount_++;
}

namespace {
uint8_t refreshFor(uint8_t type)
{
  switch (type) {
    case 0x31: case 0x32: case 0x36: case 0x38: case 0x5C: return FrameVersionWatch::REFRESH_SETTINGS;
    case 0x3D: return FrameVersionWatch::REFRESH_ALERTS;
    default: return 0;
  }
}
}

uint8_t FrameVersionWatch::onTable(const EcomaxFrameVersion *versions, uint8_t count)
{
  uint8_t refresh = 0;
  bool described = false;
  for (uint8_t i = 0; i < count; i++) {
    const EcomaxFrameVersion &entry = versions[i];
    size_t index = 0;
    while (index < knownCount_ && known_[index].type != entry.type) index++;
    const bool known = index < knownCount_;
    if (initialized_ && (!known || known_[index].version != entry.version)) {
      const uint8_t action = refreshFor(entry.type);
      if (action && !described) {
        described = true;
        changedType_ = entry.type;
        oldVersion_ = known ? known_[index].version : 0;
        newVersion_ = entry.version;
      }
      refresh |= action;
    }
    if (known) {
      known_[index].version = entry.version;
    } else if (knownCount_ < TYPES) {
      known_[knownCount_++] = entry;
    }
  }
  initialized_ = true;
  return refresh;
}

size_t buildStartMasterFrame(uint8_t *out, size_t outSize)
{
  return buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_START_MASTER, nullptr, 0, out, outSize);
}
