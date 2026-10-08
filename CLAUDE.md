# CLAUDE.md

Ten plik jest przewodnikiem dla Claude Code (claude.ai/code) i dla ludzi pracujących z tym repozytorium. **chpc-web jest wiodącym projektem całego systemu.** Repozytorium zawiera cały łańcuch sterowania pompą ciepła: serwer, klienta i oba firmware w `devices/`. Zmiana kontraktu (pola telemetrii, klucze operacji, komendy RS-485) zaczyna się od tego opisu i obejmuje wszystkie części, których dotyczy, najlepiej w jednym commicie.

Commity, komentarze i dokumentacja są po polsku.

**Dokumentacja dla ludzi** jest w [`docs/README.md`](docs/README.md): opis systemu, schemat i dokumentacja każdego modułu w trzech częściach (opis biznesowy, zasada działania ze schematami, dokumentacja techniczna). Moduły aplikacji mają ją w `docs/moduly/<moduł>/`, a firmware w `devices/<firmware>/docs/`. Zmiana w module obejmuje też jego dokumentację i komentarze w kodzie (nagłówek pliku i komentarz przy logice nieoczywistej).

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
| `devices/water-pressure-tank/` | firmware hydroforu „Hydrofor” (ESP32 DevKit z WROOM-32, typ `water-pressure-tank`), punkt 5b; dokumentacja w `devices/water-pressure-tank/docs/` |
| `devices/switch/` | firmware włącznika „Włącznik” (płytka „ESP32 Relay AC X1” z ESP32-WROOM-32E i przekaźnikiem 30 A, typ `switch`), punkt 5d; dokumentacja w `devices/switch/docs/` |
| `devices/pellet-boiler-pelux200/` | firmware sterownika pieca „Piec Pellux 200” (ESP32-C3 SuperMini z modułem RS-485 HW-519, typ `pellet-boiler-pelux200`): na magistrali ecoMAX kotła udaje moduł ecoNET, czyta dane i ustawienia (bez zapisu), punkt 5c; instrukcja w `README.md`, podłączenie i protokół w `docs/` |
| `test/e2e/` | test całego łańcucha (punkt 11) |
| `scripts/` | środowisko lokalne (`npm run local`), dane demonstracyjne (`seed-local.mjs`), symulatory hydroforu i włącznika |

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
- `modules/water-pressure-tank/` — hydrofor: uruchomienia, wodomierz, czas kompresora;
- `modules/pellet-boiler-pelux200/` — kocioł pelletowy Pellux 200 (regulator ecoMAX): odczyty w kolekcji `pellet_boiler_pelux200`, interwał odpytywania (punkt 5c);
- `modules/switch/` — włącznik: przekaźniki i ich tryby (`switch_relays`), harmonogramy (`switch_schedules`), historia włączeń (`switch_activations`), polecenia liczone przy każdym zgłoszeniu stanu (punkt 5d);
- `modules/photovoltaic/` — fotowoltaika: widoki z odczytów DTU wysyłanych przez `co` (kolekcje `pv` i `hp`, tylko odczyt; punkt 5a).

`core` i każdy moduł mają ten sam układ: `controllers/` (`*.controller.ts`), `services/` (`*.service.ts`), `models/` (jeden `*.model.ts` na kolekcję albo osadzony schemat, np. `device.model.ts`, `hp.model.ts`, `pv.model.ts`, `schedule.model.ts`, `water-pressure-tank-run.model.ts`), a w katalogu głównym `types.ts` (typy wspólne dla warstw) i `routes.ts`. Moduł ma też `device-type.ts` (wpis do rejestru rodzajów). W `core` są dodatkowo `middleware/` (`auth.ts`, `device-context.ts` — `rootId`/`deviceId`) oraz `app.ts`, `websocket.ts`, `time.ts` (strefa i granice dni w Warszawie) i `device-types.ts` (rejestr). Serwisy `core`: `device`, `device-info` (typ i `deviceId` w pamięci), `calendar` (święta, `scheduleDayMatches` dla harmonogramów włącznika), `meteo`. Typ `WeekDay` (dni harmonogramu) jest w `core/types.ts` serwera i klienta, bo używają go pompa i włącznik; `modules/heat-pump/types.ts` i `client/src/devices/heat-pump/types.ts` go re-eksportują.

Moduły importują tylko z `core`, a nie z siebie nawzajem. `core` sięga do modułów tylko tam, gdzie je składa: trasy (`core/routes.ts`), dokument `devices` (`core/models/device.model.ts` i `core/types.ts`) i **rejestr rodzajów sterowników** (`core/device-types.ts`). W rejestrze każdy moduł podaje swój `device-type.ts`: ustawienia nowego urządzenia (`initialProperties`), ustawienia odsyłane przy zgłoszeniu (`controllerSettings`; hydrofor, kocioł i włącznik tak, pompa nie), aktualizacje przez sieć na zlecenie z aplikacji (`firmwareUpdates`; hydrofor, włącznik i kocioł) i obsługę dodatkowych pól zgłoszenia (`onRegister`, wołane po zapisie urządzenia; włącznik tworzy przekaźniki z pola `relays`) oraz reakcję na zapis ustawień (`onPropertiesSaved`; pompa kasuje ręczne nadpisania). Nowy rodzaj sterownika to moduł w `modules/`, wpis w rejestrze, trasy w `core/routes.ts` i wartość w `DeviceType`. Adresy API i kolekcje nie zależą od tego podziału.

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
3. uruchamia `startScheduler()` (pompa ciepła) i `startPelletBoilerScheduler()` (harmonogram kotła pelletowego, punkt 5c);
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

**Jeden fizyczny sterownik może mieć kilka ról.** Ten sam `deviceId` (SN) może być zarejestrowany pod kilkoma `deviceType` (tak było 2026-10-01–02, gdy `co` był `heat_pump` i `pellet-boiler-pelux200`; od 2026-10-03 piec ma osobną płytkę, ale mechanizm zostaje): każda rola to osobny dokument w `devices` z własnym `rootId`. Rejestracja szuka po parze `{deviceType, deviceId}`, a każdy endpoint sterownika ma w `controllerPaths` ([`device-context.ts`](server/src/core/middleware/device-context.ts)) przypisany rodzaj, więc szukanie po samym `deviceId` jest zawężone do niego. Nowy endpoint sterownika trzeba tam dopisać.

**Endpointy sterownika (`POST /hp/add`, `POST /pv/add`, `POST /pellet-boiler-pelux200/add`, `POST /water-pressure-tank/add`, `PUT /water-pressure-tank/settings`, `POST /switch/state`, `PUT /switch/mode`)** przyjmują też sam `deviceId` (SN): bez `rootId` serwer znajduje urządzenie po `deviceId`. `co` wysyła `deviceId` zawsze, a `rootId` tylko wtedy, gdy ma go w NVS. Gdy przyszły oba, a `rootId` należy do innego `deviceId`, serwer odpowiada **409**; `co` kasuje wtedy swój Root ID i rejestruje się ponownie. Nieznany `deviceId` daje 404. Pozostałe endpointy wymagają `rootId`.

Urządzenia domyślnego nie ma: żądanie bez `rootId` (poza wyjątkiem powyżej) dostaje 400, a WebSocket bez `rootId` jest zamykany (dawniej takie żądanie trafiało do `hp-1`, które tworzyło się samo, jeśli go nie było). Ścieżki `/devices` i `/devices/register` są publiczne względem kontekstu urządzenia.

Po stronie klienta wybrane urządzenie jest przechowywane w `localStorage` pod kluczem `chpc.selectedDevice`. [`DeviceProvider`](client/src/core/context/DeviceContext.tsx) udostępnia wybór, zmianę i czyszczenie urządzenia. `DeviceGuard` przekierowuje użytkownika do `/devices`, jeśli nie wybrano pompy. Stopka „Aktywne urządzenie” z przyciskiem zmiany jest widoczna tylko wtedy, gdy `GET /api/devices` zwraca co najmniej dwa sterowniki (sprawdzane przy każdym wyborze urządzenia); przy jednym nie ma na co przełączyć. Dawny klucz `chpc.hideDeviceFooter` nie jest już używany.

### Rejestracja sterownika

`POST /api/devices/register` z `{deviceId, deviceType?, name?, version?, ip?}` zwraca urządzenie o danym `deviceId`: **201**, gdy zostało utworzone, i **200** z istniejącym `rootId`, gdy już było. Nieznany `deviceType` daje 400. To jest **zgłoszenie sterownika**: hydrofor i włącznik wywołują je raz na każdy start (włącznik z liczbą przekaźników `relays`), a `co` (każda rola) przy każdym starcie i po każdej zmianie adresu IP, także z zapisanym Root ID, z `deviceId` = SN (fabryczny MAC ESP32, 12 znaków hex). Gdy zwrócony `rootId` różni się od zapisanego, `co` go podmienia i otwiera WebSocket od nowa. Nazwa ze zgłoszenia trafia tylko do nowego urządzenia. `ip` (adres IPv4 sterownika w sieci lokalnej, wysyłany przez `co`, hydrofor i włącznik) trafia do `ipAddress`; inny format i `0.0.0.0` są pomijane. Odpowiedź ma pola urządzenia (`rootId`, `deviceType`, `deviceId`, `name`, `isDefault`), a dla hydroforu także `settings` (`compressor_seconds` i ewentualnie oferta OTA `firmware`), dla włącznika `settings` z `default_on_minutes` i ewentualnie `firmware`, dla kotła `settings` z `poll_interval_seconds` i ewentualnie `firmware`. Oferta `firmware` jest tylko przy zleceniu „Aktualizuj” (punkt 5e). Sterownik zapisuje `rootId` w NVS. Nieudane zgłoszenie `co` ponawia co 60 s, hydrofor co 10 s, włącznik co 30 s. Telemetrię wysyła także przed rejestracją, z samym `deviceId`; serwer przyjmuje ją, gdy urządzenie o tym SN już istnieje.

**Sterowniki dodaje się tylko przez samodzielną rejestrację.** Klient nie ma funkcji dodawania sterownika. Nowy sterownik pojawia się na liście w `/devices` bez nazwy, a użytkownik nadaje ją przez `PUT /api/devices/:rootId` z `{name}` (zmienia tylko nazwę; `rootId` i `deviceId` nie podlegają edycji; pusta nazwa jest dozwolona).

`POST /api/devices` pozostał na serwerze (m.in. dla testu E2E), ale klient go nie używa. Dla istniejącego `deviceId` zwraca błąd 400 („Device already exists.”).

## 4. Model danych MongoDB

### `devices`

Model główny to `DeviceModel` z kolekcją `devices`. Urządzenie zawiera między innymi:

