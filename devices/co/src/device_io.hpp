#pragma once

#include <Adafruit_ST7735.h>
#include <ArduinoJson.h>
#include <RTClib.h>

#include <domain_types.hpp>

// Sprzęt ESP32: ekran ST7735 (128×160, pionowo), RTC DS3231, NTP, Wi-Fi
// z AP MyHome-HeatPump-… i odpowiedź na magistrali RS-485.
// Wszystko wywołuje main.cpp.

// Start ekranu i Wi-Fi (do 10 s czekania), potem NTP; false = brak czasu.
bool initializeDevice(RTC_DS3231 &rtc, Adafruit_ST7735 &display);
// Ustawia RTC na czas warszawski z pl.pool.ntp.org (CET/CEST liczone lokalnie).
bool synchronizeClock(RTC_DS3231 &rtc);
void displayStatus(Adafruit_ST7735 &display, const String &text, int line = 0);
// Ekran trybu: źródło (LOCAL/CLOUD), tryb (RECZNY/AUTO/OFF), IP i adres AP.
void displayControllerMode(Adafruit_ST7735 &display,
  ControllerMode controllerMode, WORK_MODE workMode);
// Ekran główny (układ opisany w CLAUDE.md, punkt 13, „Ekran”).
// outdoorCurrent false shows "--" instead of outdoorTemperature.
void renderDashboard(Adafruit_ST7735 &display,
  const DateTime &rtcTime, const JsonDocument &telemetry,
  ControllerMode controllerMode, WORK_MODE workMode, const PV &pv,
  bool pvTemperatureCurrent, const DeviceSettings &settings,
  float outdoorTemperature, bool outdoorCurrent);
// Connected to the configured network and holding an address.
bool stationOnline();
bool accessPointEnabled();
void setAccessPointEnabled(bool enabled);
// Odpowiedź `co` (adres 0x10) na magistrali: tekst JSON zakończony CRLF.
void writeSerialResponse(const String &text);
