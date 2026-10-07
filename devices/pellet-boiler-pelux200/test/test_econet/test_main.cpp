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
#include <bus_watch.hpp>
#include "../../src/bus_watch.cpp"
#include <service_password.hpp>
#include "../../src/service_password.cpp"
#include <alerts_log.hpp>
#include "../../src/alerts_log.cpp"

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

// Włącz/wyłącz regulator (od 1.4.0, według PyPlumIO): 0x3B [0/1], potwierdzenie 0xBB.
void testControlWriter()
{
  BoilerParameterWriter writer;
  uint8_t out[ECONET_MAX_FRAME];
  TEST_ASSERT_TRUE(writer.start(0, 0, BoilerParameterWriter::CONTROL));
  TEST_ASSERT_TRUE(writer.isControl());
  TEST_ASSERT_FALSE(writer.isMixer());
  const size_t length = writer.nextRequest(0, out, sizeof(out));
  const uint8_t expected[] = {0x68, 11, 0, 0x45, 0x56, 48, 5, 0x3B, 0};
  TEST_ASSERT_EQUAL_UINT32(11, length);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));

  Bytes ack = {0x68, 10, 0, 0x00, 0x45, 0x00, 0x05, 0xBB, 0x00, 0x16};
  uint8_t bcc = 0;
  for (size_t i = 0; i < 8; i++) bcc ^= ack[i];
  ack[8] = bcc;
  EcomaxFrameParser parser;
  EcomaxFrame frame;
  TEST_ASSERT_TRUE(parse(parser, ack.data(), ack.size(), frame));
  TEST_ASSERT_TRUE(writer.onResponse(frame));
  TEST_ASSERT_FALSE(writer.busy());
}

// StartMaster bajt w bajt jak PyPlumIO: 68 0A 00 45 56 30 05 19 BCC 16, BCC = XOR = 0x5D.
void testServicePassword()
{
  ServicePasswordReader reader;
  uint8_t out[ECONET_MAX_FRAME];
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(0, out, sizeof(out)));  // bez start() nic
  reader.start();
  const size_t length = reader.nextRequest(1000, out, sizeof(out));
  // 0x3A bez danych do regulatora: 68 0A 00 45 56 30 05 3A BCC 16
  const uint8_t head[8] = {0x68, 0x0A, 0x00, 0x45, 0x56, 0x30, 0x05, 0x3A};
  TEST_ASSERT_EQUAL_UINT32(10, length);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(head, out, 8);
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(1100, out, sizeof(out)));  // czeka na odpowiedź

  EcomaxFrame frame{};
  frame.sender = ECOMAX_ADDRESS_ECOMAX;
  frame.recipient = 0x56;
  frame.type = ECOMAX_FRAME_PASSWORD_RESPONSE;
  static uint8_t bad[] = {0x00, 'a', 0x07};  // znak sterujący: odrzucone
  frame.data = bad;
  frame.dataLength = sizeof(bad);
  TEST_ASSERT_FALSE(reader.onResponse(frame));
  static uint8_t good[] = {0x04, '0', '0', '0', '1'};  // pierwszy bajt pomijany, jak PyPlumIO message[1:]
  frame.data = good;
  frame.dataLength = sizeof(good);
  TEST_ASSERT_TRUE(reader.onResponse(frame));
  TEST_ASSERT_TRUE(reader.has());
  TEST_ASSERT_EQUAL_STRING("0001", reader.text());
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_TRUE(isServicePasswordFrame(0xBA));
  TEST_ASSERT_FALSE(isServicePasswordFrame(0x3A));

  // bez odpowiedzi: 3 próby co TIMEOUT_MS, potem koniec i failed()
  reader.start();
  uint32_t now = 10000;
  for (uint8_t attempt = 0; attempt < ServicePasswordReader::ATTEMPTS; attempt++) {
    TEST_ASSERT_EQUAL_UINT32(10, reader.nextRequest(now, out, sizeof(out)));
    now += ServicePasswordReader::TIMEOUT_MS;
    reader.update(now);
  }
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_EQUAL_UINT32(1, reader.failed());
  TEST_ASSERT_EQUAL_STRING("0001", reader.text());  // poprzednie hasło zostaje
}