- `deviceType` — `heat_pump`, `water-pressure-tank` (hydrofor), `pellet-boiler-pelux200` (kocioł) albo `switch` (włącznik); scheduler obsługuje tylko `heat_pump`;
- `deviceId` — identyfikator sterownika, SN (MAC ESP32); najstarszy sterownik miał `hp-1`, w produkcji zmienione na SN (także w rekordach `hp`, 2026-09-26);
- `name` — opcjonalna nazwa nadana przez użytkownika (domyślnie pusta; rejestracja automatyczna jej nie ustawia). Klient pokazuje `name`, a gdy jest pusta — `deviceId` (`deviceLabel` w [`DeviceContext.tsx`](client/src/core/context/DeviceContext.tsx));
- `isDefault` — sterownik domyślny, otwierany po starcie aplikacji; najwyżej jeden (`PUT /api/devices/:rootId/default`);
- `firmwareVersion`, `firmwareSeenAt` — wersja firmware i czas ostatniego zgłoszenia, które ją niosło (pole `version`; starsze sterowniki go nie wysyłają, więc zostaje ostatnia znana);
- `firmwareUpdate` — zlecenie aktualizacji z aplikacji `{version, requestedAt}` (przycisk „Aktualizuj”, punkt 5e); znika, gdy sterownik zgłosi oferowaną wersję;
- `ipAddress`, `ipSeenAt` — adres IPv4 sterownika w sieci lokalnej i czas zgłoszenia, które go niosło (pole `ip`; bez niego zostaje ostatni znany); klient pokazuje go w karcie „Sterownik” w Ustawieniach (`DeviceAddress`) jako odnośnik do stron sterownika;
- `properties` — ustawienia domyślne;
- `schedules` — osadzone definicje harmonogramów pompy (włącznik ma własną kolekcję `switch_schedules`).

### `properties`

Ustawienia domyślne pompy:

- `co_min`, `co_max`;
- `cwu_min`, `cwu_max`;
- `work_mode` — `M`, `A`, `CWU` albo `OFF`.

Domyślny `work_mode` modelu to `CWU` (dopisywany też hydroforowi, który go nie używa).

Ustawienia hydroforu (punkt 5b): tylko `compressor_seconds` (1–3600); nowy hydrofor dostaje przy zgłoszeniu 30 s. Dawne zbiorniki i progi presostatu (`tanks`, `pressure_low`, `pressure_high`) usunięto w wersji 1.3.0.

Ustawienie włącznika (punkt 5d): `default_on_minutes` — domyślny czas „Włącz” w pełnych minutach 0–10080 (0 = bez limitu), nowy włącznik dostaje 30.

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

### `water_pressure_tank` i `water_meter`

`water_pressure_tank` — uruchomienia pompy hydroforu, jeden dokument na `runId` sterownika: `pumpStart`, `pumpEnd`, `compressorStart`, `compressorEnd`, `restarts`, `manualSeconds` (czas ręcznego włączenia kompresora, odejmowany od czasu pompy), `timeApproximate`, `lastSeenAt`, `compressorRunning` (stan kompresora z ostatniej wiadomości; po „Uruchom na N s” `compressorEnd` zostaje z poprzedniego wyłączenia). Indeksy: unikalny `{rootId, runId}` i `{rootId, pumpStart}`. Wody w rekordzie nie ma: liczy ją serwer przy odczycie (punkt 5b); dawne `waterLiters`, `waterAirBaseLiters` i `waterMembraneLiters` zostają w starszych dokumentach, ale nie są używane. `water_meter` — ręczne odczyty wodomierza: `readAt`, `valueM3`, `note`; indeks `{rootId, readAt}`.

### `switch_relays`, `switch_schedules` i `switch_activations`

Włącznik (punkt 5d). `switch_relays` — jeden dokument na przekaźnik (unikalny `{rootId, relay}`, `relay` od 1): `name` (≤ 40 znaków), `mode` (`schedule`, `on`, `timer`, `off`), `until` (koniec `timer`), `modeSource` (`app` albo `controller`), `modeChangedAt`, stan ze sterownika `on`, `changedAt`, `lastSeenAt`. Tryb jest trwały: restart serwera go nie kasuje. `switch_schedules` — wpisy harmonogramu: `relay`, `enabled`, `dayOfWeek` (`WeekDay`) albo `date`, `startTime`, `endTime`; indeks `{rootId, relay}`. `switch_activations` — włączenia: `relay`, `onAt`, `offAt` (`null` = trwa), `source` (`schedule`, `app`, `controller`), `approximate`; indeksy `{rootId, onAt}` i `{rootId, relay, offAt}`.

### `pellet_boiler_pelux200_commands`

Zlecenia zmiany parametrów regulatora z aplikacji (punkt 5c): `kind` (`ecomax`, `mixer`), `mixer` (od 1), `index`, `value` (surowa), `previous`, `label`, `status` (`pending`, `sent`, `done`, `error`, `replaced`), `error`, `sentAt`, `doneAt`; indeksy `{rootId, createdAt}` i `{rootId, status, createdAt}`. Brak retencji.

### `pellet_boiler_pelux200_settings`

Ostatni odczyt ustawień regulatora kotła (punkt 5c), jeden dokument na `rootId` (unikalny): `readAt`, `deviceId`, surowe odpowiedzi regulatora jako hex (`ecomax_parameters`, `mixer_parameters`, `thermostat_parameters`, `schedules`, `regulator_data_schema`). Rozkodowanie przy odczycie.

### `firmware_images` i `firmware_offers`

Firmware sterowników z aktualizacją przez sieć (OTA). `firmware_images`: `deviceType`, `version`, `data` (plik `.bin`, ok. 1 MB), `size`, `description` (opis wersji), `sha256`; indeks unikalny `{deviceType, version}`. `firmware_offers`: jeden dokument na rodzaj: `version` (oferowana), `previousVersion`, `enabled`. W bazie zostają tylko te dwie wersje (przy zmianie oferty starsze pliki są kasowane).

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

`co` wysyła `POST /api/hp/add?deviceId=<SN>&rootId=<id>` co 10 s, gdy sprężarka pracuje, i co 30 s w spoczynku. Komunikat WebSocket `operation` powoduje wcześniejszą wysyłkę. Wysyła też wtedy, gdy CHPC nie odpowiada i `HP` jest puste: serwer nie zapisuje takiej telemetrii, ale odsyła operację, więc sterownik zna `work_mode` przy odłączonej pompie. `HP` jest czyszczone dopiero po **3 kolejnych odczytach bez odpowiedzi** CHPC (`HeatPumpLinkWatch`, `co` od 1.2.2; ok. 90 s w spoczynku, 30 s przy pracy sprężarki); wcześniej `co` w kółko wysyłał ostatni udany odczyt, więc po wyłączeniu sterownika pompy aplikacja pokazywała stare temperatury jako aktualne (produkcja 2026-10-08: 6 godzin identycznych wartości). Kafelek pompy na liście pokazuje „Brak łączności” po 5 min bez zapisanej telemetrii (uwaga, po godzinie błąd). Treść:

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

### Fotowoltaika jako osobny rodzaj (`photovoltaic`)

Widoki PV dla użytkownika (moduł serwera `modules/photovoltaic/`, klient `devices/photovoltaic/`). **DTU nadal czyta `co`** i wysyła `pv/add` jak wyżej (firmware bez zmian); urządzenie „Fotowoltaika” (`deviceType: 'photovoltaic'`, ten sam SN co `co`) zakłada serwer przy pierwszym odczycie PV (`ensurePhotovoltaicDevice` w `pv.service.ts`, `registerDevice`). Moduł tylko czyta: odczyty leżą pod `rootId` pompy, więc źródło to urządzenie `heat_pump` o tym samym `deviceId`; kolekcje `pv` i `hp` czyta sterownikiem bazy (`mongoose.connection.collection`), bez modeli modułu pompy. Dzień z odczytami `pv` bierze dane z `pv` (z panelami), dzień bez nich — podsumowanie PV z `hp` (do 2026-09-26: `PV.total_power`, `total_prod`, `total_prod_today`, `temperature`; historia od 2026-05-08).

- `GET /photovoltaic/current` — moc (suma mocy DC portów: mapa Modbus Hoymiles nie ma mocy AC), produkcja dziś, w roku (licznik całkowity − licznik na początku dnia pierwszego odczytu w roku; `yearFrom`), całkowita, temperatura, panele ze stanem (`produces` / `idle` / `offline` gdy `link` ≠ 1 / `alarm` gdy `alarm_code` ≠ 0), `stale` po 3 min;
- `GET /photovoltaic/day?date=` — przedziały 5 min (średnia moc, temperatura, produkcja), moc każdego panelu, energia i szczyt dnia;
- `GET /photovoltaic/summary?period=month&date=YYYY-MM | year&date=YYYY | total` — produkcja dnia = największe `total_prod_today` w dobie warszawskiej (`$group` po dniu, bez sortowania), sumy w dniach / miesiącach / latach;
- `GET /photovoltaic/readings?date=[&panel=serial-port]` — odczyty dnia od najnowszego, jeden na minutę;
- `GET /photovoltaic/inverters` — mikrofalowniki z ostatniego odczytu z panelami, seria z prefiksu SN jak w OpenDTU (1144 = HMS 2 porty, 1164 = HMS 4 porty).

Klient: Podgląd (moc, kafelki dziś / rok / łącznie / temperatura, krzywa mocy dnia ostatniego odczytu, panele po mikrofalownikach z paskiem mocy względem szczytu dnia i stanem), Dane („Odczyty dnia”: całość albo panel; „Dni miesiąca”: produkcja i szczyt dzień po dniu; CSV), Wykres (dzień: instalacja, moc paneli albo produkcja paneli — słupki kWh z `energyWh` = największe `prod_today` portu, na czerwono panele poniżej 85 % średniej; miesiąc / rok / całość: słupki kWh), Ustawienia (instalacja z DTU, lista parametrów DTU i mikrofalowników — tylko podgląd, `utils/parameters.ts`). Parametry, adresy rejestrów i wzorce widoków (S-Miles, OpenDTU, AhoyDTU): [docs/moduly/photovoltaic/parametry-i-wykresy.md](docs/moduly/photovoltaic/parametry-i-wykresy.md), zrzuty w `docs/moduly/photovoltaic/img/`. Dane demo z produkcji: `node scripts/seed-pv-local.mjs` (czyści bazę lokalną; zmyślone SN i numery mikrofalowników z zachowanym prefiksem). Komplet lokalnie: `node scripts/seed-local.mjs --days 10` (pompa i hydrofor, czyści bazę), potem `node scripts/seed-pv-local.mjs --keep` (historia PV do tej samej pompy), `node scripts/seed-pellet-local.mjs` (piec: odczyty z produkcji i ustawienia z kopii kotła) i `node scripts/simulate-switch.mjs --relays 2 --history` (włącznik na żywo); po wczytaniu restart serwera. Testy: `server/test/photovoltaic.test.ts` (7).

## 5b. Hydrofor (`water-pressure-tank`)

Pełny opis: [firmware](devices/water-pressure-tank/docs/1-opis-biznesowy.md) i [moduł serwera/klienta](docs/moduly/water-pressure-tank/1-opis-biznesowy.md); pierwotna specyfikacja w `devices/water-pressure-tank/docs/water-pressure-tank.md`. Sterownik (ESP32 DevKit z WROOM-32, przekaźnik na GPIO26; schemat podłączenia w części 3 dokumentacji firmware) ma zasilanie tylko w czasie pracy pompy: po 1 s od startu raz włącza kompresor na `compressor_seconds`, potem łączy się z Wi-Fi. Punkt dostępowy działa przez cały czas pracy.

