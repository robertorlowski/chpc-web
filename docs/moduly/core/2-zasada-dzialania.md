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
        PBM["modules/pellet-boiler-pelux200"]
        WS["core/websocket.ts"]
        MET["core: meteo (IMGW)<br/>kalendarz świąt"]
        APP --> CTX --> RT
        RT --> DEV
        RT --> HPM
        RT --> WPT
        RT --> PBM
        DEV --> REG
        REG -.-> HPM
        REG -.-> WPT
        REG -.-> PBM
        HPM --> WS
        HPM --> MET
    end
    subgraph Klient["Klient (client/src)"]
        CAPP["core/App.tsx<br/>DeviceGuard, trasy, stopka"]
        CREG["core/device-types.tsx<br/>rejestr: menu i ekrany"]
        HDR["core/components/Header.tsx<br/>menu"]
        CHP["devices/heat-pump"]
        CWP["devices/water-pressure-tank"]
        CPB["devices/pellet-boiler-pelux200"]
        CAPP --> CREG
        HDR --> CREG
        CREG -.-> CHP
        CREG -.-> CWP
        CREG -.-> CPB
    end
    Klient -- "REST /api, WebSocket /ws" --> Serwer
```

Moduły rodzajów sterowników nie znają się nawzajem. Łączy je tylko core: trasy, rejestr i wspólny dokument urządzenia w bazie.

## Zgłoszenie sterownika

Hydrofor wysyła zgłoszenie przy każdym starcie (odbiera w nim ustawienia), a `co` przy każdym starcie, po każdej zmianie adresu IP i po odpowiedzi 409, także gdy ma już Root ID danej roli (inny `rootId` z odpowiedzi zastępuje zapisany); sterownik pieca zgłasza się przy każdym starcie. Hydrofor, `co` i sterownik pieca wysyłają w zgłoszeniu swój adres IP, który klient pokazuje w Ustawieniach. Serwer rozpoznaje urządzenie po parze (rodzaj, SN): nowe tworzy, znanemu oddaje jego rekord.

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
    Note over R,S: odpowiedź ma rootId, a dla rodzajów z controllerSettings<br/>(hydrofor, kocioł pelletowy) także pole settings — sterownik zapisuje je w pamięci
```

Sterownik zapisuje `rootId` w swojej pamięci (NVS; sterownik z kilkoma rolami osobno dla każdej roli). Dane może wysyłać także przed zgłoszeniem, z samym SN — serwer przyjmie je, jeśli urządzenie o tym SN i rodzaju endpointu już istnieje.

## Jeden sterownik, kilka ról

Fizyczny sterownik może mieć w aplikacji kilka urządzeń. Tak było 2026-10-01–02: `co` był pompą ciepła (`heat_pump`) i kotłem pelletowym (`pellet-boiler-pelux200`); od 2026-10-03 kocioł ma osobny sterownik pieca (`devices/pellet-boiler-pelux200`), a mechanizm ról został na serwerze. Mają ten sam `deviceId` (SN), ale inny `deviceType` i inny `rootId`; model `devices` nie ma unikalnego indeksu na `deviceId`. Nie ma więc pojęcia „urządzenia nadrzędnego”: każda rola jest zwykłym urządzeniem z własnym kontekstem, menu, danymi i ustawieniami.

```mermaid
flowchart LR
    SN["sterownik<br/>SN = AABBCC000001"] -- "/hp/add, /pv/add" --> HP["urządzenie heat_pump<br/>rootId = A"]
    SN -- "/pellet-boiler-pelux200/add" --> PB["urządzenie pellet-boiler-pelux200<br/>rootId = B"]
```

Skoro sam SN nie wskazuje jednoznacznie urządzenia, serwer wybiera rolę po **ścieżce endpointu** (mapa `controllerPaths` w `device-context.ts`, niżej) i szuka po parze `{deviceId, deviceType}`. Zgłoszenie (`POST /devices/register`) szuka też po tej parze, więc ten sam SN zgłoszony z innym rodzajem tworzy drugie urządzenie.

## Kontekst urządzenia w każdym zapytaniu

Prawie każde zapytanie do `/api` musi wskazać sterownik. Robi to middleware `device-context` przed przekazaniem zapytania do modułu.

```mermaid
flowchart TD
    A["zapytanie /api/..."] --> B{"ścieżka publiczna?<br/>/devices, /devices/register,<br/>/devices/:rootId..."}
    B -- tak --> OK["dalej, bez kontekstu"]
    B -- nie --> C{"jest rootId?"}
    C -- nie --> D{"ścieżka sterownika z mapy controllerPaths<br/>(/hp/add, /pv/add,<br/>/water-pressure-tank/add, /settings,<br/>/pellet-boiler-pelux200/add)<br/>i jest deviceId?"}
    D -- nie --> E400["400: rootId jest wymagane"]
    D -- tak --> F["szukaj po {deviceId, rodzaj z mapy}"]
    C -- tak --> G["szukaj po rootId"]
    F --> H{"znalezione?"}
    G --> H
    H -- nie --> E404["404"]
    H -- tak --> I{"ścieżka sterownika, a sterownik podał rootId<br/>i deviceId nie pasuje albo rodzaj urządzenia<br/>jest inny niż rodzaj endpointu?"}
    I -- tak --> E409["409 — sterownik kasuje rootId<br/>i zgłasza się ponownie"]
    I -- nie --> J["req.deviceRootId = urządzenie → moduł"]
```

Odpowiedź 409 chroni przed sytuacją, w której sterownik ma w pamięci `rootId` z innej bazy (np. po przełączeniu serwera z lokalnego na produkcyjny) albo z innej roli (np. `rootId` pompy wysłany na endpoint kotła).

Dla zwykłych endpointów (spoza `controllerPaths`) kontekst wyznacza wyłącznie `rootId`, bez sprawdzania rodzaju urządzenia.

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

Serwer ma analogiczny rejestr: każdy rodzaj podaje ustawienia nowego urządzenia i ustawienia odsyłane przy zgłoszeniu (hydrofor: czas kompresora; kocioł pelletowy: `poll_interval_seconds`).

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
