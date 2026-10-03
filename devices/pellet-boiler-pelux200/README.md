# Piec Pellux 200 — sterownik `pellet-boiler-pelux200`

Sterownik na płytce ESP32-C3 SuperMini z modułem RS-485 HW-519, który podsłuchuje magistralę regulatora ecoMAX kotła pelletowego Pellux 200 Touch, dekoduje ramki `SensorData` i co kilka minut wysyła ostatni odczyt do chpc-web. Kotłem nie steruje i niczego na jego magistralę nie nadaje (etap 1). Firmware 1.0.1.

Do 2026-10-02 tę rolę pełnił sterownik `co` (drugi UART, piny GPIO16 i GPIO4); od 2026-10-03 działa na tej osobnej płytce, a kontrakt z chmurą się nie zmienił.

Dokumentacja: **[podłączenie, protokół i dane](docs/piec-pellux200.md)** · [dokumentacja producenta kotła](docs/pellux200-dokumentacja/README.md) · strona chmury i aplikacji: [moduł pellet-boiler-pelux200](../../docs/moduly/pellet-boiler-pelux200/1-opis-biznesowy.md) · kontrakt: [CLAUDE.md, punkt 5c](../../CLAUDE.md).

## Płytka i podłączenie

```text
 kocioł Pellux 200, moduł A, gniazdo G2          sterownik pieca
 ┌──────────────────────────┐            ┌──────────────┐        ┌──────────────────────┐
 │ D+ ──────────────────────┼────────────┤ A            │        │ ESP32-C3 SuperMini   │
 │ D− ──────────────────────┼────────────┤ B    HW-519  │        │                      │
 │ 5V   (nie podłączać)     │            │         TXD ─┼───────►│ GPIO21 (UART1 RX)    │
 │ GND  (na początek nie)   │            │         RXD ─┼── ✕    │ (TX nieprzypisany)   │
 │ panel kotła zostaje      │            │         VCC ─┼────────┤ 3V3                  │
 │ podłączony równolegle    │            │         GND ─┼────────┤ GND                  │
 └──────────────────────────┘            └──────────────┘        │ USB-C 5 V: zasilanie │
                                                                 │ i konsola            │
                                                                 └──────────────────────┘
```

| HW-519 | ESP32-C3 SuperMini | Uwagi |
|---|---|---|
| TXD | GPIO21 | **wyjście** modułu: dane odebrane z magistrali (opisy HW-519 są od strony modułu, przy odbiorze miga dioda TXD); jedyny przewód sygnałowy (sprawdzone 2026-10-03) |
| RXD | — (GPIO20, nieużywany) | wejście nadawcze modułu; UART nie ma przypisanego pinu TX, sterownik nie nadaje |
| VCC | 3V3 | sprawdzone 2026-10-03 (odbiór bez błędów); przy 5V wyjście TXD dawałoby 5 V na GPIO21, czego ESP32-C3 nie toleruje |
| GND | GND | |
| A / B | D+ / D− w gnieździe G2 modułu A kotła | równolegle do przewodów panelu; kolejność dobiera sterownik (niżej) |

