# Moduł water-pressure-tank — dokumentacja techniczna

[← Dokumentacja systemu](../../README.md) · [1. Opis biznesowy](1-opis-biznesowy.md) · [2. Zasada działania](2-zasada-dzialania.md) · **3. Dokumentacja techniczna** · [English](../../en/moduly/water-pressure-tank/3-technical-documentation.md)

## Pliki — serwer (`server/src/modules/water-pressure-tank`)

| Plik | Rola |
|---|---|
| `routes.ts` | trasy `/water-pressure-tank/*` |
| `device-type.ts` | wpis do rejestru: ustawienia domyślne nowego hydroforu i pole `settings` w odpowiedzi na zgłoszenie |
| `types.ts` | `WaterTank`, `WaterTankKind`, `WaterPressureTankRun`, `WaterMeterReading` |
| `controllers/water-pressure-tank.controller.ts` | `add`, `settings`, `runs`, `summary`, wodomierz i jego podsumowanie; granice okresów w czasie warszawskim |
| `services/water-pressure-tank.service.ts` | walidacja i zapis wiadomości (daty z czasów względnych), `estimateWater`, podsumowania, wodomierz, sugerowane `k`, czas kompresora |
| `models/water-pressure-tank-run.model.ts` | kolekcja `water_pressure_tank` |
| `models/water-meter.model.ts` | kolekcja `water_meter` |
| `models/water-tank.model.ts` | schemat zbiornika w `devices.properties.tanks` |

## Pliki — klient (`client/src/devices/water-pressure-tank`)

| Plik | Rola |
|---|---|
| `device-type.tsx` | wpis do rejestru: Hydrofor, Dane, Wykres, Ustawienia (bez harmonogramów) |
| `api.ts` | `WaterPressureTankRequests` |
| `types.ts` | zbiorniki, uruchomienia, podsumowania, wodomierz |
| `pages/Home.tsx` | ustawienia, zbiorniki, dzisiejsze uruchomienia (co 10 s) |
| `pages/Data.tsx` | zakładki: uruchomienia z miesiąca (CSV) i odczyty wodomierza |
| `pages/Chart.tsx` | wykres dnia / miesiąca / roku, rok z wodomierzem i sugerowanym `k` |
| `pages/Settings.tsx` | kompresor, progi, zbiorniki, kalkulator wody na cykl, dane sterownika |
| `pages/style.css` | style widoków hydroforu |
| `utils/water.ts` | wzór wody (jak na serwerze i w firmware), objętość walca, daty w Warszawie, CSV |

## API

| Metoda i ścieżka | Kto | Opis |
|---|---|---|
| `POST /water-pressure-tank/add` | sterownik | `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}`; sam `deviceId` wystarcza; 404/409 jak w core; odpowiedź `{}` (201); złe dane 400 |
| `PUT /water-pressure-tank/settings` | sterownik | `{compressor_seconds}` (pełne sekundy 1–3600, inaczej 400); zmienia tylko to pole; 404 dla innego rodzaju urządzenia |
| `GET /water-pressure-tank/runs?from=YYYY-MM-DD&to=YYYY-MM-DD` | aplikacja | uruchomienia z dni (Warszawa, `to` włącznie), z polami `inProgress` i `compressorRunning` |
| `GET /water-pressure-tank/runs?fromTime=ISO&toTime=ISO` | — | uruchomienia z okresu (obecnie nieużywane przez aplikację) |
| `GET /water-pressure-tank/summary?period=day\|month\|year&date=YYYY-MM-DD` | aplikacja | woda w godzinach (24), dniach miesiąca albo miesiącach (12); puste przedziały z zerami |
| `GET /water-pressure-tank/meter` | aplikacja | odczyty od najstarszego |
| `POST /water-pressure-tank/meter` | aplikacja | `{readAt, valueM3, note?}` |
| `DELETE /water-pressure-tank/meter/:id` | aplikacja | usunięcie; 404 dla nieznanego albo cudzego |
| `GET /water-pressure-tank/meter/summary?year=YYYY` | aplikacja | zużycie w okresach i miesiącach, porównanie z szacunkiem, `suggestedK`; < 2 odczytów → puste |

Ustawienia hydroforu zapisuje wspólne `PUT /device/properties` (moduł core). Zgłoszenie (`POST /devices/register`) zwraca `settings`: `compressor_seconds`, `pressure_low`, `pressure_high`, `tanks`.

