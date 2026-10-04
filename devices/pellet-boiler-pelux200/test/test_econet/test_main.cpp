// Testy native odpowiedzi ecoNET (econet.*) i osłony adresu 0x56 przed fabrycznym modułem.
// Uruchamianie: pio test -e native.
#include <unity.h>

#include <cstring>
#include <vector>

#include <boiler_settings.hpp>
#include <econet.hpp>
#include "../../src/boiler_settings.cpp"
#include "../../src/ecomax_frame.cpp"
#include "../../src/econet.cpp"

namespace {
typedef std::vector<uint8_t> Bytes;

// Ramka od regulatora (0x45) do ecoNET (0x56) bez danych.
Bytes requestFrame(uint8_t type, uint8_t recipient = ECONET_ADDRESS, uint8_t sender = ECOMAX_ADDRESS_ECOMAX)
{
  Bytes f = {ECOMAX_START_BYTE, 10, 0, recipient, sender, 0x00, 0x05, type};
  uint8_t bcc = 0;
  for (uint8_t b : f) bcc ^= b;
  f.push_back(bcc);
  f.push_back(ECOMAX_END_BYTE);
  return f;
}

// Przepuszcza bajty przez parser i zwraca pierwszą ramkę (dane wskazują bufor parsera).
bool parse(EcomaxFrameParser &parser, const uint8_t *bytes, size_t length, EcomaxFrame &frame)
{
  for (size_t i = 0; i < length; i++) parser.feed(bytes[i]);
  return parser.next(frame);
}

EconetNetworkInfo network()
{
  EconetNetworkInfo info;
  const uint8_t ip[4] = {192, 168, 1, 20};
  const uint8_t gw[4] = {192, 168, 1, 1};
  memcpy(info.ip, ip, 4);
  memcpy(info.gateway, gw, 4);
  info.wifiConnected = true;
  info.cloudConnected = true;
  info.signalPercent = 60;
  strcpy(info.ssid, "dom");
  return info;
}
}

void setUp() {}
void tearDown() {}

void testDeviceAvailableAnswersCheckDevice()
{
  EcomaxFrameParser parser;
  EcomaxFrame request;
  const Bytes req = requestFrame(ECOMAX_FRAME_CHECK_DEVICE);
  TEST_ASSERT_TRUE(parse(parser, req.data(), req.size(), request));

  uint8_t out[ECONET_MAX_FRAME];
  const size_t length = buildEconetResponse(request, network(), out, sizeof(out));
  // 10 B ramki + 1 + 13 (Ethernet) + 12 (Wi-Fi) + 4 (stany) + 4 (zera) + 1 + 3 (SSID)
  TEST_ASSERT_EQUAL_UINT32(10 + 1 + 13 + 12 + 4 + 4 + 1 + 3, length);

  EcomaxFrameParser check;
  EcomaxFrame reply;
  TEST_ASSERT_TRUE(parse(check, out, length, reply));
  TEST_ASSERT_EQUAL_HEX8(ECOMAX_ADDRESS_ECOMAX, reply.recipient);
  TEST_ASSERT_EQUAL_HEX8(ECONET_ADDRESS, reply.sender);
  TEST_ASSERT_EQUAL_HEX8(ECONET_SENDER_TYPE, reply.senderType);
  TEST_ASSERT_EQUAL_HEX8(ECONET_PROTOCOL_VERSION, reply.version);
  TEST_ASSERT_EQUAL_HEX8(ECOMAX_FRAME_DEVICE_AVAILABLE, reply.type);
  TEST_ASSERT_EQUAL_UINT8(1, reply.data[0]);
  TEST_ASSERT_EQUAL_UINT8(192, reply.data[14]);  // IP Wi-Fi po 1 + 13 B Ethernetu
  TEST_ASSERT_EQUAL_UINT8(20, reply.data[17]);
  TEST_ASSERT_EQUAL_UINT8(60, reply.data[28]);   // sygnał
  TEST_ASSERT_EQUAL_UINT8(3, reply.data[34]);    // długość SSID
  TEST_ASSERT_EQUAL_MEMORY("dom", reply.data + 35, 3);
}