- **Zgłoszenie** raz na start (`POST /devices/register`, typ `water-pressure-tank`, nazwa „Hydrofor”, `version`, `ip`); odpowiedź niesie ustawienia `{compressor_seconds}` (i ewentualnie `firmware`), które sterownik zapisuje w NVS. Zmiana ustawień w aplikacji działa od następnego uruchomienia pompy.
- **Kompresor ze strony `/` sterownika** (bez logowania, od wersji 1.3.0): „Włącz” (`POST /compressor/on`; praca do „Wyłącz”, najdłużej 30 min = `MANUAL_COMPRESSOR_MAX_SECONDS` 1800, pod stanem „WŁĄCZONY RĘCZNIE” duże odliczanie `mm:ss`), „Wyłącz” (`POST /compressor/off`, czerwony; kończy też zwykłą pracę) i „Uruchom na N s” (`POST /restart`, N = czas kompresora; dawne „Uruchom kompresor ponownie”). Łączny czas pracy po „Włącz” idzie w wysyłce jako `manualCompressorS`.
- **Czas kompresora na sterowniku:** sekcja „Kompresor” na `/install` (Basic Auth) zapisuje czas w NVS od razu (działa od następnego włączenia kompresora, także „Uruchom na N s”) i wysyła go `PUT /api/water-pressure-tank/settings`, który zmienia tylko `properties.compressor_seconds`. Niewysłaną zmianę sterownik ponawia co 10 s i po restarcie, a zgłoszenie nie nadpisuje jej wartością z chmury.
- **Wysyłka co 1 s** (`POST /api/water-pressure-tank/add?deviceId=…&rootId=…`, sam `deviceId` wystarcza; 404/409 jak w `/hp/add`): `{runId, pumpRunS, compressorStartS?, compressorEndS?, restarts, manualCompressorS?, queued?}` — czasy względne od startu sterownika; `manualCompressorS` (≥ 0, wysyłane, gdy > 0) serwer zapisuje jako `manualSeconds`. Serwer liczy daty ze swojego zegara: pierwsza wiadomość ustala `pumpStart = teraz − pumpRunS`, każda kolejna ustawia `pumpEnd` na chwilę odebrania, więc ostatnia przed utratą zasilania wyznacza koniec pracy pompy (dokładność 1 s). Uruchomienie jest „w toku”, gdy ostatnia wiadomość ma mniej niż 5 s (`RUN_IN_PROGRESS_MS`).
- **Aktualizacja firmware przez sieć (OTA).** Plik `.bin` leży w bazie (kolekcje `firmware_images` i `firmware_offers`, `core/services/firmware.service.ts`): oferowana wersja i jedna poprzednia, starsze są usuwane. Odpowiedź na zgłoszenie niesie `settings.firmware {version, url, sha256, request}` **tylko przy zleceniu „Aktualizuj”** z aplikacji (punkt 5e; adres to `<serwer>/api/firmware/water-pressure-tank/<wersja>.bin`). Sterownik wysyła w zgłoszeniu `version` (`FW_VERSION`), a gdy wersja z oferty jest inna, pobiera obraz raz na uruchomienie, tylko przy wyłączonym kompresorze, sprawdza SHA-256 przed aktywacją i się restartuje; zlecona aktualizacja wchodzi więc przy najbliższym uruchomieniu pompy. Firmware hydroforu pomija `request` (ponowna próba tej samej wersji po nieudanym pobraniu wymaga zmiany wersji). Plik wgrywa się na stronie firmware sterownika w aplikacji (trybik na kafelku) (albo `PUT /api/firmware/water-pressure-tank/<wersja>?description=<opis>`, surowy `application/octet-stream`, opis do 500 znaków; serwer sprawdza nagłówek ESP32 i rozmiar ≤ 1 310 720 B oraz liczy SHA-256). Endpointy `/api/firmware/...` są bez `rootId` i na razie bez autoryzacji. Opis i procedura wydania: [devices/water-pressure-tank/docs/3-dokumentacja-techniczna.md](devices/water-pressure-tank/docs/3-dokumentacja-techniczna.md).
- **Kolejka.** Uruchomienie, z którego nie doszła żadna wiadomość (brak sieci), sterownik wysyła przy kolejnym starcie z `queued: true`; serwer zapisuje je z `timeApproximate: true` (daty z chwili przyjęcia).
- **Woda** ([`water-pressure-tank.service.ts`](server/src/modules/water-pressure-tank/services/water-pressure-tank.service.ts), tylko serwer) nie jest zapisywana w rekordach, tylko liczona przy odczycie: efektywny czas pracy pompy × przepływ. Czas pompy = `pumpEnd − pumpStart − manualSeconds` (`pumpSeconds`; w agregacji `PUMP_SECONDS_EXPR`). Przepływ [l/s] = suma litrów z wodomierza / suma czasu pompy ze **wszystkich** okresów między kolejnymi odczytami (średnia ważona czasem, `loadFlow`); okresy bez pracy pompy albo z ujemnym przyrostem wodomierza są pomijane. Przed dwoma odczytami z pracą pompy między nimi przepływu nie ma i woda jest `null` (w aplikacji „---”), a czasy pompy są pokazywane. Nowy odczyt wodomierza zmienia przepływ, więc i wodę w historii. Do wersji 1.3.0 wodę szacowano wzorem Boyle'a ze zbiorników i progów presostatu (historia w `devices/water-pressure-tank/docs/water-pressure-tank.md`).
- **Wodomierz.** `GET /water-pressure-tank/flow` zwraca przepływ `{litersPerMinute | null, periods, meterLiters, pumpSeconds}`. Podsumowanie (`/water-pressure-tank/meter/summary`) interpoluje stan liniowo między odczytami (miesiące) i obok wodomierza podaje wodę z czasu pompy (`estimatedLiters`) oraz `flow`.

## 5c. Piec pelletowy (`pellet-boiler-pelux200`)

Kocioł Plum Pellux 200 Touch z regulatorem ecoMAX (**ecoMAX 860P2**, moduł A 18.21.85P1, panel ecoTOUCH 3) odczytuje osobny sterownik: płytka **ESP32-C3 SuperMini z modułem RS-485 HW-519** (`devices/pellet-boiler-pelux200/`, firmware 1.5.0 (na płytce 1.4.0), `deviceType: 'pellet-boiler-pelux200'`, SN = fabryczny MAC płytki, Root ID i ustawienia w NVS, przestrzeń `pel`). Do 2026-10-02 była to druga rola sterownika `co` (ten sam SN co pompa, UART2); od 2026-10-03 `co` nie ma kodu pieca. Kontrakt z chmurą (pola, ustawienie, odpowiedzi) się nie zmienił. Instrukcja płytki: [devices/pellet-boiler-pelux200/README.md](devices/pellet-boiler-pelux200/README.md); podłączenie, protokół, pola i wygląd w aplikacji: [devices/pellet-boiler-pelux200/docs/piec-pellux200.md](devices/pellet-boiler-pelux200/docs/piec-pellux200.md); dokumentacja producenta: [pellux200-dokumentacja/](devices/pellet-boiler-pelux200/docs/pellux200-dokumentacja/README.md). Moduł serwera i klienta: `server/src/modules/pellet-boiler-pelux200/` i `client/src/devices/pellet-boiler-pelux200/`; nie ma schedulera ani operacji.

