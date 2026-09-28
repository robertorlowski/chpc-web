# co firmware — technical documentation

[← System documentation](../../../../docs/en/README.md) · [1. Business description](1-business-description.md) · [2. How it works](2-how-it-works.md) · **3. Technical documentation** · [Polski](../3-dokumentacja-techniczna.md)

## Hardware

| Part | Details |
|---|---|
| Board | ESP32 (PlatformIO `esp32dev`) |
| RS-485 | 9600 8N1, half duplex; addresses: CHPC `0x41`, DTU `0x69`, `co` `0x10` |
| Display | ST7735 128×160, portrait |
| Clock | RTC DS3231, NTP synchronisation (Polish time) |
| Button | GPIO5, active high, 50 ms debounce |
| Relays | CO and CWU (switched together) |

Pins and addresses are in `src/hardware_config.hpp`.

## Files (`devices/co/src`)

| File | Role |
|---|---|
| `main.cpp` | main loop: CHPC and PV readings, mode button, cloud exchange, `co` replies as device 0x10 |
| `access_point_policy.*` | when the `HP-CO-setup` AP should run (3 min / 1 min / 5 min) |
| `cloud_client.*` | HTTPS to chpc-web (`hp/add`, `pv/add`, `devices/register`), WebSocket `/ws?rootId=`, 409 handling |
| `command_sink.hpp` | command queue interface (`SerialBus` on the device, `RecordingSink` in tests) |
| `config_portal.*` | web server on port 80 (`/`, `/telemetry.json`, `/pv.json`, `/install`, `/save`) |
| `cop_estimator.*` | COP estimate of the 300 l tank per compressor cycle |
| `device_config.*` | Wi-Fi and Root ID in NVS (namespace `hp`), SN from the MAC, `/install` login data |
| `device_io.*` | display, RTC and NTP, Wi-Fi AP+STA, relays, writing replies to the bus |
| `domain_types.hpp` | PV types, `SERIAL_OPERATION`, `WORK_MODE`, `ControllerMode`, `DeviceSettings` |
| `hardware_config.hpp` | addresses 0x10 and 0x69, DTU register map, pins |
| `heat_pump_data_processor.*` | parse the CHPC JSON, feed the COP estimator |
| `json_converters.hpp` | ArduinoJson converters (PV fields, `time` as `YYYY.MM.DD HH:MM:SS`, modes) |
| `modbus_frame.*` | CHPC command frames (5 B), Modbus queries to the DTU (8 B), CRC-16/MODBUS |
| `operation_controller.*` | cloud state → RS-485 commands (changes only), modes, OFF sequence, force from PV, retry after mismatch, relays |
| `operation_parser.*` | `operation` JSON → `ServerOperationState`, with ranges |
| `operation_types.hpp` | `ServerValue`/`ServerOperationState` (`present` flag), `HeatPumpReport`, merging |
| `pv_data_processor.*` | two DTU replies → installation totals and `panels[]` |
| `pv_telemetry.*` | `POST /api/pv/add` and `/pv.json` document |
| `serial_bus.*` | RS-485 queue in three classes (safety, PV continuation, regular); 500 ms, 3 s, 5 ms |
| `telemetry.*` | `POST /api/hp/add` and `/telemetry.json` document |
| `secrets.example.h` | template of `secrets.h` (outside git): default Wi-Fi and optional `CLOUD_ROOT_ID` |

## RS-485 protocol with CHPC

Command frame: `[0x41][cmd][d1][d2][0xFF]`. Decimal numbers: `d1` = integer part, `d2` = hundredths. Watts: `d1 = W/100`, `d2 = W%100`.

| cmd | Meaning | Source in the operation |
|---|---|---|
| `0x01` | read JSON | periodic reading |
| `0x03` | force start 0/1 | `force` (in `PV` — from PV production) |
| `0x04` | target T (max) | `co_max` or `cwu_max` |
| `0x05` | delta T | max − min |
| `0x08` | EEV superheat | `eev_setpoint` |
| `0x09` / `0x0A` / `0x0B` | hot / cold pump / crankcase heater | `hot_pomp`, `cold_pomp`, `sump_heater` |
| `0x0C` | CO on/off | `work_mode` (+ CO/CWU relays) |
| `0x0D` | EEV max (26–255) | `eev_max_pulse_open` |
| `0x0F` | EEV min (25–255), sent after `0x0D` | `eev_min_pulse_open` |
| `0x0E` | power limit (1001–4000 W) | `working_watt` |
| `0x10` | unlock after 5 errors | `error_reset` action |
| `0x11` | CHPC software restart | `restart` action (then the whole state again) |

