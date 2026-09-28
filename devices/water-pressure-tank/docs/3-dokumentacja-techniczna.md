# Firmware hydroforu — dokumentacja techniczna

[← Dokumentacja systemu](../../../docs/README.md) · [1. Opis biznesowy](1-opis-biznesowy.md) · [2. Zasada działania](2-zasada-dzialania.md) · **3. Dokumentacja techniczna** · [English](en/3-technical-documentation.md)

Stronę serwerową (API, kolekcje, wzór wody, wodomierz) opisuje [moduł water-pressure-tank](../../../docs/moduly/water-pressure-tank/3-dokumentacja-techniczna.md). Pierwotna specyfikacja z historią decyzji: [water-pressure-tank.md](water-pressure-tank.md).

## Sprzęt

| Element | Szczegóły |
|---|---|
| Płytka | ESP32-C3 SuperMini (PlatformIO `esp32-c3-devkitm-1`), konsola USB CDC 115200 |
| Zasilanie | zasilacz 230 V → 5 V (np. HLK-PM01) na przewodzie zasilania pompy (za przekaźnikiem presostatu) |
| Przekaźnik kompresora | moduł 5 V, 1 kanał, `IN` na `GPIO10` |
| Zbiorniki | 300 l ocynkowany z poduszką + 300 l przeponowy, równolegle (Hydro-Vacuum) |

## Podłączenie

```text
                        230 V z przekaźnika presostatu (razem z pompą)
                          L ──┬──────────────────────────────┐
                          N ──┼──────────────┐               │
                        ┌─────┴──────┐       │               │
                        │ zasilacz   │       │               │
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
      10 kΩ          │ IN  moduł przekaź.│   │   │  COM   styk  │
  IN ──/\/\/── GND   │ sterowany stanem  │   │   │  NO ──┐      │
  (moduł „H”)        │ wysokim (zworka H)│   │   └───────┼──────┘
                     │ VCC ── +5V        │   │      ┌────┴─────┐
                     │ GND ── GND        │   └──────┤ kompresor│
                     └───────────────────┘          └──────────┘
```

- **Zalecane:** moduł sterowany stanem wysokim + 10 kΩ z `IN` do `GND`, `RELAY_ACTIVE_HIGH = true`. Przekaźnik jest wtedy na pewno wyłączony przy braku napięcia i w czasie startu ESP32.
- **Moduł sterowany stanem niskim** (obecne ustawienie `RELAY_ACTIVE_HIGH = false`): moduł ma 5 V wcześniej, niż ESP32 ma 3,3 V, więc `IN` jest przez chwilę ściągane do masy przez diody pinu — przekaźnik włącza się na moment niezależnie od programu. Rezystor 10 kΩ z `IN` do `3V3` (nigdy do 5 V).
- **Styki** `COM`–`NO` w przewodzie fazowym kompresora. Prąd rozruchowy ≤ obciążalność przekaźnika (zwykle 10 A / 250 V AC); silnik powyżej ok. 0,5 kW — przez stycznik.
- Montaż tylko przez osobę uprawnioną do prac przy 230 V, w obudowie, z bezpiecznikiem.

## Pliki (`devices/water-pressure-tank`)

| Plik | Rola |
|---|---|
| `src/water-pressure-tank.cpp` | `setup()` (przekaźnik, NVS, kompresor przed Wi-Fi, kolejka, `runId`), `loop()`/`tick()`, zgłoszenie, wysyłka, strony WWW |
| `src/firmware.hpp` | typ i nazwa urządzenia, pin i poziom przekaźnika, opóźnienie startu, czasy kompresora, `CLOUD_URL` |
| `src/compressor.*` | automat kompresora: start, ponowne uruchomienie, wyłączenie po czasie, `firstStartS`/`lastEndS`/`restarts` |
| `src/settings.*` | ustawienia z chmury (JSON ↔ struktura, walidacja, max 4 zbiorniki), szacunek wody, czas z `/install` |
| `src/run_report.*` | `RunRecord`, JSON wysyłki, kolejka 40 uruchomień w NVS (`BlobStore`), `queuePreviousRun` |
| `src/secrets.example.h` | wzór `secrets.h` (poza gitem): `AP_SSID`, `AP_PASSWORD`, `INSTALL_USER`, `INSTALL_PASSWORD`, `WIFI_SSID`, `WIFI_PASSWORD` |
| `test/test_logic/test_main.cpp` | 23 testy `native` |

## Stałe

| Stała | Wartość | Miejsce |
|---|---|---|
| `DEVICE_TYPE` / `DEVICE_NAME` | `water-pressure-tank` / „Hydrofor” | `firmware.hpp` |
| `RELAY_PIN` / `RELAY_ACTIVE_HIGH` | 10 / `false` | `firmware.hpp` |
| `COMPRESSOR_START_DELAY_MS` | 1000 | `firmware.hpp` |
| `DEFAULT_COMPRESSOR_SECONDS` / `MAX_COMPRESSOR_SECONDS` | 30 / 3600 | `firmware.hpp` |
| `CLOUD_URL` | `https://chpc-web.onrender.com/api/` (adres `http://` działa bez TLS) | `firmware.hpp` |
| `REGISTER_RETRY_MS`, `COMPRESSOR_SEND_RETRY_MS` | 10 s | `water-pressure-tank.cpp` |
| `AP_ADDRESS` | `10.11.16.1` | `water-pressure-tank.cpp` |
| `RunQueue::CAPACITY` | 40 | `run_report.hpp` |

