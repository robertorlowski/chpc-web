# CHPC firmware — technical documentation

[← System documentation](../../../../docs/en/README.md) · [1. Business description](1-business-description.md) · [2. How it works](2-how-it-works.md) · **3. Technical documentation** · [Polski](../3-dokumentacja-techniczna.md)

## Hardware

| Part | Details |
|---|---|
| Board | CHPC v1.3 with an Arduino Pro Mini (ATmega328P, 5 V, 16 MHz); PCB, BOM and schematic in `docs/` |
| Sensors | 12 × DS18B20 on one OneWire bus (D12) |
| Power | current transformer on A6, RMS every 2960 samples, fixed voltage assumed |
| Flow | input A7 (> 4 V = no flow) |
| Relays | compressor D8, hot pump D7, cold pump D10, crankcase heater D11, 4-way valve D9 (unused) |
| EEV | stepper motor D2, D4, D3, D5; 480 steps |
| User interface | LCD 1602 I2C, buttons A2 (left), A3 (right), A1 (menu), buzzer D6 |
| RS-485 | Serial D0/D1, 9600 8N1, address `0x41` |

![Board](../m_PCB_v1.3_screen.jpg)

## Code

The whole firmware is `src/CHPC_firmware.ino` (~2200 lines). The file header has a map of its sections. Key places:

| Place | Role |
|---|---|
| `#define`s at the top | temperature thresholds, timings, EEV, EEPROM addresses, pins, `ERRC_*` codes |
| `setup()` | EEPROM, sensors, first measurement, EEV calibration start |
| `loop()`, asynchronous part | power, EEV, overload, flow, RS-485 (`ReadSerialCommand`) |
| buttons and menu | 10 `INPUT_TYPE_*` items, saved in EEPROM |
| display block (`DISPLAY_1602`) | screens every 5 s and **flow protection** |
| control cycle (every 1 s) | sensors, thermostat, pumps, frost, temperature protections, relay fault |
| `stopOnError` / `stopByTemperature` / `reportError` | stop with counter / without counter / record an event (`ERR`, `ERRn`) |
| `StatsSerial()` | JSON reply to `0x01` |

## Constants (code state)

| Constant | Value | Meaning |
|---|---|---|
| `POWERON_PAUSE` | 90 s | pause after power-on |
| `MINCYCLE_POWEROFF` | 20 min | minimum idle time before the next start |
| `MINCYCLE_POWERON` | 3 min | minimum run time before a thermostat stop |
| `MINCYKLE_CHECK` | 60 s | after this run time: minimum power and Tsump checks |
| `POWERON_HIGHTIME` | 9 s | start-up window (power up to 3.5 × limit allowed); pumps start after 1/4 of it (2.25 s) |
| `COLDOFF_HIGHTIME` | 50 s | from start to the first flow check |
| `DEFFERED_STOP_HOTCIRCLE` | 60 s | hot pump run-on |
| `T_SETPOINT_MAX` / `T_DELTA_MAX` | 50 / 30 °C | T max and delta limits (higher values over RS-485 are ignored) |
| `T_DELTA_DEFAULT` | 5 °C | delta when EEPROM has none |
| `MAX_WATTS` | 3200 W | default limit; **minimum power** threshold = `MAX_WATTS / 3.5` ≈ **914 W** (fixed, independent of the limit) |
| `MAX_WATTS_LIMIT` | 4000 W | upper bound of the limit |
| `EEV_TARGET_TEMP_DIFF` | 1.0 K | default superheat |
| `EEV_CLOSEEVERY` | 24 h | periodic EEV calibration |

## Protections

| Code | Name (LCD) | Condition | Effect |
|---|---|---|---|
| 1 | `ERR: Temp. Sens.` | −127 from Tae, Tbe, Ttarget, Tsump, Tco or Tho (two readings) | blocks start and stops; clears itself when the sensor returns |
| 2 | `ERR: Overload` | power > limit after 9 s from start, or > 3.5 × limit at any time | stop, **counted** |
| 3 | `ERR: Cold Flow` | no flow > 9 s, 50 s after start; **only when the power limit > 3200 W**; checked in the LCD block every 5 s | stop, **counted** |
| 4 | `ERR: Wattage Min` | after 60 s of running power < ≈ 914 W | stop, **counted** |
| 5 | `ERR: Temp. Tho` | Tho > 60 °C | stop |
| 6 | `ERR: Temp. Tsump` | Tsump > 85 °C | stop |
| 7 | `ERR: Temp. Tbc` | Tbc > 70 °C | stop |
| 8 | `ERR: Temp. Tae` | Tae < −2 °C | stop |
| 9 | `ERR: Temp. Tco` | Tco < −2 °C | stop |
| 10 | `ERR: Relay` | power > ≈ 914 W with the compressor off for > 10 s | forces both pumps on (stays after the fault is gone) |
| 11 | `ERR: Locked x5` | fifth counted error | locked until `0x10` or `0x11` |
| 12 | `ERR: Temp. Low` | after 60 s of running Tsump < 3 °C | stop |
| 13 | `ERR: Temp. Tbe` | Tbe < −1 °C for more than 60 s | stop |

