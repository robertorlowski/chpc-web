// Testy parsera ramek ecoMAX, dekodera SensorData i JSON-a pieca Pellux 200.
// Ramki budowane ręcznie według opisu z PyPlumIO (niezweryfikowane na sprzęcie).
// Uruchamianie: pio test -e native.
#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>

#include <cmath>
#include <cstring>
#include <vector>

#include <ecomax_frame.hpp>
#include <pellet_telemetry.hpp>
#include "../../src/ecomax_frame.cpp"
#include "../../src/pellet_telemetry.cpp"

namespace {
typedef std::vector<uint8_t> Bytes;

void putF32(Bytes &b, float v)
{
  uint32_t raw;
  std::memcpy(&raw, &v, 4);
  for (int i = 0; i < 4; i++) b.push_back((raw >> (8 * i)) & 0xFF);
}

void putU32(Bytes &b, uint32_t v)
{
  for (int i = 0; i < 4; i++) b.push_back((v >> (8 * i)) & 0xFF);
}

// Bajty tabeli wersji na początku SensorData: liczba wpisów i po 3 bajty (typ + uint16).
constexpr size_t FRAME_VERSIONS_SIZE = 1 + 2 * 3;

// Dane SensorData: tabela wersji, state, outputs, flags, temperatury, cele, alerty, reszta.
Bytes sensorPayload(bool tail = true)
{
  Bytes d;
  d.push_back(2);                       // 2 wpisy tabeli wersji
  d.push_back(0x31); d.push_back(0x10); d.push_back(0x27);
  d.push_back(0x55); d.push_back(0x34); d.push_back(0x12);
  d.push_back(3);                       // state
  putU32(d, ECOMAX_OUT_FAN | ECOMAX_OUT_HEATING_PUMP | ECOMAX_OUT_ALARM);
  putU32(d, 0);                         // output_flags
  d.push_back(4);                       // 4 temperatury
  d.push_back(0); putF32(d, 61.5f);     // heating
  d.push_back(3); putF32(d, NAN);       // outside: NaN
  d.push_back(5); putF32(d, 140.0f);    // exhaust
  d.push_back(200); putF32(d, 9.0f);    // indeks poza zakresem
  d.push_back(65);                      // heating_target
  d.push_back(1);                       // heating_status
  d.push_back(0xFF);                    // water_heater_target: brak
  d.push_back(0);                       // water_heater_status
  d.push_back(2);                       // 2 alerty
  d.push_back(0xAA); d.push_back(0xBB);
  d.push_back(57);                      // fuel_level
  if (!tail) return d;
  d.push_back(0);                       // transmission
  putF32(d, 35.0f);                     // fan_power
  d.push_back(40);                      // boiler_load
  putF32(d, 12.5f);                     // boiler_power
  putF32(d, 1.25f);                     // fuel_consumption
  return d;
}

// Pełna ramka do mieszaczy (kolejność PyPlumIO): termostat, 6 modułów (A z 5 B, B brak, panel
// 3 B, reszta brak), lambda (jest: 4 B), termostaty (styki + 1 × 9 B), 3 mieszacze
// (1 i 2 podłączone, 3 NaN).
Bytes sensorPayloadWithMixers()
{
  Bytes d = sensorPayload();
  d.push_back(0);                                            // thermostat
  d.push_back(18); d.push_back(21); d.push_back(85);         // moduł A: wersja
  d.push_back('P'); d.push_back(1);                          // moduł A: producent
  d.push_back(0xFF);                                         // moduł B: brak
  d.push_back(0xFF); d.push_back(0xFF); d.push_back(0xFF);   // C, ecoLAMBDA, ecoSTER
  d.push_back(1); d.push_back(2); d.push_back(3);            // panel
  d.push_back(1); d.push_back(40); d.push_back(0x10); d.push_back(0x00);  // lambda
  d.push_back(0x01); d.push_back(1);                         // styki, 1 termostat
  d.push_back(0); putF32(d, 21.0f); putF32(d, 22.0f);        // termostat 1
  d.push_back(3);                                            // 3 mieszacze
  putF32(d, 31.5f); d.push_back(35); d.push_back(0x08);      // mieszacz 1: pompa, otwiera
  d.push_back(0x08 | ECOMAX_MIXER_PUMP | ECOMAX_MIXER_OPENING); d.push_back(0);
  putF32(d, 27.0f); d.push_back(25); d.push_back(0x08);      // mieszacz 2: zamyka
  d.push_back(0x08 | ECOMAX_MIXER_CLOSING); d.push_back(0);
  putF32(d, NAN); d.push_back(0); d.push_back(0); d.push_back(0); d.push_back(0);
  return d;
}

Bytes frame(const Bytes &data, uint8_t sender = 0x45, uint8_t type = 0x35)
{
  Bytes f;
  size_t length = data.size() + 10;
  f.push_back(0x68);
  f.push_back(length & 0xFF);
  f.push_back(length >> 8);
  f.push_back(0x00);      // odbiorca
  f.push_back(sender);
  f.push_back(0x45);      // typ nadawcy
  f.push_back(0x05);      // wersja
  f.push_back(type);
  f.insert(f.end(), data.begin(), data.end());
  uint8_t bcc = 0;
  for (uint8_t b : f) bcc ^= b;
  f.push_back(bcc);
  f.push_back(0x16);
  return f;
}

void feedAll(EcomaxFrameParser &p, const Bytes &b)
{
  for (uint8_t x : b) p.feed(x);
}

void testDecodesValidSensorData()
{
  Bytes data = sensorPayload();
  EcomaxFrameParser parser;
  feedAll(parser, frame(data));
  EcomaxFrame f;
  TEST_ASSERT_TRUE(parser.next(f));
  TEST_ASSERT_TRUE(isSensorDataFrame(f));
  TEST_ASSERT_EQUAL_UINT32(data.size(), f.dataLength);

  EcomaxSensorData s;
  TEST_ASSERT_TRUE(decodeSensorData(f.data, f.dataLength, s));
  TEST_ASSERT_EQUAL_UINT8(3, s.state);
  TEST_ASSERT_TRUE(s.outputs & ECOMAX_OUT_FAN);
  TEST_ASSERT_FALSE(s.outputs & ECOMAX_OUT_FEEDER);
  TEST_ASSERT_TRUE(s.temperatures[0].present);
  TEST_ASSERT_EQUAL_FLOAT(61.5f, s.temperatures[0].value);
  TEST_ASSERT_FALSE(s.temperatures[3].present);  // NaN
  TEST_ASSERT_TRUE(s.temperatures[5].present);
  TEST_ASSERT_FALSE(s.temperatures[1].present);
  TEST_ASSERT_TRUE(s.heatingTarget.present);
  TEST_ASSERT_EQUAL_UINT8(65, s.heatingTarget.value);
  TEST_ASSERT_FALSE(s.waterHeaterTarget.present);
  TEST_ASSERT_TRUE(s.waterHeaterStatus.present);
  TEST_ASSERT_EQUAL_UINT8(57, s.fuelLevel.value);
  TEST_ASSERT_EQUAL_FLOAT(35.0f, s.fanPower.value);
  TEST_ASSERT_EQUAL_UINT8(40, s.boilerLoad.value);
  TEST_ASSERT_EQUAL_FLOAT(12.5f, s.boilerPower.value);
  TEST_ASSERT_EQUAL_FLOAT(1.25f, s.fuelConsumption.value);
}

void testBadBccIsRejected()
{
  Bytes f = frame(sensorPayload());
  f[f.size() - 2] ^= 0x01;
  EcomaxFrameParser parser;
  feedAll(parser, f);
  EcomaxFrame out;
  TEST_ASSERT_FALSE(parser.next(out));
  TEST_ASSERT_TRUE(parser.rejectedCount() > 0);
}

void testTruncatedFrameWaitsAndThenCompletes()
{
  Bytes f = frame(sensorPayload());
  EcomaxFrameParser parser;
  EcomaxFrame out;
  for (size_t i = 0; i + 1 < f.size(); i++) parser.feed(f[i]);
  TEST_ASSERT_FALSE(parser.next(out));
  parser.feed(f.back());
  TEST_ASSERT_TRUE(parser.next(out));
}

void testResynchronizesAfterGarbage()
{
  Bytes stream = {0x00, 0x13, 0x68, 0x02, 0x00, 0x99, 0x16};  // fałszywy 0x68
  Bytes f = frame(sensorPayload());
  stream.insert(stream.end(), f.begin(), f.end());
  EcomaxFrameParser parser;
  feedAll(parser, stream);
  EcomaxFrame out;
  TEST_ASSERT_TRUE(parser.next(out));
  TEST_ASSERT_EQUAL_HEX8(0x35, out.type);
  TEST_ASSERT_FALSE(parser.next(out));
}

void testTwoFramesInARow()
{
  Bytes first = sensorPayload();
  Bytes second = sensorPayload();
  second[FRAME_VERSIONS_SIZE] = 7;  // state za tabelą wersji
  Bytes stream = frame(first);
  Bytes f2 = frame(second);
  stream.insert(stream.end(), f2.begin(), f2.end());
  EcomaxFrameParser parser;
  feedAll(parser, stream);
  EcomaxFrame out;
  EcomaxSensorData s;
  TEST_ASSERT_TRUE(parser.next(out));
  TEST_ASSERT_TRUE(decodeSensorData(out.data, out.dataLength, s));
  TEST_ASSERT_EQUAL_UINT8(3, s.state);
  TEST_ASSERT_TRUE(parser.next(out));
  TEST_ASSERT_TRUE(decodeSensorData(out.data, out.dataLength, s));
  TEST_ASSERT_EQUAL_UINT8(7, s.state);
  TEST_ASSERT_FALSE(parser.next(out));
}

void testOversizedFrameIsRejected()
{
  Bytes f = frame(Bytes(1100, 0x11));  // 1110 B > ECOMAX_MAX_FRAME
  EcomaxFrameParser parser;
  EcomaxFrame out;
  // Jak w readBus() (pellet.cpp): next() po każdym bajcie.
  for (uint8_t x : f) {
    parser.feed(x);
    TEST_ASSERT_FALSE(parser.next(out));
  }
  TEST_ASSERT_TRUE(parser.rejectedCount() > 0);
  // Po takim śmieciu parser nadal przyjmuje poprawną ramkę.
  feedAll(parser, frame(sensorPayload()));
  TEST_ASSERT_TRUE(parser.next(out));
}

void testFuelLevelAbove100()
{
  Bytes d = sensorPayload();
  // fuel_level jest przed: transmission, fan_power, load, power, consumption.
  size_t fuelIndex = d.size() - (1 + 4 + 1 + 4 + 4) - 1;
  TEST_ASSERT_EQUAL_UINT8(57, d[fuelIndex]);
  d[fuelIndex] = 101 + 42;
  EcomaxSensorData s;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size(), s));
  TEST_ASSERT_TRUE(s.fuelLevel.present);
  TEST_ASSERT_EQUAL_UINT8(42, s.fuelLevel.value);

  d[fuelIndex] = 0xFF;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size(), s));
  TEST_ASSERT_FALSE(s.fuelLevel.present);
}

