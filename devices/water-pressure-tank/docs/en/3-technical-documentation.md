# Tank firmware — technical documentation

[← System documentation](../../../../docs/en/README.md) · [1. Business description](1-business-description.md) · [2. How it works](2-how-it-works.md) · **3. Technical documentation** · [Polski](../3-dokumentacja-techniczna.md)

The server side (API, collections, water formula, water meter) is described in the [water-pressure-tank module](../../../../docs/en/moduly/water-pressure-tank/3-technical-documentation.md). The original specification with the history of decisions (Polish): [water-pressure-tank.md](../water-pressure-tank.md).

## Hardware

| Part | Details |
|---|---|
| Board | ESP32-C3 SuperMini (PlatformIO `esp32-c3-devkitm-1`), USB CDC console 115200 |
| Power | 230 V → 5 V supply (e.g. HLK-PM01) on the pump supply line (after the pressure switch relay) |
| Compressor relay | 5 V single-channel module, `IN` on `GPIO10` |
| Tanks | 300 l galvanised with an air cushion + 300 l membrane, in parallel (Hydro-Vacuum) |

## Wiring

```text
                        230 V from the pressure switch relay (together with the pump)
                          L ──┬──────────────────────────────┐
                          N ──┼──────────────┐               │
                        ┌─────┴──────┐       │               │
                        │ supply     │       │               │
                        │ 230V→5V    │       │               │
                        └──┬──────┬──┘       │               │
                         +5V     GND         │               │
     ┌─────────────────────┼──────┼──┐       │               │
     │ ESP32-C3 SuperMini  │      │  │       │               │
     │                 5V ─┘      │  │       │               │
     │                GND ────────┤  │       │               │
     │             GPIO10 ──┐     │  │       │               │
     └──────────────────────┼─────┼──┘       │               │
                     ┌──────┴─────┼──────┐   │   ┌───────────┴──┐
      10 kΩ          │ IN  relay module  │   │   │  COM contact │
  IN ──/\/\/── GND   │ active-high       │   │   │  NO ──┐      │
  ("H" module)       │ (jumper H)        │   │   └───────┼──────┘
                     │ VCC ── +5V        │   │      ┌────┴─────┐
                     │ GND ── GND        │   └──────┤compressor│
                     └───────────────────┘          └──────────┘
```

- **Recommended:** active-high module + 10 kΩ from `IN` to `GND`, `RELAY_ACTIVE_HIGH = true`. The relay is then certainly off without power and while the ESP32 boots.
- **Active-low module** (current setting `RELAY_ACTIVE_HIGH = false`): the module gets 5 V before the ESP32 has 3.3 V, so `IN` is briefly pulled low through the pin's protection diodes and the relay clicks on regardless of the program. Resistor 10 kΩ from `IN` to `3V3` (never to 5 V).
- **Contacts** `COM`–`NO` in the compressor's live wire. Inrush current ≤ relay rating (usually 10 A / 250 V AC); motors above about 0.5 kW through a contactor.
- Installation only by a person qualified for 230 V work, in an enclosure, with a fuse.

## Files (`devices/water-pressure-tank`)

| File | Role |
|---|---|
| `src/water-pressure-tank.cpp` | `setup()` (relay, NVS, compressor before Wi-Fi, queue, `runId`), `loop()`/`tick()`, registration, sending, web pages |
| `src/firmware.hpp` | device type and name, relay pin and level, start delay, compressor times, `CLOUD_URL` |
| `src/compressor.*` | compressor state machine: start, restart, stop after time, `firstStartS`/`lastEndS`/`restarts` |
| `src/settings.*` | cloud settings (JSON ↔ struct, validation, max 4 tanks), water estimate, time from `/install` |
| `src/run_report.*` | `RunRecord`, report JSON, queue of 40 runs in NVS (`BlobStore`), `queuePreviousRun` |
| `src/secrets.example.h` | template of `secrets.h` (outside git): `AP_SSID`, `AP_PASSWORD`, `INSTALL_USER`, `INSTALL_PASSWORD`, `WIFI_SSID`, `WIFI_PASSWORD` |
| `test/test_logic/test_main.cpp` | 23 `native` tests |

## Constants

