# Testy CHPC

Wszystkie testy działają na komputerze, bez płytki, czujników i produkcyjnej bazy danych. Są dwa rodzaje:

| Rodzaj | Katalog | Co sprawdza | Czas |
|---|---|---|---|
| Symulacja firmware (Unity) | `sim_env/`, `test_chpc_*/` | logikę sterownika: czujniki, termostat, zabezpieczenia, RS-485, EEPROM | ok. 10 s |
| Cały łańcuch (E2E) | `e2e/` | chpc ⇄ RS-485 ⇄ co ⇄ serwer chpc-web ⇄ przeglądarka | kilka minut |

Trzeci, dodatkowy rodzaj testów, czyli prawdziwy `firmware.hex` w symulatorze Wokwi, jest w osobnym katalogu [`test-wokwi/`](../test-wokwi/README.md).

## 0. Instalacja środowiska (Windows, jednorazowo)

Polecenia wpisuje się w **Git Bash** (skrypt `build-bridge.sh` wymaga powłoki `sh`). Po każdej instalacji otwórz nowy terminal, żeby odświeżył się `PATH`.

| Narzędzie | Do czego | Instalacja | Sprawdzenie |
|---|---|---|---|
| Git for Windows (z Git Bash) | powłoka `sh`, repozytoria | `winget install Git.Git` | `git --version` |
| Python 3 | wymagany przez PlatformIO | `winget install Python.Python.3.12` | `python --version` |
| PlatformIO Core | `pio test`, pobiera Unity | `pip install -U platformio` albo rozszerzenie PlatformIO IDE w VS Code | `pio --version` (testowane na 6.2) |
| g++ (MinGW-w64) | kompilacja firmware na PC i `bridge.exe` | `winget install BrechtSanders.WinLibs.POSIX.UCRT` | `g++ --version` (testowane na 16.1) |
| Node.js 20+ | tylko E2E i chpc-web | `winget install OpenJS.NodeJS.LTS` | `node --version` (testowane na 22.13) |
| Microsoft Edge | tylko E2E (Playwright używa systemowego Edge) | jest w Windows | — |

Uwagi:
- Jeśli `pio` nie jest w `PATH` (instalacja przez VS Code), jest w `~/.platformio/penv/Scripts/`.
- PlatformIO dla środowiska `native` używa `g++` z `PATH`, więc katalog `bin` MinGW musi być w `PATH`. Winget dodaje go sam.
- Do samej symulacji firmware (punkt 1) wystarczą Python, PlatformIO i g++.

**Dodatkowo dla E2E** (repozytoria obok tego repo, w `D:/DevLocal/arduino_src/`):

```sh
cd D:/DevLocal/arduino_src
git clone <adres repo co> heatpump              # jeśli jeszcze go nie ma
git clone <adres repo chpc-web> chpc-web

# co: pobranie ArduinoJson do .pio/libdeps/native (potrzebne do zbudowania bridge.exe)
cd heatpump && pio test -e native

# chpc-web: zależności serwera i klienta; MongoDB pobiera się sama przy pierwszym "npm run local"
cd ../../chpc-web && npm install

# chpc: Playwright dla testu E2E (przeglądarki nie trzeba pobierać, używany jest Edge)
cd ../chpc/test/e2e && npm install
```

Pierwsze `npm run local` w chpc-web pobiera plik binarny MongoDB (ok. 100 MB), więc potrzebny jest internet.

## 1. Symulacja firmware (Unity)

Plik [`src/CHPC_firmware.ino`](../src/CHPC_firmware.ino) jest kompilowany na PC **bez żadnych zmian**. Sprzęt zastępują atrapy z [`sim_env/`](sim_env/):

