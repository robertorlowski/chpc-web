// Cisza regulatora na magistrali i ramka StartMaster (0x19), od firmware 1.7.0 (bez Arduino, testy w test_econet).
//
// 2026-10-05 regulator dwa razy zamilkł na wiele minut przy zasilonym kotle (0 bajtów, 16:48–17:25 i 17:28–17:37),
// 2–4 min po zapisie zmiany i odczycie ustawień; wrócił dopiero po restarcie zasilania albo zmianie stanu kotła.
// PyPlumIO (protocol.py) wysyła regulatorowi StartMasterRequest przy każdym połączeniu, a przy 10 s bez ramek łączy
// się od nowa i wysyła ją ponownie; opis w kodzie: „Once controller receives this request, it starts sending
// periodic messages.” Ramki StopMaster (0x18) PyPlumIO nigdy nie wysyła — my też nie.
//
// U nas (decyzja użytkownika 2026-10-07): StartMaster tylko przy ciszy — po każdych SILENCE_MS bez ramki od innego
// urządzenia niż my (0x56); przy starcie nie, bo regulator i tak zaczyna rozmowę po naszej odpowiedzi na
// CheckDevice. Ciszę mierzą ramki, nie bajty: echo naszej własnej ramki (HW-519 słyszy swoje nadawanie) nie może
// jej przerwać. Czy wolno nadać (polaryzacja, EconetGuard), rozstrzyga wywołujący.
//
// Do diagnozy przyczyny ciszy: ostatnie EVENTS zdarzeń — każda cisza (początek, długość, ile StartMaster, czy regulator
// odezwał się w WAKE_WINDOW_MS po naszej ramce, ostatnie HISTORY ramek przed ciszą) i każda obca ramka 0x18/0x19.
#pragma once

#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

constexpr uint8_t ECOMAX_FRAME_STOP_MASTER = 0x18;
constexpr uint8_t ECOMAX_FRAME_START_MASTER = 0x19;

class BusSilenceWatch {
public:
  static constexpr uint32_t SILENCE_MS = 30000;
  static constexpr uint32_t WAKE_WINDOW_MS = 10000;
  static constexpr size_t HISTORY = 8;
  static constexpr size_t EVENTS = 10;

  enum class EventKind : uint8_t { SILENCE, MASTER_FRAME };
  struct FrameMark {
    uint8_t type = 0;
    uint8_t sender = 0;
  };
  struct Event {
    EventKind kind = EventKind::SILENCE;
    uint32_t atMs = 0;        // cisza: ostatnia ramka przed nią; ramka 0x18/0x19: chwila odebrania
    uint32_t durationMs = 0;  // cisza: do pierwszej ramki po niej
    uint16_t startMasterSent = 0;
    bool wokeAfterStartMaster = false;  // pierwsza ramka po ciszy w WAKE_WINDOW_MS od naszej StartMaster
    uint8_t type = 0, sender = 0, recipient = 0;  // ramka 0x18/0x19
    FrameMark before[HISTORY];  // cisza: ostatnie ramki przed nią, od najstarszej
    uint8_t beforeCount = 0;
  };

  void begin(uint32_t nowMs);
  // Ramka od innego urządzenia niż 0x56 (nasze echo i obcy ecoNET są pomijane przez wywołującego).
  void onFrame(const EcomaxFrame &frame, uint32_t nowMs);
  // Czy teraz wysłać StartMaster: cisza trwa co najmniej SILENCE_MS od ostatniej ramki albo od poprzedniej StartMaster.
  bool startMasterDue(uint32_t nowMs) const;
  void onStartMasterSent(uint32_t nowMs);

  bool silent(uint32_t nowMs) const { return nowMs - lastFrameMs_ >= SILENCE_MS; }
  uint32_t silenceMs(uint32_t nowMs) const { return silent(nowMs) ? nowMs - lastFrameMs_ : 0; }
  uint32_t startMasterTotal() const { return startMasterTotal_; }
  uint16_t startMasterInSilence() const { return sentInSilence_; }
  // Zdarzenia od najstarszego; index < eventCount().
  size_t eventCount() const { return eventCount_; }
  const Event &event(size_t index) const;

private:
  void push(const Event &event);

  uint32_t lastFrameMs_ = 0;
  uint32_t lastSentMs_ = 0;
  uint16_t sentInSilence_ = 0;
  uint32_t startMasterTotal_ = 0;
  FrameMark history_[HISTORY];
  size_t historyCount_ = 0;
  size_t historyNext_ = 0;
  Event events_[EVENTS];
  size_t eventCount_ = 0;
  size_t eventNext_ = 0;
};

// Ramka StartMaster od ecoNET (0x56) do regulatora (0x45), bez danych: 68 0A 00 45 56 30 05 19 BCC 16 (jak PyPlumIO).
size_t buildStartMasterFrame(uint8_t *out, size_t outSize);