A "stop" without the counter allows a new start after 20 min of idle time. A thermostat stop clears the counted error counter. The codes are also in `client/src/devices/heat-pump/utils/errors.ts`; change them together.

## RS-485

Frame: `[0x41][cmd][d1][d2][0xFF]`; numbers: `d1` + `d2`/100; watts: `d1·100 + d2`.

| cmd | Action in CHPC | Saved in EEPROM |
|---|---|---|
| `0x01` | JSON reply | — |
| `0x03` | force start 0/1 — **only while idle** | no |
| `0x04` | T max (≤ 50) | yes |
| `0x05` | delta (≤ 30) | yes |
| `0x08` | EEV superheat (no range check; after a restart a value outside 0–8 falls back to 1.0) | yes |
| `0x09` / `0x0A` / `0x0B` | manual hot pump / cold pump / crankcase heater | no |
| `0x0C` | `co_on` (permission to start the compressor) | yes |
| `0x0D` | EEV max (26–255); if ≤ EEV min, min drops to max − 1 | yes |
| `0x0F` | EEV min (25–255); if ≥ EEV max, max rises to min + 1 | yes |
| `0x0E` | power limit (1001–4000 W) | yes |
| `0x10` | unlock (`error_count = 0`; `ERR` stays) | — |
| `0x11` | software restart (`jmp 0`: relays off, `setup()` again, 90 s pause) | — |

Reply to `0x01` — one JSON line ending in CRLF, key order:
`Tbe`, `Tae`, `Tco`, `Tho`, `Ttarget`, `Tsump`, `EEV_dt`, `Tmax`, `Tmin` (= Tmax − delta), `Watts`, `EEV` (superheat setpoint), `EEV_pos`, `EEV_pulse`, `SHS`, `HCS`, `CCS`, `HPS`, `F`, `CO`, `WWatt`, `EEVmax`, `EEVmin`, `ERR`, `ERRn`, `ERRc`, `lt_pow` (Wh since compressor start), `lt_hp_on` (s of the current or last run). Temperatures and some numbers are strings.

- `HCS` also covers manual override and frost protection; `CCS` and `SHS` cover manual override.
- The keys that `co` and chpc-web rely on are listed in the [heat-pump module documentation](../../../../docs/en/moduly/heat-pump/3-technical-documentation.md). **Do not rename or reorder them without changing both sides.**
- The firmware **does not send** a version key (`FW`), although earlier descriptions (CLAUDE.md) mentioned one; it is not in any commit.

## EEPROM

| Address | Content |
|---|---|
| `0x00` | marker `0x50` (changing it = sensors detected again) |
| `0x01` | T max (float, 4 B) |
| `0x05` | mask of used sensors (2 B) |
| next | DS18B20 sensor addresses (8 B each) |
| `0x70` | `co_on` |
| `0x74` / `0x8A` | EEV max / EEV min |
| `0x78` | EEV superheat |
| `0x82` | delta |
| `0x86` | power limit |

## Button menu

Button A1 selects the item, A2/A3 decrease/increase the value: `CO` (permission), T max, delta, EEV max, superheat, hot pump, cold pump, crankcase heater, power limit, EEV min (`INPUT_TYPE_*` order). Holding repeats every 750 ms.

## Build modes

| PlatformIO environment | Mode | Use |
|---|---|---|
| `promini` (default) | `RS485_PYTHON` | **production** — only replies to `co` on the bus |
| `wokwi` | `RS485_HUMAN` | Wokwi simulation; text messages corrupt the bus — **never flash onto a pump wired to `co`** |
| `promini_debug` | `DEBUG_LOG` | event log (JSON lines) on the UART, read with `tools/serial-log.ps1` — **never flash onto a pump wired to `co`** |
| `native`, `native_debug` | — | firmware simulation on the PC (`test/sim_env`) |

```bash
pio test -d devices/chpc -e native      # 54 tests
pio run  -d devices/chpc                # Pro Mini build; Flash 95.0% (29 174 B of 30 720 B)
pio run  -d devices/chpc -t upload      # flash (programmer / USB-UART)
```

Wokwi scenarios: `test-wokwi/`. Example run chart: `docs/m_t_graph_example.png`.

## Known issues

- **Flow protection lives in the LCD block**: it works only with `DISPLAY_1602` and every 5 s.
- **With a power limit ≤ 3200 W the flow protection is off**: on purpose, but it applies to every limit of 1001–3200 W, **including the default (3200 W)**. Setting a lower, "safer" limit disables the protection. Proposal from the 2026-09-25 audit (local report `test/raport-testow/AUDYT-2026-09-25.md`, outside git): a separate EEPROM bit and a check outside the LCD block.
- **While locked the control cycle does not run**: no frost protection, temperatures in the JSON are not refreshed.
- **Force start is cleared only by a thermostat stop** (and a restart); a stop by a protection keeps it.
- **A relay fault leaves the manual pump overrides on** until `0x09`/`0x0A`, the menu or a restart.
- Flash at 95%: new features come at the cost of old ones.
- `devices/chpc/README.md` (English, from the upstream project) and `devices/chpc/CLAUDE.md` may be out of date in places; this document prevails.
