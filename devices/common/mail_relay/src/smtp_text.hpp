#pragma once
// Przekaźnik poczty (2026-10-17): czyste funkcje tekstowe rozmowy SMTP i odcisku klucza, bez sieci i bez
// mbedtls, więc testowane natywnie (pio test -e native we włączniku). Używa ich smtp_client.cpp i mail_relay.cpp.
#include <cstdint>
#include <cstdio>
#include <string>

namespace mail_relay {

// Kod odpowiedzi SMTP z ostatniej linii odpowiedzi wieloliniowej („250-…” ciąg dalszy, „250 …” koniec).
// Zwraca 0, gdy tekst nie zaczyna się od trzech cyfr.
inline int smtpReplyCode(const std::string &line)
{
  if (line.size() < 3) return 0;
  for (int i = 0; i < 3; i++) if (line[i] < '0' || line[i] > '9') return 0;
  return (line[0] - '0') * 100 + (line[1] - '0') * 10 + (line[2] - '0');
}

// Linia kończy odpowiedź, gdy po kodzie jest spacja (albo nic); „-” oznacza kolejną linię tej samej odpowiedzi.
inline bool smtpReplyLast(const std::string &line)
{
  return line.size() <= 3 || line[3] != '-';
}

// Treść DATA: końce linii jako CRLF, kropka na początku linii podwojona (RFC 5321, 4.5.2), na końcu „CRLF.CRLF”.
inline std::string smtpData(const std::string &raw)
{
  std::string out;
  out.reserve(raw.size() + raw.size() / 40 + 8);
  bool lineStart = true;
  for (size_t i = 0; i < raw.size(); i++) {
    const char c = raw[i];
    if (c == '\r') continue;  // CRLF składane od nowa niżej, samotne CR pomijane
    if (c == '\n') {
      out += "\r\n";
      lineStart = true;
      continue;
    }
    if (lineStart && c == '.') out += '.';
    out += c;
    lineStart = false;
  }
  if (!lineStart) out += "\r\n";
  out += ".\r\n";
  return out;
}

// Odcisk klucza jak na serwerze (mail-relay.service.ts keyFingerprint): pierwsze 8 B SHA-256 klucza publicznego,
// wielkie litery hex w grupach po 4, np. „3F2A-91C0-7B5D-E814”.
inline std::string fingerprintText(const uint8_t digest[8])
{
  char text[20];
  snprintf(text, sizeof(text), "%02X%02X-%02X%02X-%02X%02X-%02X%02X",
    digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7]);
  return text;
}

// Adres do koperty SMTP: bez nawiasów i spacji, z jedną małpą, bez znaków sterujących (ochrona przed
// wstrzyknięciem poleceń SMTP przez adres).
inline bool safeAddress(const std::string &address)
{
  if (address.empty() || address.size() > 254) return false;
  size_t at = 0;
  for (char c : address) {
    if (c <= ' ' || c == '<' || c == '>' || c == '"' || c == 127) return false;
    if (c == '@') at++;
  }
  return at == 1 && address.front() != '@' && address.back() != '@';
}

}  // namespace mail_relay
