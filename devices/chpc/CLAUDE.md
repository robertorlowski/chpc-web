# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CHPC (Cheap Heat Pump Controller) is an Arduino firmware for an AVR board that runs a heat pump. It switches the compressor, the hot-side and cold-side circulating pumps, the sump (compressor) heater and a 4-way valve. It drives a stepper EEV, reads DS18B20 temperature sensors on OneWire, measures compressor power with a current transformer, and is controlled from a 1602 I2C LCD with buttons and/or RS-485. This is a fork of github.com/gonzho000/chpc (GPLv3). The fork adds changes on this branch, such as COP calculation, RS-485 commands and wattage limits stored in EEPROM. Commit messages and some code comments are in Polish.

The entire firmware is one file: [src/CHPC_firmware.ino](src/CHPC_firmware.ino), about 2400 lines. [archiwum/](archiwum/) holds old snapshots of the firmware and is not built. Do not read, search or use it as a reference (access is denied in `.claude/settings.json`). [docs/](docs/) holds the PCB files (Gerber, BOM, schematic) and photos.

## Building / flashing

The project builds with PlatformIO ([platformio.ini](platformio.ini), env `promini` = Arduino Pro Mini ATmega328P 5V/16MHz). There is no linter or test suite. The libraries (`OneWire`, `DallasTemperature`, `LiquidCrystal_I2C`) come from `lib_deps`. Add `greiman/SSD1306Ascii` only if you switch to `DISPLAY_096`.

```sh
pio run                            # compile (pio is in ~/.platformio/penv/Scripts/ if not on PATH)
pio run -t upload --upload-port COM3
pio device monitor                 # 9600 baud
```

The "redefined" warnings for `DISPLAY`, `RELAY_*`, `EEV_*` and similar come from PlatformIO's ino-to-cpp pass, which ignores `#ifdef`. They are harmless. The real compile warnings come after them.

**Flash is ~98–99% full** (30 KB available). Check the `Flash:` line after every change. Adding features will usually require cutting something else, such as unused strings or the `EEV_DEBUG` and `HUMAN_AUTOINFO` output.

RS-485 runs at 9600 baud on the hardware UART (pins 0/1); `RS485Serial` is a `#define` for `Serial`. That means RS-485 is disconnected while the board is being flashed over USB.


## Configuration model (compile-time `#define`s)

Behaviour is selected by editing the `USER OPTIONS` block at the top of the `.ino`, lines ~21–119. Nothing is selected at runtime:

- **Board variant:** `BOARD_TYPE_G` (the current one), `BOARD_TYPE_F` or `BOARD_TYPE_G9`. Each variant defines its own pin map for relays, buttons and EEV. F and G9 drive some relays through a 74HC595 shift register (`halifise()`), so relay-handling code differs by board.
- **Display:** `DISPLAY_1602`, `DISPLAY_096` or `DISPLAY_NONE`, which resolves to `DISPLAY`.
- **Serial mode:** `RS485_HUMAN`, `RS485_PYTHON` or `RS485_NONE`.
- **Feature flags:** `EEV_SUPPORT`, `EEV_ONLY`, `INPUTS_AS_BUTTONS`, `WATCHDOG` and `EEV_DEBUG`.
- **Protection thresholds:** `T_*_MIN/MAX`, `MAX_WATTS`. **Timing constants:** `POWERON_PAUSE`, `MINCYCLE_*`, `DEFFERED_STOP_*`. **EEV tuning:** `EEV_*`. Note: several `T_*` defines end with a stray `;`, so they can only be used as whole initializers (`const double cT_x = T_X;`), not inside expressions.

The power limit `c_wattage_max` also works as a deliberate switch. When it is above `MAX_WATTS` (3200), the flow protection ("Err CP") is on. The user sets exactly 3200 W to turn it off, for example when the heat pump runs from another power source on which the flow sensor is unreliable. Keep this coupling.

