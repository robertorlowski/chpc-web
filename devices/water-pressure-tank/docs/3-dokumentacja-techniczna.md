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
| `ota_tried` | wersja, po której pobraniu sterownik ostatnio się zrestartował (ochrona przed pętlą aktualizacji) |

## Kontrakt z chmurą

| Żądanie | Treść | Odpowiedź |
|---|---|---|
| `POST devices/register` | `{deviceId: SN, deviceType, name, version}` | `{rootId, settings: {compressor_seconds, pressure_low, pressure_high, tanks[], firmware?: {version, url, sha256}}}` |
| `POST water-pressure-tank/add?deviceId=&rootId=` | `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}` | `{}`; 404 nieznany SN, 409 cudzy Root ID |
| `PUT water-pressure-tank/settings?deviceId=&rootId=` | `{compressor_seconds}` | `{compressor_seconds}`; 400 zła wartość (znacznik i tak kasowany) |

SN = fabryczny MAC z eFuse, 12 znaków hex. Certyfikat serwera nie jest sprawdzany (jak w `co`). Wersja firmware (`FW_VERSION` w `firmware.hpp`) jest wysyłana w zgłoszeniu; serwer jej na razie nie zapisuje.

## Strony WWW (port 80)

| Adres | Dostęp | Zawartość |
|---|---|---|
| `GET /` | otwarty | strona główna; JS co 1 s pobiera `/state.json` |
| `GET /state.json` | otwarty | `running`, `remainingS`, `compressorSeconds`, `pumpRunS`, `restarts`, `waterLiters`, `tanks[]` (`name`, `volumeLiters`, `enabled`, `liters`), `wifi`, `registered`, `lastStatus`, `queued` |
| `POST /restart` | otwarty | ponowne uruchomienie kompresora na pełny czas |
| `GET`/`POST /install` | Basic Auth | Wi-Fi (puste hasło = bez zmian; zapis łączy od razu, **bez restartu**, bo restart włączyłby kompresor), SN, Root ID, IP, stan chmury |
| `POST /install/compressor` | Basic Auth | czas kompresora 1–3600 s (pełne sekundy) |
| `POST /install/firmware` | Basic Auth | ręczne wgranie `firmware.bin` (multipart); odrzucane przy pracującym kompresorze; po wgraniu restart |

Nieznany adres pokazuje stronę główną.

| Strona główna | Instalacja |
|---|---|
| ![Strona główna](img/strona-glowna-telefon.png) | ![Instalacja](img/instalacja-telefon.png) |

## Aktualizacja przez sieć (OTA)

Układ flash to domyślna tablica Arduino-ESP32 z dwiema partycjami aplikacji (`app0`/`app1` po 1,28 MB; obraz zajmuje ok. 74%), więc nie wymaga zmian. Pierwsze wgranie firmware z OTA jest jeszcze po USB.

1. Serwer dodaje do `settings` w odpowiedzi na zgłoszenie pole `firmware: {version, url, sha256}` ze zmiennych `WPT_FIRMWARE_VERSION`, `WPT_FIRMWARE_URL`, `WPT_FIRMWARE_SHA256` (bez wersji i adresu pola nie ma).
2. Sterownik (`ota.cpp`) przyjmuje ofertę, gdy adres zaczyna się od `https://`, wersja jest niepusta, a `sha256` ma 64 znaki hex. Oferty bez sumy kontrolnej ignoruje.
3. Pobranie startuje raz na uruchomienie, gdy: zgłoszenie się udało, bieżące uruchomienie zostało doręczone, kolejka jest pusta, **kompresor nie pracuje** (pobieranie blokuje pętlę na kilkanaście sekund i nie pilnowałaby przekaźnika) i wersja z oferty różni się od `FW_VERSION` (także starsza: powrót do poprzedniego wydania).
4. `downloadFirmware()` pobiera obraz z GitHub Releases (śledzi przekierowania) prosto do nieaktywnej partycji, licząc SHA-256 w locie. Obraz jest aktywowany dopiero po zgodnej sumie (`Update.end`), więc przerwanie pobierania albo zasilania nie psuje działającego firmware. Potem restart; kompresor włącza się jak przy każdym starcie.
5. Po zapisie obrazu wersja trafia do NVS (`ota_tried`). Gdy po restarcie `FW_VERSION` nadal nie zgadza się z ofertą (zapomniana zmiana wersji), kolejna próba jest pomijana. Nieudane pobranie ponawia się przy następnym uruchomieniu pompy.
6. Awaryjnie plik `firmware.bin` można wgrać ręcznie na `/install` (sekcja „Firmware”).

**Wydanie nowej wersji:** podnieść `FW_VERSION`, `pio run -d devices/water-pressure-tank`, `sha256sum .pio/build/esp32c3/firmware.bin`, wgrać `firmware.bin` do GitHub Release, ustawić na Render `WPT_FIRMWARE_VERSION`, `WPT_FIRMWARE_URL` (adres assetu) i `WPT_FIRMWARE_SHA256`, uruchomić build ręcznie. Sterownik pobierze obraz przy najbliższej pracy pompy dłuższej niż czas kompresora.

**Uwagi:** pobieranie i serwer WWW nie mają testów na płytce (testy `native` obejmują `ota.cpp`); certyfikat nie jest sprawdzany, a integralność obrazu zapewnia SHA-256 z odpowiedzi chmury (ten sam kanał, więc nie chroni przed podszyciem się pod serwer). Restart po aktualizacji kończy bieżący zapis uruchomienia kilkanaście sekund przed faktycznym końcem pracy pompy i zaczyna nowy `runId`.

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
