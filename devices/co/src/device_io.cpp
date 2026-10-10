// Obsługa sprzętu ESP32: ekran ST7735 (ekran trybu i główny), RTC DS3231
// z synchronizacją NTP, start Wi-Fi w trybie AP+STA, włączanie AP MyHome-HeatPump-…
// i zapis odpowiedzi na magistralę (przekaźniki CO/CWU usunięte w 1.2.0).
#include <device_io.hpp>

#include <cstring>

#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <NTPClient.h>
#include <WiFi.h>
#include <Wire.h>

#include <device_config.hpp>

namespace {
// Układ ekranu głównego (renderDashboard, od 1.2.3): linia bazowa dużego T i T. zew, przesunięcie dużego T
// w prawo (miejsce na „F”) i zejście dolnej linii, zakresu i szczegółów pompy w dół.
constexpr int16_t TANK_BASELINE = 54;
constexpr int16_t TANK_SHIFT = 6;
constexpr int16_t OUTDOOR_BASELINE = 72;
constexpr int DETAILS_DY = 8;

// Otwarta sieć sterownika (AP) pod stałym adresem 10.10.10.1.
void startConfigAccessPoint()
{
  const IPAddress address(CONFIG_AP_ADDRESS[0], CONFIG_AP_ADDRESS[1], CONFIG_AP_ADDRESS[2], CONFIG_AP_ADDRESS[3]);
  WiFi.softAPConfig(address, address, IPAddress(255, 255, 255, 0));
  WiFi.softAP(configApSsid());
}

uint8_t lastSundayOfMonth(uint16_t year, uint8_t month)
{
  uint16_t nextYear = month == 12 ? year + 1 : year;
  uint8_t nextMonth = month == 12 ? 1 : month + 1;
  DateTime lastDay = DateTime(nextYear, nextMonth, 1) - TimeSpan(1, 0, 0, 0);
  return lastDay.day() - lastDay.dayOfTheWeek();
}

// RTC trzyma czas lokalny (Europe/Warsaw), bo telemetria wysyła `time` bez
// strefy. Zmiana czasu: ostatnia niedziela marca i października, 01:00 UTC.
long warsawUtcOffset(unsigned long utcEpoch)
{
  DateTime utc(utcEpoch);
  uint16_t year = utc.year();
  DateTime dstStart(year, 3, lastSundayOfMonth(year, 3), 1, 0, 0);
  DateTime dstEnd(year, 10, lastSundayOfMonth(year, 10), 1, 0, 0);
  return utcEpoch >= dstStart.unixtime() && utcEpoch < dstEnd.unixtime()
    ? 7200L : 3600L;
}

// dy: przesunięcie w dół (szczegóły pompy pod dolną linią, od 1.2.3 o DETAILS_DY niżej)
void displayRow(Adafruit_ST7735 &display, int row, int column,
  const String &name, const String &value, const String &defaultValue = "", int dy = 0)
{
  if (column == -1)
    display.setCursor(7, row * 10 + 20 + dy);
  else
    display.setCursor(column * 65, row * 10 + 20 + dy);

  display.printf("%s%s", name.c_str(),
    (value != "" ? value : defaultValue).c_str());
}

// Napis wyśrodkowany bieżącą czcionką; shift > 0 przesuwa w prawo. centerOn: wzór, na którego szerokość
// się środkuje, żeby napis nie skakał przy zmianie wartości (nullptr = sam napis).
void printCentered(Adafruit_ST7735 &display, const char *text, int16_t y, int16_t shift = 0,
  const char *centerOn = nullptr)
{
  int16_t boundsX, boundsY;
  uint16_t width, height;
  display.getTextBounds(centerOn ? centerOn : text, 0, y, &boundsX, &boundsY, &width, &height);
  display.setCursor((display.width() - width) / 2 + shift, y);
  display.print(text);
}

// Temperatura z telemetrii z jednym miejscem po przecinku; brak = "--".
String oneDecimal(JsonVariantConst value)
{
  if (value.isNull() || !(value.is<float>() || value.is<int>())) return "--";
  return String(value.as<float>(), 1);
}

String jsonValueToString(JsonVariantConst value)
{
  if (value.isNull()) return "";
  if (value.is<const char *>()) return String(value.as<const char *>());
  if (value.is<bool>()) return value.as<bool>() ? "1" : "0";
  if (value.is<double>()) return String(value.as<double>());
  return "";
}
}