Code is heavily wrapped in `#ifdef`. When you change logic, make sure it still compiles under the other board, display and EEV combinations, or guard it correctly.

## Runtime architecture

The sketch uses the usual `setup()`/`loop()` structure. All state is in globals, including shared scratch variables `i, z, x, y, d, e, tempint, tempdouble, outString`. Check that a scratch variable isn't already in use before you reuse it.

- **`setup()`:** sets up the pins, then initializes serial and display (`InitS_and_D`). It loads persisted settings from EEPROM and discovers the DS18B20 addresses (`FindAddr`), which it stores in EEPROM behind the `MAGIC` byte. Changing `MAGIC` forces the sensors to be discovered again.
- **`loop()`:** is non-blocking and timed with `millis()`. Each pass:
  1. Takes one current sample for the asynchronous RMS power measurement (`async_wattage`). Supply voltage comes from `ReadVcc()`.
  2. Advances the EEV stepper by at most one step (`eevise()`), following `EEV_apulses`, `EEV_fast` and the `EEV_PULSE_*_MILLIS` pacing.
  3. Checks for overload and reads the emergency input. If `error_count >= 5`, the loop stops doing anything, including RS-485.
  4. Parses RS-485 commands. This block sits before the check cycle so that it still runs while the check cycle `return`s during `POWERON_PAUSE`. Code placed after the check cycle can be skipped by that `return`.
  5. Handles buttons (`input_type` selects which setting the buttons edit: `INPUT_TYPE_*`), then updates the display.
  6. Runs the **check cycle** once every `millis_cycle` (1 s). It reads the temperatures (`Get_Temperatures`; `-127` means the sensor is missing). It sets `errorcode` (`ERR_*`), runs the EEV control algorithm (keep superheat Tae−Tbe at `T_EEV_setpoint`), and then decides whether the compressor, pumps and sump heater should run. That decision applies the protections and the minimum on/off cycle times. `stopOnError()` is the common shutdown path.
- **Sensors:** each DS18B20 is an `st_tsens` global (`Tae, Tbe, Ttarget, Tsump, Tci, Tco, Thi, Tho, Tbc, Tac, Touter, Tcwu`). `.e` marks it enabled, and its `BIT_*` index is its slot in `used_sensors` and in the EEPROM address layout. The README table explains the abbreviations.
- **EEPROM:** runtime-tunable settings sit at fixed addresses (`eeprom_addr_co`, `_EEV_MAX`, `_EEV_setpoint`, `_dT`, `_WATT`) and are written with `WriteFloatEEPROM`/`WriteIntEEPROM`. The sensor addresses are stored before these, so keep new addresses clear of both.
- **RS-485 commands:** handled in the `switch` in the RS-485 block of `loop()` (step 4 above). The response is built by `StatsSerial()`. New settings must be written to EEPROM when they need to survive a reboot. The protocol is a contract with another project, described in the next section.

## RS-485 contract with the `co` controller

The bus master is a separate ESP32 project, `D:\DevLocal\arduino_src\heatpump\co` (PlatformIO, its own git repo). It polls this heat pump, forwards the data to a cloud service, computes COP and sends settings back. **Any change to the frame format, command codes, value encoding or JSON keys must be made in both projects.** On the `co` side, the relevant code is:

- `src/modbus_frame.cpp`: command encoding, covered by `test/test_modbus_frame` (`pio test -e native`).
- `src/serial_bus.cpp`: queue, timing and frame detection.
- `src/heat_pump_data_processor.cpp` and `src/cop_estimator.cpp`: JSON parsing and COP.
- `src/device_io.cpp`: the TFT dashboard.
- `src/operation_controller.cpp`: which commands are sent and when.

**Bus.** Half-duplex RS-485, 9600 8N1. The same line carries three devices, and only `co` starts a transfer:

| Address | Device | Frame format |
|---|---|---|
| `0x41` | this heat pump | 5-byte frames described below |
| `0x69` | Hoymiles DTU (PV inverters) | Modbus RTU with CRC; responses are about 200 bytes |
| `0x10` | `co` itself | answers 4-byte requests `[0x10][op][x][0xFF]` |

