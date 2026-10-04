# Firmware włącznika — dokumentacja techniczna

[← Dokumentacja systemu](../../../docs/README.md) · [1. Opis biznesowy](1-opis-biznesowy.md) · [2. Zasada działania](2-zasada-dzialania.md) · **3. Dokumentacja techniczna** · [English](en/3-technical-documentation.md)

Stronę serwerową (API, kolekcje, harmonogram, historia włączeń) opisuje [moduł switch](../../../docs/moduly/switch/3-dokumentacja-techniczna.md).

## Sprzęt

| Element | Szczegóły |
|---|---|
| Płytka | gotowy moduł **„ESP32 Relay AC X1”**: ESP32-WROOM-32E N4 (4 MB Flash, układ ESP32-D0WD-V3), PlatformIO `esp32dev`; bez USB |
| Zasilanie | wbudowany zasilacz 230 V AC → 5 V (żółty transformator) i stabilizator 3,3 V; zaciski wejścia 230 V |
| Przekaźnik | Songle SLA-05VDC-SL-A, 30 A / 250 V AC, styk zwierny (NO); sterowany z **GPIO2**, stan wysoki = włączony; zaciski wyjścia przekaźnika |
| Złącze P1 | programowanie i konsola: `GND`, `RX`, `TX`, `3V3` (opis na płytce); UART0, 115200 |
| Przyciski | przycisk przy diodzie D6 = **IO0** (BOOT, tryb programowania); **brak przycisku RST** |

**Pin przekaźnika.** Test pinów 2026-10-02 wskazał GPIO17 albo GPIO2 (opóźnienie wiadomości nie pozwoliło rozstrzygnąć). Na GPIO17 przekaźnik nie klikał; na GPIO2 działa (2026-10-03). Firmware 1.0.2 sterował oboma pinami naraz, 1.0.3 tylko GPIO2. GPIO2 to pin trybu startu ESP32 (strapping): firmware ustawia go jako wyjście dopiero w `setup()`, po starcie układu, najpierw ze stanem „wyłączony”.

## Podłączenie: programowanie

Płytka nie ma USB, więc pierwszy firmware wgrywa się przez złącze P1 i przejściówkę USB-TTL. Użyto FT232RL (sterownik FTDI z Windows), bo sterownik CP210x jest na laptopie z polityką integralności kodu (HVCI) blokowany.

```text
  przejściówka FT232RL                     złącze P1 płytki
  (poziomy logiczne 3,3 V)                 (opis: GND, RX, TX, 3V3)

        GND ──────────────────────────────── GND
        TX  ───────────────────────────────► RX    (UART0, GPIO3)
        RX  ◄─────────────────────────────── TX    (UART0, GPIO1)
        VCC   ✗ nie podłączać                3V3 ── tylko z osobnego zasilacza 3,3 V (wariant A)
```

**Pin 3V3 złącza to 3,3 V, nie 5 V** — podanie 5 V może uszkodzić ESP32. **Zasilanie z wyjścia 3,3 V przejściówki FT232RL nie wystarcza** (ok. 50 mA; ESP32 nie odpowiadał). Dwa sprawdzone warianty:

| Wariant | Zasilanie płytki | Uwagi |
|---|---|---|
| **A (zalecany)** | osobny zasilacz 3,3 V (np. moduł AMS1117) na pin `3V3`, wspólny `GND` z przejściówką; 230 V niepodłączone | bez napięcia sieci na płytce |
| **B** | płytka zasilana z 230 V, z przejściówką połączone tylko `GND`, `TX`, `RX` | **łączy laptop z płytką zasilaną z sieci**; bezpieczne tylko przy izolowanym zasilaczu płytki. Laptop na baterii (bez zasilacza), nic na wyjściu przekaźnika, nie dotykać płytki (ścieżki 230 V od spodu) |

Przy podłączonej przejściówce zaobserwowano „Brownout detected” i start w trybie programowania — po wgraniu i teście odłączyć przejściówkę.

## Podłączenie: instalacja

