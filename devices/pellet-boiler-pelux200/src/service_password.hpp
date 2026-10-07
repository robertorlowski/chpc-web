// Hasło serwisowe regulatora (od firmware 1.8.0; bez Arduino, testy w test_econet).
//
// Jak PyPlumIO (frames/requests.py PasswordRequest, responses.py PasswordResponse): zapytanie 0x3A bez danych do
// regulatora, odpowiedź 0xBA [?, tekst hasła]. Hasło jest tylko na sterowniku (decyzja użytkownika 2026-10-05):
// NVS i strona /install za Basic Auth, na żądanie. Nigdy do chmury, do /state.json, /boiler-settings.json ani na
// konsolę — pellet.cpp maskuje ramkę 0xBA w nagraniu „r”, podglądzie „t” i wypisie nowych ramek
// (isServicePasswordFrame). Odpowiedź 0xBA usłyszana na magistrali, gdy pyta ktoś inny (np. panel), też jest
// przyjmowana.
#pragma once

#include <cstddef>
#include <cstdint>

#include <ecomax_frame.hpp>

constexpr uint8_t ECOMAX_FRAME_PASSWORD = 0x3A;
constexpr uint8_t ECOMAX_FRAME_PASSWORD_RESPONSE = 0xBA;

// Ramka z hasłem (typ w bajcie 7 surowej ramki) — do maskowania w wypisach.
inline bool isServicePasswordFrame(uint8_t type) { return type == ECOMAX_FRAME_PASSWORD_RESPONSE; }

class ServicePasswordReader {
public:
  static constexpr size_t MAX_LENGTH = 32;
  static constexpr uint32_t TIMEOUT_MS = 4000;
  static constexpr uint8_t ATTEMPTS = 3;

  void start();
  bool busy() const { return reading_; }
  // Ramka 0x3A do regulatora; 0, gdy nic nie czeka albo czekamy na odpowiedź.
  size_t nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize);
  void cancelRequest();
  // Każda ramka 0xBA: true, gdy zapisano hasło (tylko znaki drukowalne ASCII, najwyżej MAX_LENGTH).
  bool onResponse(const EcomaxFrame &frame);
  // Brak odpowiedzi przez TIMEOUT_MS: ponowienie, po ATTEMPTS próbach koniec (failed() rośnie).
  void update(uint32_t nowMs);

  bool has() const { return has_; }
  const char *text() const { return text_; }
  uint32_t failed() const { return failed_; }

private:
  bool reading_ = false;
  bool awaiting_ = false;
  uint8_t attempts_ = 0;
  uint32_t sentMs_ = 0;
  uint32_t failed_ = 0;
  bool has_ = false;
  char text_[MAX_LENGTH + 1] = {};
};