| Plik | Co udaje |
|---|---|
| `Arduino.h` | wirtualny czas (`millis`, `micros`, `delay`), piny i wejścia, przekładnik prądowy (sinus 50 Hz, moc zadawana w W), czujnik przepływu, `Serial` (RS-485), klasę `String`, `simRestart()` zamiast skoku pod adres 0 |
| `OneWire.h`, `DallasTemperature.h` | czujniki DS18B20 z prawdziwym CRC8; czujnik można odłączyć albo zmienić mu temperaturę |
| `EEPROM.h` | pamięć, która przetrwa restart |
| `LiquidCrystal_I2C.h` | treść ekranu LCD |
| `chpc_sim.h` | świat testowy (czujniki Tae, Tbe, Ttarget, Tsump, Tbc, model mocy sprężarki) i funkcje pomocnicze |

Funkcje pomocnicze z `chpc_sim.h`:
- `boot()`: pierwszy start z wykrywaniem czujników, tak jak robi to człowiek (podłączanie po kolei);
- `runMs(ms, krok)`, `waitUntil(warunek, ms)`: upływ czasu;
- `sendFrame(...)`, `query()`: ramki RS-485 wysyłane tak, jak robi to `co`; `jsonNumber(json, "klucz")` wyciąga wartość z odpowiedzi;
- `resetGlobalsLikeReboot()` + `setup()`: restart płytki z zachowaniem EEPROM.

### Zestawy testów (7 zestawów, 53 testy)

| Zestaw | Testy | Co sprawdza |
|---|---|---|
| [`test_chpc_boot`](test_chpc_boot/test_main.cpp) | 5 | wykrywanie czujników i zapis adresów w EEPROM; drugi start z adresami z EEPROM; odpowiedź RS-485 w czasie pauzy startowej (< 0,7 s); kalibracja EEV (480 → 0 → 45) rozłożona na pauzę startową, z odstępem kroków `EEV_PULSE_CALIB_MILLIS`; żaden przekaźnik nie klika po włączeniu zasilania |
| [`test_chpc_thermostat`](test_chpc_thermostat/test_main.cpp) | 10 | start sprężarki poniżej T min i brak startu powyżej; pompy; pozycja EEV w spoczynku i w pracy; minimalny czas pracy i postoju; energia (`lt_pow`) i czas (`lt_hp_on`) cyklu; opóźnione wyłączenie pomp; grzałka karteru; rotacja ekranów LCD |
| [`test_chpc_rs485`](test_chpc_rs485/test_main.cpp) | 11 | JSON zawiera wszystkie klucze używane przez `co` i chpc-web; czas odpowiedzi; wszystkie komendy (setpoint, delta, limit mocy, granice EEV, przegrzanie EEV, pompy, grzałka, CO, force); dwie sklejone ramki; ignorowanie ruchu innych urządzeń; ustawienia po restarcie |
| [`test_chpc_protection`](test_chpc_protection/test_main.cpp) | 10 | przegrzanie strony gorącej i tłoczenia; zamarzanie ssania; przeciążenie; sprężarka bez poboru mocy; niska temperatura karteru; brak przepływu przy 3200 W i powyżej; zawieszony przekaźnik; utrata i powrót czujnika |
| [`test_chpc_lock`](test_chpc_lock/test_main.cpp) | 5 | 5 błędów blokuje sterownik; zablokowany odpowiada, ale nie steruje; odblokowanie `0x10` (sprężarka rusza dopiero po domknięciu EEV); restart `0x11` |
| [`test_chpc_frost_buttons`](test_chpc_frost_buttons/test_main.cpp) | 7 | ochrona przed zamarzaniem (także z odłączonym czujnikiem); przejście menu z ekranu CO dalej; tekst menu nie jest nadpisywany przez ekran główny; ustawianie EEV min z menu; przytrzymany przycisk nie blokuje pętli |
| [`test_chpc_sensors`](test_chpc_sensors/test_main.cpp) | 5 | wszystkie 12 czujników: wykrywanie; po włączeniu zasilania (DS18B20 zwraca 85 °C) prawdziwe odczyty od razu po `setup()` i w pierwszym JSON, bez kliknięcia przekaźnika; restart pojedynczego czujnika i wszystkich naraz przy pracującej sprężarce nie zatrzymuje jej ani nie zgłasza błędu |

### Jak uruchomić