void testProgramVersionAnswer()
{
  EcomaxFrameParser parser;
  EcomaxFrame request;
  const Bytes req = requestFrame(ECOMAX_FRAME_PROGRAM_VERSION);
  TEST_ASSERT_TRUE(parse(parser, req.data(), req.size(), request));

  uint8_t out[ECONET_MAX_FRAME];
  const size_t length = buildEconetResponse(request, network(), out, sizeof(out));
  TEST_ASSERT_EQUAL_UINT32(10 + 15, length);
  TEST_ASSERT_EQUAL_HEX8(ECOMAX_FRAME_PROGRAM_VERSION_RESPONSE, out[7]);
  TEST_ASSERT_EQUAL_HEX8(0xFF, out[8]);
  TEST_ASSERT_EQUAL_HEX8(ECONET_ADDRESS, out[8 + 14]);
}

void testNoAnswerForOtherRecipientSenderOrType()
{
  uint8_t out[ECONET_MAX_FRAME];
  const Bytes cases[] = {
    requestFrame(ECOMAX_FRAME_CHECK_DEVICE, 0x51),        // do eSTER
    requestFrame(ECOMAX_FRAME_CHECK_DEVICE, 0x56, 0x50),  // od panelu
    requestFrame(0x31),                                   // inny typ
  };
  for (const Bytes &req : cases) {
    EcomaxFrameParser parser;
    EcomaxFrame request;
    TEST_ASSERT_TRUE(parse(parser, req.data(), req.size(), request));
    TEST_ASSERT_EQUAL_UINT32(0, buildEconetResponse(request, network(), out, sizeof(out)));
  }
}

void testSignalPercent()
{
  TEST_ASSERT_EQUAL_UINT8(100, signalPercentFromRssi(-40));
  TEST_ASSERT_EQUAL_UINT8(60, signalPercentFromRssi(-70));
  TEST_ASSERT_EQUAL_UINT8(0, signalPercentFromRssi(-105));
}

void testGuardListensFirst()
{
  EconetGuard guard;
  guard.begin(1000);
  TEST_ASSERT_FALSE(guard.mayTransmit(1000 + EconetGuard::LISTEN_BEFORE_TX_MS - 1));
  TEST_ASSERT_TRUE(guard.mayTransmit(1000 + EconetGuard::LISTEN_BEFORE_TX_MS));
}

void testGuardRecognizesOwnEcho()
{
  EconetGuard guard;
  guard.begin(0);
  EcomaxFrameParser parser;
  EcomaxFrame request;
  const Bytes req = requestFrame(ECOMAX_FRAME_CHECK_DEVICE);
  parse(parser, req.data(), req.size(), request);
  uint8_t out[ECONET_MAX_FRAME];
  const size_t length = buildEconetResponse(request, network(), out, sizeof(out));

  const uint32_t t = EconetGuard::LISTEN_BEFORE_TX_MS;
  guard.onTransmitted(out, length, t, 0);
  EcomaxFrameParser echoParser;
  EcomaxFrame echo;
  TEST_ASSERT_TRUE(parse(echoParser, out, length, echo));
  TEST_ASSERT_TRUE(guard.onEconetFrame(echo, t + 10));
  guard.update(t + EconetGuard::ECHO_WINDOW_MS, 0);
  TEST_ASSERT_TRUE(guard.mayTransmit(t + 200));
  TEST_ASSERT_EQUAL_UINT32(1, guard.echoes());
}

// Włączony fabryczny ecoNET: jego ramka od 0x56 wstrzymuje nadawanie na BLOCK_MS
// od ostatniej takiej ramki.
void testGuardYieldsToForeignEconet()
{
  EconetGuard guard;
  guard.begin(0);
  // odpowiedź innego ecoNET: inne dane niż nasze (np. inny SSID)
  EconetNetworkInfo other = network();
  strcpy(other.ssid, "inna");
  EcomaxFrameParser parser;
  EcomaxFrame request;
  const Bytes req = requestFrame(ECOMAX_FRAME_CHECK_DEVICE);
  parse(parser, req.data(), req.size(), request);
  uint8_t foreignBytes[ECONET_MAX_FRAME];
  const size_t foreignLength = buildEconetResponse(request, other, foreignBytes, sizeof(foreignBytes));
  EcomaxFrameParser foreignParser;
  EcomaxFrame foreign;
  TEST_ASSERT_TRUE(parse(foreignParser, foreignBytes, foreignLength, foreign));

  TEST_ASSERT_FALSE(guard.onEconetFrame(foreign, 30000));  // jeszcze w czasie nasłuchu
  TEST_ASSERT_FALSE(guard.mayTransmit(EconetGuard::LISTEN_BEFORE_TX_MS));
  TEST_ASSERT_TRUE(guard.blocked(30000 + EconetGuard::BLOCK_MS - 1));
  TEST_ASSERT_TRUE(guard.mayTransmit(30000 + EconetGuard::BLOCK_MS));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(EconetBlockReason::FOREIGN_FRAME), static_cast<int>(guard.blockReason()));

  // nasze nadanie i obca ramka zaraz po nim (nie echo): też blokada
  const uint32_t t = 30000 + EconetGuard::BLOCK_MS;
  uint8_t ours[ECONET_MAX_FRAME];
  const size_t oursLength = buildEconetResponse(request, network(), ours, sizeof(ours));
  guard.onTransmitted(ours, oursLength, t, 0);
  TEST_ASSERT_FALSE(guard.onEconetFrame(foreign, t + 5));
  TEST_ASSERT_FALSE(guard.mayTransmit(t + 1000));
  TEST_ASSERT_EQUAL_UINT32(2, guard.foreignFrames());
}

