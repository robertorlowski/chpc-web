// Interfejs między symulowanym firmware CHPC (bridge_chpc.cpp) a logiką co (bridge_main.cpp).
// Osobne jednostki kompilacji: makra atrap Arduino nie mogą trafić do kodu co i ArduinoJson.
#pragma once

#include <cstdint>
#include <string>

void chpcBoot();                                   // pierwszy start z wykrywaniem czujników
std::string chpcRun(uint64_t ms);                  // upływ czasu; zwraca "restart", gdy sterownik się zrestartował
std::string chpcPoll();                            // zapytanie 0x01, zwraca JSON albo ""
void chpcSend(const uint8_t *frame, size_t length); // bajty RS-485 do sterownika
void chpcSetTemp(const std::string &name, double value);
void chpcConnect(const std::string &name, bool connected);
void chpcSetPower(double compressorWatts, double offWatts);
void chpcSetFlow(bool flowOk);
std::string chpcState();                           // przekaźniki i stan, JSON
std::string chpcLcd();
