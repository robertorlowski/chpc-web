# Water-pressure-tank module — technical documentation

[← System documentation](../../README.md) · [1. Business description](1-business-description.md) · [2. How it works](2-how-it-works.md) · **3. Technical documentation** · [Polski](../../../moduly/water-pressure-tank/3-dokumentacja-techniczna.md)

## Files — server (`server/src/modules/water-pressure-tank`)

| File | Role |
|---|---|
| `routes.ts` | `/water-pressure-tank/*` routes |
| `device-type.ts` | registry entry: default settings of a new tank and the `settings` field in the registration reply |
| `types.ts` | `WaterTank`, `WaterTankKind`, `WaterPressureTankRun`, `WaterMeterReading` |
| `controllers/water-pressure-tank.controller.ts` | `add`, `settings`, `runs`, `summary`, water meter and its summary; period boundaries in Warsaw time |
| `services/water-pressure-tank.service.ts` | message validation and save (dates from relative times), `estimateWater`, summaries, water meter, suggested `k`, compressor time |
| `models/water-pressure-tank-run.model.ts` | `water_pressure_tank` collection |
| `models/water-meter.model.ts` | `water_meter` collection |
| `models/water-tank.model.ts` | tank schema in `devices.properties.tanks` |

## Files — client (`client/src/devices/water-pressure-tank`)

| File | Role |
|---|---|
| `device-type.tsx` | registry entry: Hydrofor, Data, Chart, Settings (no schedules) |
| `api.ts` | `WaterPressureTankRequests` |
| `types.ts` | tanks, runs, summaries, water meter |
| `pages/Home.tsx` | settings, tanks, today's runs (every 10 s) |
| `pages/Data.tsx` | tabs: runs of a month (CSV) and water meter readings |
| `pages/Chart.tsx` | day / month / year chart, year with the water meter and suggested `k` |
| `pages/Settings.tsx` | compressor, thresholds, tanks, water-per-cycle calculator, controller data |
| `pages/style.css` | tank screen styles |
| `utils/water.ts` | water formula (as on the server and in the firmware), cylinder volume, Warsaw dates, CSV |

## API

| Method and path | Caller | Description |
|---|---|---|
| `POST /water-pressure-tank/add` | controller | `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}`; `deviceId` alone is enough; 404/409 as in core; reply `{}` (201); bad data 400 |
| `PUT /water-pressure-tank/settings` | controller | `{compressor_seconds}` (whole seconds 1–3600, otherwise 400); changes only that field; 404 for another device kind |
| `GET /water-pressure-tank/runs?from=YYYY-MM-DD&to=YYYY-MM-DD` | application | runs of the days (Warsaw, `to` inclusive), with `inProgress` and `compressorRunning` fields |
| `GET /water-pressure-tank/runs?fromTime=ISO&toTime=ISO` | — | runs of a period (currently unused by the application) |
| `GET /water-pressure-tank/summary?period=day\|month\|year&date=YYYY-MM-DD` | application | water per hour (24), per day of the month or per month (12); empty buckets are zero |
| `GET /water-pressure-tank/meter` | application | readings, oldest first |
| `POST /water-pressure-tank/meter` | application | `{readAt, valueM3, note?}` |
| `DELETE /water-pressure-tank/meter/:id` | application | delete; 404 for an unknown or foreign reading |
| `GET /water-pressure-tank/meter/summary?year=YYYY` | application | consumption per period and month, comparison with the estimate, `suggestedK`; < 2 readings → empty |

Tank settings are saved with the shared `PUT /device/properties` (core module). Registration (`POST /devices/register`) returns `settings`: `compressor_seconds`, `pressure_low`, `pressure_high`, `tanks`.

Message validation: `runId` — integer ≥ 0; `pumpRunS` — 0 to 24 h; other times ≥ 0.

## Data model

**`water_pressure_tank`** — one pump run:

| Field | Description |
|---|---|
| `rootId`, `deviceType`, `deviceId`, `runId` | identification (`runId` is assigned by the controller: a counter in NVS with a random start) |
| `pumpStart`, `pumpEnd` | pump start and end |
| `compressorStart`, `compressorEnd` | compressor on and last off |
| `restarts` | number of manual compressor restarts |
| `waterLiters` | water estimate from the settings when the record was created |
| `waterAirBaseLiters`, `waterMembraneLiters` | parts of the estimate: cushion at `k` = 1 and membrane (for the suggested `k`) |
| `timeApproximate` | dates from the time received (queued run) |
| `lastSeenAt` | last message (run "in progress" < 5 s) |
| `compressorRunning` | compressor on according to the last message (`compressorStartS` without `compressorEndS`); needed after "Restart", because `compressorEnd` keeps the previous stop. `GET …/runs` returns it only with `inProgress` |
| `createdAt`, `updatedAt` | timestamps |

Indexes: unique `{rootId, runId}` and `{rootId, pumpStart}`.

**`water_meter`** — water meter readings: `rootId`, `readAt` (the application stores the date as local noon), `valueM3`, `note`; index `{rootId, readAt}`.

**`devices.properties`** of a tank: `compressor_seconds` (1–3600), `pressure_low`, `pressure_high` [bar on the manometer], `tanks[]`: `{name, kind: 'air' | 'membrane', volumeLiters, enabled, precharge, k}`.

## Constants

| Constant | Value | Where |
|---|---|---|
| `RUN_IN_PROGRESS_MS` | 5 s | service |
| `MAX_COMPRESSOR_SECONDS` | 3600 | service, `properties` schema, firmware |
| atmospheric pressure | 1.013 bar | service, `utils/water.ts`, firmware `settings.cpp` |
| default settings | 30 s; 2–4 bar; "Ocynkowany" 300 l `k` = 1; "Przeponowy" 300 l `p0` = 1.8 | `device-type.ts` |

## Tests and tools

```bash
npm test -w server -- --run       # server/test/water-pressure-tank.test.ts: 30 tests (server in total: 81)
node scripts/simulate-water-pressure-tank.mjs [--history] [--fast]   # controller simulator (npm run local)
node scripts/seed-local.mjs       # demo data: several months of runs and water meter readings
```

`server/test/water-pressure-tank.test.ts` checks: the water formula and its agreement with the client formula, registration with settings, settings and their validation, compressor time from the controller (one field changed, 404, 409), dates from relative times, the queue and approximate time, "in progress", compressor running (also after a restart), summaries, water meter and `k`, default controller.

## Known issues

- **The controller sends runs only after a successful registration** (unlike `co`) — without the cloud the run waits in NVS and goes to the queue at the next start.
- **`GET /runs?fromTime=&toTime=`** and `getRunsBetween` in the client are unused (since the "between readings" filter was removed).
- **A tank gets `work_mode: CWU` in `properties`** from the schema default — the field is unused.
- **`PUT /device/properties` replaces the whole `properties`** — the application sends the full set of tank fields; any other API client must do the same.
- **The water calculator** shares its fields between all tanks (one is open at a time).
- **The firmware and the controller pages have no hardware tests** — they are checked in an emulator and in `native` tests.