// flush() czeka na wysłanie całej odpowiedzi, zanim pętla zacznie kolejną
// transmisję na półdupleksowej magistrali.
void writeSerialResponse(const String &text)
{
  Serial.println(text);
  Serial.flush();
}

bool synchronizeClock(RTC_DS3231 &rtc)
{
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiUDP ntpService;
  NTPClient timeClient(ntpService, "pl.pool.ntp.org");
  timeClient.begin();
  timeClient.setTimeOffset(0);
  bool timeUpdated = timeClient.forceUpdate();
  unsigned long unixEpoch = timeClient.getEpochTime();
  timeClient.end();

  if (!timeUpdated || unixEpoch == 0) return false;
  rtc.adjust(DateTime(unixEpoch + warsawUtcOffset(unixEpoch)));
  return true;
}

bool initializeDevice(RTC_DS3231 &rtc, Adafruit_ST7735 &display)
{
  display.initR(INITR_BLACKTAB);
  display.setRotation(0);
  display.setTextWrap(false);
  display.fillScreen(ST77XX_BLACK);
  display.invertDisplay(false);
  display.setTextSize(1);

  const DeviceConfig &config = deviceConfig();
  displayStatus(display, "WIFI connecting...");

  // The controller starts its own open network, so the configuration page is
  // reachable no matter what happens to the configured Wi-Fi. The main loop
  // switches it off once AccessPointPolicy sees stable internet access.
  // softAP() enables the access point on top of the station mode.
  WiFi.mode(WIFI_AP_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  startConfigAccessPoint();
  WiFi.begin(config.wifiSsid.c_str(), config.wifiPassword.c_str());
  unsigned long wifiStartedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStartedAt < 10000) {
    delay(50);
  }

  if (WiFi.status() != WL_CONNECTED) {
    displayStatus(display, "Error WIFI", 0);
    displayStatus(display, "AP: " + String(configApSsid()), 1);
    displayStatus(display, "IP: " + WiFi.softAPIP().toString(), 2);
    return false;
  }

  // Adres z DHCP zostaje, zmienia się tylko DNS na 8.8.8.8.
  WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(),
    IPAddress(8, 8, 8, 8));
  displayStatus(display, "Connected.", 0);
  displayStatus(display, "IP: " + WiFi.localIP().toString(), 1);
  displayStatus(display, "AP: " + WiFi.softAPIP().toString(), 2);

  displayStatus(display, "Initialize RTC...");
  return synchronizeClock(rtc);
}

void displayStatus(Adafruit_ST7735 &display, const String &text, int line)
{
  if (line == 0) display.fillScreen(ST77XX_BLACK);
  int y = line == 0 ? 5 : (line * 2 * 9) + 2;
  display.setCursor(0, y);
  display.fillRect(0, y, 160, 11, ST7735_BLACK);
  display.print(text);
}

void displayControllerMode(Adafruit_ST7735 &display,
  ControllerMode controllerMode, WORK_MODE workMode)
{
  display.fillScreen(ST77XX_BLACK);
  display.setTextSize(2);
  display.setTextColor(ST77XX_YELLOW);
  display.clearWriteError();

  // czcionka ekranu nie ma polskich liter: RECZNY zamiast RĘCZNY
  const char *source = "CLOUD";
  const char *mode = "";
  if (controllerMode == ControllerMode::OFF) {
    source = "LOCAL";
    mode = "OFF";
  } else if (controllerMode == ControllerMode::MANUAL) {
    source = "LOCAL";
    mode = "RECZNY";
  } else {
    switch (workMode) {
      case MANUAL: mode = "RECZNY"; break;
      case AUTO: mode = "AUTO"; break;
      case OFF: mode = "OFF"; break;
    }
  }

  printCentered(display, source, 60);
  printCentered(display, mode, 82);

  display.setTextColor(ST77XX_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 140);
  if (WiFi.status() == WL_CONNECTED)
    display.printf("IP: %s", WiFi.localIP().toString().c_str());
  else
    display.printf("Error WIFI");

  // The access point comes back whenever the configured network fails, so
  // its address is the way to the configuration page exactly then.
  display.setCursor(10, 150);
  if (accessPointEnabled())
    display.printf("AP: %s", WiFi.softAPIP().toString().c_str());
  else
    display.printf("AP: off");
}

