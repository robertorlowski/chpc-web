// Implementacja econet.hpp.
#include <econet.hpp>

#include <cstring>

namespace {
// PyPlumIO EncryptionType.WPA2
constexpr uint8_t ENCRYPTION_WPA2 = 4;
// wersja programu ecoNET zgłaszana regulatorowi (trzy liczby jak w PyPlumIO)
constexpr uint16_t SOFTWARE_VERSION[3] = {1, 1, 0};

size_t appendBytes(uint8_t *out, size_t at, const uint8_t *bytes, size_t count)
{
  memcpy(out + at, bytes, count);
  return at + count;
}
}

size_t buildEconetFrame(uint8_t recipient, uint8_t frameType, const uint8_t *data, size_t dataLength,
  uint8_t *out, size_t outSize)
{
  const size_t length = 7 + 1 + dataLength + 2;
  if (length > outSize || length > 0xFFFF) return 0;
  out[0] = ECOMAX_START_BYTE;
  out[1] = static_cast<uint8_t>(length & 0xFF);
  out[2] = static_cast<uint8_t>(length >> 8);
  out[3] = recipient;
  out[4] = ECONET_ADDRESS;
  out[5] = ECONET_SENDER_TYPE;
  out[6] = ECONET_PROTOCOL_VERSION;
  out[7] = frameType;
  if (dataLength > 0) memcpy(out + 8, data, dataLength);
  uint8_t bcc = 0;
  for (size_t index = 0; index < length - 2; index++) bcc ^= out[index];
  out[length - 2] = bcc;
  out[length - 1] = ECOMAX_END_BYTE;
  return length;
}

size_t buildEconetResponse(const EcomaxFrame &request, const EconetNetworkInfo &network, uint8_t *out,
  size_t outSize)
{
  if (request.recipient != ECONET_ADDRESS || request.sender != ECOMAX_ADDRESS_ECOMAX) return 0;

  uint8_t data[64] = {};
  size_t at = 0;
  if (request.type == ECOMAX_FRAME_CHECK_DEVICE) {
    // NetworkInfoStructure.encode: 1, Ethernet (IP, maska, brama, stan), Wi-Fi (IP, maska,
    // brama), stan serwera, szyfrowanie, sygnał, stan Wi-Fi, 4 × 0, SSID (długość + znaki).
    static const uint8_t noIp[4] = {0, 0, 0, 0};
    static const uint8_t defaultMask[4] = {255, 255, 255, 0};
    data[at++] = 1;
    at = appendBytes(data, at, noIp, 4);
    at = appendBytes(data, at, defaultMask, 4);
    at = appendBytes(data, at, noIp, 4);
    data[at++] = 0;  // Ethernet niepodłączony
    at = appendBytes(data, at, network.ip, 4);
    at = appendBytes(data, at, network.netmask, 4);
    at = appendBytes(data, at, network.gateway, 4);
    data[at++] = network.cloudConnected ? 1 : 0;
    data[at++] = ENCRYPTION_WPA2;
    data[at++] = network.signalPercent > 100 ? 100 : network.signalPercent;
    data[at++] = network.wifiConnected ? 1 : 0;
    at += 4;
    const size_t ssidLength = strnlen(network.ssid, 32);
    data[at++] = static_cast<uint8_t>(ssidLength);
    at = appendBytes(data, at, reinterpret_cast<const uint8_t *>(network.ssid), ssidLength);
    return buildEconetFrame(request.sender, ECOMAX_FRAME_DEVICE_AVAILABLE, data, at, out, outSize);
  }
  if (request.type == ECOMAX_FRAME_PROGRAM_VERSION) {
    // ProgramVersionStructure "<2sB2s3s3HB": znacznik FF FF, wersja struktury 5, id 7A 00,
    // sygnatura procesora 00 00 00, wersja programu (3 × uint16 LE), adres nadawcy.
    data[at++] = 0xFF;
    data[at++] = 0xFF;
    data[at++] = 5;
    data[at++] = 0x7A;
    data[at++] = 0x00;
    at += 3;
    for (uint16_t part : SOFTWARE_VERSION) {
      data[at++] = static_cast<uint8_t>(part & 0xFF);
      data[at++] = static_cast<uint8_t>(part >> 8);
    }
    data[at++] = ECONET_ADDRESS;
    return buildEconetFrame(request.sender, ECOMAX_FRAME_PROGRAM_VERSION_RESPONSE, data, at, out, outSize);
  }
  return 0;
}