// Dwa moduły nadają naraz: parser odrzuca zniekształcone ramki, echa nie ma.
void testGuardBlocksAfterCollisions()
{
  EconetGuard guard;
  guard.begin(0);
  const uint8_t frame[12] = {ECOMAX_START_BYTE, 12, 0, 0x45, 0x56, 48, 5, 0xB0, 0, 0, 0, ECOMAX_END_BYTE};
  uint32_t t = EconetGuard::LISTEN_BEFORE_TX_MS;
  uint32_t rejected = 0;
  for (uint8_t i = 0; i < EconetGuard::COLLISIONS_TO_BLOCK; i++) {
    TEST_ASSERT_TRUE(guard.mayTransmit(t));
    guard.onTransmitted(frame, sizeof(frame), t, rejected);
    rejected += 2;
    guard.update(t + EconetGuard::ECHO_WINDOW_MS, rejected);
    t += 2000;
  }
  TEST_ASSERT_FALSE(guard.mayTransmit(t));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(EconetBlockReason::COLLISIONS), static_cast<int>(guard.blockReason()));
}

// Pojedyncza kolizja (zakłócenie) bez kolejnych nie blokuje.
void testGuardSingleCollisionIsForgiven()
{
  EconetGuard guard;
  guard.begin(0);
  const uint8_t frame[12] = {ECOMAX_START_BYTE, 12, 0, 0x45, 0x56, 48, 5, 0xB0, 0, 0, 0, ECOMAX_END_BYTE};
  uint32_t t = EconetGuard::LISTEN_BEFORE_TX_MS;
  for (uint8_t i = 0; i < 10; i++) {
    const uint32_t rejectedBefore = i % 2 == 0 ? 0 : 5;
    guard.onTransmitted(frame, sizeof(frame), t, rejectedBefore);
    guard.update(t + EconetGuard::ECHO_WINDOW_MS, rejectedBefore + (i % 2 == 0 ? 1 : 0));
    t += 2000;
  }
  TEST_ASSERT_TRUE(guard.mayTransmit(t));
  TEST_ASSERT_EQUAL_UINT32(5, guard.collisions());
}

// Odpowiedź i doklejone zapytanie: echo każdej z dwóch ramek to nie obcy moduł.
void testGuardEchoOfReplyAndRequest()
{
  EconetGuard guard;
  guard.begin(0);
  EcomaxFrameParser parser;
  EcomaxFrame request;
  const Bytes req = requestFrame(ECOMAX_FRAME_CHECK_DEVICE);
  parse(parser, req.data(), req.size(), request);
  uint8_t reply[ECONET_MAX_FRAME];
  const size_t replyLength = buildEconetResponse(request, network(), reply, sizeof(reply));
  BoilerSettingsReader reader;
  reader.start();
  uint8_t query[ECONET_MAX_FRAME];
  const uint32_t t = EconetGuard::LISTEN_BEFORE_TX_MS;
  const size_t queryLength = reader.nextRequest(t, query, sizeof(query));

  guard.onTransmitted(reply, replyLength, t, 0);
  guard.onTransmitted(query, queryLength, t, 0);
  EcomaxFrameParser echoParser;
  EcomaxFrame echo;
  TEST_ASSERT_TRUE(parse(echoParser, reply, replyLength, echo));
  TEST_ASSERT_TRUE(guard.onEconetFrame(echo, t + 5));
  TEST_ASSERT_TRUE(parse(echoParser, query, queryLength, echo));
  TEST_ASSERT_TRUE(guard.onEconetFrame(echo, t + 6));
  TEST_ASSERT_TRUE(guard.mayTransmit(t + 200));
}