`co` also answers as device `0x10`: `0x01` — telemetry with `PV` and `pv_power` in one JSON, `0x02` — settings and `controller_mode`, `0x03` — nothing.

DTU: two Modbus queries of five ports each — from `0x1000` and from `0x10C8` (ports every `0x28` addresses, although a record has 20 registers).

## Cloud contract

| Direction | Address | Content |
|---|---|---|
| `co` → server | `POST /api/hp/add?deviceId=SN&rootId=…` | telemetry (described in the [heat-pump module](../../../../docs/en/moduly/heat-pump/3-technical-documentation.md)) |
| server → `co` | reply | `{"operation": {...strings...}, "t_out": 12.3}` |
| `co` → server | `POST /api/pv/add?...` | `time`, `total_power` (required), `total_prod`, `total_prod_today`, `temperature` (lowest of the ports), `pv_power` (≥ 2000 W), `panels[]` |
| `co` → server | `POST /api/devices/register` | `{deviceType: "heat_pump", deviceId: SN}` — only without a Root ID |
| server → `co` | WebSocket `/ws?rootId=` | `{"type":"operation"}` → immediate `hp/add` |

A rejected PV reading is retried every 60 s until a newer one replaces it.

## Web pages (port 80)

| Address | Access | Content |
|---|---|---|
| `GET /` | open | view (HTML `TELEMETRY_PAGE` in `config_portal.cpp`; JS fetches both JSON documents every 5 s) |
| `GET /telemetry.json` | open | telemetry document |
| `GET /pv.json` | open | PV reading with panels (`{}` before the first reading) |
| `GET /install` | Basic Auth | Wi-Fi, SN and Root ID read-only, registration state (`PAGE_TEMPLATE`) |
| `POST /save` | Basic Auth | `ssid`, `password` (empty = unchanged); save in NVS, restart after 500 ms |

An unknown address redirects (302) to `/`. The `/install` login and password are in `src/device_config.hpp`.

![Main page (wide)](../img/strona-glowna.png)

## Configuration

| NVS key (`hp`) | Meaning |
|---|---|
| `wifi_ssid`, `wifi_pass` | Wi-Fi (empty = value from `secrets.h`) |
| `root_id` | Root ID from registration (empty = `CLOUD_ROOT_ID` from `secrets.h`, if set) |
| `mode` | controller mode (`ControllerMode`), default `CLOUD` |

Cloud settings (`DeviceSettings`: operating mode, temperatures) live only in RAM; after start they default to `OFF`, 35/45, 40/47 until the first operation.

## Build, tests, flashing

```bash
cp devices/co/src/secrets.example.h devices/co/src/secrets.h   # once, fill in
pio test -d devices/co -e native     # 64 tests: operation controller, parser, COP, Modbus frames, PV, AP policy
pio run -d devices/co                # esp32dev build
pio run -d devices/co -t upload      # flash over USB
```

The `native` tests need no hardware (`test/test_access_point_policy`, `test/test_modbus_frame`, `test/test_operation_controller`, `test/test_pv_data_processor`). The `co` RS-485 code is also used by the whole-chain test (`test/e2e`, `bridge.exe`), currently out of date.

Deployment order: the server first, then `co`, CHPC last.

## History

- [State before the refactor (2026-09-10)](../baseline-before-server-driven-refactor.md) (Polish)
- [Refactor to server-driven control (2026-09-20)](../server-driven-refactor-2026-09-20.md) (Polish) — some descriptions are out of date (number of web pages, permanent AP, sending before registration); this document prevails.

## Known issues

- **The `error_reset` and `restart` actions are lost outside `CLOUD` mode**: `applyServerOperation` (`main.cpp`) rejects the whole operation then, and the server sends the action only once. The comment in `operation_controller.cpp` ("Maintenance actions run in every controller mode") describes an intent that is not met.
- **An outdated TODO** in `main.cpp` ("Scheduler must perform the MANUAL -> AUTO transition") — the server already does it.
- **`DeviceSettings.controllerMode`** is unused; the mode is kept in `OperationController::localMode`.
- **Security**: open AP, `/install` login and password in the code, HTTPS without certificate checking.
- **Silent range validation**: an out-of-range value is not applied, and the application does not show it.
