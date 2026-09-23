# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CHPC (Cheap Heat Pump Controller) is an Arduino firmware for an AVR board that runs a heat pump. It switches the compressor, the hot-side and cold-side circulating pumps, the sump (compressor) heater and a 4-way valve. It drives a stepper EEV, reads DS18B20 temperature sensors on OneWire, measures compressor power with a current transformer, and is controlled from a 1602 I2C LCD with buttons and/or RS-485. This is a fork of github.com/gonzho000/chpc (GPLv3). The fork adds changes on this branch, such as COP calculation, RS-485 commands and wattage limits stored in EEPROM. Commit messages and some code comments are in Polish.

The entire firmware is one file: [CHPC_firmware.ino](CHPC_firmware.ino), about 2400 lines. [archiwum/](archiwum/) holds old snapshots of the firmware and is not built. Do not read, search or use it as a reference (access is denied in `.claude/settings.json`). [docs/](docs/) holds the PCB files (Gerber, BOM, schematic) and photos.

## Building / flashing

The project builds with PlatformIO ([platformio.ini](platformio.ini), env `promini` = Arduino Pro Mini ATmega328P 5V/16MHz). There is no linter or test suite. The libraries (`OneWire`, `DallasTemperature`, `LiquidCrystal_I2C`) come from `lib_deps`. Add `greiman/SSD1306Ascii` only if you switch to `DISPLAY_096`.

```sh
pio run                            # compile (pio is in ~/.platformio/penv/Scripts/ if not on PATH)
pio run -t upload --upload-port COM3
pio device monitor                 # 9600 baud
```

`src_dir = .` with `build_src_filter = +<CHPC_firmware.ino*>`. The trailing `*` matters because PlatformIO generates a temporary `CHPC_firmware.ino.cpp`. The "redefined" warnings for `DISPLAY`, `RELAY_*`, `EEV_*` and similar come from PlatformIO's ino-to-cpp pass, which ignores `#ifdef`. They are harmless. The real compile warnings come after them.

**Flash is ~99% full** (≈30.5 KB of 30 KB). Check the `Flash:` line after every change. Adding features will usually require cutting something else, such as unused strings or the `EEV_DEBUG` and `HUMAN_AUTOINFO` output.

RS-485 runs through the hardware UART (pins 0/1) at 9600 baud. That means RS-485 is disconnected while the board is being flashed over USB.


## Configuration model (compile-time `#define`s)

Behaviour is selected by editing the `USER OPTIONS` block at the top of the `.ino`, lines ~21–119. Nothing is selected at runtime:

- **Board variant:** `BOARD_TYPE_G` (the current one), `BOARD_TYPE_F` or `BOARD_TYPE_G9`. Each variant defines its own pin map for relays, buttons and EEV. F and G9 drive some relays through a 74HC595 shift register (`halifise()`), so relay-handling code differs by board.
- **Display:** `DISPLAY_1602`, `DISPLAY_096` or `DISPLAY_NONE`, which resolves to `DISPLAY`.
- **Serial mode:** `RS485_HUMAN`, `RS485_PYTHON` or `RS485_NONE`.
- **Feature flags:** `EEV_SUPPORT`, `EEV_ONLY`, `INPUTS_AS_BUTTONS`, `WATCHDOG` and `EEV_DEBUG`.
- **Protection thresholds:** `T_*_MIN/MAX`, `MAX_WATTS`. **Timing constants:** `POWERON_PAUSE`, `MINCYCLE_*`, `DEFFERED_STOP_*`. **EEV tuning:** `EEV_*`. Note: several `T_*` defines end with a stray `;`, so they can only be used as whole initializers (`const double cT_x = T_X;`), not inside expressions.

Code is heavily wrapped in `#ifdef`. When you change logic, make sure it still compiles under the other board, display and EEV combinations, or guard it correctly.

## Runtime architecture

The sketch uses the usual `setup()`/`loop()` structure. All state is in globals, including shared scratch variables `i, z, x, y, d, e, tempint, tempdouble, outString`. Check that a scratch variable isn't already in use before you reuse it.

- **`setup()`:** sets up the pins, then initializes serial and display (`InitS_and_D`). It loads persisted settings from EEPROM and discovers the DS18B20 addresses (`FindAddr`), which it stores in EEPROM behind the `MAGIC` byte. Changing `MAGIC` forces the sensors to be discovered again.
- **`loop()`:** is non-blocking and timed with `millis()`. Each pass:
  1. Takes one current sample for the asynchronous RMS power measurement (`async_wattage`). Supply voltage comes from `ReadVcc()`.
  2. Advances the EEV stepper by at most one step (`eevise()`), following `EEV_apulses`, `EEV_fast` and the `EEV_PULSE_*_MILLIS` pacing.
  3. Checks for overload and reads the emergency input. If `error_count >= 5`, the loop stops doing anything.
  4. Handles buttons (`input_type` selects which setting the buttons edit: `INPUT_TYPE_*`), then updates the display.
  5. Runs the **check cycle** once every `millis_cycle` (1 s). It reads the temperatures (`Get_Temperatures`; `-127` means the sensor is missing). It sets `errorcode` (`ERR_*`), runs the EEV control algorithm (keep superheat Tae−Tbe at `T_EEV_setpoint`), and then decides whether the compressor, pumps and sump heater should run. That decision applies the protections and the minimum on/off cycle times. `stopOnError()` is the common shutdown path.
  6. Parses RS-485 commands.
- **Sensors:** each DS18B20 is an `st_tsens` global (`Tae, Tbe, Ttarget, Tsump, Tci, Tco, Thi, Tho, Tbc, Tac, Touter, Tcwu`). `.e` marks it enabled, and its `BIT_*` index is its slot in `used_sensors` and in the EEPROM address layout. The README table explains the abbreviations.
- **EEPROM:** runtime-tunable settings sit at fixed addresses (`eeprom_addr_co`, `_EEV_MAX`, `_EEV_setpoint`, `_dT`, `_WATT`) and are written with `WriteFloatEEPROM`/`WriteIntEEPROM`. The sensor addresses are stored before these, so keep new addresses clear of both.
- **RS-485 protocol:** each frame is 5 bytes, `[devID=0x41][cmd][data1][data2][0xFF]`. Commands `0x01`/`0x02` return stats (`StatsSerial()`, a text/JSON-style dump in `outString`). Commands `0x03`–`0x0E` do the following: force start, setpoint, delta, EEV max open, EEV superheat setpoint, force hot/cold pump or sump heater, CO on/off, and max watts. With `WATCHDOG` on, a value ≤1000 for max watts triggers a reset through the watchdog. New commands go in the `switch` near the end of `loop()` and must be persisted to EEPROM when they need to survive a reboot.