Wymagane: Python, PlatformIO i g++ (patrz [punkt 0](#0-instalacja-środowiska-windows-jednorazowo)). Środowisko `native` jest w [`platformio.ini`](../platformio.ini). Polecenia wykonuje się w katalogu głównym repozytorium chpc. Pierwsze uruchomienie pobiera framework Unity, więc trwa dłużej.

```sh
cd D:/DevLocal/arduino_src/chpc
pio test -e native                         # wszystkie zestawy
pio test -e native -f test_chpc_rs485      # jeden zestaw
pio test -e native -v                      # z wypisaniem każdego testu
```

Wynik powinien kończyć się linią `44 test cases: 44 succeeded`. Błąd kompilacji typu `g++: command not found` oznacza, że MinGW nie jest w `PATH`.

### Jak dopisać test

- Każdy katalog `test_chpc_*` to osobny proces. Testy w jednym katalogu tworzą **jeden scenariusz w kolejności**, bo zmienne globalne firmware nie są zerowane między testami.
- Restart płytki to `resetGlobalsLikeReboot()` + `setup()`; `millis()` liczy wtedy od zera.
- Długie oczekiwanie: `runMs(ms, 1000..2000)`. Tuż po zatrzymaniu sprężarki próbkuj gęsto (`runMs(3000)`), bo okno pomiaru mocy RMS pamięta jeszcze starą moc.
- Funkcja firmware wołana przed swoją definicją potrzebuje prototypu w `chpc_sim.h` (Arduino IDE dopisuje je samo, ta kompilacja nie).

## 2. Cały łańcuch (E2E)

[`e2e/`](e2e/) łączy trzy projekty:
- `bridge.exe` (budowany przez `build-bridge.sh`): symulowany firmware chpc + oryginalny kod `co` (`operation_parser`, `operation_controller`, `modbus_frame`, `cop_estimator`);
- `run-e2e.mjs`: udaje `co` wobec lokalnego serwera chpc-web (HTTP) i klika po interfejsie przez Playwright w systemowym Edge.

Scenariusz: rejestracja sterownika w interfejsie, harmonogram, pełny cykl grzania z COP, zmiana ustawień z panelu, przeciążenie (dzwonek, wiersz na liście), blokada x5 i „Odblokuj”, restart z panelu, zamarzanie, utrata czujnika, kilka godzin pracy oraz układ widoków przy 360, 768 i 1280 px.

### Jak uruchomić

Wymagane: środowisko z [punktu 0](#0-instalacja-środowiska-windows-jednorazowo), razem z częścią „Dodatkowo dla E2E”. Jeśli `co` leży gdzie indziej niż `../heatpump` względem tego repo, podaj ścieżkę w zmiennej `CO_DIR`.

```sh
# Terminal 1: w chpc-web lokalna baza Mongo (.local-db, port 27027), serwer 4001 i klient 5173.
# Zostaw uruchomione; Ctrl+C zatrzymuje wszystko.
cd D:/DevLocal/arduino_src/chpc-web
npm run local

# Terminal 2 (Git Bash): budowanie mostu i test
cd D:/DevLocal/arduino_src/chpc/test/e2e
sh build-bridge.sh     # buduje bridge.exe; powtórz po każdej zmianie firmware albo kodu co
                       # (co w innym miejscu: CO_DIR=/sciezka/do/co sh build-bridge.sh)
node run-e2e.mjs       # uruchamia scenariusz
```

Test startuje, gdy http://localhost:4001 i http://localhost:5173 odpowiadają. Każdy krok wypisuje w konsoli `OK` albo `BŁĄD`.

Każde uruchomienie rejestruje w lokalnej bazie nowy sterownik `hp-test-<data>`. Produkcyjna baza nie jest używana. Wyniki trafiają do `docs/raport-testow/`: `e2e-wyniki.json`, `e2e-log.txt` i zrzuty ekranu w `zrzuty/`. Katalog tworzy się przy uruchomieniu testu i jest w `.gitignore`, więc istnieje tylko lokalnie.
