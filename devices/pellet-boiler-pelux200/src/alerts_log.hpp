// Dziennik alarmów kotła (od firmware 1.7.0; bez Arduino, testy w test_econet i test_capture).
//
// Dziennik jest w panelu kotła (0x50), nie w regulatorze: na nagraniu 2026-10-03 (kociol-2026-10-03-bez-panelu.txt)
// eSTER (0x51) pyta regulator ramką 0x3D [pierwszy, liczba], regulator przekazuje pytanie panelowi, a panel odpowiada
// wszystkim (0x00) ramką 0xBD: [łącznie, pierwszy, liczba] + liczba × 9 B (kod, od: u32 LE, do: u32 LE; do = 0xFFFFFFFF,
// gdy alarm trwa). Czas to sekundy od 2000-01-01 w kalendarzu ecoMAX (miesiąc 31 dni, rok 12 × 31 dni) — przelicza
// serwer. Format jak PyPlumIO (structures/alerts.py, AlertsRequest: [start, count = 10]).
//
// Czytnik pyta o kolejne strony po PAGE wpisów (w oknie 0x56, jak zapytania o ustawienia) i zapisuje też każdą
// odpowiedź 0xBD usłyszaną na magistrali, gdy pyta ktoś inny. Kompletny dziennik (wszystkie wpisy 0..total−1, najwyżej
// MAX_ENTRIES) idzie do chmury (pellet.cpp); revision() rośnie przy każdej zmianie zapisanych wpisów.
#pragma once

#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

constexpr uint8_t ECOMAX_FRAME_ALERTS = 0x3D;
constexpr uint8_t ECOMAX_FRAME_ALERTS_RESPONSE = 0xBD;
constexpr uint32_t ECOMAX_ALERT_ONGOING = 0xFFFFFFFF;

struct AlertEntry {
  uint8_t code = 0;
  uint32_t from = 0;
  uint32_t to = 0;
};

class AlertsLogReader {
public:
  static constexpr size_t MAX_ENTRIES = 100;
  static constexpr uint8_t PAGE = 10;
  static constexpr uint32_t TIMEOUT_MS = 4000;
  static constexpr uint8_t ATTEMPTS = 3;

  // Odczyt od początku (zapisane wpisy zostają do nadpisania).
  void start();
  bool busy() const { return reading_; }
  // Ramka zapytania 0x3D do regulatora; 0, gdy nic nie czeka albo czekamy na odpowiedź.
  size_t nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize);
  void cancelRequest();
  // Każda ramka 0xBD (od panelu do wszystkich): true, gdy zapisano wpisy.
  bool onResponse(const EcomaxFrame &frame, uint32_t nowMs);
  // Brak odpowiedzi przez TIMEOUT_MS: ponowienie; po ATTEMPTS próbach koniec odczytu (np. bez panelu).
  void update(uint32_t nowMs);

  uint8_t total() const { return total_; }
  // Wszystkie wpisy 0..min(total, MAX_ENTRIES)−1 zapisane.
  bool complete() const;
  size_t entries() const { return total_ < MAX_ENTRIES ? total_ : MAX_ENTRIES; }
  bool has(size_t index) const { return index < MAX_ENTRIES && present_[index]; }
  const AlertEntry &entry(size_t index) const { return entries_[index]; }
  uint32_t revision() const { return revision_; }
  uint32_t failed() const { return failed_; }

private:
  bool reading_ = false;
  uint8_t next_ = 0;
  bool awaiting_ = false;
  uint8_t attempts_ = 0;
  uint32_t sentMs_ = 0;
  uint8_t total_ = 0;
  AlertEntry entries_[MAX_ENTRIES];
  bool present_[MAX_ENTRIES] = {};
  uint32_t revision_ = 0;
  uint32_t failed_ = 0;
  bool received_ = false;  // była już jakaś odpowiedź 0xBD (bez niej total() = 0 nic nie znaczy)
};