## NVS (przestrzeń `wp`)

| Klucz | Zawartość |
|---|---|
| `wifi_ssid`, `wifi_pass` | Wi-Fi z `/install` (puste = wartości z `secrets.h`) |
| `root_id` | Root ID z odpowiedzi na zgłoszenie (kasowany przy 409) |
| `settings` | ustawienia z chmury (JSON) |
| `comp_pending` | czas kompresora z `/install` czeka na wysłanie |
| `run_next` | następny `runId` (pierwszy losowy) |
| `run_current` | bieżące uruchomienie (blob `RunRecord`, zapis co 1 s, z flagą `delivered`) |
| `run_queue` | kolejka niedoręczonych uruchomień (blob; inny rozmiar = pusta) |

## Kontrakt z chmurą

| Żądanie | Treść | Odpowiedź |
|---|---|---|
| `POST devices/register` | `{deviceId: SN, deviceType, name}` | `{rootId, settings: {compressor_seconds, pressure_low, pressure_high, tanks[]}}` |
| `POST water-pressure-tank/add?deviceId=&rootId=` | `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}` | `{}`; 404 nieznany SN, 409 cudzy Root ID |
| `PUT water-pressure-tank/settings?deviceId=&rootId=` | `{compressor_seconds}` | `{compressor_seconds}`; 400 zła wartość (znacznik i tak kasowany) |

SN = fabryczny MAC z eFuse, 12 znaków hex. Certyfikat serwera nie jest sprawdzany (jak w `co`). Wersja firmware **nie jest** wysyłana (serwer jej nie obsługuje).

## Strony WWW (port 80)

| Adres | Dostęp | Zawartość |
|---|---|---|
| `GET /` | otwarty | strona główna; JS co 1 s pobiera `/state.json` |
| `GET /state.json` | otwarty | `running`, `remainingS`, `compressorSeconds`, `pumpRunS`, `restarts`, `waterLiters`, `tanks[]` (`name`, `volumeLiters`, `enabled`, `liters`), `wifi`, `registered`, `lastStatus`, `queued` |
| `POST /restart` | otwarty | ponowne uruchomienie kompresora na pełny czas |
| `GET`/`POST /install` | Basic Auth | Wi-Fi (puste hasło = bez zmian; zapis łączy od razu, **bez restartu**, bo restart włączyłby kompresor), SN, Root ID, IP, stan chmury |
| `POST /install/compressor` | Basic Auth | czas kompresora 1–3600 s (pełne sekundy) |

Nieznany adres pokazuje stronę główną.

| Strona główna | Instalacja |
|---|---|
| ![Strona główna](img/strona-glowna-telefon.png) | ![Instalacja](img/instalacja-telefon.png) |

## Budowanie, testy, wgranie

```bash
cp devices/water-pressure-tank/src/secrets.example.h devices/water-pressure-tank/src/secrets.h   # raz, uzupełnić
pio test -d devices/water-pressure-tank -e native            # 23 testy
pio run  -d devices/water-pressure-tank -e esp32c3           # build
pio run  -d devices/water-pressure-tank -e esp32c3 -t upload # wgranie przez USB-C
pio device monitor                                          # konsola 115200
```

Testy `native` obejmują: kompresor (jeden start, koniec po czasie, ponowne uruchomienie, czas 0, zmiana czasu od następnego włączenia), czas z `/install` (poprawne i złe wpisy, treść `PUT`, niewysłany czas nie jest nadpisywany przez chmurę), szacunek wody (oba rodzaje, wyłączony zbiornik, `k`, `p0` między progami i powyżej, złe progi), ustawienia (odrzucenie złych danych, NVS, domyślne `k`/`p0`, obcięcie do 4 zbiorników), JSON wysyłki i kolejkę (na atrapie NVS). **Wi-Fi, HTTP i strony nie mają testów automatycznych** — do sprawdzenia bez płytki służy symulator po stronie serwera: `node scripts/simulate-water-pressure-tank.mjs [--fast] [--history]` przy `npm run local`.

## Znane problemy i uwagi

- **Nie był wgrywany na płytkę** — pierwsze uruchomienie według listy kontrolnej w [części 1](1-opis-biznesowy.md#przed-pierwszym-wdrożeniem-lista-kontrolna).
- **`RELAY_ACTIVE_HIGH = false`** odpowiada obecnemu modułowi; przy nim możliwe krótkie włączenie przekaźnika w chwili podania zasilania (sprzęt, nie program).
- **Wzór wody w trzech miejscach** (`src/settings.cpp`, serwer, klient) — zmieniać razem.
- **Bezpieczeństwo:** sieć sterownika domyślnie otwarta, strony po HTTP, `POST /restart` bez logowania.
- Dawny szkic `D:\DevLocal\arduino_src\hydrofor\hydrofor.ino` (poza gitem) miał usterkę podwójnego startu kompresora; nie używać.