void testFrameVersionWatch()
{
  FrameVersionWatch watch;
  EcomaxFrameVersion table[] = {{0x56, 100}, {0x38, 2}, {0x3D, 500}};
  // pierwsza tabela tylko zapamiętuje wersje
  TEST_ASSERT_EQUAL_UINT8(0, watch.onTable(table, 3));
  TEST_ASSERT_EQUAL_UINT8(0, watch.onTable(table, 3));
  // 0x56 (dane panelu) zmienia się stale i nie jest ustawieniem
  table[0].version = 101;
  TEST_ASSERT_EQUAL_UINT8(0, watch.onTable(table, 3));
  table[1].version = 3;
  TEST_ASSERT_EQUAL_UINT8(FrameVersionWatch::REFRESH_SETTINGS, watch.onTable(table, 3));
  TEST_ASSERT_EQUAL_HEX8(0x38, watch.changedType());
  TEST_ASSERT_EQUAL_UINT16(2, watch.oldVersion());
  TEST_ASSERT_EQUAL_UINT16(3, watch.newVersion());
  // typ, którego nie ma w tabeli, zachowuje wersję: powrót z tą samą to nie zmiana
  TEST_ASSERT_EQUAL_UINT8(0, watch.onTable(table, 2));
  TEST_ASSERT_EQUAL_UINT8(0, watch.onTable(table, 3));
  // nowy typ ustawień po starcie i zmiana dziennika alarmów naraz
  EcomaxFrameVersion next[] = {{0x56, 101}, {0x38, 3}, {0x3D, 501}, {0x5C, 7}};
  TEST_ASSERT_EQUAL_UINT8(FrameVersionWatch::REFRESH_SETTINGS | FrameVersionWatch::REFRESH_ALERTS, watch.onTable(next, 4));
  TEST_ASSERT_EQUAL_HEX8(0x3D, watch.changedType());
}

void testStartMasterFrame()
{
  uint8_t out[16];
  TEST_ASSERT_EQUAL_UINT32(10, buildStartMasterFrame(out, sizeof(out)));
  const uint8_t expected[] = {0x68, 0x0A, 0x00, 0x45, 0x56, 0x30, 0x05, 0x19, 0x5D, 0x16};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expected, out, sizeof(expected));
}

EcomaxFrame watchFrame(uint8_t type, uint8_t sender = ECOMAX_ADDRESS_ECOMAX, uint8_t recipient = ECONET_ADDRESS)
{
  EcomaxFrame frame;
  frame.type = type;
  frame.sender = sender;
  frame.recipient = recipient;
  return frame;
}

// Po 30 s bez ramki StartMaster; ponownie po każdych kolejnych 30 s ciszy; ramka kończy ciszę (zdarzenie).
void testSilenceStartMaster()
{
  BusSilenceWatch watch;
  watch.begin(1000);
  // normalny ruch co 2 s: nigdy
  for (uint32_t t = 1000; t < 60000; t += 2000) {
    TEST_ASSERT_FALSE(watch.startMasterDue(t));
    watch.onFrame(watchFrame(ECOMAX_FRAME_CHECK_DEVICE), t);
  }
  watch.onFrame(watchFrame(0x35, ECOMAX_ADDRESS_ECOMAX, ECOMAX_ADDRESS_BROADCAST), 60000);
  TEST_ASSERT_FALSE(watch.startMasterDue(89999));
  TEST_ASSERT_TRUE(watch.startMasterDue(90000));
  watch.onStartMasterSent(90000);
  TEST_ASSERT_FALSE(watch.startMasterDue(119999));
  TEST_ASSERT_TRUE(watch.startMasterDue(120000));
  watch.onStartMasterSent(120000);
  TEST_ASSERT_EQUAL_UINT32(2, watch.startMasterTotal());
  // regulator odzywa się 4 s po drugiej StartMaster
  watch.onFrame(watchFrame(ECOMAX_FRAME_CHECK_DEVICE), 124000);
  TEST_ASSERT_FALSE(watch.startMasterDue(124000));
  TEST_ASSERT_EQUAL_UINT32(1, watch.eventCount());
  const BusSilenceWatch::Event &event = watch.event(0);
  TEST_ASSERT_EQUAL(BusSilenceWatch::EventKind::SILENCE, event.kind);
  TEST_ASSERT_EQUAL_UINT32(60000, event.atMs);
  TEST_ASSERT_EQUAL_UINT32(64000, event.durationMs);
  TEST_ASSERT_EQUAL_UINT16(2, event.startMasterSent);
  TEST_ASSERT_TRUE(event.wokeAfterStartMaster);
  // historia przed ciszą: 8 ostatnich ramek, ostatnia to SensorData
  TEST_ASSERT_EQUAL_UINT8(BusSilenceWatch::HISTORY, event.beforeCount);
  TEST_ASSERT_EQUAL_HEX8(0x35, event.before[BusSilenceWatch::HISTORY - 1].type);
}