- **Magistrala.** HW-519 (opisy pinów od strony modułu; zasilanie 3V3; sam przełącza kierunek, bez DE/RE): **TXD → GPIO21** (odbiór), **RXD ← GPIO20** (nadawanie, od 1.1.0); UART1 115200 8N1; zaciski **G4** modułu A (D+/D−, równolegle do sterownika pokojowego eSTER). Polaryzacja A/B wybierana automatycznie (`bus_polarity.*`). Parser (`ecomax_frame.*`, ramki do 1024 B) składa ramki `0x68 … 0x16` (BCC = XOR). Magistralę obsługuje zadanie FreeRTOS `busTask`; watchdog 30 s, restart po 10 min bez Wi-Fi.
- **ecoNET (etap 2, sprawdzony na kotle 2026-10-03).** Regulator co 2 s pyta `0x56` (CheckDevice `0x30`); fabryczny moduł ecoNET kotła jest wyłączony, więc odpowiada sterownik (`econet.*`: DeviceAvailable `0xB0`, ProgramVersion `0xC0`) i regulator nadaje **`SensorData` (`0x35`) do `0x00`** co ok. 2,5 s. `SensorData` zaczyna się od tabeli wersji ramek (liczba + po 3 B), potem stan i czujniki (PyPlumIO). **Fabryczny ecoNET może zostać włączony**: `EconetGuard` — nadawanie po minucie nasłuchu, cisza 30 min po obcej ramce od `0x56` albo 3 kolizjach. Do chmury idzie ostatni poprawny odczyt, tylko gdy młodszy niż 60 s.
- **Odczyt ustawień (etap 3).** Po starcie i na `p` z konsoli: zapytania `0x31`/`0x32`/`0x5C`/`0x36`/`0x55` jako osobna ramka **50 ms po** naszej odpowiedzi na CheckDevice (doklejonych regulator nie przyjmuje), odpowiedź (typ | `0x80`) po ok. 65 ms do `0x00` (`boiler_settings.*`). Wynik na `/boiler-settings.json`; rozkodowanie `tools/dekoduj_ustawienia.py` (PyPlumIO). **Kopia ustawień kotła z 2026-10-03 (na wypadek awarii):** `devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-03.json` i punkt 4 `docs/kociol-ustawienia.md` (zadana 67 °C, histereza 10, CWU 55/15, pompa CO 50 °C, **min. temperatura kotła 65 °C**, wybór termostatu 0).
- **Zmiana parametrów z aplikacji (od firmware 1.3.0).** Aplikacja zleca zmiany (`POST /api/pellet-boiler-pelux200/commands {changes: [{kind: "ecomax"|"mixer", mixer?, index, value}]}`, wartość surowa = bajt, kolejność zachowana; kolekcja `pellet_boiler_pelux200_commands`, statusy `pending` → `sent` → `done`/`error`, `replaced` dla zastąpionej oczekującej). Serwer sprawdza zakres min–max z ostatniego odczytu ustawień, przy zadanej kotła (98) i mieszacza (0) z nową granicą z tego samego zlecenia (99/100, 1/2). Sterownik co 15 s pyta `GET …/commands/next` (sam `deviceId`), wysyła jedną zmianę naraz: parametr kotła `0x33 [nr, wartość]` → `0xB3` (sprawdzone 2026-10-03: CWU 55 → 50), mieszacz `0x34 [mieszacz od 0, nr, wartość]` → `0xB4` (z PyPlumIO, na kotle niesprawdzone); sprawdza zakres na swoim odczycie, czeka na ponowny odczyt ustawień po poprzedniej zmianie, wynik odsyła `POST …/commands/result {id, ok, error?}`; zlecenie wysłane bez wyniku przez 3 min wraca do kolejki, sterownik bez okna ecoNET kończy je błędem po 2 min. **Zapis w każdym stanie kotła** (decyzja użytkownika 2026-10-04, jak fabryczny ecoNET300; do 1.2.0 tylko stan 0). Konsola USB: `set <nr> <wartość>`, `setm <mieszacz> <nr> <wartość>`. Klient (`components/MainParameters.tsx` na `/settings`): „Tryb pracy” Pompa ciepła / Pellet (zestawy z `docs/kociol-ustawienia.md`, punkt 4b, wysyłane tylko pola różne od odczytu), „Główne parametry” (Sezon Zima / Lato = nr 125 przyciskami, bez Auto; w każdej grupie na liście tylko temperatura zadana z ołówkiem, który otwiera panel całej grupy: kocioł 98, 99, 17, 101, 105; CWU 119, 123, 122; mieszacze 1–2: 0, 1, 2, 4, 6; wysyłane tylko zmienione pola, granice poszerzające zakres zadanej przed zadaną, zawężające po niej; mieszacz 2 bez nastaw w odczycie — tylko panel kotła), „Ostatnie zmiany” ze statusem (odświeżane co 10 s w toku). Ramek `0x37`/`0x3B`/`0x5D` firmware nie buduje — nie wysyłać bez wyraźnej decyzji. Sterowanie ręczne (pompy, zawory) idzie tylko z panelu (ramka `0x89` panelu), ecoNET go nie ma; odczyt — `docs/kociol-ustawienia.md`, punkt 1b.
- **Praca bez kotła:** nagranie 5 min rozmowy z kotłem `devices/pellet-boiler-pelux200/test/fixtures/kociol-2026-10-03.txt` (zamaskowane, `tools/maskuj_nagranie.py`), test `test_capture` na nim i symulator `tools/symulator_kotla.py COMx` (przejściówka USB-RS485). Nagranie zrobiono przy kotle zatrzymanym — stany pracy, moc, wentylator i podajnik z `SensorData` nie były widziane. Szczegóły: README sterownika.
- **Rejestracja** przy każdym starcie, po połączeniu z Wi-Fi (niezależnie od ramek z kotła): `POST /devices/register` z `name: "Piec Pellux 200"`, `version` i `ip`; odpowiedź niesie `rootId` i `settings.poll_interval_seconds`. Nieudane zgłoszenie jest ponawiane co 30 s, a do skutku sterownik nic nie wysyła. 404/409 przy wysyłce kasują Root ID i uruchamiają zgłoszenie od nowa. Płytka ma inny SN niż `co`, więc tworzy w chmurze nowe urządzenie; urządzenie pieca zarejestrowane wcześniej przez `co` (jeśli było) zostaje w bazie bez sterownika.
- **Wysyłka** `POST /api/pellet-boiler-pelux200/add?deviceId=…&rootId=…` co `poll_interval_seconds` (domyślnie 300 s, 30–3600). Pola (wszystkie opcjonalne, liczby lub boole; niezgodny typ = 400, brak pól pomiarowych = 400): `state` (0–11: OFF, STABILIZATION, KINDLING, WORKING, SUPERVISION, PAUSED, STANDBY, BURNING_OFF, ALERT, MANUAL, UNSEALING, OTHER), temperatury `heating_temp`, `feeder_temp`, `water_heater_temp`, `outside_temp`, `return_temp`, `exhaust_temp`, `optical_temp`, `upper_buffer_temp`, `lower_buffer_temp`, `heating_target`, `water_heater_target`, `heating_status`, `water_heater_status`, `fuel_level` (%), `fan_power` (%), `boiler_load` (%), `boiler_power` (kW), `fuel_consumption` (kg/h), `lambda_level`, boole `fan`, `feeder`, `heating_pump`, `water_heater_pump`, `circulation_pump`, `lighter`, `alarm`; od firmware 1.2.0 mieszacze 1 i 2: `mixer1_temp`, `mixer1_target` (°C), boole `mixer1_pump`, `mixer1_opening`, `mixer1_closing` (ruch zaworu), tak samo `mixer2_*` (mieszacz niepodłączony = brak pól; dekoder czyta sekcję mieszaczy po termostacie, wersjach modułów, lambdzie i termostatach, jak PyPlumIO). `time` jest ignorowany (sterownik pieca go nie wysyła), czas bierze serwer. Odpowiedź 201: `{"poll_interval_seconds": N}`; sterownik zapisuje N w NVS (`poll_s`). Nieudaną wysyłkę ponawia po 60 s.
- **Strony sterownika:** AP `Piec-setup` (`10.11.18.1`, otwarty, wyłącza się po 1 min połączenia z Wi-Fi, wraca po 1 min bez Wi-Fi), `/` (odczyt i diagnostyka magistrali: bajty, ramki, odrzucone, polaryzacja; Wi-Fi i chmura), `/install` (Basic Auth: Wi-Fi, wgranie `firmware.bin`, stan aktualizacji z chmury). **OTA z chmury od 1.5.0** (punkt 5e): oferta w odpowiedzi na `GET …/commands/next` zamiast zlecenia parametru (zlecenia parametrów czekają), pobieranie, gdy nie trwa zlecenie parametru ani odczyt ustawień; zadanie magistrali obsługuje ecoNET także w czasie pobierania. Wersję 1.5.0 trzeba wgrać raz przez USB albo `/install` (README).
- **Ustawienie** `properties.poll_interval_seconds` (liczba całkowita 30–3600, domyślnie 300) edytuje klient na `/settings` przez `PUT /api/device/properties`; sterownik pobiera nową wartość przy następnej wysyłce.
- **Ustawienia regulatora w aplikacji (podgląd).** Po każdym pełnym odczycie ustawień sterownik wysyła `POST /api/pellet-boiler-pelux200/settings?deviceId=…` z surowymi odpowiedziami `{ecomax_parameters, mixer_parameters, thermostat_parameters, schedules, regulator_data_schema}` (hex; wymagane `ecomax_parameters`, inaczej 400; błąd wysyłki sterownik ponawia po 10 min i nie kasuje Root ID). Serwer trzyma ostatni odczyt w `pellet_boiler_pelux200_settings` i rozkodowuje go przy `GET` według `modules/pellet-boiler-pelux200/ecomax-parameters.ts` (139 parametrów kotła i 14 mieszacza z PyPlumIO: nazwa, jednostka, krok, przesunięcie; nazwa z panelu, opis i ocena z `devices/pellet-boiler-pelux200/docs/parametry-kotla.md` — zmiana opisu w obu miejscach). Parametr nieużywany = żaden bajt nie jest ani `0xFF`, ani 0 (jak `is_valid_parameter` w PyPlumIO). Klient: zwinięty panel „Ustawienia zaawansowane” na `/settings` (`components/AdvancedSettings.tsx`): grupy, wartość, zakres, numer, opis, ocena; ołówek przy każdym parametrze (tylko gdy `ADVANCED_SETTINGS_EDIT` w `client/src/devices/pellet-boiler-pelux200/config.ts` = true, domyślnie false: same wartości i opisy) otwiera ten sam panel zmiany co „Główne parametry” (parametry „Tylko serwis” i „Nie ruszać” wymagają zaznaczenia potwierdzenia).
- **Harmonogram kotła** (zakładka `/schedules`, `pellet-boiler-pelux200-schedule.service.ts`): **praca kotła** (wpisy `type: work`, `on` = włączony/wyłączony w oknie; poza wpisami `defaults[mode].work`, domyślnie włączony; przy nakładaniu data przed dniem tygodnia, wyłączenie przed włączeniem, potem późniejszy start) i CWU od–do (od = start ładowania, do = zadana) w oknach godzin (dni jak w pompie ciepła, data przed dniem tygodnia, okno przez północ należy do dnia startu jak we włączniku), **osobna lista i osobne wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet”** (`mode: heat-pump | pellet`); działa lista trybu z ostatniego odczytu ustawień (nr 99 < 50 °C = pompa ciepła). Sezon nie jest w harmonogramie (przełącznik Zima/Lato w Ustawieniach). **„Praca kotła: Włączony / Wyłączony”** w Ustawieniach (`enabled`): Włączony = kocioł pracuje według harmonogramu; Wyłączony = jedno zlecenie wyłącz (tylko po przełączeniu z Włączony, nowy kocioł nie jest wyłączany) i harmonogram stoi (`lastApplied.paused`). Włącz/wyłącz to zlecenie `kind: control` (ramka `0x3B [0/1]` → `0xBB`, firmware 1.4.0, z PyPlumIO, na kotle niesprawdzone), pomijane, gdy ostatni odczyt już ma ten stan (wyłączony = stan 0 albo 7). Ustalenia 2026-10-04: pompa ciepła 05:00–06:00 i 13:00–15:00 CWU 40–43 °C, poza harmonogramem 35–40 °C; pellet tylko poza harmonogramem 40–55 °C (zadana 55, histereza 15). `startPelletBoilerScheduler` (`server.ts`) co minutę wylicza stan i **tylko przy zmianie** względem `lastApplied` (tryb, od, do) zleca zmiany (`createCommands`, tylko pola różne od odczytu): włącz/wyłącz, zadana CWU nr 119 = do, histereza nr 123 = do − od. Ręczna zmiana zostaje do następnej zmiany stanu. Błąd (np. brak odczytu ustawień) w `lastError`, przebieg co minutę. W tych samych ustawieniach są **nastawy trybów** (`profiles`, klucze `ecomax:<nr>` / `mixer<n>:<nr>`, wartości surowe; edycja w Ustawieniach zaawansowanych, grupa „Pompa ciepła / Pellet”, `components/ModeProfiles.tsx`), które zleca przycisk „Tryb pracy” (tylko różnice, kolejność `orderChanges`: granice poszerzające, zadane, granice zawężające, reszta); wartości startowe w `DEFAULT_SCHEDULE_SETTINGS` (punkt 4b `docs/kociol-ustawienia.md`). Kolekcje `pellet_boiler_pelux200_schedules` i `pellet_boiler_pelux200_schedule_settings`.
- **Pełna lista parametrów do wyboru:** `devices/pellet-boiler-pelux200/docs/parametry-kotla.md` (wszystkie parametry PyPlumIO z opisem, wartością u nas i oceną, propozycja do sterowania).
- **Odczyt danych:** `GET /api/pellet-boiler-pelux200/last` (ostatni odczyt albo `{}`), `GET /api/pellet-boiler-pelux200/list?date=YYYY-MM-DD` (dzień w Warszawie, malejąco po czasie). Klient: `/` bieżące dane (odświeżane co 30 s, znacznik „Dane nieaktualne” po 3 × interwał): stan z płomieniem przy paleniu (stany 1–4 i 7), tryb zima/lato (nr 125) i tryb pracy pompa ciepła/pellet (z nr 99: < 50 °C = pompa ciepła) z ostatniego odczytu ustawień, niebieskie ikony pracujących pomp CO i CWU, kafelki kocioł, CWU, mieszacz 1 i 2 (aktualna i zadana, przy kotle i CWU „od–do”: zadana − histereza nr 17 / 123; pompa, ruch zaworu); `/data` lista dnia z CSV (główne kolumny, reszta po „Pokaż wszystkie parametry”; CSV zawsze wszystkie, `READING_COLUMNS` w `utils/boiler.ts`); `/chart` wykres temperatur dnia (domyślnie CO = mieszacz 1 i CWU, przełącznikami kocioł, mieszacz 2, zewnętrzna); `/settings` tryb pracy i główne parametry, ostatnie zmiany, interwał odpytywania, ustawienia zaawansowane, na dole dane sterownika.
- **Konsola USB sterownika pieca:** `p` odczyt ustawień, `t` czasy ramek 3 s, `r` nagranie 5 min (`RAW <ms> RX|TX <hex>`), `set <nr> <wartość>` + Enter zmiana parametru kotła. Wgrywanie przez USB: esptool `--no-stub` 115200 z `0xe000 boot_app0.bin` i `0x10000 firmware.bin`.

## 5d. Włącznik (`switch`)

Pełny opis: [firmware](devices/switch/docs/1-opis-biznesowy.md) i [moduł serwera/klienta](docs/moduly/switch/1-opis-biznesowy.md). Sterownik przekaźników z harmonogramem, jak pompa ciepła, ale bez temperatur. Płytka „ESP32 Relay AC X1” (ESP32-WROOM-32E N4, przekaźnik Songle 30 A z NO, zasilacz 230 V na płytce, złącze programowania P1: `GND, RX, TX, 3V3`, przycisk IO0 przy diodzie D6, bez RST). Przekaźnik na **GPIO2**, stan wysoki = włączony (`RELAY_PINS = {2}`, `RELAY_ACTIVE_HIGH = true`; na GPIO17 z testu pinów nie klikał). Produkcja od 2026-10-03: jeden włącznik, firmware 1.0.3, przekaźnik „Bojler”.