CHPC must ignore every frame whose first byte isn't `0x41` and must never send anything it wasn't asked for.

**Request.** `[0x41][cmd][d1][d2][0xFF]`. Decimal values are sent as `d1` = whole part and `d2` = hundredths, so 45.5 is sent as `[45][50]`. Watts are sent as `d1` = W/100 and `d2` = W%100.

| cmd | Meaning | Sent by `co` |
|---|---|---|
| `0x01` | return JSON stats | GET_HP_DATA: every 10 s while running, every 30 s idle (every 10th poll goes to the PV inverters instead) |
| `0x02` | same as `0x01` | not used |
| `0x03` | force start, `d1` = 0/1 | SET_HP_FORCE_ON/OFF |
| `0x04` | T setpoint (CO max), decimal | SET_T_SETPOINT_CO = `co_max` or `cwu_max` |
| `0x05` | T delta, decimal | SET_T_DELTA_CO = max − min |
| `0x07` | EEV max open | not used (duplicate of `0x0D`) |
| `0x08` | EEV superheat setpoint, decimal | SET_EEV_SETPOINT |
| `0x09` / `0x0A` / `0x0B` | force hot pump / cold pump / sump heater, `d1` = 0/1 | SET_HOT_PUMP / SET_COLD_PUMP / SET_SUMP_HEATER |
| `0x0C` | CO on/off, `d1` = 0/1 | SET_HP_CO_ON/OFF |
| `0x0D` | EEV max open pulses, `d1` = 50–255 (≤ `EEV_MINWORKPOS` is ignored; `0x07` behaves the same) | SET_EEV_MAXPULSES_OPEN (`co` accepts `eev_max_pulse_open` 0–255; values ≤ 49 are silently ignored by CHPC, a known and accepted mismatch) |
| `0x0E` | max watts, `d1*100 + d2`. ≤1000 = watchdog reset when `WATCHDOG` is on; above `MAX_WATTS_LIMIT` (4000) the command is ignored | SET_WORKING_WATT (`co` accepts `working_watt` 0–25599 from the cloud) |

**Response to `0x01`.** One JSON object on one line, sent by `StatsSerial()`. `co` detects the end of the frame by 5 ms of silence and times out after 3 s. It spaces commands at least 500 ms apart and never waits for a reply to set-commands. This puts three constraints on CHPC:

- It must answer within 3 s. Blocking `delay()`s, slow `GetT` retries and the `error_count >= 5` lock-up all risk timeouts, which `co` counts in its `serial_read_timeout` telemetry.
- The JSON must go out without pauses longer than 5 ms.
- Nothing else may be sent while `co` waits for the response. JSON that fails to parse is counted in `hp_json_error`.

JSON keys `co` depends on (don't rename or remove them; adding keys is fine within the flash budget). Values may be numbers or quoted strings, because `co` accepts both:

- **COP calculation:** `HPS` (>0 = compressor running), `Tho`, `Ttarget`. Also `lt_pow`: Wh used since the last compressor start, reset at every start. And `lt_hp_on`: seconds of the current run, or the length of the last run once the compressor has stopped.
- **Dashboard:** `F`, `CO`, `Ttarget`, `Tmin`, `Tmax`, `Tbe`, `Tae`, `Tsump`, `Tho`, `EEV`, `EEV_dt`, `EEV_pos`, `Watts`, `HCS`, `CCS`.
- **Cloud:** the whole object is forwarded as telemetry `HP`.

**Known mismatches with the current firmware:**

- `0x04` above `T_SETPOINT_MAX` and `0x05` above `T_DELTA_MAX` are silently ignored.
- With `RS485_HUMAN`, `PrintS_and_D()` also writes status and error text to the bus without being asked (for example "Err: x" every second while `errorcode != 0`). That breaks the rule against sending unrequested data and can corrupt HP or PV reads.
