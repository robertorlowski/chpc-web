# CLAUDE.md

Ten plik jest przewodnikiem dla Claude Code (claude.ai/code) i dla ludzi pracujących z tym repozytorium. **chpc-web jest wiodącym projektem całego systemu.** Tu opisany jest cały łańcuch sterowania pompą ciepła, łącznie z dwoma projektami firmware, które mają własne repozytoria. Zmiana kontraktu (pola telemetrii, klucze operacji, komendy RS-485) zaczyna się od tego opisu i musi zostać przeniesiona do wszystkich projektów, których dotyczy.

Commity, komentarze i dokumentacja są po polsku.

## 0. System i repozytoria

```text
CHPC (Pro Mini) ⇄ RS-485 ⇄ co (ESP32) ⇄ HTTPS / WebSocket ⇄ chpc-web (serwer) ⇄ przeglądarka (klient)
                             │                                   │
DTU Hoymiles (PV) ───────────┘                                   └── MongoDB
```

| Projekt | Repozytorium | Lokalnie | Rola |
|---|---|---|---|
| **chpc-web** (to repo) | [robertorlowski/chpc-web](https://github.com/robertorlowski/chpc-web) | `D:\DevLocal\arduino_src\chpc-web` | serwer Express + klient React; harmonogramy, historia, ustawienia; produkcja: `https://chpc-web.onrender.com` (Render) |
| **co** | [robertorlowski/heatpomp](https://github.com/robertorlowski/heatpomp) | `D:\DevLocal\arduino_src\heatpump` | firmware ESP32: odpytuje pompę i PV po RS-485, wysyła telemetrię, wykonuje operacje z chmury |
| **chpc** | [robertorlowski/chpc](https://github.com/robertorlowski/chpc) | `D:\DevLocal\arduino_src\chpc` | firmware pompy (Arduino Pro Mini, fork gonzho000/chpc); testy E2E całego łańcucha |

**Gałęzie robocze (stan na 2026-09-24):** chpc-web `device-register` (główna `main`, z niej wdraża Render); heatpump `co-cloud-scheduler` → `origin/co` (główna `main`); chpc `VC---nowa-wersja` (główna `master`). Bieżąca praca nie jest jeszcze scalona z gałęziami głównymi.

Każdy z firmware ma własny `CLAUDE.md` lub `README.md` ze szczegółami. Ten plik zawiera to, co jest potrzebne do pracy nad całym łańcuchem.

**Kolejność wdrożenia.** Jeśli zmiana obejmuje kilka projektów, najpierw wdraża się chpc-web (push na `main` → Render), potem firmware `co`, a na końcu CHPC. Serwer musi znać nowe pole lub endpoint, zanim wyśle je sterownik.

## 1. Podział systemu (chpc-web)

Repozytorium składa się z dwóch aplikacji (npm workspaces):

- `server/` — Node.js, Express, TypeScript, Mongoose, MongoDB, WebSocket i scheduler;
- `client/` — React, TypeScript, Vite, React Router i REST API.

Główne elementy przepływu:

```text
Sterownik co
        │ POST /api/hp/add
        ▼
Serwer zapisuje telemetrię i zwraca oczekiwaną operację
        │
        ├── MongoDB: dane pomiarowe
        ├── scheduler: wyliczona operacja
        └── WebSocket: komunikat „update” do klienta

Klient React ── REST API ──► serwer
```

Scheduler działa niezależnie od klienta. Klient tylko wyświetla dane i zapisuje ustawienia.

## 2. Uruchamianie serwera

Punkt startowy: [`server/src/server.ts`](server/src/server.ts).

Podczas uruchamiania serwer:

1. ładuje zmienne środowiskowe;
2. łączy się z MongoDB przez `MONGODB_URI`;
3. uruchamia `startScheduler()`;
4. przygotowuje dane meteorologiczne;
5. uruchamia cykliczne odświeżanie meteo co 10 minut;
6. zaczyna nasłuch na porcie `PORT`.

Wartości konfiguracyjne:

- `MONGODB_URI` — połączenie z MongoDB;
- `PORT` — port HTTP;
- `API_KEY` — klucz używany przez middleware autoryzacji.

Middleware `verifyApiKey` jest obecnie zaimportowany, ale `app.use(verifyApiKey)` w [`server/src/middleware/app.ts`](server/src/middleware/app.ts) jest zakomentowane. Oznacza to, że w aktualnym stanie aplikacji kontrola klucza API nie jest globalnie aktywna.

**Środowisko lokalne bez bazy produkcyjnej:** `npm run local` ([`scripts/local-dev.mjs`](scripts/local-dev.mjs)) uruchamia trwałą bazę MongoDB w `.local-db/` (port 27027, poza gitem), serwer na porcie 4001 i klienta Vite na 5173. `npm run local -- --db` uruchamia samą bazę. Pierwsze uruchomienie pobiera binarkę MongoDB (ok. 100 MB). Lokalną bazę kasuje się, usuwając `.local-db/`.

## 3. Kontekst urządzenia

Za wybór pompy odpowiada [`server/src/middleware/deviceContext.ts`](server/src/middleware/deviceContext.ts).

Większość żądań musi zawierać:

```text
?rootId=<MongoDB device _id>&deviceId=<identyfikator sterownika>
```

Middleware:

1. odczytuje `rootId` z query string;
2. sprawdza urządzenie w kolekcji `devices`;
3. zapisuje wynik w `req.deviceRootId`;
4. przekazuje żądanie do kontrolera.

Urządzenia domyślnego nie ma: żądanie bez `rootId` dostaje 400, a WebSocket bez `rootId` jest zamykany (dawniej takie żądanie trafiało do `hp-1`, które tworzyło się samo, jeśli go nie było). Ścieżki `/devices` i `/devices/register` są publiczne względem kontekstu urządzenia.

Po stronie klienta wybrane urządzenie jest przechowywane w `localStorage` pod kluczem `chpc.selectedDevice`. [`DeviceProvider`](client/src/context/DeviceContext.tsx) udostępnia wybór, zmianę i czyszczenie urządzenia. `DeviceGuard` przekierowuje użytkownika do `/devices`, jeśli nie wybrano pompy. Stopka „Aktywne urządzenie” z przyciskiem zmiany jest widoczna tylko wtedy, gdy `GET /api/devices` zwraca co najmniej dwa sterowniki (sprawdzane przy każdym wyborze urządzenia); przy jednym nie ma na co przełączyć. Dawny klucz `chpc.hideDeviceFooter` nie jest już używany.

### Rejestracja sterownika

`POST /api/devices/register` z `{deviceId, deviceType?, name?}` zwraca urządzenie o danym `deviceId`: **201**, gdy zostało utworzone, i **200** z istniejącym `rootId`, gdy już było. `co` bez zapisanego Root ID wywołuje ten endpoint po połączeniu z internetem, z `deviceId` = SN (fabryczny MAC ESP32, 12 znaków hex), i zapisuje otrzymany `rootId` w NVS. Nieudaną rejestrację ponawia co 60 s i do tego czasu nie wysyła telemetrii.

**Sterowniki dodaje się tylko przez samodzielną rejestrację.** Klient nie ma funkcji dodawania sterownika. Nowy sterownik pojawia się na liście w `/devices` bez nazwy, a użytkownik nadaje ją przez `PUT /api/devices/:rootId` z `{name}` (zmienia tylko nazwę; `rootId` i `deviceId` nie podlegają edycji; pusta nazwa jest dozwolona).

`POST /api/devices` pozostał na serwerze (m.in. dla testu E2E), ale klient go nie używa. Dla istniejącego `deviceId` zwraca błąd 400 („Device already exists.”).

## 4. Model danych MongoDB

### `devices`

Model główny to `DeviceModel` z kolekcją `devices`. Urządzenie zawiera między innymi:

- `deviceType` — obecnie `heat_pump`;
- `deviceId` — identyfikator sterownika, SN (MAC ESP32); najstarszy sterownik miał `hp-1`, w produkcji zmienione na SN (także w rekordach `hp`, 2026-09-26);
- `name` — opcjonalna nazwa nadana przez użytkownika (domyślnie pusta; rejestracja automatyczna jej nie ustawia). Klient pokazuje `name`, a gdy jest pusta — `deviceId` (`deviceLabel` w [`DeviceContext.tsx`](client/src/context/DeviceContext.tsx));
- `properties` — ustawienia domyślne;
- `schedules` — osadzone definicje harmonogramów.

### `properties`

Ustawienia domyślne pompy:

- `co_min`, `co_max`;
- `cwu_min`, `cwu_max`;
- `work_mode` — `M`, `A`, `CWU` albo `OFF`.

Domyślny `work_mode` modelu to `CWU`.

### `hp`

Kolekcja `hp` przechowuje telemetrię. Dokument jest wzbogacany o:

- `rootId`;
- `deviceType`;
- `deviceId`;
- `t_out` — temperaturę zewnętrzną z serwisu meteo;
- `error_code` — kod błędu CHPC, gdy w tym odczycie pojawiło się nowe zdarzenie;
- znaczniki `createdAt` i `updatedAt`.

Telemetria zawiera między innymi `HP`, `PV`, `work_mode`, temperatury, moc, stan sprężarki oraz stany pomp. `co_pomp` jest polem telemetrii i może występować w operacji ręcznej, ale nie jest polem harmonogramu.

**Schemat jest ścisły** ([`server/src/models/model.ts`](server/src/models/model.ts)): klucz, którego nie wymienia, jest po cichu pomijany przy zapisie. Dotyczy to m.in. `EEV_pulse`, `cop_min`, `cop_max`, `controller_mode` i **wszystkich liczników diagnostycznych** z `co`. Ostatnia surowa telemetria jest dostępna przez `GET /api/hp` z pamięci podręcznej do restartu serwera. **Nowe pole telemetrii trzeba dodać do schematu, do typów `server/src/middleware/type.ts` i `client/src/api/type.ts` oraz do widoków klienta**, inaczej nie zostanie zapisane ani pokazane.

### `settings`

Kolekcja `settings` przechowuje starszy model ustawień czasowych (`night_hour`, `settings`, `cwu_settings`). Aktualny scheduler korzysta z `devices.schedules`, a nie z tej kolekcji.

## 5. Telemetria pompy

Endpoint `POST /api/hp/add` jest obsługiwany przez `addHp` w [`server/src/controllers/hp.controller.ts`](server/src/controllers/hp.controller.ts).

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

`co` wysyła `POST /api/hp/add?rootId=<id>` co 10 s, gdy sprężarka pracuje, i co 30 s w spoczynku. Komunikat WebSocket `operation` powoduje wcześniejszą wysyłkę. Wysyła też wtedy, gdy CHPC nie odpowiada i `HP` jest puste: serwer nie zapisuje takiej telemetrii, ale odsyła operację, więc sterownik zna `work_mode` przy odłączonej pompie. Treść:

- `HP` — JSON z CHPC (`StatsSerial()`), przekazany bez zmian;
- `PV` — dane z falowników: `total_power`, `total_prod`, `total_prod_today`, `temperature`, `panels[]` (`serial`, `port`, `power`, `prod_today`, `prod_total`, `temperature`);
- `time` w formacie `"YYYY.MM.DD HH:MM:SS"` (z kropkami, czas polski);
- `work_mode`, `co_min`, `co_max`, `cwu_min`, `cwu_max`, `co_pomp`, `cwu_pomp`, `pv_power`, `controller_mode` (`OFF`, `CLOUD`, `MANUAL_CO`, `MANUAL_CWU`);
- estymacja COP zbiornika: `cop`, `cop_min`, `cop_max`, `t_min`, `t_max`, `cop_bottom_start`;
- liczniki diagnostyczne: `serial_queue_overflow`, `serial_read_timeout`, `serial_receive_overflow`, `pv_crc_error`, `hp_json_error`, `pv_frame_error`, `cloud_http_status`, `cloud_request_error`, `websocket_disconnect`, `cloud_response_parse_error`, `operation_validation_error`, `preference_validation_error`.

Klucze `HP`, na których polegają `co` i chpc-web (nie wolno ich zmieniać ani usuwać):

- COP: `HPS` (>0 = sprężarka pracuje), `Tho`, `Ttarget`, `lt_pow` (Wh od startu sprężarki), `lt_hp_on` (s pracy bieżącej lub ostatniej);
- widoki: `F`, `CO`, `Ttarget`, `Tmin`, `Tmax`, `Tbe`, `Tae`, `Tsump`, `Tho`, `EEV`, `EEV_dt`, `EEV_pos`, `Watts`, `WWatt`, `HCS`, `CCS`, `EEVmax`, `EEVmin`;
- błędy: `ERR` (kod ostatniego zdarzenia), `ERRn` (numer zdarzenia, rośnie przy każdym), `ERRc` (licznik błędów; 5 = blokada).

### Błędy sterownika

Gdy `HP.ERRn` różni się od poprzedniego rekordu, a `HP.ERR` ≠ 0, serwer zapisuje kod w polu `error_code` nowego rekordu (`detectErrorEvent` w [`server/src/services/hp.service.ts`](server/src/services/hp.service.ts)). `GET /api/hp/last-error` zwraca najnowszy rekord z `error_code` z ostatnich 24 godzin (okno kroczące). Wyjątek: gdy ostatnia telemetria ma `HP.ERRc` ≥ 5 (sterownik zablokowany), okno nie obowiązuje i błąd jest zwracany aż do odblokowania. Klient pokazuje czerwony dzwonek przed „T:” w widoku głównym (na telefonie w osobnym wierszu nad temperaturą; bez błędu ten wiersz nie istnieje), czerwony wiersz na liście danych oraz w zakładce Ustawienia błąd w dwóch liniach, data i pod nią opis (`errorLine` w [`client/src/utils/errors.ts`](client/src/utils/errors.ts)), licznik błędów i przyciski „Odblokuj” (aktywny tylko przy blokadzie) i „Restart sterownika”.

Kody (`ERRC_*` w CHPC, [`client/src/utils/errors.ts`](client/src/utils/errors.ts) tutaj; zmieniać razem): 1 czujnik, 2 przeciążenie, 3 brak przepływu, 4 za mała moc, 5 Tho, 6 Tsump za wysoka, 7 Tbc, 8 Tae, 9 Tco, 10 przekaźnik, 11 blokada x5, 12 Tsump za niska. Czas błędu to czas pierwszego rekordu z nowym `ERRn`, więc jest dokładny do 10–30 s (CHPC nie ma zegara).

## 6. Scheduler

Implementacja znajduje się w [`server/src/services/scheduler.service.ts`](server/src/services/scheduler.service.ts).

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

Logika dni wolnych jest w [`server/src/services/calendar.service.ts`](server/src/services/calendar.service.ts). Zawiera święta stałe i ruchome, w tym Wigilię 24 grudnia. Scheduler i odczyt harmonogramów dla konkretnej daty korzystają z tej samej logiki.

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

Logika znajduje się w [`server/src/services/operation.service.ts`](server/src/services/operation.service.ts).

Serwis utrzymuje trzy mapy w pamięci procesu:

- `operations` — aktualna operacja do przekazania sterownikowi;
- `scheduledOperations` — ostatnia operacja wyliczona przez scheduler;
- `manualOperations` — ręczne nadpisania użytkownika.

### Kontrakt operacji z `co`

Odpowiedź na każdy `POST /api/hp/add` ma postać `{"operation":{…}}`. **Wszystkie wartości są napisami**, np. `"1"`, `"45"`. Klucze:

- `work_mode`: `M`, `A`, `CWU`, `OFF` (`co` przyjmuje też `PV`, którego serwer nie wysyła);
- `force`, `co_pomp`, `hot_pomp`, `cold_pomp`, `sump_heater`: `"0"` albo `"1"`;
- `co_min`, `co_max`, `cwu_min`, `cwu_max`;
- `working_watt`, `eev_max_pulse_open`, `eev_min_pulse_open`, `eev_setpoint`;
- **akcje jednorazowe** `error_reset` i `restart` (wartość `"1"`), kolejkowane przez `POST /api/operation/action {action}`. Trafiają do dokładnie jednej odpowiedzi `/hp/add` i nigdy nie są scalane z operacją ręczną ani z harmonogramu. Endpoint wysyła też komunikat WebSocket `{type:"operation"}`, więc akcja dociera do pompy w kilka sekund.

`co` zamienia zmienione wartości na komendy RS-485 (tabela w punkcie 13) i nie wysyła ponownie wartości, która się nie zmieniła. Pusta operacja `{}` nic nie zmienia.

CHPC nie potwierdza komend, więc `co` po każdym odczycie porównuje stan zgłoszony przez pompę z oczekiwanym i przy różnicy wysyła komendę jeszcze raz:

- `HP.CO` — oczekiwane `1` dla `work_mode` innego niż `OFF`, `0` dla `OFF` i w lokalnym trybie `OFF`. `co_on` to zgoda na start sprężarki; CHPC trzyma ją w EEPROM i można ją zmienić na samej pompie, ale chmura (albo lokalny `OFF`) ją przywraca;
- `HP.F` — porównywane tylko przy `HPS = 0` i tylko gdy serwer przysłał `force` (albo w trybie `PV`), bo CHPC przyjmuje wymuszenie tylko w spoczynku i kasuje je przy każdym zatrzymaniu.

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
- scheduler automatycznie wywołuje `clearManualOperation`, gdy przechodzi z aktywnego harmonogramu do braku aktywnego harmonogramu.

Nie ma osobnego przycisku wyłączania operacji ręcznej w interfejsie.

### Walidacja w trzech miejscach, każda po cichu

- chpc-web nie sprawdza nic: ani interfejs, ani `/operation/set` nie mają kontroli zakresów;
- `co` zaokrągla `co_*`/`cwu_*` do pełnych stopni w zakresie 1–50 i przyjmuje `working_watt` 0–25599, `eev_max_pulse_open` i `eev_min_pulse_open` 0–255 oraz `eev_setpoint` 0–255,99;
- CHPC stosuje własne limity (punkt 13).

Wartość odrzucona dalej w łańcuchu nadal wygląda w interfejsie na „ustawioną”. To, czego pompa naprawdę używa, widać w telemetrii (`WWatt`, `EEVmax`, `EEVmin`, `Tmax`).

## 8. Endpointy serwera

Trasy są zdefiniowane w [`server/src/middleware/api.routes.ts`](server/src/middleware/api.routes.ts).

| Metoda i endpoint | Znaczenie |
|---|---|
| `GET /api/devices` | lista urządzeń |
| `POST /api/devices` | utworzenie urządzenia (nieużywane przez klienta; duplikat = 400) |
| `PUT /api/devices/:rootId` | zmiana nazwy urządzenia `{name}` |
| `POST /api/devices/register` | rejestracja sterownika po SN; zwraca istniejący albo nowy `rootId` |
| `GET /api/device/properties` | wartości domyślne urządzenia |
| `PUT /api/device/properties` | zapis wartości domyślnych |
| `GET /api/hp` | ostatnia telemetria |
| `GET /api/hp/all` | dane od początku bieżącego roku |
| `GET /api/hp/dates` | dni, dla których są dane |
| `GET /api/hp/4day?date=...` | dane dla jednego dnia |
| `GET /api/hp/monthly-summary` | podsumowania energii |
| `GET /api/hp/last-error` | ostatni błąd sterownika z 24 h (przy blokadzie bez limitu czasu) |
| `POST /api/hp/add` | zapis telemetrii i zwrot operacji |
| `POST /api/hp/clear` | usunięcie telemetrii urządzenia |
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

WebSocket ([`server/src/middleware/webSocet.ts`](server/src/middleware/webSocet.ts)) działa na `/ws?rootId=…`. Sterownik `co` łączy się nim i po komunikacie `{type:"operation", rootId}` od razu wysyła `/hp/add`. Przeglądarki dostają `update` po zapisie telemetrii.

## 9. Klient React

Routing jest w [`client/src/index.tsx`](client/src/index.tsx).

Główne widoki:

- `/` i `/hp` — bieżący stan pompy;
- `/data` — tabela danych historycznych;
- `/chart` — wykresy i podsumowania;
- `/settings` — ręczne ustawienia operacji (przycisk „Zmień”, komunikat „Polecenie wysłane do sterownika.”), błąd sterownika, „Odblokuj” i „Restart sterownika”, dane sterownika;
- `/schedules` — wartości domyślne i harmonogramy;
- `/devices` — wybór sterownika i zmiana jego nazwy.

Docelowy telefon to Samsung Galaxy S20 (360×800 CSS px); układ sprawdzany jest też przy 368, 384 i 412 px, bo tyle zależnie od ustawień zgłaszają telefony z Androidem. Widok główny ma klasę `hp-page`: na telefonie karty mają pełną szerokość, a treść zawija się wewnątrz karty. Na telefonie szare karty i tabela danych sięgają od krawędzi do krawędzi ekranu, bez bocznych marginesów (reguły z prefiksem `body` w [`client/src/style.css`](client/src/style.css)). Reguły dla telefonu są w blokach `@media (max-width: 560px)`: menu pokazuje same ikony (`.nav-label` ukryte, nazwa w `title`), wiersze „etykieta + pola” w Ustawieniach i Harmonogramach są flexem z etykietą 9.5rem (pola min i max w jednej linii), wykres ma własną wysokość w `.chart-area`, a `.app-main` ma dolny odstęp na stałą stopkę. Strona nie może mieć przewijania w poziomie (wyjątek: tabela danych we własnym kontenerze).

### Urządzenia i Root ID

- Jedyne urządzenie jest wybierane automatycznie tylko po przekierowaniu z `DeviceGuard` (`state.auto`), a nie przy świadomym wejściu na `/devices`.
- Kafelki sterowników stoją obok siebie (zawijane do kolejnych wierszy), a na ekranach ≤ 560 px jeden pod drugim. Kafelek pokazuje nazwę, a pod nią małą czcionką `deviceId`; gdy nazwy nie ma, w tytule kafelka jest samo `deviceId`. Mała ikonka ołówka w rogu kafelka otwiera popup „Dane sterownika” ([`DeviceEditModal`](client/src/components/DeviceEditModal.tsx)): Root ID i Device ID są wyłączone z edycji, nazwę można wpisać lub poprawić (`PUT /api/devices/:rootId`). Popup zamyka „Anuluj”, Esc albo kliknięcie poza nim.
- Nie ma formularza dodawania sterownika (sterowniki rejestrują się same, punkt 3).
- Zakładka Ustawienia ma sekcję „Sterownik” z nazwą, `deviceId` i Root ID oraz przyciskiem „Zmień”, który otwiera ten sam popup. Po zapisie nowa nazwa trafia też do wybranego urządzenia (stopka, `localStorage`). Zmiana sterownika odbywa się przez ikonkę w stopce.

### API klienta

`client/src/api/api.ts` buduje adresy API oraz automatycznie dodaje `rootId` i `deviceId` wybranego urządzenia. Kontrakty typów są w `client/src/api/type.ts`.

### Zakładka Dane

`client/src/utils/utils.ts` pobiera dane z `/hp/4day` i:

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

[`client/src/utils/energy-cost-g12w.ts`](client/src/utils/energy-cost-g12w.ts) liczy koszt w taryfie G12w. Parser czasu przyjmuje zarówno `YYYY-MM-DD`, jak i `YYYY.MM.DD` (format z `co`) i zawsze używa czasu warszawskiego. W widoku głównym `lt_pow` jest opisane jako „Energia cyklu” w Wh, a `WWatt` jako „Limit mocy” (w Ustawieniach pole `working_watt` to „Limit mocy [W]”).

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
- [`server/scheduler.test.ts`](server/scheduler.test.ts).

Testy używają `mongodb-memory-server`, więc nie modyfikują produkcyjnej bazy. Sprawdzają między innymi:

- zapis i odczyt danych API;
- rejestrację sterownika (nowy SN bez nazwy, znany SN, brak `deviceId`);
- zmianę nazwy urządzenia (bez zmiany `deviceId`, pusta nazwa, nieznany `rootId`);
- zapis `EEVmin` i wykrywanie zdarzeń błędów (także błąd starszy niż 24 h przy blokadzie);
- jednorazowe akcje `error_reset` i `restart`;
- wybór rodzaju harmonogramu przez tryb pracy (`A` → CO, `CWU` → CWU, `M`/`OFF` → żaden) i przerwę `off` w obu trybach harmonogramu;
- ręczne nadpisanie harmonogramu;
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

- `co`: `pio test -e native` w `heatpump` (38 testów: kontroler operacji, parser PV, ramki Modbus).
- CHPC: `pio test -e native` w `chpc` (symulacja firmware, 6 zestawów, 44 testy). Dodatkowo scenariusze Wokwi w `chpc/test-wokwi/`.

Ostatni pełny przebieg (2026-09-24): serwer chpc-web 12/12 + `tsc` OK (po dodaniu edycji nazwy i błędu przy blokadzie: 20/20), klient `vite build` OK, `co` 38/38, CHPC 44/44, E2E 48/48 (30 funkcjonalnych + 18 układu widoków), build Pro Mini OK.

### E2E całego łańcucha

Testy są w repozytorium `chpc`, w katalogu `test/e2e/`. `bridge.exe` łączy symulowany firmware CHPC z prawdziwym kodem `co` (`operation_parser`, `operation_controller`, `modbus_frame`, `cop_estimator`), a `run-e2e.mjs` odgrywa rolę HTTP `co` wobec lokalnego chpc-web i steruje interfejsem przez Playwright z systemowym Edge.

1. W chpc-web: `npm run local` (baza, serwer 4001, klient 5173).
2. W heatpump: `pio test -e native` (pobiera ArduinoJson potrzebny do mostu).
3. W `chpc/test/e2e`: `npm install && sh build-bridge.sh && node run-e2e.mjs`.

Wyniki trafiają do `chpc/docs/raport-testow/` (tylko lokalnie, poza gitem): `e2e-wyniki.json`, `e2e-log.txt` i zrzuty ekranów (kroki `01`–`09` oraz `uklad-<strona>-<szerokość>.png` dla 360, 768 i 1280 px). Kopia raportu z opisem (`RAPORT.md`) leży w `chpc-web/test/raport-testow/`, również poza gitem. Test tworzy urządzenie „Pompa testowa (E2E)” w lokalnej bazie.

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
11. Zmiana pola, klucza lub komendy przechodzi przez wszystkie trzy repozytoria, a wdrożenie zaczyna się od chpc-web.

## 13. Sterownik `co` (ESP32, repo heatpomp)

Firmware PlatformIO (`esp32dev`), kod w `src/`. Szczegóły: `README.md` i `docs/server-driven-refactor-2026-09-20.md` w tamtym repozytorium.

- **Odczyty.** Co 10 s (sprężarka pracuje) lub 30 s (spoczynek) odpytuje CHPC; co dziesiąty cykl odpytuje DTU Hoymiles (Modbus, dwa zapytania po pięć portów). Szacuje COP zbiornika 300 l w każdym cyklu grzania.
- **Tryb sterownika** (przycisk na GPIO5, zapis w NVS): `OFF → CLOUD → MANUAL_CO → MANUAL_CWU → OFF`. Pierwsze naciśnięcie tylko pokazuje bieżący tryb, kolejne przechodzą dalej; wybrany tryb jest stosowany 5 s po ostatnim naciśnięciu. Tylko w `CLOUD` stosuje operacje z chmury. `OFF` wysyła do pompy sekwencję bezpieczeństwa (CO off, force off, pompy off) i wyłącza przekaźniki. W `work_mode = PV` `force` wynika z produkcji PV (≥ 2000 W), a nie z serwera.
- **Strony WWW na porcie 80** (sieć lokalna i otwarty AP `HP-CO-setup`): `/` podgląd telemetrii, `/telemetry.json`, `/install` (Basic Auth: Wi-Fi, SN i Root ID tylko do odczytu, status rejestracji), `/save`.
- **Konfiguracja.** Wi-Fi i Root ID w NVS; `src/secrets.h` daje tylko wartości domyślne, a `CLOUD_ROOT_ID` jest opcjonalny.
- **Kluczowe pliki kontraktu:** `cloud_client.cpp` (HTTP, WebSocket, rejestracja), `telemetry.cpp`, `operation_parser.cpp`, `operation_controller.cpp`, `modbus_frame.cpp`.

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

## 14. Firmware CHPC (Pro Mini, repo chpc)

Fork [gonzho000/chpc](https://github.com/gonzho000/chpc) (GPLv3) na Arduino Pro Mini (ATmega328P). Cały firmware to jeden plik `src/CHPC_firmware.ino`. Szczegóły: `CLAUDE.md` w tamtym repozytorium.

- Steruje sprężarką, pompami strony gorącej i zimnej, grzałką karteru i zaworem 4-drogowym; prowadzi silnik krokowy EEV, czyta czujniki DS18B20 i mierzy moc przekładnikiem prądowym. Ma wyświetlacz 1602 i przyciski.
- Zabezpieczenia i ich kody błędów opisuje punkt 5 („Błędy sterownika”). Po 5 błędach sterownik się blokuje: odpowiada po RS-485, ale nie steruje, do czasu `0x10` albo `0x11`.
- Limit mocy równy dokładnie 3200 W celowo wyłącza zabezpieczenie przepływu („Err CP”).
- Pamięć Flash jest zajęta w 94,3% (28 964 B, stan na 2026-09-24), więc nowe klucze JSON trzeba dodawać oszczędnie.
- Tryb produkcyjny RS-485 to `RS485_PYTHON`: magistrala niesie tylko odpowiedzi dla `co`. Build `wokwi` (`RS485_HUMAN`) nie może trafić na pompę podłączoną do `co`.

## 15. Znane niezgodności i otwarte kwestie

- Kontrola klucza API (`verifyApiKey`) jest wyłączona; `POST /api/operation/set` jest otwarte i bez walidacji.
- Zwykłe ustawienia z `/operation/set` czekają na kolejny cykliczny POST `co` (10–30 s); natychmiast (WebSocket) docierają tylko akcje jednorazowe.
- `0x04` powyżej `T_SETPOINT_MAX` i `0x05` powyżej `T_DELTA_MAX` CHPC po cichu ignoruje.
- Liczniki diagnostyczne `co` i `controller_mode` nie są zapisywane w bazie (ścisły schemat); widać je tylko w `GET /api/hp` do restartu serwera i na stronie `/` sterownika.
- Najstarszy sterownik ma Root ID wkompilowany w `secrets.h` (nie rejestruje się); jego `deviceId` zmieniono w bazie z `hp-1` na SN. Serwer trzyma `deviceId` w pamięci (`deviceInfoByRoot`), więc po zmianie w bazie trzeba zrestartować serwer.