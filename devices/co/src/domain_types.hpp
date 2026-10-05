#pragma once

#include <cstdint>

#include <hardware_config.hpp>

// Typy domenowe wspólne dla firmware i testów: odczyt PV, komendy RS-485,
// tryby pracy z chmury (WORK_MODE), tryb sterownika z przycisku i ustawienia z chmury.

// One entry per microinverter port, in the order the DTU reports them.
struct PvPanel {
  char inverter_serial[13] = {};  // 12 BCD digits taken from the DTU record
  uint8_t port = 0;               // port number inside the microinverter
  int32_t power = 0;              // W
  uint32_t prod_today = 0;        // Wh
  uint32_t prod_total = 0;        // Wh
  float temperature = 0.0f;       // degrees Celsius
  float pv_voltage = 0.0f;        // V, panel side
  float pv_current = 0.0f;        // A, panel side
  float grid_voltage = 0.0f;      // V
  float grid_frequency = 0.0f;    // Hz
  // Status, alarm and link are passed on raw: their codes are not documented
  // and a working installation reports 3, 0, 0 and 1.
  uint16_t status = 0;
  uint16_t alarm_code = 0;
  uint16_t alarm_count = 0;
  uint8_t link = 0;
};

// Suma instalacji (pola jak w POST /api/pv/add); temperature to najniższa
// z portów, pv_power = total_power >= 2000 W.
struct PV {
  int64_t total_power = 0;
  uint64_t total_prod = 0;
  uint64_t total_prod_today = 0;
  float temperature = 0.0f;
  bool pv_power = false;
  uint8_t panel_count = 0;
  PvPanel panels[PV_MAX_PANELS]{};
};

// Operacje na magistrali; kody ramek przypisuje encodeCommand() w
// modbus_frame.cpp (tabela komend CHPC: CLAUDE.md, punkt 13).
enum SERIAL_OPERATION {
  GET_HP_DATA,
  GET_PV_DATA_1,
  GET_PV_DATA_2,
  SET_HP_FORCE_ON,
  SET_HP_FORCE_OFF,
  SET_HP_CO_ON,
  SET_HP_CO_OFF,
  SET_SUMP_HEATER_ON,
  SET_SUMP_HEATER_OFF,
  SET_COLD_PUMP_ON,
  SET_COLD_PUMP_OFF,
  SET_HOT_PUMP_ON,
  SET_HOT_PUMP_OFF,
  SET_T_SETPOINT_CO,
  SET_T_DELTA_CO,
  SET_EEV_MAXPULSES_OPEN,
  SET_EEV_MINWORKPOS,
  HP_ERROR_RESET,
  HP_RESTART,
  SET_WORKING_WATT,
  SET_EEV_SETPOINT,
};

// Tryb pracy z chmury (od 1.2.0): MANUAL (ręczny), AUTO (harmonogram), OFF. Dla co oba tryby pracy
// znaczą to samo (grzanie z temperaturą od–do), różnią się tylko opisem na ekranie; harmonogram liczy
// serwer. Dawne wartości (M, A, CWU, PV) parser zamienia na MANUAL / AUTO (operation_parser.cpp).
enum WORK_MODE : int16_t {
  MANUAL,
  AUTO,
  OFF
};

// Lokalny tryb sterownika (przycisk GPIO5, NVS „mode”): OFF → CLOUD → MANUAL → OFF. Tylko CLOUD stosuje
// operacje z chmury; MANUAL (ręczny lokalnie) grzeje na ostatniej temperaturze od–do z chmury. Wartości
// liczbowe są zapisane w NVS: nie zmieniać kolejności (dawne 3 = MANUAL_CWU czytane jako MANUAL).
enum class ControllerMode : uint8_t {
  OFF,
  CLOUD,
  MANUAL,
};

// Ustawienia z chmury trzymane tylko w RAM; po restarcie obowiązują te
// wartości domyślne do pierwszej operacji z serwera. Konfiguracja pompy (pv_force, pv_dtu, tank_liters)
// pochodzi z definicji sterownika w aplikacji (okno „Dane sterownika”), cop_pause z odczytu kotła.
struct DeviceSettings {
  WORK_MODE workMode = WORK_MODE::OFF;
  double tempMin = 35.0;
  double tempMax = 45.0;
  // wymuszenie startu przy produkcji PV ≥ progu (dawny tryb PV)
  bool pvForce = false;
  // panele Hoymiles przez DTU: bez nich sterownik nie odpytuje DTU
  bool pvDtu = true;
  // pojemność zbiornika [l] do szacunku COP
  double tankLiters = 300.0;
  // pompa CO kotła pracuje (podłączenie CO): woda odpływa ze zbiornika, COP nie jest liczony
  bool copPause = false;
  ControllerMode controllerMode = ControllerMode::CLOUD;
};