- Przy pierwszych próbach do GPIO21 trafił pin RXD modułu (wejście) i odbiór nie działał — bez względu na napięcie; dane są na pinie **TXD**.
- HW-519 sam przełącza kierunek transmisji, więc nie ma pinu DE/RE.
- Płytkę C3 zasila się przez USB-C (5 V). Tym samym złączem idzie konsola (USB CDC, 115200) i pierwsze wgranie.
- Punkt wpięcia w kotle (zaciski G2, ostrzeżenia: tylko D+ i D−, bez 5 V, masa kotła, wyłączone zasilanie kotła): [docs/piec-pellux200.md, punkt 3](docs/piec-pellux200.md#3-podłączenie).
- Magistrala: 115200 baud 8N1 (`ECOMAX_RX_PIN = 21`, `ECOMAX_BAUD` w `src/firmware.hpp`).

## Automatyczna polaryzacja

Zamienione przewody A/B dają odwrócony sygnał na wyjściu danych modułu (TXD): bajty płyną, ale żadna ramka nie przechodzi kontroli. Sterownik wybiera polaryzację sam (`src/bus_polarity.*`), odwracając sygnał wejścia UART:

- gdy przez 8 s (`SWITCH_AFTER_MS`) od ostatniej zmiany przyszło co najmniej 64 bajty (`MIN_BYTES`) i ani jedna poprawna ramka, odwraca sygnał;
- przy ciszy (mniej niż 64 bajty: kocioł wyłączony, odłączony przewód) polaryzacja się nie zmienia;
- pierwsza poprawna ramka (dowolnego typu) zatwierdza polaryzację i zapisuje ją w NVS (klucz `bus_inv`), więc po restarcie sterownik zaczyna od właściwej;
- zatwierdzona polaryzacja zmienia się dopiero po 5 min (`CONFIRMED_SWITCH_AFTER_MS`) bajtów bez poprawnej ramki (np. po przełożeniu przewodów), więc krótkie zakłócenia jej nie przełączają.

## Wi-Fi i punkt dostępowy

- Punkt dostępowy `Piec-setup` pod adresem `10.11.18.1` (hydrofor ma `10.11.16.1`, włącznik `10.11.17.1`), domyślnie otwarty (`AP_PASSWORD` krótsze niż 8 znaków = bez hasła). Działa po starcie razem z Wi-Fi (AP+STA), wyłącza się po 1 min połączenia z siecią domową i wraca po 1 min bez Wi-Fi.
- Wi-Fi ustawia się na stronie `/install`; zapis trafia do NVS i ma pierwszeństwo przed `WIFI_SSID`/`WIFI_PASSWORD` z `secrets.h`.
- NVS: przestrzeń `pel` (`wifi_ssid`, `wifi_pass`, `root_id`, `poll_s`, `bus_inv`).
- **Samoczynny restart** (od 1.0.1; 2026-10-03 płytka raz zawisła bez restartu przy słabym Wi-Fi): watchdog zadania pętli restartuje układ, gdy pętla stoi dłużej niż 30 s (`WATCHDOG_S`; najdłuższe zapytanie HTTP trwa 8 s), a po 10 min bez sieci domowej (`WIFI_RESTART_AFTER_MS`) sterownik restartuje się sam — tylko z zapisaną siecią i gdy nikt nie jest połączony z AP.

## Strony sterownika

| Adres | Dostęp | Zawartość |
|---|---|---|
| `/` (i każdy nieznany adres) | otwarty | odczyt kotła (stan, temperatury, paliwo, moc, wyjścia, wiek odczytu); diagnostyka magistrali: bajty, ramki (w tym `SensorData`), odrzucone, polaryzacja (normalna / odwrócona, „dobierany” przed zatwierdzeniem); Wi-Fi i chmura (sieć, IP, RSSI, zgłoszenie, ostatnia wysyłka i jej kod HTTP, interwał). Odświeżane co 2 s z `/state.json` |
| `/state.json` | otwarty | to samo jako JSON |
| `/install` | Basic Auth (`INSTALL_USER`/`INSTALL_PASSWORD` z `secrets.h`) | Wi-Fi (SSID, hasło: puste = bez zmian), wersja firmware i wgranie pliku `firmware.bin`, SN, Root ID, stan zgłoszenia |
| `POST /install/firmware` | Basic Auth | wgranie `firmware.bin` (formularz albo `curl`, niżej); po poprawnym pliku restart do nowej wersji |

## Chmura

Kontrakt jak w CLAUDE.md, punkt 5c (serwer i klient pieca bez zmian):

- **Zgłoszenie** przy każdym starcie (po połączeniu z Wi-Fi): `POST devices/register` z `{deviceId: SN, deviceType: "pellet-boiler-pelux200", name: "Piec Pellux 200", version: "1.0.1", ip}`. SN to fabryczny MAC z eFuse (12 znaków hex). Odpowiedź niesie `rootId` (zapis w NVS) i `settings.poll_interval_seconds`. Nieudane zgłoszenie jest ponawiane co 30 s; do skutku sterownik niczego nie wysyła.
- **Wysyłka** `POST pellet-boiler-pelux200/add?deviceId=<SN>&rootId=<id>` co `poll_interval_seconds` (domyślnie 300 s, 30–3600, ustawiane w aplikacji, zapis w NVS `poll_s`), tylko gdy ostatni odczyt `SensorData` jest młodszy niż 60 s. Treść: pola odczytane z ramki (bez `time`, czas bierze serwer). Odpowiedź `{"poll_interval_seconds": N}` aktualizuje interwał.
- Nieudana wysyłka jest ponawiana po 60 s; 404 albo 409 kasuje Root ID i uruchamia zgłoszenie od nowa.
- Adres chmury: `https://chpc-web.onrender.com/api/` (`CLOUD_URL` w `firmware.hpp`, do podmiany flagą `-D PELLET_CLOUD_URL=...`). Certyfikat nie jest sprawdzany, jak w pozostałych sterownikach.
- **Brak OTA z chmury** dla tego rodzaju. Nowa wersja: strona `/install` albo

  ```sh
  curl -u admin:<hasło> -F "firmware=@.pio/build/esp32c3/firmware.bin" http://<IP>/install/firmware
  ```

## Budowanie, testy, wgrywanie

```sh
cp src/secrets.example.h src/secrets.h   # nazwa i hasło AP, login /install, domyślne Wi-Fi
pio run                                  # build (esp32c3)
pio test -e native                       # testy logiki na PC (14: 10 ecoMAX + 4 polaryzacji)
pio device monitor                       # konsola (USB CDC, 115200)
```

**Pierwsze wgranie** przez USB płytki. Na tym laptopie wgrywanie ze stubem esptool urywa się, dlatego `--no-stub` (wolniej, ale działa); pliki z `.pio/build/esp32c3/`, a `boot_app0.bin` z `~/.platformio/packages/framework-arduinoespressif32/tools/partitions/`:

```sh
esptool.py --chip esp32c3 --port COMx --baud 115200 --no-stub --before default_reset --after hard_reset \
  write_flash 0x0 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin
```

(`esptool.py` jest w `~/.platformio/packages/tool-esptoolpy/`.) Kolejne wersje: `/install` albo `curl` (wyżej).

## Testy

| Zestaw | Co sprawdza |
|---|---|
| [test_ecomax_frame](test/test_ecomax_frame/test_main.cpp) (10, przeniesione z `co`) | parser ramek ecoMAX (BCC, za duża ramka, ramka urwana, resynchronizacja, dwie ramki pod rząd), dekoder `SensorData` (poziom paliwa > 100, krótki ładunek, inny nadawca lub typ) i JSON z samymi odczytanymi polami |
| [test_logic](test/test_logic/test_main.cpp) (4) | polaryzacja: odwrócenie po bajtach bez ramek, brak zmiany przy ciszy, zatwierdzenie ramką i dłuższe trzymanie, ramki odnawiające okno |

### Test na biurku

Komputer z przejściówką USB-RS485 udaje kocioł: co 1 s wysyła ramkę `SensorData` (typ `0x35`) od nadawcy `0x45`, a sterownik ją podsłuchuje (skrypt nie jest w repozytorium). Wynik 2026-10-03: po 16 s sterownik sam odwrócił polaryzację (przewody A/B były zamienione), potem odebrał 13 z 13 wysłanych ramek `SensorData`.

## Pliki

| Plik | Zawartość |
|---|---|
| `src/pellet.cpp` | nasłuch magistrali (UART1, GPIO21), Wi-Fi i punkt dostępowy, zgłoszenie i wysyłka do chmury, strony `/`, `/state.json`, `/install`, `/install/firmware` |
| `src/firmware.hpp` | typ, wersja (`FW_VERSION`), nazwa, pin i prędkość magistrali, wiek odczytu, domyślny interwał, adres chmury |
| `src/bus_polarity.*` | automatyczny wybór polaryzacji (bez zależności od Arduino) |
| `src/ecomax_frame.*` | parser ramek ecoMAX i dekoder `SensorData` (skopiowane z `co`) |
| `src/pellet_telemetry.*` | JSON wysyłki `pellet-boiler-pelux200/add` (skopiowane z `co`) |
| `src/secrets.example.h` | wzór `secrets.h` (poza gitem) |

## Znane ograniczenia

- Format ramek i `SensorData` pochodzi z biblioteki PyPlumIO i **nie był sprawdzony na prawdziwym kotle** (lista do sprawdzenia: [docs/piec-pellux200.md, punkt 7](docs/piec-pellux200.md#7-do-sprawdzenia-nasłuchem-na-kotle)).
- Nadawanie z C3 przez HW-519 nie działało w teście na biurku; dla etapu 1 (sam odbiór) jest niepotrzebne, ale przed etapem 2 (odpowiedź na `CheckDevice`) trzeba to wyjaśnić.
- Brak OTA z chmury: aktualizacja tylko przez `/install` albo `curl`.
- Wysyłka HTTP blokuje pętlę na kilka sekund; bufor UART (4 KB) gubi wtedy nadmiar bajtów, parser się resynchronizuje, a do chmury idzie ostatni poprawny odczyt.