- **Zgłoszenie** raz na start (i po 404/409; nieudane co 30 s): `POST /devices/register` z `deviceType: "switch"`, `name: "Włącznik"`, `version`, `ip`, `relays` (liczba przekaźników, 1–16). `onRegister` od razu tworzy przekaźniki w `switch_relays` (nadmiarowe usuwa z harmonogramami). Odpowiedź: `settings: {default_on_minutes, firmware?}` (`firmware` tylko przy zleceniu „Aktualizuj”, punkt 5e). Bez udanego zgłoszenia sterownik nie wysyła stanu.
- **Wymiana co 5 s** `POST /api/switch/state?deviceId=…&rootId=…` (sam `deviceId` wystarcza; 404/409 kasują Root ID): `{uptimeS, relays: [{on, changedS}]}` → `{relays: [{on, offAfterS?, mode}], firmware?}` (`firmware` = oferta OTA przy zleceniu „Aktualizuj”). Polecenie serwer liczy przy każdym zgłoszeniu z trybu i harmonogramu (`relayCommand`), **osobnego schedulera nie ma**. Sterownik sam odlicza `offAfterS`, więc bez sieci dokończy włączenie i wyłączy przekaźnik. WebSocket `/ws?rootId=`: `{"type":"operation"}` (zmiana trybu albo harmonogramu) → zgłoszenie od razu. Po starcie przekaźniki są wyłączone, stan przywraca chmura.
- **Tryby** (`switch_relays.mode`, trwałe w bazie, inaczej niż operacje pompy): `schedule` (okna harmonogramu), `on` (bez limitu), `timer` (do `until`, potem wraca do `schedule`), `off` (wyłączony, blokuje harmonogram). Zmiana: `PUT /api/switch/mode {relay, mode, minutes?}` (`minutes` 1–10080 tylko dla `timer`); aplikacja z `rootId`, sterownik samym `deviceId` z `source: "controller"`. Zmiana trybu i harmonogramu budzi sterownik (`operation`).
- **Zmiany ze strony sterownika** (`POST /relay` na `/`, bez logowania) działają od razu na przekaźnik i idą do chmury `PUT switch/mode`; do potwierdzenia (`pending`, numer `pendingSeq`) polecenia chmury dla tego przekaźnika są pomijane. „Harmonogram” bez chmury (brak udanej wymiany od 30 s) wyłącza przekaźnik.
- **Harmonogram** (`switch_schedules`, wpis na przekaźnik): dni jak w pompie (`ANY_DAY`, `WORKDAYS` bez świąt, `DAYS_OFF` z polskimi świętami, dzień tygodnia, `date` z pierwszeństwem; `scheduleDayMatches` w `calendar.service`). **Okno przez północ należy do dnia startu** (inaczej niż scheduler pompy), koniec wyłączny, stykające się okna są łączone w jedno włączenie (`until` = koniec ostatniego), `nextStart` w ciągu 8 dni.
- **Historia** (`switch_activations`) ze stanu zgłaszanego przez sterownik: `onAt`/`offAt` = teraz − `changedS`, `source` (`schedule`, `app`, `controller`; zapisywane, aplikacja go nie pokazuje). Po utracie zasilania (stan wyłączony od startu według `uptimeS`) koniec włączenia = ostatnie zgłoszenie przed restartem, `approximate: true`. Zmiana stanu przekaźnika → WebSocket `update` dla przeglądarek. Przekaźnik jest online, gdy zgłoszenie przyszło w ciągu 30 s.
- **Ustawienie** `properties.default_on_minutes` (0–10080, 0 = bez limitu, domyślnie 30) przez `PUT /device/properties`; podpowiada czas „Włącz” w aplikacji i na stronie sterownika (tam dopiero po restarcie).
- **OTA** na zlecenie „Aktualizuj” (punkt 5e; `firmwareUpdates: true`, strona firmware w aplikacji), pobieranie tylko przy wszystkich przekaźnikach wyłączonych i bez niewysłanych zmian lokalnych. Od 1.1.0 oferta przychodzi też w odpowiedzi na zgłoszenie stanu, więc sterownik aktualizuje się w kilka sekund bez restartu; 1.0.3 czyta ją tylko przy zgłoszeniu (po restarcie). Ręcznie: `/install` albo `curl -u <login> -F "firmware=@.pio/build/esp32dev/firmware.bin" http://<IP>/install/firmware`.
- **Firmware** `devices/switch/src/`: `firmware.hpp` (`FW_VERSION` 1.1.0, `SWITCH_CLOUD_URL`), `relays.*` (`RelayBank`), `protocol.*` (JSON), `ota.*`, `switch.cpp` (Wi-Fi, chmura, WebSocket, strony). Środowiska: `esp32dev` (produkcja), `esp32dev-local` (`http://192.168.55.9:4001/api/`, adres do zmiany w `platformio.ini`; zapora Windows w sieci publicznej blokuje port 4001), `native` (testy). NVS `sw`: `wifi_ssid`, `wifi_pass`, `root_id`, `def_min`, `ota_tried` (od 1.1.0 klucz `wersja#zlecenie`). AP `Wlacznik-setup` (`10.11.17.1`, domyślnie otwarty) działa po starcie, gaśnie po 1 min z Wi-Fi, wraca po 1 min bez Wi-Fi.
- **Pierwsze wgranie** tylko przez P1 i przejściówkę USB-TTL (FT232RL; CP210x blokowany przez HVCI): IO0 przytrzymany przy podaniu zasilania, `esptool` 115200 z `--before no_reset --after no_reset`. **Pin 3V3 to 3,3 V, nie 5 V; zasilanie z przejściówki nie wystarcza** — osobny zasilacz 3,3 V albo płytka z 230 V (tylko GND/TX/RX; łączy laptop z płytką z sieci). Szczegóły i schematy: [część 3 firmware](devices/switch/docs/3-dokumentacja-techniczna.md).
- Klient `client/src/devices/switch/` (punkt 9), symulator `node scripts/simulate-switch.mjs [--relays N] [--history]`.

## 5e. Aktualizacja firmware na zlecenie (OTA)

Od 2026-10-04 **żaden sterownik nie aktualizuje się sam**. Plik i oferowana wersja rodzaju są jak dotąd na stronie firmware (trybik na kafelku, `firmware_images`/`firmware_offers`), ale oferta `{version, url, sha256, request}` trafia do sterownika tylko wtedy, gdy przy urządzeniu jest zlecenie `devices.firmwareUpdate` (`firmwareOfferForDevice` w `core/services/firmware.service.ts`).

- **Zlecenie:** przycisk „Aktualizuj” w karcie „Sterownik” w Ustawieniach (`core/components/FirmwareStatus.tsx`; hydrofor, włącznik, kocioł) → `POST /api/devices/:rootId/firmware-update` (409: brak oferowanej wersji, aktualizacje wyłączone albo sterownik ma już tę wersję; 400: rodzaj bez OTA) i WebSocket `operation`. „Anuluj aktualizację” = `DELETE` tej ścieżki. Zgłoszenie z oferowaną wersją kasuje zlecenie. Wyłączone „Aktualizacje” na stronie firmware wstrzymują też zlecone.
- **`request`** (czas zlecenia w ms) odróżnia kliknięcia: włącznik (1.1.0) i kocioł (1.5.0) zapisują po pobraniu `ota_tried = wersja#request` i w pamięci klucz próbowany w tym uruchomieniu, więc jedno zlecenie = jedna próba, ponowne „Aktualizuj” = kolejna (`otaKey`/`shouldUpdate` w `ota.hpp`). Hydrofor pomija `request`.
- **Gdzie sterownik dostaje ofertę:** hydrofor w odpowiedzi na zgłoszenie (przy uruchomieniu pompy, kompresor wyłączony); włącznik w zgłoszeniu i w każdej odpowiedzi `POST /switch/state` (przekaźniki wyłączone); kocioł w zgłoszeniu i w odpowiedzi `GET …/commands/next` zamiast zlecenia parametru (co 15 s, gdy nie trwa zapis ani odczyt ustawień).
- **Klient:** wersja, stan (aktualny / dostępna wersja X / zlecona, czeka na sterownik), ostatnie zgłoszenie, przycisk z potwierdzeniem i podpowiedź `firmwareUpdateHint` z `device-type.tsx` rodzaju; przy zleceniu odświeżanie co 15 s.
- **Wdrożenie 2026-10-04:** najpierw serwer; kocioł 1.5.0 raz przez USB albo `/install` (1.4.0 nie ma OTA); włącznik 1.1.0 przez „Aktualizuj” i restart płytki (1.0.3 czyta ofertę tylko przy zgłoszeniu) albo `/install`.

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

Typ `WeekDay` jest zdefiniowany w kontrakcie serwera i klienta (`core/types.ts` po obu stronach; wspólny z harmonogramami włącznika, punkt 5d):

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
- **zapis ustawień domyślnych** (`PUT /api/device/properties`, „Ustawienia harmonogramu” w zakładce Harmonogramy) kasuje ręczne nadpisania pompy (`onPropertiesSaved` w `modules/heat-pump/device-type.ts`): scheduler od razu liczy operację z nowych wartości (`runSchedulerOnce(now, rootId)`), ręczne `co_pomp: "0"` wraca jawnie na `"1"`, a WebSocket `operation` budzi `co`. Bez tego ręczne pole trzymało się bez końca, gdy żaden harmonogram się nie kończył (produkcja 2026-10-04: ręczne CWU max 38 przy domyślnym 48);
- `consumeManualForceOnStart` (wołane w `/hp/add` po `clearOperation`) usuwa z ręcznych nadpisań samo `force: "1"` przy pierwszym starcie sprężarki (`HP.HPS`: spoczynek → praca) po jego ustawieniu. Inne ręczne pola zostają. Następna odpowiedź niesie jawne `force` z harmonogramu (`forceStart` na czas wpisu) albo `"0"`, bo `co` trzyma ostatnią przysłaną wartość. Bez tego ręczne force działało bez końca: CHPC kasuje force przy każdym stopie, a `co` wysyłał je ponownie. Force ustawione w trakcie pracy czeka na postój i kolejny start.

- zapis z `work_mode`, ale bez `co_pomp`, ustawia w ręcznych nadpisaniach `co_pomp: "1"` (`setManualOperationData`). Samo usunięcie klucza nie działało, bo `co` trzyma ostatnią przysłaną wartość: ręczne `"0"` wyłączało przekaźniki CO/CWU mimo zmiany trybu i restartu sterownika, aż do ręcznego `"1"` (produkcja 27.09, 08:21–08:55). `"1"` działa tak samo jak brak pola (przekaźniki włączone w trybach CO).

Nie ma osobnego przycisku wyłączania operacji ręcznej w interfejsie.

### Walidacja w trzech miejscach, każda po cichu

- chpc-web nie sprawdza nic: ani interfejs, ani `/operation/set` nie mają kontroli zakresów;
- `co` zaokrągla `co_*`/`cwu_*` do pełnych stopni w zakresie 1–50 i przyjmuje `working_watt` 0–25599, `eev_max_pulse_open` i `eev_min_pulse_open` 0–255 oraz `eev_setpoint` 0–255,99;
- CHPC stosuje własne limity (punkt 13).

Wartość odrzucona dalej w łańcuchu nadal wygląda w interfejsie na „ustawioną”. To, czego pompa naprawdę używa, widać w telemetrii (`WWatt`, `EEVmax`, `EEVmin`, `Tmax`).

## 8. Endpointy serwera

