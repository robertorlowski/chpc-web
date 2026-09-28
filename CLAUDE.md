# CLAUDE.md

Ten plik jest przewodnikiem dla Claude Code (claude.ai/code) i dla ludzi pracujących z tym repozytorium. **chpc-web jest wiodącym projektem całego systemu.** Repozytorium zawiera cały łańcuch sterowania pompą ciepła: serwer, klienta i oba firmware w `devices/`. Zmiana kontraktu (pola telemetrii, klucze operacji, komendy RS-485) zaczyna się od tego opisu i obejmuje wszystkie części, których dotyczy, najlepiej w jednym commicie.

Commity, komentarze i dokumentacja są po polsku.

## 0. System i repozytoria

```text
CHPC (Pro Mini) ⇄ RS-485 ⇄ co (ESP32) ⇄ HTTPS / WebSocket ⇄ chpc-web (serwer) ⇄ przeglądarka (klient)
                             │                                   │
DTU Hoymiles (PV) ───────────┘                                   └── MongoDB
```

Repozytorium [robertorlowski/chpc-web](https://github.com/robertorlowski/chpc-web), lokalnie `D:\DevLocal\arduino_src\chpc-web`:

| Katalog | Rola |
|---|---|
| `server/`, `client/` | serwer Express + klient React; harmonogramy, historia, ustawienia; produkcja: `https://chpc-web.onrender.com` (Render) |
| `devices/co/` | firmware `co` (ESP32, PlatformIO): odpytuje pompę i PV po RS-485, wysyła telemetrię, wykonuje operacje z chmury; licencja MIT |
| `devices/chpc/` | firmware pompy CHPC (Arduino Pro Mini, fork gonzho000/chpc); licencja GPLv3 (`devices/chpc/docs/LICENSE`) |
| `devices/water-pressure-tank/` | firmware hydroforu „Hydrofor” (ESP32-C3 SuperMini, typ `water-pressure`), punkt 5b; pełny opis w `devices/water-pressure-tank/docs/water-pressure-tank.md` |
| `test/e2e/` | test całego łańcucha (punkt 11) |
| `scripts/` | środowisko lokalne (`npm run local`) |

Oba firmware przeniesiono 2026-09-27 z historią z osobnych repozytoriów [heatpomp](https://github.com/robertorlowski/heatpomp) (`main`) i [chpc](https://github.com/robertorlowski/chpc) (`master`); tamte repozytoria nie są już rozwijane. Dawne kopie robocze `D:\DevLocal\arduino_src\heatpump` i `…\chpc` są nieaktualne. Firmware otwiera się w VS Code przez `chpc.code-workspace` (PlatformIO wymaga `platformio.ini` w katalogu głównym folderu), a z terminala: `pio run -d devices/co`, `pio test -d devices/chpc -e native`. Lokalny `devices/co/src/secrets.h` jest poza gitem (wzór: `secrets.example.h`).

**Gałęzie:** praca na `develop`, gałąź główna `main`. Scalanie do `main` i jego push tylko na wyraźne polecenie.

Każdy firmware ma własny `README.md`, a CHPC także `devices/chpc/CLAUDE.md` ze szczegółami. Ten plik zawiera to, co jest potrzebne do pracy nad całym łańcuchem.

**Kolejność wdrożenia.** Wspólny commit nie wdraża wszystkiego naraz. Najpierw wdraża się serwer (`main`, build na Render uruchamiany ręcznie, nie automatycznie po pushu), potem firmware `co` (wgranie do ESP32), a na końcu CHPC. Serwer musi znać nowe pole lub endpoint, zanim wyśle je sterownik.

## 1. Podział systemu (chpc-web)

Repozytorium składa się z dwóch aplikacji (npm workspaces):

- `server/` — Node.js, Express, TypeScript, Mongoose, MongoDB, WebSocket i scheduler;
- `client/` — React, TypeScript, Vite, React Router i REST API.

**Serwer jest podzielony według rodzaju sterownika** (`server/src`):

- `core/` — część wspólna: urządzenia (lista, zgłoszenie, nazwa, domyślny, `properties`), temperatura zewnętrzna, kalendarz, kontekst urządzenia, WebSocket;
- `modules/heat-pump/` — pompa ciepła (sterownik `co`): telemetria `hp`, PV, operacje, scheduler, harmonogramy, starsze `settings`;
- `modules/water-pressure-tank/` — hydrofor: uruchomienia, wodomierz, czas kompresora.

`core` i każdy moduł mają ten sam układ: `controllers/` (`*.controller.ts`), `services/` (`*.service.ts`), `models/` (jeden `*.model.ts` na kolekcję albo osadzony schemat, np. `device.model.ts`, `hp.model.ts`, `pv.model.ts`, `schedule.model.ts`, `water-pressure-run.model.ts`), a w katalogu głównym `types.ts` (typy wspólne dla warstw) i `routes.ts`. Moduł ma też `device-type.ts` (wpis do rejestru rodzajów). W `core` są dodatkowo `middleware/` (`auth.ts`, `device-context.ts` — `rootId`/`deviceId`) oraz `app.ts`, `websocket.ts`, `time.ts` (strefa i granice dni w Warszawie) i `device-types.ts` (rejestr). Serwisy `core`: `device`, `device-info` (typ i `deviceId` w pamięci), `calendar`, `meteo`.

Moduły importują tylko z `core`, a nie z siebie nawzajem. `core` sięga do modułów tylko tam, gdzie je składa: trasy (`core/routes.ts`), dokument `devices` (`core/models/device.model.ts` i `core/types.ts`) i **rejestr rodzajów sterowników** (`core/device-types.ts`). W rejestrze każdy moduł podaje swój `device-type.ts`: ustawienia nowego urządzenia (`initialProperties`) i ustawienia odsyłane przy zgłoszeniu (`controllerSettings`; hydrofor tak, pompa nie). Nowy rodzaj sterownika to moduł w `modules/`, wpis w rejestrze, trasy w `core/routes.ts` i wartość w `DeviceType`. Adresy API i kolekcje nie zależą od tego podziału.

Główne elementy przepływu:

```text
Sterownik co
        │ POST /api/hp/add                 │ POST /api/pv/add (co 60 s)
        ▼                                  ▼
Serwer zapisuje telemetrię HP            Serwer zapisuje odczyt PV
i zwraca oczekiwaną operację             (kolekcja pv)
        │
        ├── MongoDB: dane pomiarowe
        ├── scheduler: wyliczona operacja
        └── WebSocket: komunikat „update” do klienta

Klient React ── REST API ──► serwer (moc PV wpisywana do rekordów HP przy zapisie)
```

Scheduler działa niezależnie od klienta. Klient tylko wyświetla dane i zapisuje ustawienia.

## 2. Uruchamianie serwera

Punkt startowy: [`server/src/server.ts`](server/src/server.ts).

Podczas uruchamiania serwer:

1. ładuje zmienne środowiskowe;
2. łączy się z MongoDB przez `MONGODB_URI`;
3. uruchamia `startScheduler()`;
4. usuwa szczegóły paneli z odczytów PV starszych niż 90 dni i powtarza to co 24 h (`removeExpiredPanelDetails`);
5. przygotowuje dane meteorologiczne;
6. uruchamia cykliczne odświeżanie meteo co 10 minut;
7. zaczyna nasłuch na porcie `PORT`.

Wartości konfiguracyjne:

- `MONGODB_URI` — połączenie z MongoDB; wymagane, bez niego serwer kończy start błędem;
- `PORT` — port HTTP;
- `API_KEY` — klucz używany przez middleware autoryzacji; bez niego chronione ścieżki dostają 403.

Wartości są tylko w zmiennych środowiskowych: na Render w Environment usługi, lokalnie w `server/.env` (poza gitem, wzór w [`server/.env.example`](server/.env.example)). W kodzie nie ma wartości domyślnych. Do 2026-09-27 adres z hasłem użytkownika `hp` był wpisany w `server.ts` i jest w historii publicznego repozytorium; ten użytkownik został usunięty w Atlasie (2026-09-27), produkcja łączy się jako `driver`.

Middleware `verifyApiKey` jest obecnie zaimportowany, ale `app.use(verifyApiKey)` w [`server/src/core/app.ts`](server/src/core/app.ts) jest zakomentowane. Oznacza to, że w aktualnym stanie aplikacji kontrola klucza API nie jest globalnie aktywna.

**Środowisko lokalne bez bazy produkcyjnej:** `npm run local` ([`scripts/local-dev.mjs`](scripts/local-dev.mjs)) uruchamia trwałą bazę MongoDB w `.local-db/` (port 27027, poza gitem), serwer na porcie 4001 i klienta Vite na 5173. `npm run local -- --db` uruchamia samą bazę. Pierwsze uruchomienie pobiera binarkę MongoDB (ok. 100 MB). Lokalną bazę kasuje się, usuwając `.local-db/`.

## 3. Kontekst urządzenia

Za wybór pompy odpowiada [`server/src/core/middleware/device-context.ts`](server/src/core/middleware/device-context.ts).

Większość żądań musi zawierać:

```text
?rootId=<MongoDB device _id>&deviceId=<identyfikator sterownika>
```

Middleware:

1. odczytuje `rootId` z query string;
2. sprawdza urządzenie w kolekcji `devices`;
3. zapisuje wynik w `req.deviceRootId`;
4. przekazuje żądanie do kontrolera.

**Endpointy sterownika (`POST /hp/add`, `POST /pv/add`)** przyjmują też sam `deviceId` (SN): bez `rootId` serwer znajduje urządzenie po `deviceId`. `co` wysyła `deviceId` zawsze, a `rootId` tylko wtedy, gdy ma go w NVS. Gdy przyszły oba, a `rootId` należy do innego `deviceId`, serwer odpowiada **409**; `co` kasuje wtedy swój Root ID i rejestruje się ponownie. Nieznany `deviceId` daje 404. Pozostałe endpointy wymagają `rootId`.

Urządzenia domyślnego nie ma: żądanie bez `rootId` (poza wyjątkiem powyżej) dostaje 400, a WebSocket bez `rootId` jest zamykany (dawniej takie żądanie trafiało do `hp-1`, które tworzyło się samo, jeśli go nie było). Ścieżki `/devices` i `/devices/register` są publiczne względem kontekstu urządzenia.

Po stronie klienta wybrane urządzenie jest przechowywane w `localStorage` pod kluczem `chpc.selectedDevice`. [`DeviceProvider`](client/src/core/context/DeviceContext.tsx) udostępnia wybór, zmianę i czyszczenie urządzenia. `DeviceGuard` przekierowuje użytkownika do `/devices`, jeśli nie wybrano pompy. Stopka „Aktywne urządzenie” z przyciskiem zmiany jest widoczna tylko wtedy, gdy `GET /api/devices` zwraca co najmniej dwa sterowniki (sprawdzane przy każdym wyborze urządzenia); przy jednym nie ma na co przełączyć. Dawny klucz `chpc.hideDeviceFooter` nie jest już używany.

### Rejestracja sterownika

`POST /api/devices/register` z `{deviceId, deviceType?, name?}` zwraca urządzenie o danym `deviceId`: **201**, gdy zostało utworzone, i **200** z istniejącym `rootId`, gdy już było. Nieznany `deviceType` daje 400. To jest **zgłoszenie sterownika**: hydrofor wywołuje je raz na każdy start, a `co` tylko wtedy, gdy nie ma Root ID, z `deviceId` = SN (fabryczny MAC ESP32, 12 znaków hex). Nazwa ze zgłoszenia trafia tylko do nowego urządzenia. Odpowiedź ma pola urządzenia (`rootId`, `deviceType`, `deviceId`, `name`, `isDefault`), a dla hydroforu także `settings` (czas kompresora, progi, zbiorniki). Sterownik zapisuje `rootId` w NVS. Nieudane zgłoszenie `co` ponawia co 60 s, hydrofor co 10 s. Telemetrię wysyła także przed rejestracją, z samym `deviceId`; serwer przyjmuje ją, gdy urządzenie o tym SN już istnieje.

**Sterowniki dodaje się tylko przez samodzielną rejestrację.** Klient nie ma funkcji dodawania sterownika. Nowy sterownik pojawia się na liście w `/devices` bez nazwy, a użytkownik nadaje ją przez `PUT /api/devices/:rootId` z `{name}` (zmienia tylko nazwę; `rootId` i `deviceId` nie podlegają edycji; pusta nazwa jest dozwolona).

`POST /api/devices` pozostał na serwerze (m.in. dla testu E2E), ale klient go nie używa. Dla istniejącego `deviceId` zwraca błąd 400 („Device already exists.”).

## 4. Model danych MongoDB

### `devices`

Model główny to `DeviceModel` z kolekcją `devices`. Urządzenie zawiera między innymi:

- `deviceType` — `heat_pump` albo `water-pressure` (hydrofor); scheduler obsługuje tylko `heat_pump`;
- `deviceId` — identyfikator sterownika, SN (MAC ESP32); najstarszy sterownik miał `hp-1`, w produkcji zmienione na SN (także w rekordach `hp`, 2026-09-26);
- `name` — opcjonalna nazwa nadana przez użytkownika (domyślnie pusta; rejestracja automatyczna jej nie ustawia). Klient pokazuje `name`, a gdy jest pusta — `deviceId` (`deviceLabel` w [`DeviceContext.tsx`](client/src/core/context/DeviceContext.tsx));
- `isDefault` — sterownik domyślny, otwierany po starcie aplikacji; najwyżej jeden (`PUT /api/devices/:rootId/default`);
- `properties` — ustawienia domyślne;
- `schedules` — osadzone definicje harmonogramów.

### `properties`

Ustawienia domyślne pompy:

- `co_min`, `co_max`;
- `cwu_min`, `cwu_max`;
- `work_mode` — `M`, `A`, `CWU` albo `OFF`.

Domyślny `work_mode` modelu to `CWU` (dopisywany też hydroforowi, który go nie używa).

Ustawienia hydroforu (punkt 5b): `compressor_seconds`, `pressure_low`, `pressure_high` (progi presostatu, bar na manometrze) i `tanks[]` (`{name, kind: 'air' | 'membrane', volumeLiters, enabled, precharge, k}`). Nowy hydrofor dostaje przy zgłoszeniu wartości domyślne: 30 s, 2/4 bar, zbiornik 300 l z poduszką (`k` = 1) i przeponowy 300 l (`p0` = 1,8 bar).

### `hp`

Kolekcja `hp` przechowuje telemetrię. Dokument jest wzbogacany o:

- `rootId`;
- `deviceType`;
- `deviceId`;
- `t_out` — temperaturę zewnętrzną z serwisu meteo;
- `error_code` — kod błędu CHPC, gdy w tym odczycie pojawiło się nowe zdarzenie;
- znaczniki `createdAt` i `updatedAt`.

Telemetria zawiera między innymi `HP`, `work_mode`, temperatury, moc, stan sprężarki oraz stany pomp. Rekordy sprzed wydzielenia PV (2026-09-26) mają pełne `PV` i `pv_power` z telemetrii; nowe mają tylko `PV.total_power`, wpisane przez serwer (sekcja 5a). `co_pomp` jest polem telemetrii i może występować w operacji ręcznej, ale nie jest polem harmonogramu.

**Schemat jest ścisły** ([`server/src/modules/heat-pump/models/hp.model.ts`](server/src/modules/heat-pump/models/hp.model.ts)): klucz, którego nie wymienia, jest po cichu pomijany przy zapisie. Dotyczy to m.in. `EEV_pulse`, `cop_min`, `cop_max`, `controller_mode` i **wszystkich liczników diagnostycznych** z `co`. Ostatnia surowa telemetria jest dostępna przez `GET /api/hp` z pamięci podręcznej do restartu serwera. **Nowe pole telemetrii trzeba dodać do schematu, do typów `server/src/modules/heat-pump/types.ts` i `client/src/devices/heat-pump/types.ts` oraz do widoków klienta**, inaczej nie zostanie zapisane ani pokazane.

### `pv`

Kolekcja `pv` przechowuje odczyty DTU z `POST /api/pv/add`, jeden dokument na odczyt: `rootId`, `deviceType`, `deviceId`, `time`, podsumowanie (`total_power`, `total_prod`, `total_prod_today`, `temperature`, `pv_power`) i `panels[]`. `panels` jest usuwane z dokumentów starszych niż 90 dni (`PANEL_DETAILS_RETENTION_DAYS` w [`server/src/modules/heat-pump/services/pv.service.ts`](server/src/modules/heat-pump/services/pv.service.ts)), podsumowanie zostaje na zawsze. Indeksy: `{rootId, createdAt}` i `{createdAt}`.

### `water_pressure` i `water_meter`

`water_pressure` — uruchomienia pompy hydroforu, jeden dokument na `runId` sterownika: `pumpStart`, `pumpEnd`, `compressorStart`, `compressorEnd`, `restarts`, `waterLiters` (z ustawień w chwili utworzenia) oraz części `waterAirBaseLiters` (poduszka przy `k` = 1) i `waterMembraneLiters` (do podpowiedzi `k`), `timeApproximate`, `lastSeenAt`. Indeksy: unikalny `{rootId, runId}` i `{rootId, pumpStart}`. `water_meter` — ręczne odczyty wodomierza: `readAt`, `valueM3`, `note`; indeks `{rootId, readAt}`.

### `settings`

Kolekcja `settings` przechowuje starszy model ustawień czasowych (`night_hour`, `settings`, `cwu_settings`). Aktualny scheduler korzysta z `devices.schedules`, a nie z tej kolekcji.

## 5. Telemetria pompy

Endpoint `POST /api/hp/add` jest obsługiwany przez `addHp` w [`server/src/modules/heat-pump/controllers/hp.controller.ts`](server/src/modules/heat-pump/controllers/hp.controller.ts).

Przebieg:

1. serwer pobiera operację z pamięci przez `getOperationData(rootId)` i dokłada do niej jednorazowe akcje (`takeOperationActions`);
2. czyści bieżącą operację przez `clearOperation(rootId)`;
3. jeśli telemetria zawiera `HP.Ttarget`, zapisuje dane do MongoDB;
4. `addHpData` dopisuje `rootId`, `deviceType`, `deviceId`, aktualną temperaturę zewnętrzną i ewentualny `error_code`;
5. zapis telemetrii wywołuje komunikat WebSocket `update` do klienta;
6. odpowiedź HTTP zawiera operację, którą sterownik może zastosować.

To jest główny moment przekazania wyliczonej operacji do sterownika. Scheduler nie wysyła przy każdym przeliczeniu osobnego żądania WebSocket.

`getHpLastData` korzysta z pamięci podręcznej per `rootId`; po pierwszym odczycie najnowsza telemetria jest utrzymywana w `lastDataByRoot`.

### Treść telemetrii wysyłanej przez `co`

`co` wysyła `POST /api/hp/add?deviceId=<SN>&rootId=<id>` co 10 s, gdy sprężarka pracuje, i co 30 s w spoczynku. Komunikat WebSocket `operation` powoduje wcześniejszą wysyłkę. Wysyła też wtedy, gdy CHPC nie odpowiada i `HP` jest puste: serwer nie zapisuje takiej telemetrii, ale odsyła operację, więc sterownik zna `work_mode` przy odłączonej pompie. Treść:

- `HP` — JSON z CHPC (`StatsSerial()`), przekazany bez zmian;
- `time` w formacie `"YYYY.MM.DD HH:MM:SS"` (z kropkami, czas polski);
- `work_mode`, `co_min`, `co_max`, `cwu_min`, `cwu_max`, `co_pomp`, `cwu_pomp`, `controller_mode` (`OFF`, `CLOUD`, `MANUAL_CO`, `MANUAL_CWU`);
- estymacja COP zbiornika: `cop`, `cop_min`, `cop_max`, `t_min`, `t_max`, `cop_bottom_start`;
- liczniki diagnostyczne: `serial_queue_overflow`, `serial_read_timeout`, `serial_receive_overflow`, `pv_crc_error`, `hp_json_error`, `pv_frame_error`, `cloud_http_status`, `cloud_request_error`, `websocket_disconnect`, `cloud_response_parse_error`, `operation_validation_error`, `preference_validation_error`.

Klucze `HP`, na których polegają `co` i chpc-web (nie wolno ich zmieniać ani usuwać):

- COP: `HPS` (>0 = sprężarka pracuje), `Tho`, `Ttarget`, `lt_pow` (Wh od startu sprężarki), `lt_hp_on` (s pracy bieżącej lub ostatniej);
- widoki: `F`, `CO`, `Ttarget`, `Tmin`, `Tmax`, `Tbe`, `Tae`, `Tsump`, `Tho`, `EEV`, `EEV_dt`, `EEV_pos`, `Watts`, `WWatt`, `HCS`, `CCS`, `EEVmax`, `EEVmin`;
- błędy: `ERR` (kod ostatniego zdarzenia), `ERRn` (numer zdarzenia, rośnie przy każdym), `ERRc` (licznik błędów; 5 = blokada).

### Błędy sterownika

Gdy `HP.ERRn` różni się od poprzedniego rekordu, a `HP.ERR` ≠ 0, serwer zapisuje kod w polu `error_code` nowego rekordu (`detectErrorEvent` w [`server/src/modules/heat-pump/services/hp.service.ts`](server/src/modules/heat-pump/services/hp.service.ts)). `GET /api/hp/last-error` zwraca najnowszy rekord z `error_code` z ostatnich 24 godzin (okno kroczące). Wyjątek: gdy ostatnia telemetria ma `HP.ERRc` ≥ 5 (sterownik zablokowany), okno nie obowiązuje i błąd jest zwracany aż do odblokowania. Klient pokazuje czerwony dzwonek przed „T:” w widoku głównym (na telefonie w osobnym wierszu nad temperaturą; bez błędu ten wiersz nie istnieje), czerwony wiersz na liście danych oraz w zakładce Ustawienia błąd w dwóch liniach, data i pod nią opis (`errorLine` w [`client/src/devices/heat-pump/utils/errors.ts`](client/src/devices/heat-pump/utils/errors.ts)), licznik błędów i przyciski „Odblokuj” (aktywny tylko przy blokadzie) i „Restart sterownika”.

Kody (`ERRC_*` w CHPC, [`client/src/devices/heat-pump/utils/errors.ts`](client/src/devices/heat-pump/utils/errors.ts) tutaj; zmieniać razem): 1 czujnik, 2 przeciążenie, 3 brak przepływu, 4 za mała moc, 5 Tho, 6 Tsump za wysoka, 7 Tbc, 8 Tae, 9 Tco, 10 przekaźnik, 11 blokada x5, 12 Tsump za niska, 13 Tbe (parowanie poniżej −1 °C dłużej niż 60 s). Czas błędu to czas pierwszego rekordu z nowym `ERRn`, więc jest dokładny do 10–30 s (CHPC nie ma zegara).

## 5a. PV

Dane PV są oddzielone od telemetrii pompy, pod przyszły widok zarządzania energią. Pełne odczyty są w kolekcji `pv`. Rekordy `hp` dostają od serwera tylko `PV.total_power`, potrzebne do bilansu energii.

`co` odczytuje DTU co 60 s (pierwszy raz zaraz po starcie) i wysyła `POST /api/pv/add?deviceId=<SN>&rootId=<id>`. Nieprzyjęty odczyt ponawia co 60 s, aż zastąpi go nowszy. Odpowiedź to `{}` (201), bez operacji. Treść:

- `time` (jak w telemetrii HP), `total_power` (W, wymagane, inaczej 400), `total_prod`, `total_prod_today` (Wh), `temperature` (°C, **najniższa** z portów: pojedynczy port potrafi podać zawyżoną wartość), `pv_power` (`total_power` ≥ 2000 W);
- `panels[]`, po jednym na port mikrofalownika: `serial`, `port`, `power` (W), `prod_today`, `prod_total` (Wh), `temperature` (°C), `pv_voltage` (V), `pv_current` (A), `grid_voltage` (V), `grid_frequency` (Hz), `status`, `alarm_code`, `alarm_count`, `link`. Ostatnie cztery są przekazywane surowo, bo ich kody nie są udokumentowane (działająca instalacja podaje 3, 0, 0, 1).

`pv.service.ts` trzyma ostatni odczyt w `lastPvDataByRoot` (po restarcie serwera odtwarzany z bazy). Odczyt starszy niż 3 min (`PV_MAX_AGE_MS`) jest pomijany. Z ostatniego odczytu korzystają:

- `POST /api/hp/add` — przed zapisem `addHp` wpisuje do rekordu `PV: {total_power}`, jeśli telemetria nie ma własnego `PV` (starszy firmware wysyła je sam i zostaje ono bez zmian). `pv_power`, temperatura i produkcja nie trafiają do `hp`;
- `GET /api/hp` — do bieżącej telemetrii dołącza pełne podsumowanie (`PV` bez `panels` i `pv_power`), bo ekran HP pokazuje też temperaturę i dzisiejszą produkcję.

Dzięki temu `/hp/4day`, `/hp/all` i `monthly-summary` działają bez zmian na `PV.total_power` z rekordów `hp`, a klient (ekran HP, zakładka Dane, koszty G12w) nie wymagał zmian. **Nie łączyć `hp` z `pv` w agregacji:** baza produkcyjna (współdzielony plan Atlas) sortuje w pamięci najwyżej 32 MB i nie pozwala na `allowDiskUse`, a `monthly-summary` za rok mieści się tylko dzięki indeksowi `createdAt` na `hp`. Wersja z `$unionWith` + `$locf` przekraczała limit już dla jednego miesiąca (sprawdzone na produkcji 2026-09-26).

## 5b. Hydrofor (`water-pressure`)

Pełny opis: [`devices/water-pressure-tank/docs/water-pressure-tank.md`](devices/water-pressure-tank/docs/water-pressure-tank.md). Sterownik (ESP32-C3) ma zasilanie tylko w czasie pracy pompy: po 1 s od startu raz włącza kompresor na `compressor_seconds`, potem łączy się z Wi-Fi. Punkt dostępowy działa przez cały czas pracy.

- **Zgłoszenie** raz na start (`POST /devices/register`, typ `water-pressure`, nazwa „Hydrofor”); odpowiedź niesie ustawienia, które sterownik zapisuje w NVS. Zmiana ustawień w aplikacji działa od następnego uruchomienia pompy.
- **Czas kompresora na sterowniku:** sekcja „Kompresor” na `/install` (Basic Auth) zapisuje czas w NVS od razu (działa od następnego włączenia kompresora, także „Uruchom ponownie”) i wysyła go `PUT /api/water-pressure/settings`, który zmienia tylko `properties.compressor_seconds`. Niewysłaną zmianę sterownik ponawia co 10 s i po restarcie, a zgłoszenie nie nadpisuje jej wartością z chmury.
- **Wysyłka co 1 s** (`POST /api/water-pressure/add?deviceId=…&rootId=…`, sam `deviceId` wystarcza; 404/409 jak w `/hp/add`): `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, queued?}` — czasy względne od startu sterownika. Serwer liczy daty ze swojego zegara: pierwsza wiadomość ustala `pumpStart = teraz − pumpRunS`, każda kolejna ustawia `pumpEnd` na chwilę odebrania, więc ostatnia przed utratą zasilania wyznacza koniec pracy pompy (dokładność 1 s). Uruchomienie jest „w toku”, gdy ostatnia wiadomość ma mniej niż 5 s (`RUN_IN_PROGRESS_MS`).
- **Kolejka.** Uruchomienie, z którego nie doszła żadna wiadomość (brak sieci), sterownik wysyła przy kolejnym starcie z `queued: true`; serwer zapisuje je z `timeApproximate: true` (daty z chwili przyjęcia).
- **Woda** (`estimateWater` w [`water-pressure-tank.service.ts`](server/src/modules/water-pressure-tank/services/water-pressure-tank.service.ts); ten sam wzór w `client/src/devices/water-pressure-tank/utils/water.ts` i `devices/water-pressure-tank/src/settings.cpp` — zmieniać razem): prawo Boyle'a między progami presostatu, suma z włączonych zbiorników; poduszka `k · V · 1,013 · (1/p_d − 1/p_g)`, przepona `V · p0 · (1/max(p_d, p0) − 1/p_g)` (ciśnienia bezwzględne). Wartość jest liczona przy utworzeniu rekordu i nie zmienia się po zmianie ustawień.
- **Wodomierz.** Podsumowanie (`/water-pressure/meter/summary`) interpoluje stan liniowo między odczytami (miesiące) i podpowiada `k` zbiornika z poduszką: `(wodomierz − przepona) / poduszka przy k = 1`.

## 6. Scheduler

Implementacja znajduje się w [`server/src/modules/heat-pump/services/scheduler.service.ts`](server/src/modules/heat-pump/services/scheduler.service.ts).

Stała:

```ts
SCHEDULER_INTERVAL_MS = 60 * 1000
```

Scheduler wykonuje pierwszy przebieg od razu po uruchomieniu, a następnie uruchamia się co minutę. Jeśli poprzedni przebieg jeszcze trwa, następny nie jest uruchamiany równolegle (`running`).

### Jeden przebieg schedulera

Dla każdej pompy typu `heat_pump` scheduler:

1. pobiera urządzenie wraz z `properties` i `schedules`;
2. pobiera ostatnią telemetrię;
3. tworzy `defaultOperation`;
4. wyszukuje jeden aktywny harmonogram rodzaju wskazanego przez `work_mode` (niżej);
5. wykrywa przejście z aktywnego harmonogramu do braku harmonogramu;
6. w razie takiego przejścia czyści operację ręczną;
7. tworzy operację z harmonogramu albo operację domyślną;
8. zapisuje ją przez `replaceOperationData`.

Scheduler nie wysyła komunikatu WebSocket i nie wykonuje bezpośredniego żądania do pompy. Sterownik pobierze operację przy kolejnym zapisie telemetrii.

### Operacja domyślna

`getDefaultOperation` korzysta z następującej kolejności:

1. wartości z `device.properties`;
2. temperatury — wartości z ostatniej telemetrii;
3. `work_mode` — `CWU`. Nigdy z telemetrii: sterownik raportuje w niej tryb otrzymany od serwera (po restarcie domyślne `OFF`), więc serwer odsyłałby mu jego własny stan i `OFF` utrwalałby się bez końca.

Operacja domyślna zawsze ustawia `force: '0'`. Nie zawiera `co_pomp`.

Gdy żaden harmonogram nie jest aktywny, a `work_mode` to `A` (CO Harmonogram), scheduler wysyła operację domyślną z `work_mode: 'CWU'`: poza harmonogramem włączona pompa grzeje CWU (`withoutSchedule`). `CWU`, `M` i `OFF` zostają bez zmian.

### Mapowanie typu harmonogramu

| Typ harmonogramu | `work_mode` | Temperatury | `force` |
|---|---|---|---|
| `off` | `OFF` | wartości domyślne | zawsze `0` |
| `co` | `A` | `co_min`, `co_max` | `forceStart` |
| `cwu` | `CWU` | `cwu_min`, `cwu_max` | `forceStart` |

Jeżeli `minTemperature` lub `maxTemperature` nie jest wpisane w harmonogramie, scheduler bierze odpowiednią temperaturę z `defaultOperation`. Każda temperatura jest rozpatrywana osobno.

`co_pomp` nie jest ustawiane przez scheduler i nie jest wysyłane jako `0` ani `false` tylko dlatego, że harmonogram nie posiada tego pola. Stan pompy CO pozostaje po stronie sterownika. `co_pomp` może nadal być użyte w operacji ręcznej oraz w danych telemetrycznych.

### Czas i strefa czasowa

Scheduler używa strefy `Europe/Warsaw`.

Zakres:

- `startTime <= endTime` — zwykły zakres, np. `13:00–15:00`;
- `startTime > endTime` — zakres przez północ, np. `21:30–05:30`.

Koniec zakresu jest wyłączny: o godzinie równej `endTime` harmonogram nie jest już aktywny.

### Dni harmonogramu

Typ `WeekDay` jest zdefiniowany w kontrakcie serwera i klienta:

- `ANY_DAY = -1` — każdy dzień;
- `WORKDAYS = -2` — poniedziałek–piątek, z wyłączeniem świąt;
- `DAYS_OFF = -3` — soboty, niedziele i polskie święta ustawowo wolne;
- `0–6` — konkretne dni tygodnia.

Logika dni wolnych jest w [`server/src/core/services/calendar.service.ts`](server/src/core/services/calendar.service.ts). Zawiera święta stałe i ruchome, w tym Wigilię 24 grudnia. Scheduler i odczyt harmonogramów dla konkretnej daty korzystają z tej samej logiki.

Jeżeli harmonogram ma konkretną `date`, data ma pierwszeństwo przed `dayOfWeek` i jest porównywana w strefie Warszawy.

### Rodzaj harmonogramów wybiera tryb pracy

`properties.work_mode` (w zakładce Harmonogramy pole „Tryb pracy” w „Ustawieniach harmonogramu”) decyduje, które harmonogramy w ogóle działają (`scheduleTypesForWorkMode`):

- `A` (CO Harmonogram) — harmonogramy typu `co` oraz przerwy `off`;
- `CWU` (CWU Harmonogram) — harmonogramy typu `cwu` oraz przerwy `off`;
- `M`, `OFF` — żaden; obowiązuje operacja domyślna.

W formularzu klienta rodzaj „OFF (przerwa)” nie ma temperatur ani wymuszenia. Klient podkreśla czerwoną linią nazwy działających grup nad listą; decyduje zapisany tryb, nie bieżąca wartość listy. Pod listą jest pozycja „Poza harmonogramem / Ustawienie domyślne” (tryb i temperatury, które scheduler wysyła bez harmonogramu). Pozycja, która działa teraz, ma czerwoną lewą kreskę: harmonogram z `GET /api/schedules/current` (także przerwa `off`) albo ustawienie domyślne; przy trybie `OFF` nic nie jest zaznaczone. Klient odświeża zaznaczenie co minutę i po każdym zapisie.

### Powrót z trybu ręcznego po północy

Gdy przebieg schedulera trafia na nową datę (Europe/Warsaw), tryb `M` jest zamieniany na `A` w dwóch miejscach: w `properties.work_mode` (zapis w bazie) i w ręcznym nadpisaniu z `/operation/set` (`switchManualWorkMode`; pozostałe ręczne pola zostają). Dzień poprzedniego przebiegu jest trzymany w pamięci, więc pierwszy przebieg po restarcie serwera niczego nie przełącza.

### Nakładanie harmonogramów

Jeżeli w tej samej chwili aktywnych jest kilka harmonogramów, wybierany jest jeden według kolejności:

1. harmonogram z konkretną datą ma priorytet nad cyklicznym;
2. przerwa `off` ma priorytet nad `co`/`cwu`;
3. przy remisie wygrywa późniejszy `startTime`;
4. ostatecznie rozstrzyga identyfikator `_id`.

## 7. Operacje

Logika znajduje się w [`server/src/modules/heat-pump/services/operation.service.ts`](server/src/modules/heat-pump/services/operation.service.ts).

Serwis utrzymuje trzy mapy w pamięci procesu:

- `operations` — aktualna operacja do przekazania sterownikowi;
- `scheduledOperations` — ostatnia operacja wyliczona przez scheduler;
- `manualOperations` — ręczne nadpisania użytkownika.

### Kontrakt operacji z `co`

Odpowiedź na każdy `POST /api/hp/add` ma postać `{"operation":{…}, "t_out": 12.3}`. `t_out` to temperatura zewnętrzna z IMGW (`getTemperature()` w `meteo.service.ts`, stacja Zakopane, odświeżana co 10 min) jako liczba, poza operacją; brak go, dopóki serwer nie pobrał pomiaru. `co` pokazuje ją na ekranie jako „T. zew:” (po 30 min bez nowej wartości `--`). W `operation` **wszystkie wartości są napisami**, np. `"1"`, `"45"`. Klucze:

- `work_mode`: `M`, `A`, `CWU`, `OFF` (`co` przyjmuje też `PV`, którego serwer nie wysyła);
- `force`, `co_pomp`, `hot_pomp`, `cold_pomp`, `sump_heater`: `"0"` albo `"1"`;
- `co_min`, `co_max`, `cwu_min`, `cwu_max`;
- `working_watt`, `eev_max_pulse_open`, `eev_min_pulse_open`, `eev_setpoint`;
- **akcje jednorazowe** `error_reset` i `restart` (wartość `"1"`), kolejkowane przez `POST /api/operation/action {action}`. Trafiają do dokładnie jednej odpowiedzi `/hp/add` i nigdy nie są scalane z operacją ręczną ani z harmonogramu. Endpoint wysyła też komunikat WebSocket `{type:"operation"}`, więc akcja dociera do pompy w kilka sekund.

`co` zamienia zmienione wartości na komendy RS-485 (tabela w punkcie 13) i nie wysyła ponownie wartości, która się nie zmieniła. Pusta operacja `{}` nic nie zmienia.

CHPC nie potwierdza komend, więc `co` po każdym odczycie porównuje stan zgłoszony przez pompę z oczekiwanym i przy różnicy wysyła komendę jeszcze raz:

- `HP.CO` — oczekiwane `1` dla `work_mode` innego niż `OFF`, `0` dla `OFF` i w lokalnym trybie `OFF`. `co_on` to zgoda na start sprężarki; CHPC trzyma ją w EEPROM i można ją zmienić na samej pompie, ale chmura (albo lokalny `OFF`) ją przywraca;
- `HP.F` — porównywane tylko przy `HPS = 0` i tylko gdy serwer przysłał `force` (albo w trybie `PV`), bo CHPC przyjmuje wymuszenie tylko w spoczynku i kasuje je przy każdym zatrzymaniu;
- `HP.Tmax` i `HP.Tmin` (poza `OFF`) — `Tmax` porównywane z `co_max`/`cwu_max` (komenda `0x04`), a `Tmax − Tmin` z różnicą max − min (`0x05`), z tolerancją 0,11 °C, bo CHPC podaje jedno miejsce po przecinku. Pomijane, gdy wartość przekracza limit CHPC (zadana > 50, różnica > 30), bo CHPC i tak by ją odrzucił. Bez tego zgubiona ramka zostawiała pompę na granicach poprzedniego trybu na wiele godzin (np. 26.09 12:31–13:10 tryb `A` 35/45, pompa 22/45: doszło `0x04`, nie doszło `0x05`).

Prawdopodobna przyczyna gubienia ramek: CHPC wczytuje wszystko z magistrali do 49 bajtów i przetwarza tylko wtedy, gdy bufor zaczyna się od jego adresu. Komenda, która trafi do jednego odczytu razem z obcymi bajtami (np. końcówką 205-bajtowej odpowiedzi DTU), jest odrzucana.

Gdy odczyt pompy został bez odpowiedzi (CHPC odłączony albo restartuje), pierwszy odczyt po powrocie powoduje wysłanie całego stanu od nowa. W trybach `MANUAL_*` stan pompy nie jest sprawdzany.

### Zapis operacji ręcznej

`POST /api/operation/set` wywołuje `setManualOperationData`.

Funkcja:

1. pobiera dotychczasowe ręczne nadpisania;
2. scala je z nowymi polami;
3. zapisuje wynik w `manualOperations`;
4. nakłada ręczne pola na ostatnią operację schedulera;
5. zapisuje wynik w `operations`.

Operacja ręczna jest przechowywana tylko w pamięci procesu. Restart serwera ją usuwa.

### Priorytet ręcznych ustawień

Scalanie ma postać:

```ts
{
  ...scheduledOperation,
  ...manualOperation,
}
```

Oznacza to, że ręcznie ustawione pola wygrywają nad schedulerem, ale tylko dla pól faktycznie przekazanych ręcznie.

### Czyszczenie

- `clearOperation` czyści bieżącą operację po obsłużeniu telemetrii;
- jeśli istnieje operacja ręczna, odtwarza operację z nadpisaniem;
- `clearManualOperation` usuwa ręczne nadpisania i przywraca ostatnią operację schedulera;
- scheduler automatycznie wywołuje `clearManualOperation`, gdy przechodzi z aktywnego harmonogramu do braku aktywnego harmonogramu;
- `consumeManualForceOnStart` (wołane w `/hp/add` po `clearOperation`) usuwa z ręcznych nadpisań samo `force: "1"` przy pierwszym starcie sprężarki (`HP.HPS`: spoczynek → praca) po jego ustawieniu. Inne ręczne pola zostają. Następna odpowiedź niesie jawne `force` z harmonogramu (`forceStart` na czas wpisu) albo `"0"`, bo `co` trzyma ostatnią przysłaną wartość. Bez tego ręczne force działało bez końca: CHPC kasuje force przy każdym stopie, a `co` wysyłał je ponownie. Force ustawione w trakcie pracy czeka na postój i kolejny start.

- zapis z `work_mode`, ale bez `co_pomp`, ustawia w ręcznych nadpisaniach `co_pomp: "1"` (`setManualOperationData`). Samo usunięcie klucza nie działało, bo `co` trzyma ostatnią przysłaną wartość: ręczne `"0"` wyłączało przekaźniki CO/CWU mimo zmiany trybu i restartu sterownika, aż do ręcznego `"1"` (produkcja 27.09, 08:21–08:55). `"1"` działa tak samo jak brak pola (przekaźniki włączone w trybach CO).

Nie ma osobnego przycisku wyłączania operacji ręcznej w interfejsie.

### Walidacja w trzech miejscach, każda po cichu

- chpc-web nie sprawdza nic: ani interfejs, ani `/operation/set` nie mają kontroli zakresów;
- `co` zaokrągla `co_*`/`cwu_*` do pełnych stopni w zakresie 1–50 i przyjmuje `working_watt` 0–25599, `eev_max_pulse_open` i `eev_min_pulse_open` 0–255 oraz `eev_setpoint` 0–255,99;
- CHPC stosuje własne limity (punkt 13).

Wartość odrzucona dalej w łańcuchu nadal wygląda w interfejsie na „ustawioną”. To, czego pompa naprawdę używa, widać w telemetrii (`WWatt`, `EEVmax`, `EEVmin`, `Tmax`).

## 8. Endpointy serwera

Trasy składa [`server/src/core/routes.ts`](server/src/core/routes.ts): urządzenia i temperatura z `core`, reszta z plików `routes.ts` modułów (`modules/heat-pump`, `modules/water-pressure-tank`).

| Metoda i endpoint | Znaczenie |
|---|---|
| `GET /api/devices` | lista urządzeń |
| `POST /api/devices` | utworzenie urządzenia (nieużywane przez klienta; duplikat = 400) |
| `PUT /api/devices/:rootId` | zmiana nazwy urządzenia `{name}` |
| `POST /api/devices/register` | rejestracja sterownika po SN; zwraca istniejący albo nowy `rootId` |
| `GET /api/device/properties` | wartości domyślne urządzenia |
| `PUT /api/device/properties` | zapis wartości domyślnych |
| `GET /api/hp` | ostatnia telemetria (z bieżącym PV) |
| `GET /api/hp/all` | dane od początku bieżącego roku |
| `GET /api/hp/dates` | dni, dla których są dane |
| `GET /api/hp/4day?date=...` | dane dla jednego dnia |
| `GET /api/hp/monthly-summary` | podsumowania energii |
| `GET /api/hp/last-error` | ostatni błąd sterownika z 24 h (przy blokadzie bez limitu czasu) |
| `POST /api/hp/add` | zapis telemetrii i zwrot operacji |
| `POST /api/hp/clear` | usunięcie telemetrii HP urządzenia (bez `pv`) |
| `GET /api/pv` | ostatni odczyt PV z panelami |
| `GET /api/pv/range?date=...` lub `?startDate=...&endDate=...` | odczyty PV z zakresu dni |
| `POST /api/pv/add` | zapis odczytu PV (sterownik) |
| `GET /api/operation` | przygotowany zestaw wartości do widoku ustawień |
| `GET /api/operation/get` | bieżąca operacja z pamięci |
| `GET /api/operation/getAndClear` | pobranie i wyczyszczenie operacji |
| `POST /api/operation/set` | zapis operacji ręcznej |
| `POST /api/operation/action` | akcja jednorazowa `error_reset` albo `restart` |
| `GET /api/schedules` | lista harmonogramów |
| `GET /api/schedules/current` | harmonogram działający teraz `{scheduleId, work_mode}`; `scheduleId: null` = ustawienie domyślne |
| `POST /api/schedules` | utworzenie harmonogramu |
| `PUT /api/schedules/:id` | aktualizacja harmonogramu |
| `DELETE /api/schedules/:id` | usunięcie harmonogramu |
| `GET /api/settings` | starsze ustawienia czasowe |
| `POST /api/settings/set` | zapis starszych ustawień |
| `GET /api/temperature` | temperatura z serwisu meteo |
| `PUT /api/devices/:rootId/default` | sterownik domyślny `{isDefault}` (najwyżej jeden) |
| `POST /api/water-pressure/add` | wysyłka hydroforu co 1 s (sterownik) |
| `PUT /api/water-pressure/settings` | czas kompresora ustawiony na stronie sterownika `{compressor_seconds}` (tylko to pole; sam `deviceId` wystarcza, 404/409 jak w `/hp/add`) |
| `GET /api/water-pressure/runs?from=&to=` lub `?fromTime=&toTime=` | uruchomienia z dni (Warszawa) albo okresu między odczytami |
| `GET /api/water-pressure/summary?period=day\|month\|year&date=` | woda w godzinach, dniach albo miesiącach |
| `GET` / `POST /api/water-pressure/meter`, `DELETE /api/water-pressure/meter/:id` | odczyty wodomierza |
| `GET /api/water-pressure/meter/summary?year=` | zużycie z wodomierza w miesiącach i okresach, sugerowane `k` |

WebSocket ([`server/src/core/websocket.ts`](server/src/core/websocket.ts)) działa na `/ws?rootId=…`. Sterownik `co` łączy się nim i po komunikacie `{type:"operation", rootId}` od razu wysyła `/hp/add`. Przeglądarki dostają `update` po zapisie telemetrii.

## 9. Klient React

**Klient jest podzielony tak jak serwer** (`client/src`):

- `index.tsx` — punkt wejścia; `style.css` — style globalne; `assets/`;
- `core/` — część wspólna: `App.tsx` (routing, `DeviceGuard`, stopka „Aktywne urządzenie”), `device-types.tsx` (rejestr rodzajów sterowników), `http.ts`, `api.ts`, `types.ts`, `context/DeviceContext.tsx`, `components/` (`Header`, `DeviceEditModal`, `Notification`, ikony menu), `pages/Devices` (wybór sterownika);
- `devices/heat-pump/` — pompa ciepła: `pages/` (`Home`, `Data`, `Charts`, `Settings`, `Schedules`), `components/` (`DateDict`, `ResourceBlock`), `utils/` (energia, G12w, błędy), `api.ts`, `types.ts`, `device-type.tsx`;
- `devices/water-pressure-tank/` — hydrofor: `pages/` (`Home`, `Data`, `Chart`, `Settings`), `utils/water.ts`, `api.ts`, `types.ts`, `device-type.tsx`.

**Menu i trasy powstają z rejestru** (`core/device-types.tsx`). Każdy rodzaj podaje w `device-type.tsx` ikonę kafelka i widoki w kolejności menu (`path`, `label`, `icon`, `element`; pompa ma też `/hp` poza menu). `Header` rysuje menu wybranego rodzaju. `App` tworzy trasy dla wszystkich ścieżek, a ścieżka, której wybrany rodzaj nie ma (np. `/schedules` hydroforu), prowadzi na `/`. Nowy rodzaj sterownika to katalog `devices/<rodzaj>/`, wpis w rejestrze i wartość w `DeviceType`, tak jak na serwerze.

Główne widoki pompy ciepła:

- `/` i `/hp` — bieżący stan pompy;
- `/data` — tabela danych historycznych;
- `/chart` — wykresy i podsumowania;
- `/settings` — ręczne ustawienia operacji (przycisk „Zmień”, komunikat „Polecenie wysłane do sterownika.”; checkbox „Pompy CO/CWU” pokazuje rzeczywisty stan przekaźników z telemetrii `co_pomp`, bo `co` przełącza oba razem, i jest zablokowany w trybach `CWU` i `OFF`, w których `co` i tak trzyma je wyłączone; checkbox „Wymuszenie pracy” pokazuje `HP.F` z pompy, czyli wymuszenie od ustawienia do zatrzymania sprężarki, i jest zablokowany w `OFF`; pompy zimnej i ciepłej wody pokazują `HP.CCS` i `HP.HCS`, czyli pracę automatyczną, włączenie komendą albo ochronę przed mrozem; wymuszenie i obie pompy są zablokowane, gdy telemetria przy wejściu na stronę ma `HP.HPS` > 0, bo pompa steruje nimi wtedy sama, a force przyjmuje tylko w spoczynku), błąd sterownika, „Odblokuj” i „Restart sterownika”, dane sterownika;
- `/schedules` — wartości domyślne i harmonogramy;
- `/devices` — wybór sterownika i zmiana jego nazwy.

**Widoki zależą od typu wybranego sterownika** (rejestr wyżej). Dla hydroforu ([`devices/water-pressure-tank/pages/`](client/src/devices/water-pressure-tank/pages/)) te same ścieżki pokazują:
- `/` — podgląd: czas kompresora, progi, zbiorniki z szacunkiem wody i dzisiejsze uruchomienia (odświeżane co 10 s);
- `/data` — zakładki *Uruchomienia pompy* (miesiąc, CSV) / *Odczyty wodomierza* (dodawanie z samą datą i usuwanie odczytów);
- `/chart` — „Zużycie wody w okresie”: kropki dzień / miesiąc / rok; w roku znacznik „Pokaż odczyty z wodomierza” (wodomierz vs szacunek w miesiącach, sugerowane `k`);
- `/settings` — czas kompresora, progi presostatu, zbiorniki (włączony/wyłączony; kalkulator wody na cykl z obwodu i różnicy słupa wody przy zbiorniku z poduszką, „Wstaw” dobiera `k`), dane sterownika.

Hydrofor nie ma harmonogramów (`/schedules` przekierowuje na `/`).

Docelowy telefon to Samsung Galaxy S20 (360×800 CSS px); układ sprawdzany jest też przy 368, 384 i 412 px, bo tyle zależnie od ustawień zgłaszają telefony z Androidem. Widok główny ma klasę `hp-page`: na telefonie karty mają pełną szerokość, a treść zawija się wewnątrz karty. Na telefonie szare karty i tabela danych sięgają od krawędzi do krawędzi ekranu, bez bocznych marginesów (reguły z prefiksem `body` w [`client/src/style.css`](client/src/style.css)). Reguły dla telefonu są w blokach `@media (max-width: 560px)`: menu pokazuje same ikony (`.nav-label` ukryte, nazwa w `title`), wiersze „etykieta + pola” w Ustawieniach i Harmonogramach są flexem z etykietą 9.5rem (pola min i max w jednej linii), wykres ma własną wysokość w `.chart-area`, a `.app-main` ma dolny odstęp na stałą stopkę. Strona nie może mieć przewijania w poziomie (wyjątek: tabela danych we własnym kontenerze).

### Urządzenia i Root ID

- Po przekierowaniu z `DeviceGuard` (`state.auto`, brak wybranego sterownika) wybierany jest automatycznie sterownik domyślny z bazy, a bez niego jedyny sterownik; nie przy świadomym wejściu na `/devices`.
- **Sterownik domyślny** ustawia gwiazdka w lewym górnym rogu kafelka (`isDefault` w bazie, najwyżej jeden). Po otwarciu aplikacji `DeviceGuard` raz na sesję przeglądarki (`sessionStorage` `chpc.defaultApplied`) przełącza na niego, także gdy w `localStorage` jest inny wybór; zmiana w stopce obowiązuje do końca sesji.
- Ikona kafelka zależy od typu: fale (pompa ciepła) albo kropla (hydrofor).
- Kafelki sterowników stoją obok siebie (zawijane do kolejnych wierszy), a na ekranach ≤ 560 px jeden pod drugim. Kafelek pokazuje nazwę, a pod nią małą czcionką `deviceId`; gdy nazwy nie ma, w tytule kafelka jest samo `deviceId`. Mała ikonka ołówka w rogu kafelka otwiera popup „Dane sterownika” ([`DeviceEditModal`](client/src/core/components/DeviceEditModal.tsx)): Root ID i Device ID są wyłączone z edycji, nazwę można wpisać lub poprawić (`PUT /api/devices/:rootId`). Popup zamyka „Anuluj”, Esc albo kliknięcie poza nim.
- Nie ma formularza dodawania sterownika (sterowniki rejestrują się same, punkt 3).
- Zakładka Ustawienia ma sekcję „Sterownik” z nazwą, `deviceId` i Root ID oraz przyciskiem „Zmień”, który otwiera ten sam popup. Po zapisie nowa nazwa trafia też do wybranego urządzenia (stopka, `localStorage`). Zmiana sterownika odbywa się przez ikonkę w stopce.

### API klienta

`client/src/core/http.ts` buduje adresy API i WebSocket oraz automatycznie dodaje `rootId` i `deviceId` wybranego urządzenia. Urządzenia (lista, nazwa, domyślny, `properties`) obsługuje `DeviceRequests` w `client/src/core/api.ts`, a ich typy są w `client/src/core/types.ts`. API i typy rodzajów sterowników: `client/src/devices/heat-pump/` (`HpRequests`: telemetria, operacje, harmonogramy) i `client/src/devices/water-pressure-tank/` (`WaterRequests`), każdy z `api.ts` i `types.ts`.

### Zakładka Dane

`client/src/devices/heat-pump/utils/utils.ts` pobiera dane z `/hp/4day` i:

1. filtruje rekordy do `HPS === true`, chyba że zaznaczono „Wszystkie dane”;
2. sortuje je malejąco po czasie;
3. spłaszcza dane `HP` do wierszy tabeli;
4. zachowuje `work_mode` i dane PV.

W tabeli kolumna `Praca` pokazuje:

- `A` jako `CO`;
- `M` jako `CO`;
- pozostałe kody bez tłumaczenia, np. `CWU`, `OFF`, `PV`.

Eksport CSV stosuje tę samą prezentację.

### Koszt energii

[`client/src/devices/heat-pump/utils/energy-cost-g12w.ts`](client/src/devices/heat-pump/utils/energy-cost-g12w.ts) liczy koszt w taryfie G12w. Parser czasu przyjmuje zarówno `YYYY-MM-DD`, jak i `YYYY.MM.DD` (format z `co`) i zawsze używa czasu warszawskiego. W widoku głównym `lt_pow` jest opisane jako „Energia cyklu” w Wh, a `WWatt` jako „Limit mocy” (w Ustawieniach pole `working_watt` to „Limit mocy [W]”).

## 10. Definicja harmonogramu

Aktualna definicja zawiera:

```ts
{
  type: 'co' | 'cwu' | 'off',
  enabled: boolean,
  dayOfWeek?: -1 | -2 | -3 | 0 | 1 | 2 | 3 | 4 | 5 | 6,
  date?: Date,
  startTime: 'HH:mm',
  endTime: 'HH:mm',
  forceStart: boolean,
  minTemperature?: number,
  maxTemperature?: number,
}
```

Temperatury są opcjonalne. Brak temperatury oznacza użycie odpowiedniej wartości domyślnej urządzenia podczas najbliższego przebiegu schedulera.

Harmonogram nie zawiera `co_pomp`. To pole nie jest wymagane ani zapisywane dla definicji harmonogramu.

## 11. Testy

### chpc-web

Testy serwera znajdują się w:

- [`server/app.test.ts`](server/app.test.ts);
- [`server/pv.test.ts`](server/pv.test.ts);
- [`server/scheduler.test.ts`](server/scheduler.test.ts).

Testy używają `mongodb-memory-server`, więc nie modyfikują produkcyjnej bazy. Sprawdzają między innymi:

- zapis i odczyt danych API;
- rejestrację sterownika (nowy SN bez nazwy, znany SN, brak `deviceId`);
- zmianę nazwy urządzenia (bez zmiany `deviceId`, pusta nazwa, nieznany `rootId`);
- zapis `EEVmin` i wykrywanie zdarzeń błędów (także błąd starszy niż 24 h przy blokadzie);
- jednorazowe akcje `error_reset` i `restart`;
- PV: zapis z samym `deviceId`, 404 i 409 przy identyfikacji, wpisanie samego `PV.total_power` do rekordu `hp` (z limitem 3 min, bez nadpisywania `PV` od starszego firmware), pełne PV w `GET /hp`, bilans `monthly-summary`, usuwanie `panels` po 90 dniach;
- wybór rodzaju harmonogramu przez tryb pracy (`A` → CO, `CWU` → CWU, `M`/`OFF` → żaden) i przerwę `off` w obu trybach harmonogramu;
- ręczne nadpisanie harmonogramu;
- przywrócenie `co_pomp: "1"` przy zmianie trybu w operacji ręcznej;
- przełączenie trybu `M` na `A` po północy;
- automatyczne wyczyszczenie operacji ręcznej;
- temperatury domyślne przy pustym harmonogramie;
- tryb `CWU` poza harmonogramem w trybie `A`;
- harmonogram działający teraz (`getCurrentSchedule`);
- weekendy i polskie święta jako `DAYS_OFF`;
- brak `co_pomp` w operacji schedulera.

Nie pokrywają WebSocketu.

Podstawowe polecenia:

```bash
npm run build -w server
npm run build -w client
npm test -w server -- --run
npx tsc -p server/tsconfig.tests.json --noEmit
```

Pierwsze uruchomienie testów pobiera binarkę MongoDB i może przekroczyć domyślny limit 10 s hooka `beforeAll`. Wtedy pomaga `npx vitest run --hookTimeout=240000` w `server/`. Błąd `spawn EBUSY` zaraz po pobraniu mija przy kolejnym uruchomieniu.

### Firmware

- `co`: `pio test -e native` w `devices/co` (64 testy: kontroler operacji, parser PV, ramki Modbus, polityka AP).
- CHPC: `pio test -e native` w `devices/chpc` (symulacja firmware, 54 testy). Dodatkowo scenariusze Wokwi w `devices/chpc/test-wokwi/`.
- hydrofor: `pio test -e native` w `devices/water-pressure-tank` (23 testy: kompresor, szacunek wody, ustawienia, czas kompresora z `/install`, JSON wysyłki, kolejka w NVS).

Serwer ma też testy hydroforu w [`server/water-pressure-tank.test.ts`](server/water-pressure-tank.test.ts) (30: wzór wody i zgodność ze wzorem klienta, zgłoszenie z ustawieniami, ustawienia i ich walidacja, czas kompresora ze sterownika, daty z czasów względnych, kolejka, 404/409, podsumowania, wodomierz i `k`, sterownik domyślny). Symulator sterownika hydroforu dla środowiska lokalnego: `node scripts/simulate-water-pressure.mjs [--history] [--fast]` (przy `npm run local`; `--history` dopisuje 60 dni uruchomień wprost do bazy lokalnej).

Przebieg 2026-09-28 (hydrofor): serwer 71/71 + `tsc` OK, klient `vite build` OK, `co` 64/64 + build `esp32dev`, CHPC 54/54 + build Pro Mini, hydrofor 20/20 + build `esp32c3`; widoki hydroforu sprawdzone w Edge przy 360 i 1280 px (bez przewijania w poziomie i błędów konsoli). E2E łańcucha pompy nie był uruchamiany (nieaktualny, punkt 15).

Wcześniejszy pełny przebieg (2026-09-24): serwer chpc-web 12/12 + `tsc` OK (po dodaniu edycji nazwy i błędu przy blokadzie: 20/20), klient `vite build` OK, `co` 38/38, CHPC 44/44, E2E 48/48 (30 funkcjonalnych + 18 układu widoków), build Pro Mini OK.

### E2E całego łańcucha

Testy są w `test/e2e/` (do 2026-09-27 w repozytorium `chpc`). `bridge.exe` łączy symulowany firmware CHPC z prawdziwym kodem `co` (`operation_parser`, `operation_controller`, `modbus_frame`, `cop_estimator`), a `run-e2e.mjs` odgrywa rolę HTTP `co` wobec lokalnego chpc-web i steruje interfejsem przez Playwright z systemowym Edge.

1. W chpc-web: `npm run local` (baza, serwer 4001, klient 5173).
2. W `devices/co`: `pio test -e native` (pobiera ArduinoJson potrzebny do mostu).
3. W `test/e2e`: `npm install && sh build-bridge.sh && node run-e2e.mjs` (kod `co` z `devices/co`, inna ścieżka w `CO_DIR`).

Wyniki trafiają do `test/raport-testow/` (tylko lokalnie, poza gitem): `e2e-wyniki.json`, `e2e-log.txt` i zrzuty ekranów (kroki `01`–`09` oraz `uklad-<strona>-<szerokość>.png` dla 360, 768 i 1280 px), obok raportu z opisem (`RAPORT.md`). Test tworzy urządzenie „Pompa testowa (E2E)” w lokalnej bazie.

## 12. Najważniejsze zasady systemu

1. Scheduler liczy stan co minutę, ale nie wysyła osobnego żądania do sterownika.
2. Sterownik dostaje operację w odpowiedzi na zapis telemetrii. WebSocket tylko przyspiesza ten zapis (akcje jednorazowe).
3. Brak aktywnego harmonogramu oznacza operację domyślną urządzenia; w trybie `A` z `work_mode` zamienionym na `CWU`.
4. Ręczne pola mają pierwszeństwo nad schedulerem.
5. Ręczne nadpisania są tylko w pamięci i są czyszczone po przejściu z harmonogramu do trybu domyślnego. Tryb `M` wraca po północy na `A`.
6. Działają tylko harmonogramy rodzaju wybranego trybem pracy: `A` → CO, `CWU` → CWU, inne → żaden; przerwa `off` działa w `A` i `CWU` i wygrywa z CO/CWU.
7. `co_pomp` nie należy do harmonogramu i nie jest ustawiane przez scheduler.
8. Temperatury harmonogramu mogą być pominięte — wtedy używane są temperatury domyślne.
9. Wszystkie porównania czasu harmonogramu odbywają się w `Europe/Warsaw`.
10. Wartości operacji są napisami; nowe pole telemetrii wymaga zmiany schematu Mongo i typów po obu stronach.
11. Zmiana pola, klucza lub komendy obejmuje serwer, klienta i oba firmware (`devices/`), a wdrożenie zaczyna się od serwera.

## 13. Sterownik `co` (ESP32, `devices/co`)

Firmware PlatformIO (`esp32dev`), kod w `devices/co/src/`. Szczegóły: `devices/co/README.md` i `devices/co/docs/server-driven-refactor-2026-09-20.md`.

- **Odczyty.** Co 10 s (sprężarka pracuje) lub 30 s (spoczynek) odpytuje CHPC. 3 s po ostatniej komendzie sterującej z serii czyta pompę od razu, sprawdza, czy komendy doszły, i wysyła świeży stan do `hp/add`; zwykły cykl liczy się wtedy od nowa. Taki szybki odczyt jest najwyżej co 10 s, żeby pompa odrzucająca komendę nie była czytana w kółko. Niezależnie od tego co 60 s i zaraz po starcie odpytuje DTU Hoymiles (Modbus, dwa zapytania po pięć portów: od 0x1000 i od 0x10C8, bo DTU numeruje porty co 0x28 adresów, choć rekord ma 20 rejestrów). Odczyt PV idzie osobno na `pv/add` (sekcja 5a). Szacuje COP zbiornika 300 l w każdym cyklu grzania.
- **Strony lokalne:** `/telemetry.json` to telemetria HP, a `/pv.json` to odczyt PV z panelami. Odpowiedź RS-485 na zapytanie `0x01` do `co` (adres `0x10`) nadal zawiera `PV` i `pv_power` w jednym JSON-ie.
- **Tryb sterownika** (przycisk na GPIO5, zapis w NVS): `OFF → CLOUD → MANUAL_CO → MANUAL_CWU → OFF`. Pierwsze naciśnięcie tylko pokazuje bieżący tryb, kolejne przechodzą dalej; wybrany tryb jest stosowany 5 s po ostatnim naciśnięciu. Tylko w `CLOUD` stosuje operacje z chmury. `OFF` wysyła do pompy sekwencję bezpieczeństwa (CO off, force off, pompy off) i wyłącza przekaźniki. W `work_mode = PV` `force` wynika z produkcji PV (≥ 2000 W), a nie z serwera.
- **Strony WWW na porcie 80** (sieć lokalna i otwarty AP `HP-CO-setup`): `/` podgląd telemetrii, `/telemetry.json`, `/install` (Basic Auth: Wi-Fi, SN i Root ID tylko do odczytu, status rejestracji), `/save`.
- **AP `HP-CO-setup` nie działa stale** (`AccessPointPolicy`). Startuje razem ze sterownikiem i jest wyłączany, gdy przez 3 min Wi-Fi ma adres, a każde żądanie do chmury dostaje odpowiedź HTTP (dowolny kod, także 4xx). Wraca, gdy Wi-Fi jest rozłączone dłużej niż 1 min albo chmura milczy 5 min. Przy wyłączonym AP strony konfiguracji są dostępne pod adresem IP sterownika w sieci lokalnej, a ekran pokazuje `AP: off`.
- **Ekran:** nad niebieską linią data, godzina i tryb oraz `P:` (moc/produkcja dziś PV) i `T:` (temperatura falowników). Między liniami duże `T:` to `HP.Ttarget` — temperatura czujnika w środku zbiornika, nie zadana; czerwona przy nierozwiązanym błędzie (`ERRc` > 0; `ERR` to tylko kod ostatniego zdarzenia i nie wraca do 0), żółta, gdy pracuje sprężarka (`HPS` > 0), w pozostałych przypadkach biała. Pod nią biała „T. zew:” z `t_out` z chmury (czcionka `FreeSans9pt7b`).
- **Konfiguracja.** Wi-Fi i Root ID w NVS; `src/secrets.h` daje tylko wartości domyślne, a `CLOUD_ROOT_ID` jest opcjonalny.
- **Kluczowe pliki kontraktu:** `cloud_client.cpp` (HTTP, WebSocket, rejestracja), `telemetry.cpp`, `pv_telemetry.cpp`, `json_converters.hpp` (pola PV), `operation_parser.cpp`, `operation_controller.cpp`, `modbus_frame.cpp`.

**Komendy RS-485 do CHPC** (ramka `[0x41][cmd][d1][d2][0xFF]`, liczby dziesiętne jako część całkowita + setne, waty jako W/100 i W%100):

| cmd | Znaczenie | Źródło w operacji |
|---|---|---|
| `0x01` | odczyt JSON | cykliczny odczyt |
| `0x03` | force start 0/1 | `force` (w `PV` z produkcji PV) |
| `0x04` | T zadana (max) | `co_max` albo `cwu_max` |
| `0x05` | delta T | max − min |
| `0x08` | przegrzanie EEV | `eev_setpoint` |
| `0x09` / `0x0A` / `0x0B` | pompa gorąca / zimna / grzałka karteru | `hot_pomp`, `cold_pomp`, `sump_heater` |
| `0x0C` | CO on/off | `work_mode` (+ przekaźniki CO/CWU w `co`) |
| `0x0D` | EEV max (26–255) | `eev_max_pulse_open` |
| `0x0F` | EEV min (25–255), wysyłane po `0x0D` | `eev_min_pulse_open` |
| `0x0E` | limit mocy (1001–4000 W) | `working_watt` |
| `0x10` | odblokowanie po 5 błędach | akcja `error_reset` |
| `0x11` | restart programowy CHPC | akcja `restart` (potem `co` wysyła ponownie cały stan) |

Na tej samej magistrali (9600 8N1, półdupleks) są: CHPC `0x41`, DTU `0x69` (Modbus RTU z CRC) i sam `co` `0x10`. Transmisję zaczyna tylko `co`: odstęp między komendami co najmniej 500 ms, koniec ramki po 5 ms ciszy, timeout 3 s.

## 14. Firmware CHPC (Pro Mini, `devices/chpc`)

Fork [gonzho000/chpc](https://github.com/gonzho000/chpc) (GPLv3) na Arduino Pro Mini (ATmega328P). Cały firmware to jeden plik `devices/chpc/src/CHPC_firmware.ino`. Szczegóły: `devices/chpc/CLAUDE.md`.

- Steruje sprężarką, pompami strony gorącej i zimnej, grzałką karteru i zaworem 4-drogowym; prowadzi silnik krokowy EEV, czyta czujniki DS18B20 i mierzy moc przekładnikiem prądowym. Ma wyświetlacz 1602 i przyciski.
- Zabezpieczenia i ich kody błędów opisuje punkt 5 („Błędy sterownika”). Po 5 błędach sterownik się blokuje: odpowiada po RS-485, ale nie steruje, do czasu `0x10` albo `0x11`.
- Limit mocy równy dokładnie 3200 W celowo wyłącza zabezpieczenie przepływu („Err CP”).
- Pamięć Flash jest zajęta w 95,0% (29 174 B z 30 720 B, stan na 2026-09-28), więc nowe klucze JSON trzeba dodawać oszczędnie.
- Tryb produkcyjny RS-485 to `RS485_PYTHON`: magistrala niesie tylko odpowiedzi dla `co`. Build `wokwi` (`RS485_HUMAN`) nie może trafić na pompę podłączoną do `co`.

## 15. Znane niezgodności i otwarte kwestie

- Kontrola klucza API (`verifyApiKey`) jest wyłączona; `POST /api/operation/set` jest otwarte i bez walidacji.
- Zwykłe ustawienia z `/operation/set` czekają na kolejny cykliczny POST `co` (10–30 s); natychmiast (WebSocket) docierają tylko akcje jednorazowe.
- `0x04` powyżej `T_SETPOINT_MAX` i `0x05` powyżej `T_DELTA_MAX` CHPC po cichu ignoruje.
- Liczniki diagnostyczne `co` i `controller_mode` nie są zapisywane w bazie (ścisły schemat); widać je tylko w `GET /api/hp` do restartu serwera i na stronie `/` sterownika.
- Test E2E łańcucha pompy (`test/e2e`) jest nieaktualny: czeka na formularz dodawania sterownika, którego klient już nie ma (audyt 2026-09-25).
- Najstarszy sterownik ma Root ID wkompilowany w `secrets.h`, więc się nie zgłasza. Jego `deviceId` zmieniono w bazie z `hp-1` na SN. Serwer trzyma `deviceId` w pamięci (`deviceInfoByRoot`), więc po zmianie w bazie trzeba zrestartować serwer.