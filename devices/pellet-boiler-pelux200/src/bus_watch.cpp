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

size_t buildStartMasterFrame(uint8_t *out, size_t outSize)
{
  return buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_START_MASTER, nullptr, 0, out, outSize);
}
