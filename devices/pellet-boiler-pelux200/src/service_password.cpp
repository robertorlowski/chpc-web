// Implementacja service_password.hpp.
#include <service_password.hpp>

#include <econet.hpp>

void ServicePasswordReader::start()
{
  reading_ = true;
  awaiting_ = false;
  attempts_ = 0;
}

size_t ServicePasswordReader::nextRequest(uint32_t nowMs, uint8_t *out, size_t outSize)
{
  if (!reading_ || awaiting_) return 0;
  const size_t length = buildEconetFrame(ECOMAX_ADDRESS_ECOMAX, ECOMAX_FRAME_PASSWORD, nullptr, 0, out, outSize);
  if (length == 0) return 0;
  awaiting_ = true;
  sentMs_ = nowMs;
  attempts_++;
  return length;
}

void ServicePasswordReader::cancelRequest()
{
  if (!awaiting_) return;
  awaiting_ = false;
  if (attempts_ > 0) attempts_--;
}

bool ServicePasswordReader::onResponse(const EcomaxFrame &frame)
{
  if (frame.type != ECOMAX_FRAME_PASSWORD_RESPONSE || frame.dataLength < 2) return false;
  size_t length = 0;
  for (size_t index = 1; index < frame.dataLength && length < MAX_LENGTH; index++) {
    const uint8_t byte = frame.data[index];
    if (byte == 0) break;
    if (byte < 0x20 || byte > 0x7E) return false;
    text_[length++] = static_cast<char>(byte);
  }
  if (length == 0) return false;
  text_[length] = '\0';
  has_ = true;
  reading_ = false;
  awaiting_ = false;
  return true;
}

void ServicePasswordReader::update(uint32_t nowMs)
{
  if (!reading_ || !awaiting_ || nowMs - sentMs_ < TIMEOUT_MS) return;
  awaiting_ = false;
  if (attempts_ >= ATTEMPTS) {
    reading_ = false;
    failed_++;
  }
}
