// Klucz płytki i odszyfrowanie (opis w mail_crypto.hpp). mbedtls z rdzenia ESP32 (2.28): ECP P-256, ECDH,
// SHA-256, AES-GCM, base64. Liczby losowe ze sprzętowego generatora (esp_fill_random).
#include "mail_crypto.hpp"

#include <esp_random.h>
#include <mbedtls/base64.h>
#include <mbedtls/ecdh.h>
#include <mbedtls/ecp.h>
#include <mbedtls/gcm.h>
#include <mbedtls/platform_util.h>
#include <mbedtls/sha256.h>

#include "smtp_text.hpp"

namespace mail_relay {
namespace {

constexpr const char *KEY_NVS = "mail_key";
constexpr const char *KDF_LABEL = "chpc-mail-v1";

int hardwareRandom(void *, unsigned char *output, size_t length)
{
  esp_fill_random(output, length);
  return 0;
}

// base64 → bajty; false przy błędzie albo za dużej długości
bool decodeBase64(const String &text, uint8_t *out, size_t capacity, size_t &length)
{
  return mbedtls_base64_decode(out, capacity, &length, reinterpret_cast<const unsigned char *>(text.c_str()), text.length()) == 0;
}

String encodeBase64(const uint8_t *data, size_t length)
{
  size_t outLength = 0;
  std::string out(((length + 2) / 3) * 4 + 1, '\0');
  if (mbedtls_base64_encode(reinterpret_cast<unsigned char *>(&out[0]), out.size(), &outLength, data, length) != 0) return String();
  out.resize(outLength);
  return String(out.c_str());
}

}  // namespace

bool MailCrypto::begin(Preferences &preferences)
{
  mbedtls_ecp_group group;
  mbedtls_mpi secret;
  mbedtls_ecp_point point;
  mbedtls_ecp_group_init(&group);
  mbedtls_mpi_init(&secret);
  mbedtls_ecp_point_init(&point);
  bool ok = mbedtls_ecp_group_load(&group, MBEDTLS_ECP_DP_SECP256R1) == 0;

  if (ok && preferences.getBytesLength(KEY_NVS) == sizeof(privateKey)) {
    preferences.getBytes(KEY_NVS, privateKey, sizeof(privateKey));
    ok = mbedtls_mpi_read_binary(&secret, privateKey, sizeof(privateKey)) == 0
      && mbedtls_ecp_check_privkey(&group, &secret) == 0
      && mbedtls_ecp_mul(&group, &point, &secret, &group.G, hardwareRandom, nullptr) == 0;
  } else if (ok) {
    // pierwszy start z przekaźnikiem poczty: nowy klucz (chmura musi go zatwierdzić w aplikacji)
    ok = mbedtls_ecp_gen_keypair(&group, &secret, &point, hardwareRandom, nullptr) == 0
      && mbedtls_mpi_write_binary(&secret, privateKey, sizeof(privateKey)) == 0
      && preferences.putBytes(KEY_NVS, privateKey, sizeof(privateKey)) == sizeof(privateKey);
  }

  uint8_t publicKey[65];
  size_t publicLength = 0;
  ok = ok && mbedtls_ecp_point_write_binary(&group, &point, MBEDTLS_ECP_PF_UNCOMPRESSED, &publicLength, publicKey, sizeof(publicKey)) == 0
    && publicLength == sizeof(publicKey);
  if (ok) {
    publicKeyBase64 = encodeBase64(publicKey, sizeof(publicKey));
    uint8_t digest[32];
    mbedtls_sha256(publicKey, sizeof(publicKey), digest, 0);
    fingerprintValue = String(fingerprintText(digest).c_str());
  }

  mbedtls_ecp_point_free(&point);
  mbedtls_mpi_free(&secret);
  mbedtls_ecp_group_free(&group);
  if (!ok) mbedtls_platform_zeroize(privateKey, sizeof(privateKey));
  return ok && publicKeyBase64.length() > 0;
}

bool MailCrypto::decrypt(const String &epkText, const String &ivText, const String &ctText, const String &tagText,
  const String &aad, String &plain)
{
  if (!ready()) return false;
  uint8_t epk[65], iv[12], tag[16];
  size_t epkLength = 0, ivLength = 0, tagLength = 0, ctLength = 0;
  if (!decodeBase64(epkText, epk, sizeof(epk), epkLength) || epkLength != sizeof(epk)) return false;
  if (!decodeBase64(ivText, iv, sizeof(iv), ivLength) || ivLength != sizeof(iv)) return false;
  if (!decodeBase64(tagText, tag, sizeof(tag), tagLength) || tagLength != sizeof(tag)) return false;
  const size_t ctCapacity = (ctText.length() / 4) * 3 + 3;
  std::string ct(ctCapacity, '\0');
  if (!decodeBase64(ctText, reinterpret_cast<uint8_t *>(&ct[0]), ctCapacity, ctLength)) return false;

  mbedtls_ecp_group group;
  mbedtls_mpi secret, shared;
  mbedtls_ecp_point peer;
  mbedtls_ecp_group_init(&group);
  mbedtls_mpi_init(&secret);
  mbedtls_mpi_init(&shared);
  mbedtls_ecp_point_init(&peer);
  uint8_t sharedBytes[32];
  uint8_t key[32];
  bool ok = mbedtls_ecp_group_load(&group, MBEDTLS_ECP_DP_SECP256R1) == 0
    && mbedtls_mpi_read_binary(&secret, privateKey, sizeof(privateKey)) == 0
    && mbedtls_ecp_point_read_binary(&group, &peer, epk, sizeof(epk)) == 0
    && mbedtls_ecp_check_pubkey(&group, &peer) == 0
    && mbedtls_ecdh_compute_shared(&group, &shared, &peer, &secret, hardwareRandom, nullptr) == 0
    && mbedtls_mpi_write_binary(&shared, sharedBytes, sizeof(sharedBytes)) == 0;
  if (ok) {
    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, sharedBytes, sizeof(sharedBytes));
    mbedtls_sha256_update(&sha, epk, sizeof(epk));
    mbedtls_sha256_update(&sha, reinterpret_cast<const unsigned char *>(KDF_LABEL), strlen(KDF_LABEL));
    mbedtls_sha256_finish(&sha, key);
    mbedtls_sha256_free(&sha);
  }
  mbedtls_ecp_point_free(&peer);
  mbedtls_mpi_free(&shared);
  mbedtls_mpi_free(&secret);
  mbedtls_ecp_group_free(&group);
  mbedtls_platform_zeroize(sharedBytes, sizeof(sharedBytes));
  if (!ok) return false;

  std::string out(ctLength + 1, '\0');
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  ok = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256) == 0
    && mbedtls_gcm_auth_decrypt(&gcm, ctLength, iv, sizeof(iv), reinterpret_cast<const unsigned char *>(aad.c_str()), aad.length(),
      tag, sizeof(tag), reinterpret_cast<const unsigned char *>(ct.data()), reinterpret_cast<unsigned char *>(&out[0])) == 0;
  mbedtls_gcm_free(&gcm);
  mbedtls_platform_zeroize(key, sizeof(key));
  if (!ok) {
    mbedtls_platform_zeroize(&out[0], out.size());
    return false;
  }
  out.resize(ctLength);
  plain = String(out.c_str());
  mbedtls_platform_zeroize(&out[0], out.size());
  return true;
}

}  // namespace mail_relay