```text
            sieć 230 V przez zabezpieczenie dobrane przez elektryka
              L ──┬──────────────────────────────────────┐
              N ──┼──────────────┐                       │
                  │              │                       │
          ┌───────┴──────────────┴───────┐        ┌──────┴───────┐
          │ zaciski wejścia 230 V (L, N) │        │ COM          │
          │ zasilacz 230 V → 5 V → 3,3 V │        │  przekaźnik  │
          │ ESP32 ── GPIO2 ──────────────┼───────►│  30 A        │
          └──────────────────────────────┘        │ NO ──┐       │
                                                  └──────┼───────┘
                                                    ┌────┴─────┐
              N ────────────────────────────────────┤ odbiornik│
              PE ───────────────────────────────────┤ (bojler) │
                                                    └──────────┘
```

- **Styk NO w przewodzie fazowym odbiornika**: przekaźnik zwiera `COM`–`NO`, gdy GPIO2 jest w stanie wysokim. Bez zasilania odbiornik jest wyłączony, a firmware po starcie ustawia przekaźnik jako wyłączony, dopóki chmura nie przyśle polecenia. Schemat zakłada styk bezpotencjałowy na zaciskach wyjścia; oznaczenia zacisków i to, czy płytka łączy `COM` z `L`, sprawdzić na płytce przed montażem.
- **Duże obciążenia** (bojler): przekaźnik ma 30 A / 250 V AC, ale przekrój przewodów, zaciski, zabezpieczenie i ewentualny stycznik (obciążenie indukcyjne, prąd blisko granicy) dobiera elektryk. Termostat bojlera zostaje w obwodzie.
- **PE** odbiornika łączy się bezpośrednio, nie przez płytkę.
- Montaż tylko przez osobę uprawnioną do prac przy 230 V, w obudowie izolacyjnej; płytka ma odsłonięte ścieżki 230 V.

## Pliki (`devices/switch`)

| Plik | Rola |
|---|---|
| `platformio.ini` | środowiska `esp32dev` (produkcja), `esp32dev-local` (lokalny serwer), `native` (testy) |
| `src/switch.cpp` | `setup()` (przekaźniki wyłączone, NVS, sieć), `loop()`/`tick()`, zgłoszenie, wymiana stanu, zmiany lokalne do chmury, WebSocket, AP, OTA, strony WWW, dziennik na konsoli |
| `src/firmware.hpp` | `DEVICE_TYPE`, `FW_VERSION`, `DEVICE_NAME`, `RELAY_PINS`, `RELAY_ACTIVE_HIGH`, `DEFAULT_ON_MINUTES`, `MAX_ON_MINUTES`, `CLOUD_URL` (z makra `SWITCH_CLOUD_URL`) |
| `src/relays.*` | `RelayBank`: `applyCloud` (polecenie chmury, pomijane przy `pending`), `applyLocal` (zmiana ze strony), `update` (koniec odliczania), `pendingMinutes`, `confirmPending` (po numerze zmiany) |
| `src/protocol.*` | `buildStateReport`, `applyStateResponse`, `buildModeBody`, `parseDefaultMinutes` |
| `src/ota.*` | `parseOtaOffer` (`{version, url, sha256, request}`), `otaKey` (`wersja#request`), `shouldUpdate` (jedna próba na zlecenie) |
| `src/secrets.example.h` | wzór `secrets.h` (poza gitem): `AP_SSID` („Wlacznik-setup”), `AP_PASSWORD` (puste = AP otwarty), `INSTALL_USER`, `INSTALL_PASSWORD`, `WIFI_SSID`, `WIFI_PASSWORD` |
| `test/test_logic/test_main.cpp` | 12 testów `native` |

## Stałe

| Stała | Wartość | Miejsce |
|---|---|---|
| `DEVICE_TYPE` / `DEVICE_NAME` | `switch` / „Włącznik” | `firmware.hpp` |
| `FW_VERSION` | `1.1.0` | `firmware.hpp` |
| `RELAY_PINS` / `RELAY_ACTIVE_HIGH` | `{2}` / `true` | `firmware.hpp` |
| `DEFAULT_ON_MINUTES` / `MAX_ON_MINUTES` | 30 / 10080 | `firmware.hpp` |
| `CLOUD_URL` | `https://chpc-web.onrender.com/api/` (`esp32dev-local`: `http://192.168.55.9:4001/api/`) | `firmware.hpp`, `platformio.ini` |
| `MAX_RELAYS` | 8 | `relays.hpp` |
| `EXCHANGE_INTERVAL_MS` | 5 s | `switch.cpp` |
| `REGISTER_RETRY_MS` / `PENDING_RETRY_MS` | 30 s / 5 s | `switch.cpp` |
| `CLOUD_ONLINE_MS` | 30 s (chmura „dostępna” po udanej wymianie) | `switch.cpp` |
| `AP_OFF_AFTER_MS` / `AP_ON_AFTER_MS` | 1 min / 1 min | `switch.cpp` |
| `HTTP_TIMEOUT_MS` / `REGISTER_TIMEOUT_MS` / `OTA_TIMEOUT_MS` | 4 s / 8 s / 15 s | `switch.cpp` |
| `STATUS_LOG_MS` | 30 s | `switch.cpp` |
| `AP_ADDRESS` | `10.11.17.1` | `switch.cpp` |

