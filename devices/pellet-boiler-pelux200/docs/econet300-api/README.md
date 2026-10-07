# Lokalne API modułu ecoNET300 (materiały z integracji Home Assistant)

Materiały do połączenia z kotłem przez **ecoNET300 (Wi-Fi)** zamiast magistrali RS-485:
płytka pieca czyta moduł ecoNET300 w sieci domowej i wysyła dane do chmury w tym samym formacie
co dziś (plan z 2026-10-08, jeszcze niezrobiony). Plum nie publikuje opisu tego API; wszystko
poniżej pochodzi od społeczności i **nie było sprawdzane na naszym module**.

- **Źródło:** [jontofront/ecoNET-300-Home-Assistant-Integration](https://github.com/jontofront/ecoNET-300-Home-Assistant-Integration),
  commit `b3998fd2725a107cbc9cf7d69f095b728bb7f412` (2026-10-07), wersja integracji 1.3.4.
  Pierwotna wersja: [pblxptr/ecoNET-300-Home-Assistant-Integration](https://github.com/pblxptr/ecoNET-300-Home-Assistant-Integration).
- **Licencja:** MIT, © 2023–2026 jontofront and contributors — tekst w
  [LICENSE-econet300-ha.txt](LICENSE-econet300-ha.txt). Pliki skopiowano bez zmian, z wyjątkiem
  zamaskowanych pól w `sysParams.json` (niżej).
- **Pobrano:** 2026-10-08.

Instrukcja producenta modułu (PDF, poza repozytorium): `../pellux200-dokumentacja/ecoNET300-DTR-PL.pdf`.

## Znaczniki

Każdy plik ma znaczniki w kolumnie „Znaczniki”:

| Znacznik | Znaczenie |
|---|---|
| `nieoficjalne` | opis z obserwacji społeczności, nie od Plum |
| `niesprawdzone-u-nas` | nie porównane z naszym ecoNET300 / regulatorem |
| `model:<regulator>` | nagranie z tego regulatora (inny egzemplarz niż nasz) |
| `nasz-regulator` | ten sam model co u nas (ecoMAX 860P2) |
| `odczyt` / `zapis` | dotyczy odczytu danych / zmiany parametrów |
| `zamaskowane` | pola zmienione przed dodaniem do repozytorium |

## Opis API (`opis-api/`, dokumentacja integracji, po angielsku)

| Plik | Co zawiera | Znaczniki |
|---|---|---|
| [API_V1_DOCUMENTATION.md](opis-api/API_V1_DOCUMENTATION.md) | adresy `/econet/<zapytanie>`, Basic Auth, lista zapytań, numery parametrów bieżących (1024+ temperatury, 1280+ zadane), tabela stanów `mode` | `nieoficjalne` `niesprawdzone-u-nas` `odczyt` `zapis` |
| [API_CONSTRUCTION_GUIDE.md](opis-api/API_CONSTRUCTION_GUIDE.md) | jak budować zapytania (`uid`, `lang`) | `nieoficjalne` `odczyt` |
| [NEW_API_ENDPOINTS_DISCOVERED.md](opis-api/NEW_API_ENDPOINTS_DISCOVERED.md) | zapytania znalezione później (lista menu, opisy, jednostki) | `nieoficjalne` `niesprawdzone-u-nas` `odczyt` |
| [BOILER_CONTROL_README.md](opis-api/BOILER_CONTROL_README.md) | włącz/wyłącz kocioł (`newParam?newParamName=BOILER_CONTROL`) | `nieoficjalne` `niesprawdzone-u-nas` `zapis` |
| [SCHEDULES.md](opis-api/SCHEDULES.md) | harmonogramy regulatora w `sysParams` (CO, CWU, mieszacze) | `nieoficjalne` `niesprawdzone-u-nas` `odczyt` |
| [ALARMS_AND_EVENTS.md](opis-api/ALARMS_AND_EVENTS.md) | alarmy i nazwy alarmów (`rmAlarms`, `rmAlarmsNames`) | `nieoficjalne` `niesprawdzone-u-nas` `odczyt` |
| [FUEL_CONSUMPTION.md](opis-api/FUEL_CONSUMPTION.md) | zużycie paliwa z `fuelStream` [kg/h] | `nieoficjalne` `odczyt` |

## Odpowiedzi modułów (`odpowiedzi/`, nagrania z testów integracji)

| Plik | Co zawiera | Znaczniki |
|---|---|---|
| [ecoMAX860P2-N/regParams.json](odpowiedzi/ecoMAX860P2-N/regParams.json) | **bieżące dane** (`curr`): temperatury, zadane, stan `mode`, pompy, mieszacze, wentylator, podajnik, paliwo, moc, `fuelStream`; wersje danych (`settingsVer`, `schedulesVer`) | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` |
| [ecoMAX860P2-N/rmCurrentDataParamsEdits.json](odpowiedzi/ecoMAX860P2-N/rmCurrentDataParamsEdits.json) | zadane do zmiany z zakresem: 1280 zadana kotła 63 (55–80), 1281 zadana CWU 45 (20–70), 2048/2049 | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` `zapis` |
| [ecoMAX860P2-N/rmCurrentDataParams.json](odpowiedzi/ecoMAX860P2-N/rmCurrentDataParams.json) | nazwy i jednostki bieżących danych po numerach | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` |
| [ecoMAX860P2-N/regParamsData.json](odpowiedzi/ecoMAX860P2-N/regParamsData.json) | bieżące dane po numerach (1024+ …) | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` |
| [ecoMAX860P2-N/sysParams.json](odpowiedzi/ecoMAX860P2-N/sysParams.json) | moduł: wersja oprogramowania, sieć, harmonogramy regulatora, pole `servicePassword` | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` `zamaskowane` |
| [ecoMAX860P2-N/currentDataMerged.json](odpowiedzi/ecoMAX860P2-N/currentDataMerged.json) | bieżące dane połączone z nazwami (przetworzone przez integrację) | `nasz-regulator` `model:ecoMAX860P2-N` `odczyt` |
| [ecoMAX810P-L/rmParamsData.json](odpowiedzi/ecoMAX810P-L/rmParamsData.json), [rmParamsNames.json](odpowiedzi/ecoMAX810P-L/rmParamsNames.json) | **lista parametrów menu** (wartość, min, max, mnożnik, przesunięcie) i ich nazwy — przykład budowy; dla 860P2 brak nagrania | `model:ecoMAX810P-L` `odczyt` `zapis` |

Zamaskowane w `ecoMAX860P2-N/sysParams.json`: `key` i `servicePassword` (`MASKED`). Adresy IP,
SSID i hasło Wi-Fi były zanonimizowane już w źródle.

## Ustalenia (2026-10-08, na sucho)

- **Dostęp:** `http://<IP ecoNET300>/econet/<zapytanie>`, Basic Auth (fabrycznie `admin`/`admin`).
  Serwer chpc-web (Render) nie widzi sieci domowej, więc łączy się płytka pieca w tej samej sieci.
- **Bieżące dane → nasz odczyt** (`regParams.curr` → pola `POST /pellet-boiler-pelux200/add`):

  | ecoNET300 | nasze pole | ecoNET300 | nasze pole |
  |---|---|---|---|
  | `tempCO` | `heating_temp` | `tempCOSet` | `heating_target` |
  | `tempCWU` | `water_heater_temp` | `tempCWUSet` | `water_heater_target` |
  | `tempExternalSensor` | `outside_temp` | `tempBack` | `return_temp` |
  | `tempFlueGas` | `exhaust_temp` | `tempOpticalSensor` | `optical_temp` |
  | `tempUpperBuffer` | `upper_buffer_temp` | `mixerTemp1`, `mixerSetTemp1` | `mixer1_temp`, `mixer1_target` |
  | `mixerPumpWorks1` | `mixer1_pump` | `statusCO`, `statusCWU` | `heating_status`, `water_heater_status` |
  | `fuelLevel` | `fuel_level` | `fanPower` | `fan_power` |
  | `boilerPower` [%] | `boiler_load` | `boilerPowerKW` | `boiler_power` |
  | `fuelStream` [kg/h] | `fuel_consumption` (licznik pelletu) | `pumpCOWorks`, `pumpCWUWorks`, `pumpCirculationWorks` | `heating_pump`, `water_heater_pump`, `circulation_pump` |
  | `fanWorks`, `feederWorks`, `lighterWorks`, `alarmOutputWorks` | `fan`, `feeder`, `lighter`, `alarm` | `mode` | `state` (przeliczenie, niżej) |

  `pumpCO`, `pumpCWU`, `fan`… bez „Works” to raczej wyjścia skonfigurowane (jak `output_flags`
  z magistrali), a z „Works” — praca. Brak w `curr`: temperatura pokojowa eSTER, ruch zaworów
  mieszaczy.
- **Stan `mode` ma inną numerację niż magistrala (PyPlumIO):** 1 = zatrzymany, 6 = czyszczenie,
  12 = stabilizacja, 13–26 stany dodatkowe; u nas 1 = stabilizacja, 6 = czuwanie. Przy wysyłce
  trzeba przeliczać (tabela w `API_V1_DOCUMENTATION.md`, „Complete Operation Mode Mapping Table”).
- **Zapis zadanej kotła i CWU:** `rmCurrNewParam?newParamKey=1280|1281&newParamValue=…`
  z zakresem z `rmCurrentDataParamsEdits` (na nagraniu 860P2 zgodny z naszą kopią ustawień: 63 °C
  i 45 °C).
- **Pozostałe parametry** (min. temperatura kotła nr 99, histerezy 17/123, Lato/Zima 125, nastawy
  trybów) są w liście menu `rmParamsData`, zapis `rmNewParam?newParamIndex=…`. **Numeracja tej
  listy jest inna niż numery parametrów ecoMAX z magistrali** (na 810P-L pozycja 98 to „Integration
  time constant”, u nas nr 98 to zadana kotła) — dopasowanie po nazwach po odczycie z naszego modułu.
- **Hasło serwisowe** jest w `sysParams.servicePassword` — w trybie ecoNET300 też tylko na `/install`
  płytki, nigdy do chmury.
- Do sprawdzenia na naszym module: wersja oprogramowania (`sysParams.ecosrvSoftVer`), `rmParamsData`
  z nazwami po polsku, zapis przez `rmCurrNewParam`, harmonogram czyszczenia w `sysParams`, alarmy.