void testShortPayloadReturnsWhatWasRead()
{
  Bytes d = sensorPayload(false);  // kończy się na fuel_level
  EcomaxSensorData s;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size(), s));
  TEST_ASSERT_TRUE(s.fuelLevel.present);
  TEST_ASSERT_FALSE(s.fanPower.present);
  TEST_ASSERT_FALSE(s.boilerPower.present);

  // Urwane po pierwszej temperaturze: zostają tylko poprawnie odczytane.
  EcomaxSensorData t;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), FRAME_VERSIONS_SIZE + 9 + 1 + 5 + 2, t));
  TEST_ASSERT_TRUE(t.temperatures[0].present);
  TEST_ASSERT_FALSE(t.temperatures[5].present);
  TEST_ASSERT_FALSE(t.heatingTarget.present);

  TEST_ASSERT_FALSE(decodeSensorData(d.data(), 3, t));
  TEST_ASSERT_FALSE(t.valid);
  TEST_ASSERT_FALSE(decodeSensorData(nullptr, 0, t));
}

void testOtherSenderOrTypeIsNotSensorData()
{
  EcomaxFrameParser parser;
  feedAll(parser, frame(sensorPayload(), 0x51));
  feedAll(parser, frame(sensorPayload(), 0x45, 0x30));
  EcomaxFrame out;
  TEST_ASSERT_TRUE(parser.next(out));
  TEST_ASSERT_FALSE(isSensorDataFrame(out));
  TEST_ASSERT_TRUE(parser.next(out));
  TEST_ASSERT_FALSE(isSensorDataFrame(out));
}