// Cisza zakończona bez naszej ramki (np. w czasie blokady EconetGuard) i obce ramki 0x18 / 0x19.
void testSilenceEventsAndMasterFrames()
{
  BusSilenceWatch watch;
  watch.begin(0);
  watch.onFrame(watchFrame(ECOMAX_FRAME_STOP_MASTER, 0x50, ECOMAX_ADDRESS_ECOMAX), 1000);
  watch.onFrame(watchFrame(ECOMAX_FRAME_CHECK_DEVICE), 50000);
  TEST_ASSERT_EQUAL_UINT32(2, watch.eventCount());
  TEST_ASSERT_EQUAL(BusSilenceWatch::EventKind::MASTER_FRAME, watch.event(0).kind);
  TEST_ASSERT_EQUAL_HEX8(0x18, watch.event(0).type);
  TEST_ASSERT_EQUAL_HEX8(0x50, watch.event(0).sender);
  TEST_ASSERT_EQUAL(BusSilenceWatch::EventKind::SILENCE, watch.event(1).kind);
  TEST_ASSERT_EQUAL_UINT16(0, watch.event(1).startMasterSent);
  TEST_ASSERT_FALSE(watch.event(1).wokeAfterStartMaster);
  // pierścień: najwyżej EVENTS zdarzeń, od najstarszego
  for (uint32_t i = 0; i < 20; i++) watch.onFrame(watchFrame(ECOMAX_FRAME_START_MASTER, 0x51), 60000 + i);
  TEST_ASSERT_EQUAL_UINT32(BusSilenceWatch::EVENTS, watch.eventCount());
  TEST_ASSERT_EQUAL_UINT32(60010, watch.event(0).atMs);
}

// Odpowiedź 0xBD od panelu (0x50) do wszystkich: [łącznie, pierwszy, liczba] + liczba × 9 B.
Bytes alertsResponse(uint8_t total, uint8_t first, uint8_t count)
{
  Bytes data = {total, first, count};
  for (uint8_t i = 0; i < count; i++) {
    const uint32_t from = 1000u * (first + i), to = (first + i == 0) ? ECOMAX_ALERT_ONGOING : from + 60;
    data.push_back(static_cast<uint8_t>(first + i == 3 ? 8 : 0));
    for (int b = 0; b < 4; b++) data.push_back(static_cast<uint8_t>(from >> (8 * b)));
    for (int b = 0; b < 4; b++) data.push_back(static_cast<uint8_t>(to >> (8 * b)));
  }
  return data;
}

// Zapytanie 0x3D [pierwszy, 10] do regulatora, strony po 10 wpisów, koniec po ostatniej; brak odpowiedzi = koniec po 3 próbach.
void testAlertsLogPaging()
{
  AlertsLogReader reader;
  uint8_t out[32];
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(0, out, sizeof(out)));
  TEST_ASSERT_FALSE(reader.complete());
  reader.start();
  TEST_ASSERT_EQUAL_UINT32(12, reader.nextRequest(0, out, sizeof(out)));
  TEST_ASSERT_EQUAL_HEX8(0x45, out[3]);
  TEST_ASSERT_EQUAL_HEX8(0x3D, out[7]);
  TEST_ASSERT_EQUAL_UINT8(0, out[8]);
  TEST_ASSERT_EQUAL_UINT8(10, out[9]);
  TEST_ASSERT_EQUAL_UINT32(0, reader.nextRequest(10, out, sizeof(out)));  // czeka na odpowiedź
  Bytes page = alertsResponse(15, 0, 10);
  EcomaxFrame frame;
  frame.type = ECOMAX_FRAME_ALERTS_RESPONSE;
  frame.sender = 0x50;
  frame.recipient = ECOMAX_ADDRESS_BROADCAST;
  frame.data = page.data();
  frame.dataLength = page.size();
  TEST_ASSERT_TRUE(reader.onResponse(frame, 100));
  TEST_ASSERT_TRUE(reader.busy());
  TEST_ASSERT_EQUAL_UINT32(12, reader.nextRequest(200, out, sizeof(out)));
  TEST_ASSERT_EQUAL_UINT8(10, out[8]);
  Bytes last = alertsResponse(15, 10, 5);
  frame.data = last.data();
  frame.dataLength = last.size();
  reader.onResponse(frame, 300);
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_TRUE(reader.complete());
  TEST_ASSERT_EQUAL_UINT32(15, reader.entries());
  TEST_ASSERT_EQUAL_UINT32(ECOMAX_ALERT_ONGOING, reader.entry(0).to);
  TEST_ASSERT_EQUAL_UINT8(8, reader.entry(3).code);
  const uint32_t revision = reader.revision();
  reader.onResponse(frame, 400);  // ta sama strona jeszcze raz: bez zmiany
  TEST_ASSERT_EQUAL_UINT32(revision, reader.revision());
  // bez panelu: 3 próby po 4 s i koniec odczytu
  reader.start();
  for (uint32_t t = 1000; t < 1000 + 3 * AlertsLogReader::TIMEOUT_MS + 3; t += AlertsLogReader::TIMEOUT_MS + 1) {
    reader.nextRequest(t, out, sizeof(out));
    reader.update(t + AlertsLogReader::TIMEOUT_MS);
  }
  TEST_ASSERT_FALSE(reader.busy());
  TEST_ASSERT_EQUAL_UINT32(1, reader.failed());
}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(testMixerParameterWriter);
  RUN_TEST(testControlWriter);
  RUN_TEST(testServicePassword);
  RUN_TEST(testFrameVersionWatch);
  RUN_TEST(testStartMasterFrame);
  RUN_TEST(testAlertsLogPaging);
  RUN_TEST(testSilenceStartMaster);
  RUN_TEST(testSilenceEventsAndMasterFrames);
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