bool stationOnline()
{
  return WiFi.status() == WL_CONNECTED
    && WiFi.localIP() != IPAddress(0, 0, 0, 0);
}

bool accessPointEnabled()
{
  return (WiFi.getMode() & WIFI_MODE_AP) != 0;
}

void setAccessPointEnabled(bool enabled)
{
  if (enabled == accessPointEnabled()) return;
  if (enabled) {
    // The station keeps its connection; the access point joins its channel.
    WiFi.mode(WIFI_AP_STA);
    startConfigAccessPoint();
  } else {
    // wifioff = true drops the AP interface and leaves the station mode.
    WiFi.softAPdisconnect(true);
  }
}

void renderDashboard(Adafruit_ST7735 &display,
  const DateTime &rtcTime, const JsonDocument &telemetry,
  ControllerMode controllerMode, WORK_MODE workMode, const PV &pv,
  bool pvTemperatureCurrent, const DeviceSettings &settings,
  float outdoorTemperature, bool outdoorCurrent)
{
  // Nad niebieską linią (y = 23): data, godzina, tryb (C-MAN, C-AUT, C-OFF, L-MAN, OFF), moc PV
  // i produkcja dziś, temperatura falowników. Między liniami: duże T (Ttarget, FreeSansBold 18 pt),
  // „F” przy wymuszeniu, T. zew. Pod linią y = 78: zakres Tmin–Tmax i szczegóły pompy.
  // Układ od 1.2.3 (2026-10-10): po 5 px odstępu nad dużym T, między nim a T. zew i pod T. zew; oba napisy
  // środkowane na stałą szerokość wzoru (T:99.9, T. zew: -99.9), więc nie skaczą przy zmianie wartości.
  display.fillScreen(ST77XX_BLACK);
  display.setTextSize(1);
  display.clearWriteError();
  display.setCursor(0, 3);
  display.printf("%04d.%02d.%02d %02d:%02d", rtcTime.year(), rtcTime.month(),
    rtcTime.day(), rtcTime.hour(), rtcTime.minute());
  // tryb do prawej krawędzi (czcionka 6 px na znak): C = z chmury, L = lokalnie (przycisk), MAN = ręczny,
  // AUT = harmonogram; najwyżej 5 znaków, bo data z godziną zajmuje 96 z 128 px
  const char *modeLabel = "C-OFF";
  if (controllerMode == ControllerMode::OFF) {
    modeLabel = "OFF";
  } else if (controllerMode == ControllerMode::MANUAL) {
    modeLabel = "L-MAN";
  } else if (workMode == MANUAL) {
    modeLabel = "C-MAN";
  } else if (workMode == AUTO) {
    modeLabel = "C-AUT";
  }
  display.setCursor(display.width() - static_cast<int16_t>(strlen(modeLabel)) * 6, 3);
  display.print(modeLabel);

  display.drawLine(0, 23, 420, 23, ST77XX_BLUE);
  display.setCursor(0, 13);
  display.printf("P:%lld/%llu", static_cast<long long>(pv.total_power),
    static_cast<unsigned long long>(pv.total_prod_today));
  display.setCursor(90, 13);
  if (pvTemperatureCurrent)
    display.printf("T:%2.0f", pv.temperature);
  else
    display.printf("T:--");

  // Outdoor temperature from the cloud (IMGW) under the tank temperature,
  // centred on "T. zew: -99.9". FreeSans 9 pt; with a GFX font the cursor
  // y is the baseline. It does not depend on the pump, so it is drawn even
  // without pump data.
  display.setFont(&FreeSans9pt7b);
  display.setTextSize(1);
  {
    char outdoor[24];
    if (outdoorCurrent)
      snprintf(outdoor, sizeof(outdoor), "T. zew: %.1f", outdoorTemperature);
    else
      snprintf(outdoor, sizeof(outdoor), "T. zew: --");
    printCentered(display, outdoor, OUTDOOR_BASELINE, 0, "T. zew: -99.9");
  }
  display.setFont(nullptr);

  JsonObjectConst hp = telemetry["HP"].as<JsonObjectConst>();
  if (hp.isNull()) return;

  display.setTextSize(2);
  if (hp["F"]) {
    display.setTextColor(ST77XX_YELLOW);
    display.setCursor(0, 30);
    display.printf("F");
    display.setTextColor(ST77XX_WHITE);
  }

  // Duże T (temperatura w środku zbiornika), FreeSansBold 18 pt, środkowane na "T:99.9" i przesunięte
  // w prawo, żeby nie wchodziło na „F”.
  display.setTextSize(1);
  display.setFont(&FreeSansBold18pt7b);
  if (!hp["CO"].isNull()) {
    // Red while CHPC counts an unresolved error (ERRc > 0; it clears after
    // a successful run or an unlock, and 5 means locked), otherwise yellow
    // while the compressor runs. ERR itself is only the last event's code
    // and never goes back to 0, so it cannot tell a current error.
    if (hp["ERRc"].as<int>() > 0)
      display.setTextColor(ST77XX_RED);
    else if (hp["HPS"].as<int>() > 0)
      display.setTextColor(ST77XX_YELLOW);
  }
  {
    const String tank = "T:" + (hp["CO"].isNull() ? String("--") : oneDecimal(hp["Ttarget"]));
    printCentered(display, tank.c_str(), TANK_BASELINE, TANK_SHIFT, "T:99.9");
  }
  display.setFont(nullptr);

  display.setTextColor(ST77XX_WHITE);
  display.drawLine(0, 70 + DETAILS_DY, 420, 70 + DETAILS_DY, ST77XX_BLUE);
  display.setTextSize(1);

  // Only what CHPC reports as set (Tmin–Tmax from its telemetry), not what
  // `co` wants to send: a mismatch then shows as a stale value, not a second line.
  // Same font as "T. zew:" (GFX font: y is the baseline), centred and 4 px to the left; one decimal
  // ("35.0 - 45.0": with two the line filled the whole 128 px); takes the place of the rows 6 and 7 of
  // the 5x7 font, so the rest starts at row 7.
  {
    const bool known = !hp["Tmin"].isNull() && !hp["Tmax"].isNull();
    const String range = "T: " + (known ? oneDecimal(hp["Tmin"]) + " - " + oneDecimal(hp["Tmax"]) : String("--"));
    display.setFont(&FreeSans9pt7b);
    printCentered(display, range.c_str(), 86 + DETAILS_DY, -4);
    display.setFont(nullptr);
  }
  int row = 7;
  const int dy = DETAILS_DY;

  displayRow(display, row, 0, "T.be:", jsonValueToString(hp["Tbe"]), "", dy);
  displayRow(display, row++, 1, "T.ae:", jsonValueToString(hp["Tae"]), "", dy);
  displayRow(display, row, 0, "T.hp:", jsonValueToString(hp["Tsump"]), "", dy);
  displayRow(display, row++, 1, "T.ho:", jsonValueToString(hp["Tho"]), "", dy);
  displayRow(display, row, 0, "E.ev:", jsonValueToString(hp["EEV"]), "", dy);
  displayRow(display, row++, 1, "E.dt:", jsonValueToString(hp["EEV_dt"]), "", dy);
  displayRow(display, row, 0, "E.ps:", jsonValueToString(hp["EEV_pos"]), "", dy);
  displayRow(display, row++, 1, "Watt:", jsonValueToString(hp["Watts"]), "", dy);
  displayRow(display, row, 0, "HC.s:",
    hp["HCS"].isNull() ? "" : hp["HCS"] ? "ON" : "OFF", "", dy);
  displayRow(display, row++, 1, "CC.s:",
    hp["CCS"].isNull() ? "" : hp["CCS"] ? "ON" : "OFF", "", dy);
}