void testJsonHasOnlyReadFields()
{
  Bytes d = sensorPayload();
  EcomaxSensorData s;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size(), s));
  JsonDocument doc;
  fillPelletJson(doc, s);
  TEST_ASSERT_EQUAL_INT(3, doc["state"].as<int>());
  TEST_ASSERT_TRUE(doc["heating_temp"].is<float>());
  TEST_ASSERT_TRUE(doc["outside_temp"].isNull());
  TEST_ASSERT_TRUE(doc["water_heater_target"].isNull());
  TEST_ASSERT_EQUAL_INT(65, doc["heating_target"].as<int>());
  TEST_ASSERT_TRUE(doc["fan"].as<bool>());
  TEST_ASSERT_FALSE(doc["feeder"].as<bool>());
  TEST_ASSERT_TRUE(doc["alarm"].as<bool>());
  TEST_ASSERT_TRUE(doc["mixer1_temp"].isNull());  // ramka bez części mieszaczy
}

void testMixersAfterModulesLambdaAndThermostats()
{
  Bytes d = sensorPayloadWithMixers();
  EcomaxSensorData s;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size(), s));
  TEST_ASSERT_TRUE(s.mixers[0].present);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 31.5f, s.mixers[0].temperature);
  TEST_ASSERT_EQUAL_UINT8(35, s.mixers[0].target);
  TEST_ASSERT_TRUE(s.mixers[1].present);
  TEST_ASSERT_EQUAL_UINT8(25, s.mixers[1].target);
  TEST_ASSERT_FALSE(s.mixers[2].present);  // NaN = niepodłączony

  JsonDocument doc;
  fillPelletJson(doc, s);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 31.5f, doc["mixer1_temp"].as<float>());
  TEST_ASSERT_EQUAL_INT(35, doc["mixer1_target"].as<int>());
  TEST_ASSERT_TRUE(doc["mixer1_pump"].as<bool>());
  TEST_ASSERT_TRUE(doc["mixer1_opening"].as<bool>());
  TEST_ASSERT_FALSE(doc["mixer1_closing"].as<bool>());
  TEST_ASSERT_FALSE(doc["mixer2_pump"].as<bool>());
  TEST_ASSERT_TRUE(doc["mixer2_closing"].as<bool>());
  TEST_ASSERT_TRUE(doc["mixer3_temp"].isNull());  // do JSON idą tylko mieszacze 1 i 2

  // Urwana w środku mieszacza 2: mieszacz 1 zostaje, 2 nie.
  EcomaxSensorData t;
  TEST_ASSERT_TRUE(decodeSensorData(d.data(), d.size() - 12, t));
  TEST_ASSERT_TRUE(t.mixers[0].present);
  TEST_ASSERT_FALSE(t.mixers[1].present);
}
}

void setUp() {}
void tearDown() {}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(testDecodesValidSensorData);
  RUN_TEST(testBadBccIsRejected);
  RUN_TEST(testTruncatedFrameWaitsAndThenCompletes);
  RUN_TEST(testResynchronizesAfterGarbage);
  RUN_TEST(testTwoFramesInARow);
  RUN_TEST(testOversizedFrameIsRejected);
  RUN_TEST(testFuelLevelAbove100);
  RUN_TEST(testShortPayloadReturnsWhatWasRead);
  RUN_TEST(testOtherSenderOrTypeIsNotSensorData);
  RUN_TEST(testJsonHasOnlyReadFields);
  RUN_TEST(testMixersAfterModulesLambdaAndThermostats);
  return UNITY_END();
}