void testSettingsRequestFrame()
{
  BoilerSettingsReader reader;
  uint8_t out[ECONET_MAX_FRAME];
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(0, out, sizeof(out)));  // nic nie zlecono
  reader.start();
  const size_t length = reader.nextRequest(0, out, sizeof(out));
  const uint8_t expected[] = {0x68, 12, 0, 0x45, 0x56, 48, 5, 0x31, 255, 0};
  TEST_ASSERT_EQUAL_UINT32(12, length);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));
  uint8_t bcc = 0;
  for (size_t i = 0; i < 10; i++) bcc ^= out[i];
  TEST_ASSERT_EQUAL_HEX8(bcc, out[10]);
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(10, out, sizeof(out)));  // czeka na odpowiedź
}

// Odpowiedź 0xB1 (regulator wysyła ją do wszystkich, 0x00) jest zapisywana, potem idzie
// następne zapytanie (0x32).
void testSettingsResponseStoredAndNext()
{
  BoilerSettingsReader reader;
  reader.start();
  uint8_t out[ECONET_MAX_FRAME];
  reader.nextRequest(0, out, sizeof(out));

  Bytes response = {0x68, 0, 0, 0x00, 0x45, 0x00, 0x05, 0xB1, 0x00, 0x00, 0x02, 67, 40, 85, 10, 1, 30};
  response[1] = static_cast<uint8_t>(response.size() + 2);
  uint8_t bcc = 0;
  for (uint8_t b : response) bcc ^= b;
  response.push_back(bcc);
  response.push_back(ECOMAX_END_BYTE);
  EcomaxFrameParser parser;
  EcomaxFrame frame;
  TEST_ASSERT_TRUE(parse(parser, response.data(), response.size(), frame));
  TEST_ASSERT_TRUE(reader.onResponse(frame, 100));
  TEST_ASSERT_TRUE(reader.has(0));
  TEST_ASSERT_EQUAL_UINT32(9, reader.length(0));
  TEST_ASSERT_EQUAL_UINT8(67, reader.data(0)[3]);
  TEST_ASSERT_EQUAL_INT8(1, reader.current());
  TEST_ASSERT_EQUAL_UINT32(12, reader.nextRequest(200, out, sizeof(out)));
  TEST_ASSERT_EQUAL_HEX8(0x32, out[7]);
}

// Bez odpowiedzi: dwa ponowienia, po trzeciej próbie następne zapytanie; na końcu koniec odczytu.
void testSettingsTimeoutsAndEnd()
{
  BoilerSettingsReader reader;
  reader.start();
  uint8_t out[ECONET_MAX_FRAME];
  uint32_t t = 0;
  for (uint8_t item = 0; item < BOILER_SETTINGS_COUNT; item++) {
    for (uint8_t attempt = 0; attempt < BoilerSettingsReader::ATTEMPTS; attempt++) {
      TEST_ASSERT_TRUE(reader.nextRequest(t, out, sizeof(out)) > 0);
      TEST_ASSERT_EQUAL_HEX8(BOILER_SETTINGS_REQUESTS[item].type, out[7]);
      reader.update(t + BoilerSettingsReader::TIMEOUT_MS - 1);
      TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(t + 1, out, sizeof(out)));
      t += BoilerSettingsReader::TIMEOUT_MS;
      reader.update(t);
    }
  }
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_EQUAL_UINT32(BOILER_SETTINGS_COUNT, reader.failed());
}

