#pragma once

#include <cstddef>
#include <cstdint>

#include <domain_types.hpp>
#include <hardware_config.hpp>

// Składa odczyt PV z dwóch odpowiedzi Modbus DTU Hoymiles (po 5 portów):
// sumy instalacji i dane każdego portu. Bez zależności od Arduino
// (test_pv_data_processor).
class PvDataProcessor {
public:
  // Na początku każdego odczytu (przed wysłaniem pierwszego zapytania).
  void reset();
  // Dokłada jedną odpowiedź 0x03 (CRC sprawdzone wcześniej); false = ramka
  // uszkodzona albo nadmiarowa.
  bool appendFrame(const uint8_t *data, size_t length);
  // True dopiero po obu odpowiedziach; ustawia pv_power wg progu [W].
  bool complete(PV &result, int64_t forceThreshold) const;

private:
  static constexpr uint8_t EXPECTED_FRAME_COUNT = PV_REQUEST_COUNT;

  PV accumulated{};
  uint8_t frameCount = 0;
  uint8_t temperatureSampleCount = 0;

  static uint32_t readUnsigned(const uint8_t *data, uint8_t deviceIndex,
    uint8_t startByte, uint8_t byteCount);
};
