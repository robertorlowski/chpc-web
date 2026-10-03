// Automatyczny wybór polaryzacji magistrali ecoMAX (bez zależności od Arduino, testowane
// w test_logic). Zamienione przewody A/B (D+/D−) dają odwrócony sygnał na wyjściu
// transceivera: bajty płyną, ale żadna ramka nie przechodzi kontroli. Gdy przez
// SWITCH_AFTER_MS po ostatniej zmianie przyszło co najmniej MIN_BYTES bajtów i ani
// jedna poprawna ramka, sterownik odwraca sygnał UART. Po pierwszej poprawnej ramce
// polaryzacja jest zatwierdzona (zapis w NVS) i zmienia się dopiero po dłuższej ciszy
// ramek przy płynących bajtach (np. przełożenie przewodów).
#pragma once

#include <cstdint>

class BusPolarity {
public:
  static constexpr uint32_t SWITCH_AFTER_MS = 8000;
  static constexpr uint32_t CONFIRMED_SWITCH_AFTER_MS = 300000;
  static constexpr uint32_t MIN_BYTES = 64;

  explicit BusPolarity(bool inverted = false) : inverted_(inverted) {}

  bool inverted() const { return inverted_; }
  bool confirmed() const { return confirmed_; }
  uint32_t switches() const { return switches_; }

  void onBytes(uint32_t count) { bytes_ += count; }
  // Poprawna ramka (dowolnego typu): polaryzacja jest dobra.
  void onFrame(uint32_t nowMs);

  // Wołane w pętli. True, gdy trzeba odwrócić sygnał (inverted() już zmienione).
  bool update(uint32_t nowMs);

private:
  bool inverted_;
  bool confirmed_ = false;
  bool started_ = false;
  uint32_t sinceMs_ = 0;
  uint32_t bytes_ = 0;
  uint32_t switches_ = 0;
};
