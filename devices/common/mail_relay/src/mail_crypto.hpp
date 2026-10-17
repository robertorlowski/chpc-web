#pragma once
// Przekaźnik poczty (2026-10-17): klucz płytki i odszyfrowanie danych z chmury.
// Para kluczy P-256 powstaje na płytce przy pierwszym starcie (sprzętowy generator liczb losowych); w NVS leży
// tylko klucz prywatny (32 B, klucz „mail_key” w przestrzeni sterownika). Klucz publiczny idzie w zgłoszeniu
// (pole mailKey, base64 65 B), a chmura szyfruje nim dane SMTP i maile: ECDH z kluczem jednorazowym chmury,
// klucz AES = SHA-256(wspólny sekret ‖ klucz jednorazowy ‖ „chpc-mail-v1”), AES-256-GCM z AAD
// (server/src/core/services/mail-relay.service.ts, encryptFor). Danych SMTP płytka nie zapisuje.
#include <Arduino.h>
#include <Preferences.h>

namespace mail_relay {

class MailCrypto {
public:
  // Wczytuje klucz z NVS albo tworzy nowy i zapisuje. False = błąd mbedtls albo NVS (przekaźnik nieczynny).
  bool begin(Preferences &preferences);
  bool ready() const { return publicKeyBase64.length() > 0; }
  // klucz publiczny do zgłoszenia i odcisk do porównania z aplikacją (strona /install)
  const String &publicKey() const { return publicKeyBase64; }
  const String &fingerprint() const { return fingerprintValue; }
  // Odszyfrowuje {epk, iv, ct, tag} (base64) z danym AAD; false = zły klucz, uszkodzone dane albo inne AAD.
  bool decrypt(const String &epk, const String &iv, const String &ct, const String &tag, const String &aad, String &plain);

private:
  uint8_t privateKey[32] = {0};
  String publicKeyBase64;
  String fingerprintValue;
};

}  // namespace mail_relay
