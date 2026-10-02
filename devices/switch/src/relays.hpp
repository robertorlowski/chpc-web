// Stan przekaźników włącznika i reguły zmian, bez zależności od Arduino (testowane w
// test_logic). Przekaźnik zmienia stan na polecenie chmury (włącz na N s / bez limitu,
// wyłącz) albo ze strony sterownika, a włączenie na czas wyłącza sam, także bez sieci.
// Zmiana ze strony sterownika czeka w pending na wysłanie do chmury (PUT switch/mode);
// do tego czasu polecenia chmury dla tego przekaźnika są pomijane, żeby nie cofnęły zmiany.
#pragma once

#include <cstdint>

constexpr uint8_t MAX_RELAYS = 8;

// Tryb jak w chmurze: harmonogram, włączony bez limitu, na czas, wyłączony (blokuje harmonogram).
enum class RelayMode : uint8_t { Schedule, On, Timer, Off, Unknown };

const char *relayModeName(RelayMode mode);
RelayMode relayModeFromName(const char *name);

struct Relay {
  bool on = false;
  // chwila ostatniej zmiany stanu (millis)
  uint32_t changedMs = 0;
  // włączony na czas: wyłączenie w offAtMs
  bool timed = false;
  uint32_t offAtMs = 0;
  // tryb według ostatniej odpowiedzi chmury albo zmiany lokalnej (do wyświetlenia)
  RelayMode mode = RelayMode::Unknown;
  // zmiana ze strony sterownika, jeszcze niewysłana do chmury
  bool pending = false;
  RelayMode pendingMode = RelayMode::Schedule;
  // numer zmiany: potwierdzenie starszej wysyłki nie kasuje nowszej zmiany
  uint32_t pendingSeq = 0;
};

class RelayBank {
public:
  explicit RelayBank(uint8_t count);

  uint8_t count() const { return count_; }
  const Relay &relay(uint8_t index) const { return relays_[index]; }
  uint32_t remainingMs(uint8_t index, uint32_t nowMs) const;

  // Polecenie z chmury: on/off i offAfterS (0 = bez limitu). Pomijane przy pending.
  // Zwraca true, gdy stan przekaźnika się zmienił.
  bool applyCloud(uint8_t index, bool on, uint32_t offAfterS, RelayMode mode, uint32_t nowMs);

  // Zmiana ze strony sterownika: On, Off, Timer (minutes) albo Schedule. Schedule bez
  // łączności z chmurą (cloudOnline = false) wyłącza przekaźnik, bo harmonogram zna tylko
  // chmura; z łącznością stan zostaje do najbliższej odpowiedzi. Zwraca true przy zmianie stanu.
  bool applyLocal(uint8_t index, RelayMode mode, uint32_t minutes, bool cloudOnline, uint32_t nowMs);

  // Minuty do wysłania w PUT switch/mode dla zmiany Timer: tyle, ile zostało (co najmniej 1).
  uint32_t pendingMinutes(uint8_t index, uint32_t nowMs) const;
  // Chmura przyjęła zmianę o numerze seq.
  void confirmPending(uint8_t index, uint32_t seq);
  bool anyPending() const;

  // Wyłącza przekaźniki, którym minął czas. Zwraca maskę bitową przekaźników, które się zmieniły.
  uint32_t update(uint32_t nowMs);

private:
  bool setOn(uint8_t index, bool on, uint32_t nowMs);

  uint8_t count_;
  Relay relays_[MAX_RELAYS];
  uint32_t nextSeq_ = 1;
};