Trasy składa [`server/src/core/routes.ts`](server/src/core/routes.ts): urządzenia i temperatura z `core`, reszta z plików `routes.ts` modułów (`modules/heat-pump`, `modules/water-pressure-tank`, `modules/pellet-boiler-pelux200`, `modules/switch`).

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
| `POST` / `DELETE /api/devices/:rootId/firmware-update` | zlecenie aktualizacji firmware do oferowanej wersji („Aktualizuj”) / odwołanie (punkt 5e) |
| `POST /api/water-pressure-tank/add` | wysyłka hydroforu co 1 s (sterownik) |
| `POST /api/pellet-boiler-pelux200/add` | odczyt kotła pelletowego (sterownik co 300 s); odpowiedź `{poll_interval_seconds}` |
| `GET /api/pellet-boiler-pelux200/last` | ostatni odczyt kotła albo `{}` |
| `GET /api/pellet-boiler-pelux200/list?date=` | odczyty kotła z dnia (Warszawa) |
| `POST /api/pellet-boiler-pelux200/settings` | ustawienia regulatora od sterownika pieca (surowe odpowiedzi hex; sam `deviceId` wystarcza) |
| `POST` / `GET /api/pellet-boiler-pelux200/commands` | zlecenie zmian parametrów regulatora `{changes}` / ostatnie zlecenia ze statusem |
| `GET /api/pellet-boiler-pelux200/commands/next`, `POST …/commands/result` | sterownik pieca: najstarsze oczekujące zlecenie (przy zleceniu „Aktualizuj” zamiast niego `{firmware}`) / wynik `{id, ok, error?}` |
| `GET` / `PUT /api/pellet-boiler-pelux200/schedule-settings` | harmonogram kotła i nastawy trybów `{enabled, defaults: {heat-pump, pellet: {cwuFrom, cwuTo}}, profiles: {heat-pump, pellet}}` (PUT od razu stosuje) |
| `GET /api/pellet-boiler-pelux200/schedules/current` | stan harmonogramu teraz `{enabled, mode, state, scheduleId, workScheduleId, lastError}` |
| `GET` / `POST /api/pellet-boiler-pelux200/schedules`, `PUT` / `DELETE …/schedules/:id` | wpisy harmonogramu kotła `{type: cwu | work, mode, dayOfWeek | date, startTime, endTime, cwuFrom, cwuTo | on, enabled?}` |
| `GET /api/pellet-boiler-pelux200/settings` | ostatni odczyt ustawień rozkodowany: `{readAt, groups: [{key, label, parameters}], mixers}` albo `{}` |
| `PUT /api/water-pressure-tank/settings` | czas kompresora ustawiony na stronie sterownika `{compressor_seconds}` (tylko to pole; sam `deviceId` wystarcza, 404/409 jak w `/hp/add`) |
| `GET /api/water-pressure-tank/runs?from=&to=` lub `?fromTime=&toTime=` | uruchomienia z dni (Warszawa) albo okresu między odczytami; każde z `pumpSeconds` (bez ręcznej pracy kompresora) i `waterLiters` (`null` bez przepływu) |
| `GET /api/water-pressure-tank/summary?period=day\|month\|year&date=` | kubełki `{key, pumpSeconds, waterLiters \| null, runs}` w godzinach, dniach albo miesiącach oraz `flow` |
| `GET /api/water-pressure-tank/flow` | przepływ pompy z wodomierza `{litersPerMinute \| null, periods, meterLiters, pumpSeconds}` |
| `GET` / `POST /api/water-pressure-tank/meter`, `DELETE /api/water-pressure-tank/meter/:id` | odczyty wodomierza |
| `GET /api/water-pressure-tank/meter/summary?year=` | zużycie z wodomierza w okresach `{from, to, meterLiters, pumpSeconds, estimatedLiters \| null}` i miesiącach, woda z czasu pompy, `flow` |
| `POST /api/switch/state` | zgłoszenie stanu przekaźników włącznika co 5 s (sterownik) `{uptimeS, relays: [{on, changedS}]}`; odpowiedź `{relays: [{on, offAfterS?, mode}]}` |
| `PUT /api/switch/mode` | tryb przekaźnika `{relay, mode, minutes?}` (`schedule`, `on`, `timer` z `minutes` 1–10080, `off`); aplikacja z `rootId`, sterownik samym `deviceId` |
| `GET /api/switch/relays` | przekaźniki: stan ze sterownika, tryb, `until`, `online`, `desiredOn`, wpis działający teraz (`scheduleId`), `nextStart` |
| `PUT /api/switch/relays/:relay` | nazwa przekaźnika `{name}` (≤ 40 znaków) |
| `GET` / `POST /api/switch/schedules`, `PUT` / `DELETE /api/switch/schedules/:id` | harmonogramy przekaźników `{relay, dayOfWeek \| date, startTime, endTime, enabled?}` |
| `GET /api/switch/activations?date=YYYY-MM-DD[&relay=N]` | włączenia nachodzące na dzień (Warszawa) z `durationS` |
| `GET /api/firmware/:deviceType` | oferta firmware i lista plików w bazie (bez `rootId`; tylko rodzaje z OTA: `water-pressure-tank`, `switch`, `pellet-boiler-pelux200`) |
| `PUT /api/firmware/:deviceType/:version?description=` | wgranie pliku `.bin` (surowa treść) z opisem wersji i ustawienie go jako oferowanego |
| `DELETE /api/firmware/:deviceType/:version` | usunięcie pliku wersji innej niż oferowana (oferowana: 409) |
| `PUT /api/firmware/:deviceType` | `{enabled?, version?}`: włączenie/wyłączenie oferty, przywrócenie wersji z bazy |
| `GET /api/firmware/:deviceType/:version.bin` | plik dla sterownika |
| `GET /api/photovoltaic/current`, `/day?date=`, `/summary?period=&date=`, `/readings?date=&panel=`, `/inverters` | widoki fotowoltaiki (urządzenie `photovoltaic`, punkt 5a) |

WebSocket ([`server/src/core/websocket.ts`](server/src/core/websocket.ts)) działa na `/ws?rootId=…`. Sterownik `co` łączy się nim i po komunikacie `{type:"operation", rootId}` od razu wysyła `/hp/add`, a włącznik `/switch/state`. Przeglądarki dostają `update` po zapisie telemetrii i po zmianie stanu przekaźnika włącznika.

## 9. Klient React

**Klient jest podzielony tak jak serwer** (`client/src`):

- `index.tsx` — punkt wejścia; `style.css` — style globalne; `assets/`;
- `core/` — część wspólna: `App.tsx` (routing, `DeviceGuard`, stopka „Aktywne urządzenie”), `device-types.tsx` (rejestr rodzajów sterowników), `http.ts`, `api.ts`, `types.ts`, `context/DeviceContext.tsx`, `components/` (`Header`, `DeviceEditModal`, `Notification`, `IconButton` (szablon przycisku-ikony: wszystkie przyciski-ikony stosują go zamiast własnych), ikony menu i akcji), `pages/Devices` (wybór sterownika), `pages/Firmware` (`/firmware/:deviceType`: firmware rodzaju sterownika: aktualna wersja z opisem, poprzednie wersje z opisami (przywrócenie, usunięcie) i dodanie wersji w popupie (ikona plusa na belce „Aktualna wersja”); otwierana trybikiem w rogu kafelka sterownika, tylko dla rodzajów z `firmwareUpdates` w rejestrze, bez wyboru sterownika), `components/FirmwareStatus` (karta „Sterownik” w Ustawieniach: wersja firmware, stan aktualizacji, przycisk „Aktualizuj” / „Anuluj aktualizację”, punkt 5e);
- `devices/heat-pump/` — pompa ciepła: `pages/` (`Home`, `Data`, `Charts`, `Settings`, `Schedules`), `components/` (`DateDict`, `ResourceBlock`), `utils/` (energia, G12w, błędy), `api.ts`, `types.ts`, `device-type.tsx`;
- `devices/water-pressure-tank/` — hydrofor: `pages/` (`Home`, `Data`, `Chart`, `Settings`), `components/FlowDetails.tsx` (przepływ pompy), `utils/water.ts` (formaty, CSV), `api.ts`, `types.ts`, `device-type.tsx`;
- `devices/switch/` — włącznik: `pages/` (`Home`, `Data`, `Schedules`, `Settings`, `style.css`), `utils/format.ts` (czasy w Warszawie, opis trybu, odliczanie, CSV), `api.ts` (`SwitchRequests`), `types.ts`, `device-type.tsx`;
- `devices/photovoltaic/` — fotowoltaika (ikona słońca): `pages/` (`Home`, `Data`, `Chart`, `Settings`, `style.css`), `utils/pv.ts` (formaty mocy i energii, stany paneli, CSV), `utils/parameters.ts` (lista parametrów DTU), `api.ts` (`PhotovoltaicRequests`), `types.ts`, `device-type.tsx`.

**Menu i trasy powstają z rejestru** (`core/device-types.tsx`). Każdy rodzaj podaje w `device-type.tsx` ikonę kafelka i widoki w kolejności menu (`path`, `label`, `icon`, `element`; pompa ma też `/hp` poza menu). `Header` rysuje menu wybranego rodzaju. `App` tworzy trasy dla wszystkich ścieżek, a ścieżka, której wybrany rodzaj nie ma (np. `/schedules` hydroforu), prowadzi na `/`. Nowy rodzaj sterownika to katalog `devices/<rodzaj>/`, wpis w rejestrze i wartość w `DeviceType`, tak jak na serwerze.

Główne widoki pompy ciepła:

- `/` i `/hp` — bieżący stan pompy;
- `/data` — tabela danych historycznych;
- `/chart` — wykresy i podsumowania;
- `/settings` — ręczne ustawienia operacji (przycisk „Zmień”, komunikat „Polecenie wysłane do sterownika.”; checkbox „Pompy CO/CWU” pokazuje rzeczywisty stan przekaźników z telemetrii `co_pomp`, bo `co` przełącza oba razem, i jest zablokowany w trybach `CWU` i `OFF`, w których `co` i tak trzyma je wyłączone; checkbox „Wymuszenie pracy” pokazuje `HP.F` z pompy, czyli wymuszenie od ustawienia do zatrzymania sprężarki, i jest zablokowany w `OFF`; pompy zimnej i ciepłej wody pokazują `HP.CCS` i `HP.HCS`, czyli pracę automatyczną, włączenie komendą albo ochronę przed mrozem; wymuszenie i obie pompy są zablokowane, gdy telemetria przy wejściu na stronę ma `HP.HPS` > 0, bo pompa steruje nimi wtedy sama, a force przyjmuje tylko w spoczynku), błąd sterownika, „Odblokuj” i „Restart sterownika”, dane sterownika;
- `/schedules` — wartości domyślne i harmonogramy;
- `/devices` — wybór sterownika i zmiana jego nazwy.