## NVS (przestrzeń `sw`)

| Klucz | Zawartość |
|---|---|
| `wifi_ssid`, `wifi_pass` | Wi-Fi z `/install` (puste = wartości z `secrets.h`) |
| `root_id` | Root ID z odpowiedzi na zgłoszenie (kasowany przy 404/409) |
| `def_min` | domyślny czas „Włącz” z chmury [min] |
| `ota_tried` | klucz oferty `wersja#request` (`otaKey()`), po której pobraniu sterownik ostatnio się zrestartował (jedna próba na zlecenie, ochrona przed pętlą aktualizacji; do 1.0.3 sama wersja) |

Stan przekaźników nie jest zapisywany: po starcie są wyłączone, a stan przywraca chmura.

## Kontrakt z chmurą

| Żądanie | Treść | Odpowiedź |
|---|---|---|
| `POST devices/register` | `{deviceId: SN, deviceType: "switch", name: "Włącznik", version, ip, relays}` | `{rootId, settings: {default_on_minutes, firmware?: {version, url, sha256, request}}}`; `firmware` tylko przy zleceniu „Aktualizuj” |
| `POST switch/state?deviceId=&rootId=` | `{uptimeS, relays: [{on, changedS}]}` | `{relays: [{on, offAfterS?, mode}], firmware?}` (`firmware` jak wyżej, czytane od 1.1.0); 404 nieznany SN, 409 cudzy Root ID |
| `PUT switch/mode?deviceId=&rootId=` | `{relay, mode, minutes?, source: "controller"}` (`minutes` tylko dla `timer`) | przekaźnik; 400 zmiana nie do przyjęcia (nie ponawiana) |
| WebSocket `/ws?rootId=` | — | `{"type":"operation"}` → zgłoszenie stanu od razu; inne komunikaty pomijane |

SN = fabryczny MAC z eFuse, 12 znaków hex. `rootId` jest dopisywany, gdy jest zapisany; serwer znajduje sterownik także po samym SN. Certyfikat serwera nie jest sprawdzany (jak w `co` i hydroforze). Host, port i TLS WebSocketu są wyliczane z `CLOUD_URL`.

## Strony WWW (port 80)

| Adres | Dostęp | Zawartość |
|---|---|---|
| `GET /` | otwarty | strona główna; JS co 1 s pobiera `/state.json` (nie odświeża, gdy kursor jest w polu); karta każdego przekaźnika („Przekaźnik N”): stan, tryb (`tryb nieznany (brak chmury)` przed pierwszą odpowiedzią, „czeka na wysłanie do chmury” przy `pending`), odliczanie `h:mm:ss`, przyciski „Włącz”, „Wyłącz”, „Harmonogram” (nieaktywny w trybie harmonogramu), pola „Czas włączenia [h] [min]”; karta „Wi-Fi i chmura” |
| `GET /state.json` | otwarty | `relays[]` (`relay`, `on`, `mode`, `remainingS`, `pending`), `defaultMinutes`, `wifi`, `ssid`, `ip`, `rssi`, `cloud`, `lastStatus` |
| `POST /relay?n=&mode=on\|off\|timer\|schedule&minutes=` | otwarty | zmiana ze strony; `minutes` 1–10080 tylko dla `timer`; 400 zły numer, tryb albo czas |
| `GET`/`POST /install` | Basic Auth | Wi-Fi (puste hasło = bez zmian; zapis łączy od razu, bez restartu), wersja firmware i stan OTA, SN, Root ID, liczba przekaźników, adres IP, stan zgłoszenia |
| `POST /install/firmware` | Basic Auth | ręczne wgranie `firmware.bin` (multipart, pole `firmware`); po wgraniu restart (przekaźniki na chwilę wyłączone); 409 przy niepoprawnym pliku |

