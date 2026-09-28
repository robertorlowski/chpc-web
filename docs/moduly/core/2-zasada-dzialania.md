# Moduł core — zasada działania

[← Dokumentacja systemu](../../README.md) · [1. Opis biznesowy](1-opis-biznesowy.md) · **2. Zasada działania** · [3. Dokumentacja techniczna](3-dokumentacja-techniczna.md) · [English](../../en/moduly/core/2-how-it-works.md)

## Miejsce w systemie

Core łączy moduły rodzajów sterowników w jedną aplikację. Po stronie serwera przyjmuje każde zapytanie, ustala, którego sterownika dotyczy, i przekazuje je do modułu. Po stronie klienta pilnuje wybranego sterownika i buduje menu z opisów modułów.

```mermaid
flowchart TB
    subgraph Serwer["Serwer (server/src)"]
        APP["core/app.ts<br/>Express, CORS, JSON"]
        CTX["core/middleware/device-context.ts<br/>rootId / deviceId → urządzenie"]
        RT["core/routes.ts<br/>trasy"]
        DEV["core: urządzenia<br/>lista, zgłoszenie, nazwa,<br/>domyślny, properties"]
        REG["core/device-types.ts<br/>rejestr rodzajów"]
        HPM["modules/heat-pump"]
        WPT["modules/water-pressure-tank"]
        WS["core/websocket.ts"]
        MET["core: meteo (IMGW)<br/>kalendarz świąt"]
        APP --> CTX --> RT
        RT --> DEV
        RT --> HPM
        RT --> WPT
        DEV --> REG
        REG -.-> HPM
        REG -.-> WPT
        HPM --> WS
        HPM --> MET
    end
    subgraph Klient["Klient (client/src)"]
        CAPP["core/App.tsx<br/>DeviceGuard, trasy, stopka"]
        CREG["core/device-types.tsx<br/>rejestr: menu i ekrany"]
        HDR["core/components/Header.tsx<br/>menu"]
        CHP["devices/heat-pump"]
        CWP["devices/water-pressure-tank"]
        CAPP --> CREG
        HDR --> CREG
        CREG -.-> CHP
        CREG -.-> CWP
    end
    Klient -- "REST /api, WebSocket /ws" --> Serwer
```

Moduły rodzajów sterowników nie znają się nawzajem. Łączy je tylko core: trasy, rejestr i wspólny dokument urządzenia w bazie.

## Zgłoszenie sterownika

Hydrofor wysyła zgłoszenie przy każdym starcie (odbiera w nim ustawienia), a `co` tylko wtedy, gdy nie ma jeszcze Root ID (także po odpowiedzi 409). Serwer rozpoznaje sterownik po SN: nowy tworzy, znanemu oddaje jego rekord.

```mermaid
sequenceDiagram
    participant S as Sterownik
    participant R as POST /api/devices/register
    participant D as core: urządzenia
    participant T as rejestr rodzajów
    participant M as MongoDB (devices)
    S->>R: { deviceId: SN, deviceType, name? }
    R->>R: deviceId wymagany, deviceType znany (inaczej 400)
    R->>D: registerDevice(typ, SN, nazwa)
    D->>M: szukaj urządzenia o tym SN i typie
    alt nowe urządzenie
        D->>T: initialProperties(typ)
        D->>M: utwórz (nazwa ze zgłoszenia, ustawienia domyślne)
        R-->>S: 201 + dane urządzenia
    else znane urządzenie
        R-->>S: 200 + dane urządzenia (nazwa bez zmian)
    end
    Note over R,S: odpowiedź ma rootId, a dla rodzajów z controllerSettings<br/>(hydrofor) także pole settings — sterownik zapisuje je w pamięci
```

Sterownik zapisuje `rootId` w swojej pamięci (NVS). Telemetrię może wysyłać także przed zgłoszeniem, z samym SN — serwer przyjmie ją, jeśli urządzenie o tym SN już istnieje.

## Kontekst urządzenia w każdym zapytaniu

Prawie każde zapytanie do `/api` musi wskazać sterownik. Robi to middleware `device-context` przed przekazaniem zapytania do modułu.

```mermaid
flowchart TD
    A["zapytanie /api/..."] --> B{"ścieżka publiczna?<br/>/devices, /devices/register,<br/>/devices/:rootId..."}
    B -- tak --> OK["dalej, bez kontekstu"]
    B -- nie --> C{"jest rootId?"}
    C -- nie --> D{"ścieżka sterownika<br/>(/hp/add, /pv/add,<br/>/water-pressure-tank/add, /settings)<br/>i jest deviceId?"}
    D -- nie --> E400["400: rootId jest wymagane"]
    D -- tak --> F["szukaj po deviceId"]
    C -- tak --> G["szukaj po rootId"]
    F --> H{"znalezione?"}
    G --> H
    H -- nie --> E404["404"]
    H -- tak --> I{"sterownik podał rootId i deviceId,<br/>a nie pasują do siebie?"}
    I -- tak --> E409["409 — sterownik kasuje rootId<br/>i zgłasza się ponownie"]
    I -- nie --> J["req.deviceRootId = urządzenie → moduł"]
```

