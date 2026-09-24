# Testy w symulatorze Wokwi

Ten katalog zawiera projekt [Wokwi](https://wokwi.com/) i scenariusze testowe. Wokwi uruchamia **prawdziwy plik `firmware.hex`** zbudowany dla Pro Mini, na emulowanym procesorze AVR, z tymi samymi połączeniami co płytka.

Różnica wobec testów z [`test/`](../test/README.md):

| | `test/` (Unity na PC) | `test-wokwi/` (Wokwi) |
|---|---|---|
| Co działa | kod firmware skompilowany na PC, sprzęt to atrapy | skompilowany `firmware.hex` na emulowanym AVR |
| Sprawdza dodatkowo | — | kompilację na AVR, prawdziwe biblioteki OneWire/Dallas/LCD, czasy UART i RS-485 |
| Czas | ok. 10 s wszystkie testy | 2–5 min na scenariusz |
| Koszt | brak | limity konta Wokwi (patrz niżej) |

Dlatego Wokwi jest ścieżką **dodatkową**. Podstawą są testy z `test/`.

## Pliki

| Plik | Opis |
|---|---|
| `wokwi.toml` | wskazuje firmware z builda PlatformIO: `../.pio/build/wokwi/firmware.hex` i `.elf` (env `wokwi`: jak `promini`, ale z `RS485_HUMAN`, bo scenariusze czekają na komunikaty tekstowe na UART) |
| `diagram.json` | schemat połączeń (opis niżej) |
| `scenario.yaml` | scenariusz główny |
| `scenario-eev-min.yaml` | granice EEV |
| `scenario-frost.yaml` | ochrona przed zamarzaniem |
| `scenario-sensor-lost.yaml` | utrata czujnika |
| `latency.sh` | pomiar czasu odpowiedzi RS-485 z nagrania analizatora stanów logicznych |

## Schemat (`diagram.json`)

- **Arduino Nano** zamiast Pro Mini (ten sam ATmega328P, 16 MHz).
- **LCD 1602 I2C** (adres 0x27).
- **4 czujniki DS18B20** na magistrali OneWire z rezystorem 4,7 kΩ: `sTae` (5 °C), `sTbe` (2 °C), `sTtarget` (30 °C), `sTbc` (50 °C). Każdy jest podłączony przez przycisk (`cTae`, `cTbe`, `cTtarget`, `cTbc`). Wciśnięty przycisk oznacza czujnik wpięty do magistrali, dzięki czemu scenariusz może udawać człowieka, który podłącza czujniki po kolei przy pierwszym starcie, albo odłączyć czujnik w trakcie pracy.
- **Przyciski sterownika** `<`, `>` i `menu` (`btnLeft`, `btnRight`, `btn3`) z rezystorami 10 kΩ oraz przycisk **reset** (`btnReset`).
- **Potencjometr na A6** w połowie zakresu zamiast przekładnika prądowego. Wokwi nie symuluje dzielników napięcia, więc potencjometr daje środek skali, czyli „zero prądu”.
- **Analizator stanów logicznych** (`la`) na RX (D0) i TX (D1), czyli na liniach RS-485.

## Scenariusze

Każdy scenariusz zaczyna się od pustej pamięci EEPROM, więc najpierw przechodzi pierwsze wykrywanie czujników. Podłącza Tae, Tbe, Ttarget i Tbc, a pozostałe czujniki pomija przyciskiem `>`. To zajmuje ok. 60 s czasu symulacji. Ramki RS-485 są wysyłane tak jak robi to `co`: co najmniej 500 ms odstępu, a po komendzie zapytanie `0x01` i oczekiwanie na fragment JSON.

| Scenariusz | Co sprawdza |
|---|---|
| `scenario.yaml` | Wykrywanie czujników i zapis w EEPROM. Odpowiedź JSON w czasie pauzy startowej. Komendy: setpoint `0x04` (25,50 °C), limit mocy `0x0E` (3800 W przyjęte, 4500 W odrzucone), EEV max `0x0D` (obniżenie minimum, wartość > 127). Restart przyciskiem reset i odczyt ustawień z EEPROM. Dwie ramki sklejone w jednym odczycie UART. |
| `scenario-eev-min.yaml` | Wartości domyślne EEV (max 67, min 49). Ustawienie EEV min z menu (9 × `menu`, 4 × `<` → 45). Komendy `0x0F` i `0x0D`, które przesuwają drugą granicę. Wartości spoza zakresu są ignorowane. Obie granice przetrwają restart. |
| `scenario-frost.yaml` | Po pauzie startowej pompa obiegu gorącego (`HCS`) jest wyłączona. Tbe −1 °C włącza ją, Tbe 1 °C (histereza) nie wyłącza, a Tbe 3 °C wyłącza. |
| `scenario-sensor-lost.yaml` | Odłączenie Tbe w trakcie pracy przy zapytaniach co 500 ms. Sterownik dalej odpowiada, zgłasza błąd czujnika i `Tbe = -127`. Po ponownym podłączeniu odczyt wraca do 2,0 °C. |

Ustawiony setpoint jest zawsze niższy niż `Ttarget`, więc sprężarka nie startuje. Odczyt prądu z potencjometru nie jest realistyczny i po starcie sprężarki wywołałby błędy zabezpieczeń.

## Instalacja środowiska (jednorazowo)

1. **PlatformIO**, żeby zbudować `firmware.hex`. Instalację opisuje [test/README.md, punkt 0](../test/README.md#0-instalacja-środowiska-windows-jednorazowo). Do Wokwi wystarczą Python i PlatformIO, g++ nie jest potrzebny.

2. **wokwi-cli**, program uruchamiający symulację z wiersza poleceń:
   - Windows (PowerShell): `iwr https://wokwi.com/ci/install.ps1 -useb | iex`
   - Linux/macOS: `curl -L https://wokwi.com/ci/install.sh | sh`
   - albo ręcznie: pobierz `wokwi-cli-win-x64.exe` z [github.com/wokwi/wokwi-cli/releases](https://github.com/wokwi/wokwi-cli/releases), zmień nazwę na `wokwi-cli.exe` i umieść w katalogu z `PATH`, np. `~/bin`.

   Sprawdzenie: `wokwi-cli --version`.

3. **Token CI Wokwi.** Zaloguj się na wokwi.com i wygeneruj token na stronie [wokwi.com/dashboard/ci](https://wokwi.com/dashboard/ci). Zapisz go w pliku `.wokwi-token` w katalogu głównym repozytorium. Plik jest w `.gitignore`, więc **nie trafi do gita**. Nigdy nie wpisuj tokenu do plików śledzonych przez git.

4. *(opcjonalnie)* Rozszerzenie **Wokwi Simulator** do VS Code. Pozwala otworzyć `diagram.json` i klikać ręcznie przyciski czujników oraz sterownika. Wymaga darmowej licencji Wokwi, odnawianej w rozszerzeniu.

### Limity darmowego konta

- Jedno uruchomienie może trwać najwyżej **5 minut**, dlatego w poleceniach jest `--timeout 280000`.
- Obowiązuje **miesięczny limit minut CI**. W tym projekcie wyczerpał się 2026-09-23 i odnawia się na początku miesiąca. Po wyczerpaniu wokwi-cli kończy się błędem autoryzacji lub limitu.

## Jak uruchomić

Polecenia wykonuje się w Git Bash, w katalogu głównym repozytorium. Po każdej zmianie firmware trzeba najpierw zbudować nowy `firmware.hex`.

```sh
cd D:/DevLocal/arduino_src/chpc
pio run -e wokwi                                             # buduje .pio/build/wokwi/firmware.hex (tryb RS485_HUMAN)
export WOKWI_CLI_TOKEN=$(grep -m1 -o 'wok_[A-Za-z0-9]*' .wokwi-token)

wokwi-cli test-wokwi --scenario scenario.yaml --timeout 280000
wokwi-cli test-wokwi --scenario scenario-eev-min.yaml --timeout 280000
wokwi-cli test-wokwi --scenario scenario-frost.yaml --timeout 280000
wokwi-cli test-wokwi --scenario scenario-sensor-lost.yaml --timeout 280000
```

Ścieżka scenariusza jest względna wobec katalogu projektu (`test-wokwi`). Poprawny wynik kończy się komunikatem, że scenariusz się powiódł, a kod wyjścia to 0. Jeśli któryś krok `wait-serial` nie doczeka się tekstu przed `--timeout`, test kończy się błędem, a w logu widać ostatni oczekiwany tekst.

### Pomiar czasu odpowiedzi RS-485

```sh
wokwi-cli test-wokwi --scenario scenario.yaml --timeout 280000 --vcd-file out.vcd
sh test-wokwi/latency.sh out.vcd
```

`latency.sh` wypisuje dla każdego zapytania czas symulacji od końca ramki do początku odpowiedzi, np. `1.2ms 0.9ms brak …`. „brak” oznacza, że sterownik nie odpowiedział. Czas zegarowy nie nadaje się do tego pomiaru, bo Wokwi nie działa w stałym tempie.

## Jak dopisać scenariusz

- Najprościej skopiować `scenario-frost.yaml` i zostawić część z wykrywaniem czujników.
- Temperaturę czujnika zmienia się krokiem `set-control: { part-id: sTbe, control: temperature, value: -1 }`. Działa, choć dokumentacja Wokwi tego nie opisuje.
- Czujnik odłącza się przez puszczenie jego przycisku: `set-control: { part-id: cTbe, control: pressed, value: 0 }`.
- `wait-serial` widzi tylko to, co idzie na port szeregowy. Komunikaty wypisywane przez `Print_D` trafiają tylko na LCD, więc scenariusz nie może na nie czekać.
- Między ramkami RS-485 zachowuj co najmniej 500 ms odstępu (`delay: 600ms`), tak jak `co`.
