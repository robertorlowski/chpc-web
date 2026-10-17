#pragma once
// Przekaźnik poczty (2026-10-17): minimalny klient SMTP z STARTTLS (port 587, Office 365). Rdzeń ESP32 2.0
// nie ma STARTTLS w WiFiClientSecure, więc rozmowa idzie gołym gniazdem lwIP, a po „STARTTLS” to samo gniazdo
// obsługuje mbedtls. Certyfikat serwera jest sprawdzany (smtp_roots.hpp) razem z nazwą hosta — hasło do poczty
// nie trafi do podstawionego serwera. Logowanie AUTH LOGIN, wiadomość wysyłana bez zmian (składa ją chmura).
// Blokuje do kilkunastu sekund: wołane tylko z zadania przekaźnika (mail_relay.cpp), nie z pętli sterownika.
#include <cstdint>
#include <string>
#include <vector>

namespace mail_relay {

struct SmtpSettings {
  std::string host;
  uint16_t port = 587;
  std::string user;
  std::string pass;
};

// Wysyła wiadomość raw (nagłówki i treść) do adresów to z kopertą from. False: error = krok i odpowiedź serwera
// (np. „AUTH: 535 5.7.139 Authentication unsuccessful”).
bool smtpSend(const SmtpSettings &settings, const std::string &from, const std::vector<std::string> &to,
  const std::string &raw, std::string &error);

}  // namespace mail_relay