| Constant | Value | Where |
|---|---|---|
| `DEVICE_TYPE` / `DEVICE_NAME` | `water-pressure-tank` / "Hydrofor" | `firmware.hpp` |
| `RELAY_PIN` / `RELAY_ACTIVE_HIGH` | 10 / `false` | `firmware.hpp` |
| `COMPRESSOR_START_DELAY_MS` | 1000 | `firmware.hpp` |
| `DEFAULT_COMPRESSOR_SECONDS` / `MAX_COMPRESSOR_SECONDS` | 30 / 3600 | `firmware.hpp` |
| `CLOUD_URL` | `https://chpc-web.onrender.com/api/` (an `http://` address works without TLS) | `firmware.hpp` |
| `REGISTER_RETRY_MS`, `COMPRESSOR_SEND_RETRY_MS` | 10 s | `water-pressure-tank.cpp` |
| `AP_ADDRESS` | `10.11.16.1` | `water-pressure-tank.cpp` |
| `RunQueue::CAPACITY` | 40 | `run_report.hpp` |

## NVS (namespace `wp`)

| Key | Content |
|---|---|
| `wifi_ssid`, `wifi_pass` | Wi-Fi from `/install` (empty = values from `secrets.h`) |
| `root_id` | Root ID from the registration reply (dropped on 409) |
| `settings` | cloud settings (JSON) |
| `comp_pending` | compressor time from `/install` waits to be sent |
| `run_next` | next `runId` (the first one random) |
| `run_current` | current run (`RunRecord` blob, saved every 1 s, with a `delivered` flag) |
| `run_queue` | queue of undelivered runs (blob; a different size = empty) |

## Cloud contract

| Request | Body | Reply |
|---|---|---|
| `POST devices/register` | `{deviceId: SN, deviceType, name}` | `{rootId, settings: {compressor_seconds, pressure_low, pressure_high, tanks[]}}` |
| `POST water-pressure-tank/add?deviceId=&rootId=` | `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}` | `{}`; 404 unknown SN, 409 foreign Root ID |
| `PUT water-pressure-tank/settings?deviceId=&rootId=` | `{compressor_seconds}` | `{compressor_seconds}`; 400 invalid value (the flag is cleared anyway) |

SN = factory MAC from eFuse, 12 hex characters. The server certificate is not checked (as in `co`). The firmware version is **not** sent (the server does not support it).

## Web pages (port 80)

| Address | Access | Content |
|---|---|---|
| `GET /` | open | main page; JS fetches `/state.json` every 1 s |
| `GET /state.json` | open | `running`, `remainingS`, `compressorSeconds`, `pumpRunS`, `restarts`, `waterLiters`, `tanks[]` (`name`, `volumeLiters`, `enabled`, `liters`), `wifi`, `registered`, `lastStatus`, `queued` |
| `POST /restart` | open | run the compressor again for the full time |
| `GET`/`POST /install` | Basic Auth | Wi-Fi (empty password = unchanged; saving reconnects at once, **without a restart**, because a restart would start the compressor), SN, Root ID, IP, cloud state |
| `POST /install/compressor` | Basic Auth | compressor time 1–3600 s (whole seconds) |

An unknown address shows the main page.

| Main page | Installation |
|---|---|
| ![Main page](../img/strona-glowna-telefon.png) | ![Installation](../img/instalacja-telefon.png) |

## Build, tests, flashing

```bash
cp devices/water-pressure-tank/src/secrets.example.h devices/water-pressure-tank/src/secrets.h   # once, fill in
pio test -d devices/water-pressure-tank -e native            # 23 tests
pio run  -d devices/water-pressure-tank -e esp32c3           # build
pio run  -d devices/water-pressure-tank -e esp32c3 -t upload # flash over USB-C
pio device monitor                                          # console 115200
```

The `native` tests cover: the compressor (single start, stop after time, restart, time 0, a time change applies from the next start), the time from `/install` (valid and invalid inputs, `PUT` body, an unsent time is not overwritten by the cloud), the water estimate (both kinds, a disabled tank, `k`, `p0` between and above the thresholds, invalid thresholds), settings (rejecting invalid data, NVS, default `k`/`p0`, truncation to 4 tanks), the report JSON and the queue (on a mock NVS). **Wi-Fi, HTTP and the pages have no automated tests**; without a board use the server-side simulator: `node scripts/simulate-water-pressure-tank.mjs [--fast] [--history]` with `npm run local`.

## Known issues and notes

- **Never flashed onto a board**: first start according to the checklist in [part 1](1-business-description.md#before-the-first-deployment-checklist).
- **`RELAY_ACTIVE_HIGH = false`** matches the current module; with it the relay may click on briefly when power is applied (hardware, not the program).
- **The water formula lives in three places** (`src/settings.cpp`, server, client); change them together.
- **Security:** the controller network is open by default, pages over HTTP, `POST /restart` without login.
- The old sketch `D:\DevLocal\arduino_src\hydrofor\hydrofor.ino` (outside git) had the double compressor start bug; do not use it.