Walidacja wiadomości: `runId` — liczba całkowita ≥ 0; `pumpRunS` — 0 do 24 h; pozostałe czasy ≥ 0.

## Model danych

**`water_pressure_tank`** — jedno uruchomienie pompy:

| Pole | Opis |
|---|---|
| `rootId`, `deviceType`, `deviceId`, `runId` | identyfikacja (`runId` nadaje sterownik: licznik w NVS, losowy start) |
| `pumpStart`, `pumpEnd` | start i koniec pracy pompy |
| `compressorStart`, `compressorEnd` | włączenie i ostatnie wyłączenie kompresora |
| `restarts` | liczba ręcznych ponownych uruchomień kompresora |
| `waterLiters` | szacunek wody z ustawień w chwili utworzenia rekordu |
| `waterAirBaseLiters`, `waterMembraneLiters` | części szacunku: poduszka przy `k` = 1 i przepona (do sugerowanego `k`) |
| `timeApproximate` | daty z chwili przyjęcia (uruchomienie z kolejki) |
| `lastSeenAt` | ostatnia wiadomość (uruchomienie „w toku” < 5 s) |
| `compressorRunning` | kompresor włączony według ostatniej wiadomości (`compressorStartS` bez `compressorEndS`); potrzebne po „Uruchom ponownie”, bo `compressorEnd` zostaje z poprzedniego wyłączenia. `GET …/runs` zwraca je tylko przy `inProgress` |
| `createdAt`, `updatedAt` | znaczniki zapisu |

Indeksy: unikalny `{rootId, runId}` i `{rootId, pumpStart}`.

**`water_meter`** — odczyty wodomierza: `rootId`, `readAt` (aplikacja zapisuje datę jako południe czasu lokalnego), `valueM3`, `note`; indeks `{rootId, readAt}`.

**`devices.properties`** hydroforu: `compressor_seconds` (1–3600), `pressure_low`, `pressure_high` [bar na manometrze], `tanks[]`: `{name, kind: 'air' | 'membrane', volumeLiters, enabled, precharge, k}`.

## Stałe

| Stała | Wartość | Gdzie |
|---|---|---|
| `RUN_IN_PROGRESS_MS` | 5 s | serwis |
| `MAX_COMPRESSOR_SECONDS` | 3600 | serwis, schemat `properties`, firmware |
| ciśnienie atmosferyczne | 1,013 bar | serwis, `utils/water.ts`, firmware `settings.cpp` |
| ustawienia domyślne | 30 s; 2–4 bar; „Ocynkowany” 300 l `k` = 1; „Przeponowy” 300 l `p0` = 1,8 | `device-type.ts` |

## Testy i narzędzia

```bash
npm test -w server -- --run       # server/test/water-pressure-tank.test.ts: 30 testów (serwer razem: 81)
node scripts/simulate-water-pressure-tank.mjs [--history] [--fast]   # symulator sterownika (npm run local)
node scripts/seed-local.mjs       # dane demo: kilka miesięcy uruchomień i odczyty wodomierza
```

`server/test/water-pressure-tank.test.ts` sprawdza: wzór wody i zgodność ze wzorem klienta, zgłoszenie z ustawieniami, ustawienia i ich walidację, czas kompresora ze sterownika (zmiana jednego pola, 404, 409), daty z czasów względnych, kolejkę i czas przybliżony, „w toku”, pracę kompresora (także po ponownym uruchomieniu), podsumowania, wodomierz i `k`, sterownik domyślny.

## Znane problemy

- **Sterownik wysyła uruchomienia dopiero po udanym zgłoszeniu** (w odróżnieniu od `co`) — bez chmury uruchomienie czeka w NVS i trafia do kolejki przy następnym starcie.
- **`GET /runs?fromTime=&toTime=`** i `getRunsBetween` w kliencie są nieużywane (po usunięciu filtra „między odczytami”).
- **Hydrofor dostaje w `properties` `work_mode: CWU`** z wartości domyślnej schematu — pole jest nieużywane.
- **`PUT /device/properties` podmienia całe `properties`** — aplikacja wysyła komplet pól hydroforu; inny klient API musi zrobić to samo.
- **Kalkulator wody** ma wspólne pola dla wszystkich zbiorników (otwarty jest jeden naraz).
- **Firmware i strony sterownika nie mają testów na sprzęcie** — sprawdzane są w emulatorze i testach `native`.