Odpowiedź 409 chroni przed sytuacją, w której sterownik ma w pamięci `rootId` z innej bazy (np. po przełączeniu serwera z lokalnego na produkcyjny).

## Wybór sterownika w aplikacji

```mermaid
flowchart TD
    S["otwarcie aplikacji"] --> L{"w przeglądarce zapamiętany<br/>sterownik (localStorage)?"}
    L -- nie --> DEV["/devices: wybór sterownika"]
    DEV --> AUTO{"wejście automatyczne<br/>(ze strażnika)?"}
    AUTO -- tak --> DEF{"jest domyślny w bazie?"}
    DEF -- tak --> PICK["wybierz domyślny"]
    DEF -- nie --> ONE{"jeden sterownik?"}
    ONE -- tak --> PICK
    ONE -- nie --> USER["użytkownik klika kafelek"]
    AUTO -- nie --> USER
    L -- tak --> SES{"pierwsze otwarcie w tej sesji<br/>(sessionStorage)?"}
    SES -- tak --> SW["przełącz na domyślny z bazy"]
    SES -- nie --> KEEP["zostaw wybrany"]
    SW --> CHK
    KEEP --> CHK["odśwież dane sterownika z serwera;<br/>jeśli go nie ma — wyczyść wybór"]
    PICK --> APP["ekrany rodzaju sterownika"]
    USER --> APP
    CHK --> APP
```

- Wybrany sterownik jest w `localStorage` (`chpc.selectedDevice`), więc przetrwa zamknięcie przeglądarki.
- Przełączenie na sterownik domyślny następuje raz na sesję przeglądarki (`sessionStorage` `chpc.defaultApplied`); ręczna zmiana w stopce obowiązuje do końca sesji.
- Zapamiętany sterownik, którego nie ma w bazie (np. po przełączeniu z bazy lokalnej na produkcyjną), jest usuwany z pamięci przeglądarki. Błąd sieci niczego nie usuwa.

## Menu i ekrany z rejestru

Każdy rodzaj sterownika podaje w swoim pliku `device-type` listę ekranów (ścieżka, nazwa, ikona, strona). Aplikacja:

1. tworzy trasy dla wszystkich ścieżek wszystkich rodzajów;
2. dla wybranej ścieżki pokazuje ekran rodzaju aktywnego sterownika;
3. jeśli ten rodzaj nie ma takiej ścieżki (np. hydrofor i `/schedules`), przekierowuje na stronę główną;
4. menu w nagłówku rysuje z ekranów aktywnego rodzaju.

Po zmianie sterownika ekran jest tworzony od nowa, więc nie zostają w nim dane poprzedniego sterownika.

Serwer ma analogiczny rejestr: każdy rodzaj podaje ustawienia nowego urządzenia i ustawienia odsyłane przy zgłoszeniu.

## WebSocket

```mermaid
sequenceDiagram
    participant CO as sterownik co
    participant B as przeglądarka
    participant WS as serwer /ws?rootId=...
    participant API as serwer REST
    CO->>WS: połączenie z rootId
    B->>WS: połączenie z rootId
    API->>WS: sendMessage("operation", rootId) — np. akcja jednorazowa
    WS-->>CO: { type: "operation", rootId } (po 1 s)
    CO->>API: od razu POST /api/hp/add → odbiera operację
    API->>WS: sendMessage("update", rootId) — po zapisie telemetrii
    WS-->>B: { type: "update", rootId }
    B->>API: pobiera świeże dane
```

WebSocket niczego nie przenosi poza sygnałem „zajrzyj po dane”. Operacje zawsze trafiają do sterownika w odpowiedzi na jego zapytanie HTTP. Połączenie bez `rootId` serwer zamyka.

## Usługi wspólne

- **Temperatura zewnętrzna.** Przy starcie i co 10 minut serwer pobiera pomiar ze stacji synoptycznej IMGW (Zakopane). Wartość jest dopisywana do rekordów telemetrii pompy (`t_out`) i odsyłana sterownikowi `co`, który pokazuje ją na ekranie.
- **Kalendarz.** Wszystkie daty użytkownika są w strefie `Europe/Warsaw`. Kalendarz zna polskie święta stałe i ruchome (także Wigilię) i rozstrzyga, czy dzień jest roboczy — korzysta z tego scheduler harmonogramów pompy.

## Start serwera

1. Wczytanie zmiennych środowiskowych; bez `MONGODB_URI` serwer kończy start błędem.
2. Połączenie z MongoDB.
3. Start schedulera pompy ciepła (przebieg od razu, potem co minutę).
4. Czyszczenie szczegółów paneli PV starszych niż 90 dni (od razu i co 24 h).
5. Pobranie temperatury IMGW i odświeżanie co 10 minut.
6. Nasłuch HTTP i WebSocket na porcie `PORT`.