**Widoki zależą od typu wybranego sterownika** (rejestr wyżej). Dla hydroforu ([`devices/water-pressure-tank/pages/`](client/src/devices/water-pressure-tank/pages/)) te same ścieżki pokazują:
- `/` — podgląd: pod nagłówkiem przełączniki „Pompa wody” i „Kompresor powietrza” (jak „CO pompa” pompy ciepła; z bieżącego uruchomienia w toku i `compressorRunning`), karta „Ustawienia” (czas kompresora i przepływ pompy) i dzisiejsze uruchomienia z kolumną „Pompa” (np. „4 min 10 s”, podpowiedź z odjętą ręczną pracą kompresora) i wodą (odświeżane co 5 s);
- `/data` — zakładki *Uruchomienia pompy* (miesiąc, CSV, kolumna Pompa jak wyżej, „Razem: X l, pompa Y”) / *Odczyty wodomierza* (dodawanie z samą datą i usuwanie odczytów);
- `/chart` — „Zużycie wody w okresie”: kropki dzień / miesiąc / rok, słupki wody; bez przepływu słupki czasu pracy pompy w minutach i podpowiedź o dwóch odczytach wodomierza; w roku znacznik „Pokaż odczyty z wodomierza” (wodomierz vs „z czasu pompy” w miesiącach i przepływ, którym ją policzono);
- `/settings` — czas kompresora, karta „Przepływ pompy” (`FlowDetails`: wartość i z czego ją policzono albo instrukcja: dwa odczyty wodomierza), dane sterownika z wersją firmware, stanem aktualizacji i przyciskiem „Aktualizuj” (punkt 5e).

Hydrofor nie ma harmonogramów (`/schedules` przekierowuje na `/`).

Dla włącznika ([`devices/switch/pages/`](client/src/devices/switch/pages/); menu Włącznik, Dane, Harmonogram, Ustawienia, bez `/chart`):
- `/` — karta na przekaźnik: przełącznik stanu ze sterownika (jak „CO pompa”), opis trybu (np. „Harmonogram · włączony do 23:30”, „Wyłączony · harmonogram zablokowany” na czerwono), duże odliczanie do wyłączenia, „Sterownik offline od …” (brak zgłoszenia od 30 s), „Czeka na sterownik…”, przyciski „Włącz” / „Wyłącz” / „Harmonogram” i pod nimi „Czas włączenia [h] [min]” (domyślnie `default_on_minutes`; „Włącz” na ten czas, 0 h 0 min = bez limitu); tabela „Dziś” z sumą; odświeżanie co 5 s i po WebSocket `update`;
- `/data` — włączenia z dnia (filtr przekaźnika przy więcej niż jednym, „≈” przy czasie przybliżonym, „Razem w dniu”, CSV; bez kolumny źródła);
- `/schedules` — wpisy po przekaźnikach, czerwona kreska = wpis działający teraz, „(+1 dzień)” przy oknie przez północ, formularz jak w pompie (bez temperatur), uwaga o przekaźnikach w trybie ręcznym;
- `/settings` — nazwy przekaźników, „Czas włączenia [min]” (0 = bez limitu), karta „Sterownik” z liczbą przekaźników, IP, firmware i „Aktualizuj”.

Docelowy telefon to Samsung Galaxy S20 (360×800 CSS px); układ sprawdzany jest też przy 368, 384 i 412 px, bo tyle zależnie od ustawień zgłaszają telefony z Androidem. Widok główny ma klasę `hp-page`: na telefonie karty mają pełną szerokość, a treść zawija się wewnątrz karty. Na telefonie szare karty i tabela danych sięgają od krawędzi do krawędzi ekranu, bez bocznych marginesów (reguły z prefiksem `body` w [`client/src/style.css`](client/src/style.css)). Reguły dla telefonu są w blokach `@media (max-width: 560px)`: menu pokazuje same ikony (`.nav-label` ukryte, nazwa w `title`), wiersze „etykieta + pola” w Ustawieniach i Harmonogramach są flexem z etykietą 9.5rem (pola min i max w jednej linii), wykres ma własną wysokość w `.chart-area`, a `.app-main` ma dolny odstęp na stałą stopkę. Strona nie może mieć przewijania w poziomie (wyjątek: tabela danych we własnym kontenerze).

### Urządzenia i Root ID

- Po przekierowaniu z `DeviceGuard` (`state.auto`, brak wybranego sterownika) wybierany jest automatycznie sterownik domyślny z bazy, a bez niego jedyny sterownik; nie przy świadomym wejściu na `/devices`.
- **Sterownik domyślny** ustawia gwiazdka w lewym górnym rogu kafelka (`isDefault` w bazie, najwyżej jeden). Po otwarciu aplikacji `DeviceGuard` raz na sesję przeglądarki (`sessionStorage` `chpc.defaultApplied`) przełącza na niego, także gdy w `localStorage` jest inny wybór; zmiana w stopce obowiązuje do końca sesji.
- Ikona kafelka zależy od typu: fale (pompa ciepła), kropla (hydrofor) albo przełącznik (włącznik).
- Kafelki sterowników stoją obok siebie (zawijane do kolejnych wierszy), a na ekranach ≤ 560 px jeden pod drugim. Kafelek pokazuje nazwę, a pod nią małą czcionką `deviceId`; gdy nazwy nie ma, w tytule kafelka jest samo `deviceId`. Mała ikonka ołówka w rogu kafelka otwiera popup „Dane sterownika” ([`DeviceEditModal`](client/src/core/components/DeviceEditModal.tsx)): Root ID i Device ID są wyłączone z edycji, nazwę można wpisać lub poprawić (`PUT /api/devices/:rootId`). Popup zamyka „Anuluj”, Esc albo kliknięcie poza nim.
- Nie ma formularza dodawania sterownika (sterowniki rejestrują się same, punkt 3).
- Zakładka Ustawienia ma sekcję „Sterownik” z nazwą, `deviceId`, Root ID i adresem IP z ostatniego zgłoszenia (odnośnik do stron sterownika; `core/components/DeviceAddress`, dane z `GET /api/devices`) oraz przyciskiem „Zmień”, który otwiera ten sam popup. Po zapisie nowa nazwa trafia też do wybranego urządzenia (stopka, `localStorage`). Zmiana sterownika odbywa się przez ikonkę w stopce.

### API klienta

`client/src/core/http.ts` buduje adresy API i WebSocket oraz automatycznie dodaje `rootId` i `deviceId` wybranego urządzenia. Urządzenia (lista, nazwa, domyślny, `properties`) obsługuje `DeviceRequests` w `client/src/core/api.ts`, a ich typy są w `client/src/core/types.ts`. API i typy rodzajów sterowników: `client/src/devices/heat-pump/` (`HpRequests`: telemetria, operacje, harmonogramy), `client/src/devices/water-pressure-tank/` (`WaterPressureTankRequests`) i `client/src/devices/switch/` (`SwitchRequests`: przekaźniki, tryby, harmonogramy, włączenia), każdy z `api.ts` i `types.ts`.

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

- [`server/test/app.test.ts`](server/test/app.test.ts);
- [`server/test/pv.test.ts`](server/test/pv.test.ts);
- [`server/test/scheduler.test.ts`](server/test/scheduler.test.ts).

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

- `co`: `pio test -e native` w `devices/co` (64 testy: kontroler operacji, parser PV, ramki Modbus, polityka AP; testy ramek ecoMAX przeszły 2026-10-03 do sterownika pieca).
- CHPC: `pio test -e native` w `devices/chpc` (symulacja firmware, 54 testy). Dodatkowo scenariusze Wokwi w `devices/chpc/test-wokwi/`.
- hydrofor: `pio test -e native` w `devices/water-pressure-tank` (25 testów: kompresor z pracą ręczną „Włącz”/„Wyłącz”, ustawienia, czas kompresora z `/install`, JSON wysyłki z `manualCompressorS`, kolejka w NVS, OTA).
- włącznik: `pio test -e native` w `devices/switch` (12 testów, +1 oferty OTA na zlecenie z odpowiedzi na stan: odliczanie włączenia z chmury, włączenie bez limitu, zmiana lokalna wygrywa do potwierdzenia, timer lokalny i minuty do wysłania, „Harmonogram” bez chmury, JSON zgłoszenia, odpowiedzi i `PUT switch/mode`, `default_on_minutes`, oferta OTA).
- piec Pellux 200: `pio test -e native` w `devices/pellet-boiler-pelux200` (42 testy: 11 parsera ramek ecoMAX, dekodera `SensorData` z mieszaczami i JSON wysyłki, 4 automatycznej polaryzacji, 16 ecoNET, odczytu ustawień, zmiany parametru kotła i mieszacza i włącz/wyłącz regulator, 8 na czterech nagraniach z kotła w `test/fixtures/`, w tym mieszacze z dekodera zgodne z bajtami 156–170 nagrań i ruchy zaworów obu mieszaczy, 3 oferty OTA z `commands/next` i jednej próby na zlecenie).

Testy pieca pelletowego są w [`server/test/pellet-boiler-pelux200.test.ts`](server/test/pellet-boiler-pelux200.test.ts) (10: dwie role tego samego SN, routing po `deviceId` i rodzaju, zapis i walidacja odczytu, `last`, `list`, `poll_interval_seconds`, ustawienia regulatora z kopii kotła: rozkodowanie, grupy, krok i przesunięcie, mieszacz, walidacja hex).

Testy włącznika są w [`server/test/switch.test.ts`](server/test/switch.test.ts) (13: łączenie stykających się okien, okno przez północ w dniu startu, dni robocze bez świąt i wyłączny koniec, `nextStart`, zgłoszenie tworzy przekaźniki, polecenie w każdym trybie i koniec timera, walidacja trybu, zmiana trybu samym `deviceId`, 404/409, historia z czasem ze sterownika, koniec włączenia po utracie zasilania, harmonogramy, nazwy). Razem z pozostałymi serwer ma 116 testów (2026-10-04: `firmware.test.ts` z ofertą tylko na zlecenie „Aktualizuj”, także w odpowiedzi włącznika i pieca). Symulator sterownika włącznika: `node scripts/simulate-switch.mjs [--relays N] [--history]` (przy `npm run local`; `--history` dopisuje włączenia z 7 dni wprost do bazy lokalnej).

Serwer ma też testy hydroforu w [`server/test/water-pressure-tank.test.ts`](server/test/water-pressure-tank.test.ts) (31: czas pompy bez ręcznej pracy kompresora, przepływ z wodomierza ważony czasem i woda uruchomień, brak wody przed dwoma odczytami, zgłoszenie z ustawieniami, ustawienia i ich walidacja, czas kompresora ze sterownika, daty z czasów względnych, kolejka, 404/409, `manualCompressorS`, podsumowania, wodomierz, sterownik domyślny). Symulator sterownika hydroforu dla środowiska lokalnego: `node scripts/simulate-water-pressure-tank.mjs [--history] [--fast]` (przy `npm run local`; `--history` dopisuje 60 dni uruchomień wprost do bazy lokalnej).

Przebieg 2026-10-03 (piec na osobnej płytce, kod pieca usunięty z `co`): `co` 64/64 + build `esp32dev` (RAM 17,2 %, Flash 34,7 %), sterownik pieca 14/14 + build `esp32c3` (RAM 12,8 %, Flash 74,6 %). Serwer i klient pieca bez zmian. Płytka pieca sprawdzona na biurku z komputerem udającym kocioł (README sterownika, „Test na biurku”); nowego `co` nie wgrywano.

Przebieg 2026-10-03 (włącznik): serwer 109/109 (w tym `switch.test.ts` 13), firmware włącznika 11/11 + build `esp32dev` (Flash ok. 77 %, RAM ok. 15 %). Wdrożenie na produkcji: sterownik zarejestrowany, firmware 1.0.3 na płytce, przekaźnik na GPIO2 klika, przekaźnik nazwany „Bojler”. Zrzuty widoków w `docs/moduly/switch/img/` z symulatora (2 przekaźniki).

