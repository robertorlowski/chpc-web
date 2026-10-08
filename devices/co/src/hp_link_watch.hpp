#pragma once

#include <stdint.h>

// Czy łączność z CHPC jest utracona (main.cpp, scheduleNextDeviceRead). Telemetria niesie ostatni udany odczyt
// CHPC (pole HP), więc bez tego po wyłączeniu sterownika pompy stare temperatury szłyby do chmury w kółko
// jako aktualne (produkcja 2026-10-08: 6 godzin identycznych wartości, licznik serial_read_timeout rósł).
// Po LOST_AFTER_MISSES kolejnych odczytach bez odpowiedzi pole HP jest czyszczone: serwer takiej telemetrii nie
// zapisuje, a aplikacja po kilku minutach pokazuje „Brak łączności”. Pojedyncza zgubiona ramka niczego nie czyści.
class HeatPumpLinkWatch {
public:
  static constexpr uint8_t LOST_AFTER_MISSES = 3;

  // Wołane przy planowaniu kolejnego odczytu; previousUnanswered = poprzedni odczyt nie dostał odpowiedzi.
  // Zwraca true, gdy łączność uznano za utraconą (HP do wyczyszczenia).
  bool onReadScheduled(bool previousUnanswered)
  {
    if (previousUnanswered && misses < 255) misses++;
    return lost();
  }

  // Odpowiedź CHPC (także uszkodzona): łączność jest, licznik od nowa.
  void onResponse() { misses = 0; }

  bool lost() const { return misses >= LOST_AFTER_MISSES; }
  uint8_t missedReads() const { return misses; }

private:
  uint8_t misses = 0;
};