Nieznany adres pokazuje stronę główną. Login i hasło `/install` są w `secrets.h`.

| Strona główna | Instalacja |
|---|---|
| ![Strona główna](img/strona-glowna-telefon.png) | ![Instalacja](img/instalacja-telefon.png) |

## Pierwsze wgranie przez złącze P1

1. Zbudować obraz: `pio run -d devices/switch` (pliki w `devices/switch/.pio/build/esp32dev/`).
2. Podłączyć przejściówkę jak w [schemacie programowania](#podłączenie-programowanie), na razie bez zasilania płytki.
3. **Tryb programowania:** przytrzymać przycisk IO0 (przy diodzie D6), podać zasilanie (wariant A albo B), puścić przycisk.
4. Wgrać całość przy 115200 bodów:

```bash
esptool.py --chip esp32 --port COMx --baud 115200 --before no_reset --after no_reset \
  write_flash -z 0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin
```

   `boot_app0.bin` jest w `framework-arduinoespressif32/tools/partitions/` (pakiet PlatformIO), pozostałe pliki w `.pio/build/esp32dev/`.
5. Odłączyć zasilanie i przejściówkę, zasilić płytkę normalnie. Telefonem połączyć się z `Wlacznik-setup` i ustawić Wi-Fi na `http://10.11.17.1/install`.

**Kolejne wersje przez Wi-Fi:**

```bash
curl -u <login>:<hasło z secrets.h> -F "firmware=@.pio/build/esp32dev/firmware.bin" http://<IP sterownika>/install/firmware
```

albo formularz „Firmware” na stronie `/install`, albo „Aktualizuj” w aplikacji (OTA, niżej).

## Aktualizacja przez sieć (OTA)

Układ flash to domyślna tablica Arduino-ESP32 z dwiema partycjami aplikacji (`app0`/`app1` po 1,28 MB; obraz zajmuje ok. 77 %).

1. Plik `.bin` jest w bazie serwera (`firmware_images`, `firmware_offers`; oferowana wersja i jedna poprzednia). **Serwer nie wysyła oferty sam:** tylko gdy urządzenie ma zlecenie `devices.firmwareUpdate {version, requestedAt}`, utworzone przyciskiem „Aktualizuj” w Ustawieniach (karta „Sterownik”, `POST /api/devices/:rootId/firmware-update`) i odwoływane „Anuluj aktualizację” (`DELETE`). Przy wyłączonych aktualizacjach na stronie firmware zlecenia nie są doręczane. Zlecenie znika samo, gdy sterownik zgłosi się z oferowaną wersją.
2. Oferta `{version, url, sha256, request}` (`url` = `<serwer>/api/firmware/switch/<wersja>.bin`, `request` = `requestedAt` w ms jako napis) jest w odpowiedzi na zgłoszenie (`settings.firmware`) i w każdej odpowiedzi na `POST switch/state` (`firmware`). Wersja 1.0.3 czyta ją tylko przy zgłoszeniu (potrzebny restart), od 1.1.0 także z wymiany stanu, więc aktualizacja startuje w ciągu kilku sekund.
3. Sterownik przyjmuje ofertę, gdy adres zaczyna się od `https://`, wersja jest niepusta, a `sha256` ma 64 znaki hex.
4. Pobranie startuje, gdy: zgłoszenie się udało, ostatnia wymiana stanu udała się w ciągu 30 s, **wszystkie przekaźniki są wyłączone**, nie ma niewysłanych zmian lokalnych, wersja z oferty różni się od `FW_VERSION`, a klucz `wersja#request` (`otaKey()`) od `ota_tried` i od klucza próbowanego w tym starcie (RAM). Przy włączonym przekaźniku sterownik czeka, aż się wyłączy.
5. Obraz idzie prosto do nieaktywnej partycji z SHA-256 liczonym w locie; aktywacja tylko przy zgodnej sumie. Potem zapis klucza w `ota_tried` i restart; stan przekaźników przywraca chmura. Każde „Aktualizuj” daje jedną próbę; nieudaną ponawia się kolejnym kliknięciem (nowe zlecenie). Stan próby widać na `/install` („Aktualizacja z chmury: …”).

**Wydanie nowej wersji:** podnieść `FW_VERSION` w `src/firmware.hpp`, `pio run -d devices/switch`, wgrać `.pio/build/esp32dev/firmware.bin` na stronie firmware w aplikacji (lista sterowników → trybik na kafelku włącznika, plus na belce „Aktualna wersja”, wersja taka jak `FW_VERSION` i opis) albo `curl -X PUT -H "Content-Type: application/octet-stream" --data-binary @firmware.bin "https://chpc-web.onrender.com/api/firmware/switch/<wersja>?description=<opis>"`. Potem w Ustawieniach włącznika „Aktualizuj”; sterownik pobierze obraz, gdy przekaźnik będzie wyłączony.

## Budowanie, testy, środowiska

```bash
cp devices/switch/src/secrets.example.h devices/switch/src/secrets.h   # raz, uzupełnić
pio test -d devices/switch -e native            # 12 testów
pio run  -d devices/switch                      # build esp32dev (Flash ok. 77 %, RAM ok. 15 %)
pio run  -d devices/switch -e esp32dev-local    # build do testu z npm run local
pio device monitor -d devices/switch            # konsola 115200 przez złącze P1
```

**`esp32dev-local`** podmienia `SWITCH_CLOUD_URL` na `http://192.168.55.9:4001/api/` — adres komputera z `npm run local`, do zmiany w `platformio.ini`. Zapora Windows w profilu sieci publicznej blokuje port 4001 (zmienić profil na prywatny albo dodać regułę). Obraz z tego środowiska nie łączy się z produkcją, a lokalna oferta OTA ma adres `http://`, więc sterownik ją pomija (wgrywać przez `/install`).

**Dziennik na konsoli.** Linie `[ms od startu] treść` na UART0 115200 (złącze P1): start (wersja, SN, Root ID, liczba przekaźników, adres chmury), AP, Wi-Fi, zgłoszenie z odpowiedzią i ofertą OTA, każda zmiana przekaźnika z przyczyną (chmura, strona sterownika, koniec czasu), zmiany lokalne wysłane do chmury, błędy HTTP, kroki OTA. Co 30 s linia `stan:` (Wi-Fi z RSSI, zgłoszenie, chmura, ostatni HTTP, AP, przekaźnik 1). Bufor nadawania 2 KB, więc dziennik nie opóźnia pętli.

**Testy `native`** (`test/test_logic`): włączenie na czas z chmury wyłącza się samo; odświeżenie polecenia przedłuża odliczanie bez zmiany stanu; włączenie bez limitu; zmiana lokalna wygrywa z chmurą do potwierdzenia (także numer zmiany); timer lokalny i minuty do wysłania; „Harmonogram” lokalny wyłącza tylko bez chmury; JSON zgłoszenia stanu; stosowanie odpowiedzi; JSON `PUT switch/mode`; domyślny czas z `settings`; oferta OTA; jedna próba na zlecenie (`wersja#request`). **Wi-Fi, HTTP, WebSocket i strony nie mają testów automatycznych** — bez płytki służy symulator po stronie serwera: `node scripts/simulate-switch.mjs [--relays N] [--history]` przy `npm run local`.

## Znane problemy i uwagi

- **Bezpieczeństwo:** AP po starcie domyślnie otwarty, strony po HTTP, `/` i `POST /relay` bez logowania — w zasięgu AP (pierwsza minuta po połączeniu z Wi-Fi albo po zaniku Wi-Fi) i w sieci domowej każdy może przełączyć przekaźnik.
- **Zgłoszenie tylko przy starcie** (i po 404/409), nie po zmianie adresu IP jak w `co`: adres IP w aplikacji i domyślny czas na stronie sterownika odświeżają się przy restarcie (oferta OTA od 1.1.0 przychodzi też w wymianie stanu). Płytka nie ma przycisku RST; restart = odłączenie zasilania albo wgranie firmware na `/install`.
- **Wgranie na `/install` nie czeka na wyłączenie przekaźnika** (w odróżnieniu od OTA z chmury): restart wyłącza go na kilka–kilkanaście sekund.
- **Strona sterownika nie zna nazw przekaźników** z aplikacji — pokazuje „Przekaźnik N”.
- **GPIO17** z testu pinów nie steruje przekaźnikiem tej płytki; nie wracać do niego bez pomiaru.
- **Pobieranie OTA i strony nie mają testów na płytce** poza ręcznym sprawdzeniem; certyfikat nie jest sprawdzany, a integralność obrazu daje SHA-256 z odpowiedzi chmury (ten sam kanał).