Przebieg 2026-10-01 (rola `pellet-boiler-pelux200`): serwer 81/81 (testy w `server/test/`) + `tsc` + build OK, klient `vite build` OK, `co` 74/74 + build `esp32dev` (RAM 17,4 %, Flash 34,9 %). Test integracyjny na lokalnej chmurze (`npm run local`, baza lokalna): rejestracja drugiej roli tego samego SN (nowy `rootId`, ponowna rejestracja zwraca ten sam), `POST /pellet-boiler-pelux200/add` z JSON wygenerowanym przez kod firmware z ramki testowej (rootId+deviceId i sam deviceId), 409 dla `rootId` pompy, 400 dla pustego odczytu, `last`, `list`, zapis i walidacja `poll_interval_seconds`, `POST /hp/add` po samym `deviceId` nadal trafia do pompy. Widoki klienta sprawdzone w Edge (1280 i 360 px, bez przewijania strony w poziomie) z odpowiedziami API podstawionymi w przeglądarce. Nie sprawdzono: kotła ani ramek z magistrali, płytki `co` z UART2, eksportu CSV i zapisu ustawień w przeglądarce.

Przebieg 2026-09-29 (dokumentacja i komentarze, zmiany tylko w komentarzach): serwer 73/73 + `tsc` OK, klient `vite build` OK, `co` 64/64, CHPC 54/54 + build Pro Mini (Flash 95,0%, 29 174 B), hydrofor 23/23 + build `esp32c3`. Zrzuty ekranów w dokumentacji powstały na lokalnej bazie z danymi z `node scripts/seed-local.mjs` (czyści bazę lokalną; 7 dni HP i PV z publicznego API produkcji z zanonimizowanymi identyfikatorami, uruchomienia hydroforu i odczyty wodomierza wygenerowane; po nim zrestartować serwer).

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
5. Ręczne nadpisania są tylko w pamięci i są czyszczone po przejściu z harmonogramu do trybu domyślnego oraz przy zapisie ustawień domyślnych. Tryb `M` wraca po północy na `A`.
6. Działają tylko harmonogramy rodzaju wybranego trybem pracy: `A` → CO, `CWU` → CWU, inne → żaden; przerwa `off` działa w `A` i `CWU` i wygrywa z CO/CWU.
7. `co_pomp` nie należy do harmonogramu i nie jest ustawiane przez scheduler.
8. Temperatury harmonogramu mogą być pominięte — wtedy używane są temperatury domyślne.
9. Wszystkie porównania czasu harmonogramu odbywają się w `Europe/Warsaw`.
10. Wartości operacji są napisami; nowe pole telemetrii wymaga zmiany schematu Mongo i typów po obu stronach.
11. Zmiana pola, klucza lub komendy obejmuje serwer, klienta i oba firmware (`devices/`), a wdrożenie zaczyna się od serwera.

## 13. Sterownik `co` (ESP32, `devices/co`)

Firmware PlatformIO (`esp32dev`), kod w `devices/co/src/`. Dokumentacja: `devices/co/docs/` (trzy części, PL i EN); historia: `devices/co/docs/server-driven-refactor-2026-09-20.md`.

- **Odczyty.** Co 10 s (sprężarka pracuje) lub 30 s (spoczynek) odpytuje CHPC. 3 s po ostatniej komendzie sterującej z serii czyta pompę od razu, sprawdza, czy komendy doszły, i wysyła świeży stan do `hp/add`; zwykły cykl liczy się wtedy od nowa. Taki szybki odczyt jest najwyżej co 10 s, żeby pompa odrzucająca komendę nie była czytana w kółko. Niezależnie od tego co 60 s i zaraz po starcie odpytuje DTU Hoymiles (Modbus, dwa zapytania po pięć portów: od 0x1000 i od 0x10C8, bo DTU numeruje porty co 0x28 adresów, choć rekord ma 20 rejestrów). Odczyt PV idzie osobno na `pv/add` (sekcja 5a). Szacuje COP zbiornika 300 l w każdym cyklu grzania.
- **Strony lokalne:** `/telemetry.json` to telemetria HP, a `/pv.json` to odczyt PV z panelami. Odpowiedź RS-485 na zapytanie `0x01` do `co` (adres `0x10`) nadal zawiera `PV` i `pv_power` w jednym JSON-ie.
- **Tryb sterownika** (przycisk na GPIO5, zapis w NVS): `OFF → CLOUD → MANUAL_CO → MANUAL_CWU → OFF`. Pierwsze naciśnięcie tylko pokazuje bieżący tryb, kolejne przechodzą dalej; wybrany tryb jest stosowany 5 s po ostatnim naciśnięciu. Tylko w `CLOUD` stosuje operacje z chmury. `OFF` wysyła do pompy sekwencję bezpieczeństwa (CO off, force off, pompy off) i wyłącza przekaźniki. W `work_mode = PV` `force` wynika z produkcji PV (≥ 2000 W), a nie z serwera.
- **Strony WWW na porcie 80** (sieć lokalna i otwarty AP `HP-CO-setup`): `/` podgląd telemetrii, `/telemetry.json`, `/install` (Basic Auth: Wi-Fi, SN i Root ID tylko do odczytu, status rejestracji), `/save`.
- **AP `HP-CO-setup` nie działa stale** (`AccessPointPolicy`). Startuje razem ze sterownikiem i jest wyłączany, gdy przez 3 min Wi-Fi ma adres, a każde żądanie do chmury dostaje odpowiedź HTTP (dowolny kod, także 4xx). Wraca, gdy Wi-Fi jest rozłączone dłużej niż 1 min albo chmura milczy 5 min. Przy wyłączonym AP strony konfiguracji są dostępne pod adresem IP sterownika w sieci lokalnej, a ekran pokazuje `AP: off`.
- **Ekran:** nad niebieską linią data, godzina i tryb oraz `P:` (moc/produkcja dziś PV) i `T:` (temperatura falowników). Między liniami duże `T:` to `HP.Ttarget` — temperatura czujnika w środku zbiornika, nie zadana; czerwona przy nierozwiązanym błędzie (`ERRc` > 0; `ERR` to tylko kod ostatniego zdarzenia i nie wraca do 0), żółta, gdy pracuje sprężarka (`HPS` > 0), w pozostałych przypadkach biała. Pod nią biała „T. zew:” z `t_out` z chmury (czcionka `FreeSans9pt7b`).
- **Konfiguracja.** Wi-Fi i Root ID w NVS; `src/secrets.h` daje tylko wartości domyślne, a `CLOUD_ROOT_ID` jest opcjonalny. Zgłoszenie przy każdym starcie i zmianie IP (punkt 3) podmienia Root ID na ten, który serwer ma dla SN, także wkompilowany.
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

Fork [gonzho000/chpc](https://github.com/gonzho000/chpc) (GPLv3) na Arduino Pro Mini (ATmega328P). Cały firmware to jeden plik `devices/chpc/src/CHPC_firmware.ino`. Dokumentacja: `devices/chpc/docs/` (trzy części, PL i EN); szczegóły dla agenta: `devices/chpc/CLAUDE.md`. Firmware nie wysyła klucza z wersją (`FW`) i nigdy go nie miał w żadnym commicie.

- Steruje sprężarką, pompami strony gorącej i zimnej, grzałką karteru i zaworem 4-drogowym; prowadzi silnik krokowy EEV, czyta czujniki DS18B20 i mierzy moc przekładnikiem prądowym. Ma wyświetlacz 1602 i przyciski.
- Zabezpieczenia i ich kody błędów opisuje punkt 5 („Błędy sterownika”). Po 5 błędach sterownik się blokuje: odpowiada po RS-485, ale nie steruje, do czasu `0x10` albo `0x11`.
- Limit mocy 3200 W lub niższy celowo wyłącza zabezpieczenie przepływu („Err CP”); ustawia się w tym celu 3200 W. Próg mocy minimalnej (kod 4) to stałe ≈ 914 W, niezależne od limitu.
- Pamięć Flash jest zajęta w 95,0% (29 174 B z 30 720 B, stan na 2026-09-28), więc nowe klucze JSON trzeba dodawać oszczędnie.
- Tryb produkcyjny RS-485 to `RS485_PYTHON`: magistrala niesie tylko odpowiedzi dla `co`. Build `wokwi` (`RS485_HUMAN`) nie może trafić na pompę podłączoną do `co`.

## 15. Znane niezgodności i otwarte kwestie

- Kontrola klucza API (`verifyApiKey`) jest wyłączona; `POST /api/operation/set` jest otwarte i bez walidacji.
- Zwykłe ustawienia z `/operation/set` czekają na kolejny cykliczny POST `co` (10–30 s); natychmiast (WebSocket) docierają tylko akcje jednorazowe.
- `0x04` powyżej `T_SETPOINT_MAX` i `0x05` powyżej `T_DELTA_MAX` CHPC po cichu ignoruje.
- Liczniki diagnostyczne `co` i `controller_mode` nie są zapisywane w bazie (ścisły schemat); widać je tylko w `GET /api/hp` do restartu serwera i na stronie `/` sterownika.
- Piec `pellet-boiler-pelux200` (punkt 5c): firmware 1.1.0 sprawdzony na kotle tylko przy kotle zatrzymanym (stan 0) — pola pracy `SensorData` (stan, moc, wentylator, podajnik, alarmy) nie były widziane. Wi-Fi płytki: do obniżenia mocy nadajnika do 8,5 dBm (2026-10-03, znana wada ESP32-C3 SuperMini) płytka przy kotle nie łączyła się z siecią; teraz łączy się, za ścianą sygnał ok. −74 dBm. W odczycie ustawień grupa „nadmuch” ma wartości > 100 przy `%`, mieszacz 2 nie ma wartości, termostaty są tylko surowo; offset 81 RegulatorData nierozpoznany (schemat 275 pól jest w kopii ustawień). OTA z chmury od 1.5.0 na zlecenie (punkt 5e), na kotle jeszcze niesprawdzone. Dokumentacja: `docs/moduly/pellet-boiler-pelux200/` (PL, EN w `docs/en/`), `devices/pellet-boiler-pelux200/README.md` i `devices/pellet-boiler-pelux200/docs/piec-pellux200.md` (tylko PL); wersji EN dwóch ostatnich nie ma.
- Włącznik (punkt 5d): strona `/` sterownika i `POST /relay` są bez logowania, a AP `Wlacznik-setup` po starcie domyślnie otwarty — w zasięgu AP i w sieci domowej każdy może przełączyć przekaźnik; `PUT /api/switch/mode` przyjmuje sam `deviceId` bez autoryzacji. Zgłoszenie jest tylko przy starcie (nie po zmianie IP jak w `co`), więc `default_on_minutes` na stronie sterownika i adres IP odświeżają się dopiero po restarcie płytki (bez przycisku RST: odłączenie zasilania). Koniec trybu `timer` w trakcie okna harmonogramu daje krótką przerwę (sterownik wyłącza po odliczeniu, chmura zaraz włącza z harmonogramu; wynika z kodu, niesprawdzone). `switch_activations` nie ma retencji.
- Test E2E łańcucha pompy (`test/e2e`) jest nieaktualny: czeka na formularz dodawania sterownika, którego klient już nie ma (audyt 2026-09-25).
- Najstarszy sterownik ma Root ID wkompilowany w `secrets.h`. Do 2026-10-02 się nie zgłaszał; od wersji ze zgłoszeniem przy każdym starcie zgłasza się z SN, więc w bazie musi być urządzenie `heat_pump` z tym SN (inaczej serwer utworzy nowe i sterownik przejdzie na jego Root ID). Jego `deviceId` zmieniono w bazie z `hp-1` na SN. Serwer trzyma `deviceId` w pamięci (`deviceInfoByRoot`), więc po zmianie w bazie trzeba zrestartować serwer.