uint8_t signalPercentFromRssi(int rssi)
{
  if (rssi >= -50) return 100;
  if (rssi <= -100) return 0;
  return static_cast<uint8_t>(2 * (rssi + 100));
}

void EconetGuard::begin(uint32_t nowMs)
{
  startMs = nowMs;
}

bool EconetGuard::blocked(uint32_t nowMs) const
{
  return hasBlock && nowMs - blockedAtMs < BLOCK_MS;
}

bool EconetGuard::mayTransmit(uint32_t nowMs) const
{
  return nowMs - startMs >= LISTEN_BEFORE_TX_MS && !blocked(nowMs);
}

void EconetGuard::block(uint32_t nowMs, EconetBlockReason why)
{
  // każde kolejne zdarzenie przedłuża blokadę: włączony moduł ecoNET trzyma nas w ciszy
  hasBlock = true;
  blockedAtMs = nowMs;
  reason = why;
  txPending = false;
  collisionStreak = 0;
}

void EconetGuard::onTransmitted(const uint8_t *frame, size_t length, uint32_t nowMs, uint32_t rejectedCount)
{
  transmittedCount++;
  const uint8_t slot = nextTxSlot;
  nextTxSlot = (nextTxSlot + 1) % TX_HISTORY;
  lastTxLength[slot] = length < ECONET_MAX_FRAME ? length : ECONET_MAX_FRAME;
  memcpy(lastTx[slot], frame, lastTxLength[slot]);
  // kolejna ramka tego samego nadania nie kasuje oczekiwania na echo poprzedniej
  if (!txPending) {
    echoSeen = false;
    rejectedAtTx = rejectedCount;
  }
  lastTxMs = nowMs;
  txPending = true;
}

bool EconetGuard::isEcho(const EcomaxFrame &frame, uint8_t slot) const
{
  const uint8_t *tx = lastTx[slot];
  const size_t length = lastTxLength[slot];
  return length >= 10 && frame.recipient == tx[3] && frame.sender == tx[4] && frame.type == tx[7]
    && frame.dataLength == length - 10 && memcmp(frame.data, tx + 8, frame.dataLength) == 0;
}

bool EconetGuard::onEconetFrame(const EcomaxFrame &frame, uint32_t nowMs)
{
  // różnica ze znakiem: czas odczytu bywa sprzed nadania (ten sam obieg pętli)
  bool echo = static_cast<int32_t>(nowMs - lastTxMs) <= static_cast<int32_t>(ECHO_WINDOW_MS);
  if (echo) {
    echo = false;
    for (uint8_t slot = 0; slot < TX_HISTORY; slot++) echo = echo || isEcho(frame, slot);
  }
  if (echo) {
    echoCount++;
    echoSeen = true;
    return true;
  }
  foreignCount++;
  block(nowMs, EconetBlockReason::FOREIGN_FRAME);
  return false;
}

void EconetGuard::update(uint32_t nowMs, uint32_t rejectedCount)
{
  if (!txPending || static_cast<int32_t>(nowMs - lastTxMs) < static_cast<int32_t>(ECHO_WINDOW_MS)) return;
  txPending = false;
  if (!echoSeen && rejectedCount != rejectedAtTx) {
    collisionCount++;
    if (++collisionStreak >= COLLISIONS_TO_BLOCK) block(nowMs, EconetBlockReason::COLLISIONS);
    return;
  }
  collisionStreak = 0;
}