// Zmiana parametru: ramka 0x33 [nr, wartość], potwierdzenie 0xB3 (do 0x00), ponowienia.
void testParameterWriter()
{
  BoilerParameterWriter writer;
  uint8_t out[ECONET_MAX_FRAME];
  TEST_ASSERT_EQUAL_UINT32(0, writer.nextRequest(0, out, sizeof(out)));
  TEST_ASSERT_TRUE(writer.start(119, 50));
  TEST_ASSERT_FALSE(writer.start(98, 60));  // jedna zmiana naraz
  const size_t length = writer.nextRequest(0, out, sizeof(out));
  const uint8_t expected[] = {0x68, 12, 0, 0x45, 0x56, 48, 5, 0x33, 119, 50};
  TEST_ASSERT_EQUAL_UINT32(12, length);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));

  const uint8_t ack[] = {0x68, 10, 0, 0x00, 0x45, 0x00, 0x05, 0xB3, 0x00, 0x16};
  Bytes frameBytes(ack, ack + sizeof(ack));
  uint8_t bcc = 0;
  for (size_t i = 0; i < 8; i++) bcc ^= frameBytes[i];
  frameBytes[8] = bcc;
  EcomaxFrameParser parser;
  EcomaxFrame frame;
  TEST_ASSERT_TRUE(parse(parser, frameBytes.data(), frameBytes.size(), frame));
  TEST_ASSERT_TRUE(writer.onResponse(frame));
  TEST_ASSERT_FALSE(writer.busy());
  TEST_ASSERT_EQUAL_INT(static_cast<int>(BoilerParameterWriter::Result::CONFIRMED),
    static_cast<int>(writer.result()));

  TEST_ASSERT_TRUE(writer.start(119, 55));
  uint32_t t = 0;
  for (uint8_t attempt = 0; attempt < BoilerParameterWriter::ATTEMPTS; attempt++) {
    TEST_ASSERT_TRUE(writer.nextRequest(t, out, sizeof(out)) > 0);
    t += BoilerParameterWriter::TIMEOUT_MS;
    writer.update(t);
  }
  TEST_ASSERT_FALSE(writer.busy());
  TEST_ASSERT_EQUAL_INT(static_cast<int>(BoilerParameterWriter::Result::FAILED), static_cast<int>(writer.result()));
}

// Mieszacz (od 1.3.0, według PyPlumIO): 0x34 [mieszacz od 0, nr, wartość], potwierdzenie 0xB4;
// potwierdzenie 0xB3 (parametr kotła) nie kończy zmiany mieszacza.
void testMixerParameterWriter()
{
  BoilerParameterWriter writer;
  uint8_t out[ECONET_MAX_FRAME];
  TEST_ASSERT_TRUE(writer.start(0, 45, 0));
  TEST_ASSERT_TRUE(writer.isMixer());
  const size_t length = writer.nextRequest(0, out, sizeof(out));
  const uint8_t expected[] = {0x68, 13, 0, 0x45, 0x56, 48, 5, 0x34, 0, 0, 45};
  TEST_ASSERT_EQUAL_UINT32(13, length);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));

  auto ack = [](uint8_t type) {
    Bytes bytes = {0x68, 10, 0, 0x00, 0x45, 0x00, 0x05, type, 0x00, 0x16};
    uint8_t bcc = 0;
    for (size_t i = 0; i < 8; i++) bcc ^= bytes[i];
    bytes[8] = bcc;
    return bytes;
  };
  EcomaxFrameParser parser;
  EcomaxFrame frame;
  Bytes wrong = ack(0xB3);
  TEST_ASSERT_TRUE(parse(parser, wrong.data(), wrong.size(), frame));
  TEST_ASSERT_FALSE(writer.onResponse(frame));
  Bytes right = ack(0xB4);
  TEST_ASSERT_TRUE(parse(parser, right.data(), right.size(), frame));
  TEST_ASSERT_TRUE(writer.onResponse(frame));
  TEST_ASSERT_FALSE(writer.busy());

  // kolejna zmiana bez mieszacza znów jest parametrem kotła
  TEST_ASSERT_TRUE(writer.start(119, 50));
  TEST_ASSERT_FALSE(writer.isMixer());
}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(testMixerParameterWriter);
  RUN_TEST(testDeviceAvailableAnswersCheckDevice);
  RUN_TEST(testProgramVersionAnswer);
  RUN_TEST(testNoAnswerForOtherRecipientSenderOrType);
  RUN_TEST(testSignalPercent);
  RUN_TEST(testGuardListensFirst);
  RUN_TEST(testGuardRecognizesOwnEcho);
  RUN_TEST(testGuardYieldsToForeignEconet);
  RUN_TEST(testGuardBlocksAfterCollisions);
  RUN_TEST(testGuardSingleCollisionIsForgiven);
  RUN_TEST(testGuardEchoOfReplyAndRequest);
  RUN_TEST(testSettingsRequestFrame);
  RUN_TEST(testSettingsResponseStoredAndNext);
  RUN_TEST(testSettingsTimeoutsAndEnd);
  RUN_TEST(testParameterWriter);
  return UNITY_END();
}
