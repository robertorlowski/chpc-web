# Heat Pump App — opis logiki systemu

Ten dokument opisuje aktualną architekturę i przepływ danych aplikacji monitorującej oraz sterującej pompą ciepła. Jego celem jest umożliwienie odtworzenia logiki serwera i klienta bez analizowania całego kodu od początku.

## 1. Podział systemu

System składa się z dwóch aplikacji:

- `server/` — Node.js, Express, TypeScript, Mongoose, MongoDB, WebSocket i scheduler;
- `client/` — React, TypeScript, Vite, React Router i REST API.

Główne elementy przepływu:

```text
Pompa / sterownik
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

Wyjątki korzystające z urządzenia domyślnego `hp-1` bez `rootId` to między innymi `/hp/add`, `/operation` i `/settings`. Lista urządzeń `/devices` jest publiczna względem kontekstu urządzenia.

Po stronie klienta wybrane urządzenie jest przechowywane w `localStorage` pod kluczem `chpc.selectedDevice`. [`DeviceProvider`](client/src/context/DeviceContext.tsx) udostępnia wybór, zmianę i czyszczenie urządzenia. `DeviceGuard` przekierowuje użytkownika do `/devices`, jeśli nie wybrano pompy.

## 4. Model danych MongoDB

### `devices`

Model główny to `DeviceModel` z kolekcją `devices`. Urządzenie zawiera między innymi:

- `deviceType` — obecnie `heat_pump`;
- `deviceId` — identyfikator sterownika, np. `hp-1`;
- `name`;
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
- znaczniki `createdAt` i `updatedAt`.

Telemetria zawiera między innymi `HP`, `PV`, `work_mode`, temperatury, moc, stan sprężarki oraz stany pomp. `co_pomp` jest polem telemetrii i może występować w operacji ręcznej, ale nie jest polem harmonogramu.

### `settings`

Kolekcja `settings` przechowuje starszy model ustawień czasowych (`night_hour`, `settings`, `cwu_settings`). Aktualny scheduler korzysta z `devices.schedules`, a nie z tej kolekcji.

## 5. Telemetria pompy

Endpoint `POST /api/hp/add` jest obsługiwany przez `addHp` w [`server/src/controllers/hp.controller.ts`](server/src/controllers/hp.controller.ts).

Przebieg:

1. serwer pobiera operację z pamięci przez `getOperationData(rootId)`;
2. czyści bieżącą operację przez `clearOperation(rootId)`;
3. jeśli telemetria zawiera `HP.Ttarget`, zapisuje dane do MongoDB;
4. `addHpData` dopisuje `rootId`, `deviceType`, `deviceId` i aktualną temperaturę zewnętrzną;
5. zapis telemetrii wywołuje komunikat WebSocket `update` do klienta;
6. odpowiedź HTTP zawiera operację, którą sterownik może zastosować.

To jest główny moment przekazania wyliczonej operacji do sterownika. Scheduler nie wysyła przy każdym przeliczeniu osobnego żądania WebSocket.

`getHpLastData` korzysta z pamięci podręcznej per `rootId`; po pierwszym odczycie najnowsza telemetria jest utrzymywana w `lastDataByRoot`.

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
4. wyszukuje jeden aktywny harmonogram;
5. wykrywa przejście z aktywnego harmonogramu do braku harmonogramu;
6. w razie takiego przejścia czyści operację ręczną;
7. tworzy operację z harmonogramu albo operację domyślną;
8. zapisuje ją przez `replaceOperationData`.

Scheduler nie wysyła komunikatu WebSocket i nie wykonuje bezpośredniego żądania do pompy. Sterownik pobierze operację przy kolejnym zapisie telemetrii.

### Operacja domyślna

`getDefaultOperation` korzysta z następującej kolejności:

1. wartości z `device.properties`;
2. wartości z ostatniej telemetrii;
3. dla `work_mode` — `CWU`, jeśli nie ma żadnej wartości.

Operacja domyślna zawsze ustawia `force: '0'`. Nie zawiera `co_pomp`.

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

### Nakładanie harmonogramów

Jeżeli w tej samej chwili aktywnych jest kilka harmonogramów, wybierany jest jeden według kolejności:

1. harmonogram z konkretną datą ma priorytet nad cyklicznym;
2. `OFF` ma priorytet nad `CO`;
3. `CO` ma priorytet nad `CWU`;
4. przy remisie wygrywa późniejszy `startTime`;
5. ostatecznie rozstrzyga identyfikator `_id`.

Priorytety są zdefiniowane w `scheduleTypePriority`.

## 7. Operacje ręczne

Logika znajduje się w [`server/src/services/operation.service.ts`](server/src/services/operation.service.ts).

Serwis utrzymuje trzy mapy w pamięci procesu:

- `operations` — aktualna operacja do przekazania sterownikowi;
- `scheduledOperations` — ostatnia operacja wyliczona przez scheduler;
- `manualOperations` — ręczne nadpisania użytkownika.

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

## 8. Endpointy serwera

Trasy są zdefiniowane w [`server/src/middleware/api.routes.ts`](server/src/middleware/api.routes.ts).

| Metoda i endpoint | Znaczenie |
|---|---|
| `GET /api/devices` | lista urządzeń |
| `POST /api/devices` | utworzenie urządzenia |
| `GET /api/device/properties` | wartości domyślne urządzenia |
| `PUT /api/device/properties` | zapis wartości domyślnych |
| `GET /api/hp` | ostatnia telemetria |
| `GET /api/hp/all` | dane od początku bieżącego roku |
| `GET /api/hp/4day?date=...` | dane dla jednego dnia |
| `GET /api/hp/monthly-summary` | podsumowania energii |
| `POST /api/hp/add` | zapis telemetrii i zwrot operacji |
| `POST /api/hp/clear` | usunięcie telemetrii urządzenia |
| `GET /api/operation` | przygotowany zestaw wartości do widoku ustawień |
| `GET /api/operation/get` | bieżąca operacja z pamięci |
| `GET /api/operation/getAndClear` | pobranie i wyczyszczenie operacji |
| `POST /api/operation/set` | zapis operacji ręcznej |
| `GET /api/schedules` | lista harmonogramów |
| `POST /api/schedules` | utworzenie harmonogramu |
| `PUT /api/schedules/:id` | aktualizacja harmonogramu |
| `DELETE /api/schedules/:id` | usunięcie harmonogramu |
| `GET /api/settings` | starsze ustawienia czasowe |
| `POST /api/settings/set` | zapis starszych ustawień |
| `GET /api/temperature` | temperatura z serwisu meteo |

## 9. Klient React

Routing jest w [`client/src/index.tsx`](client/src/index.tsx).

Główne widoki:

- `/` i `/hp` — bieżący stan pompy;
- `/data` — tabela danych historycznych;
- `/chart` — wykresy i podsumowania;
- `/settings` — ręczne ustawienia operacji;
- `/schedules` — wartości domyślne i harmonogramy;
- `/devices` — wybór urządzenia.

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

## 11. Testy i odtwarzanie logiki

Testy serwera znajdują się w:

- [`server/app.test.ts`](server/app.test.ts);
- [`server/scheduler.test.ts`](server/scheduler.test.ts).

Testy używają `mongodb-memory-server`, więc nie modyfikują produkcyjnej bazy. Sprawdzają między innymi:

- zapis i odczyt danych API;
- wybór CO/CWU/OFF;
- priorytet `OFF` nad innymi typami;
- ręczne nadpisanie harmonogramu;
- automatyczne wyczyszczenie operacji ręcznej;
- temperatury domyślne przy pustym harmonogramie;
- weekendy i polskie święta jako `DAYS_OFF`;
- brak `co_pomp` w operacji schedulera.

Podstawowe polecenia:

```bash
npm run build -w server
npm run build -w client
npm test -w server -- --run
npx tsc -p server/tsconfig.tests.json --noEmit
```

## 12. Najważniejsze zasady odtworzenia systemu

1. Scheduler liczy stan co minutę, ale nie wysyła osobnego żądania do sterownika.
2. Sterownik dostaje operację w odpowiedzi na zapis telemetrii.
3. Brak aktywnego harmonogramu oznacza operację domyślną urządzenia.
4. Ręczne pola mają pierwszeństwo nad schedulerem.
5. Ręczne nadpisania są tylko w pamięci i są czyszczone po przejściu z harmonogramu do trybu domyślnego.
6. `OFF > CO > CWU` przy nakładaniu harmonogramów.
7. `co_pomp` nie należy do harmonogramu i nie jest ustawiane przez scheduler.
8. Temperatury harmonogramu mogą być pominięte — wtedy używane są temperatury domyślne.
9. Wszystkie porównania czasu harmonogramu odbywają się w `Europe/Warsaw`.
