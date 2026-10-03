# Moduł core — opis biznesowy

[← Dokumentacja systemu](../../README.md) · **1. Opis biznesowy** · [2. Zasada działania](2-zasada-dzialania.md) · [3. Dokumentacja techniczna](3-dokumentacja-techniczna.md) · [English](../../en/moduly/core/1-business-description.md)

## Po co jest ten moduł

Core to część wspólna aplikacji chpc-web, niezależna od rodzaju urządzenia. Dzięki niej w jednej aplikacji można mieć kilka sterowników różnych rodzajów (dziś pompę ciepła, hydrofor i kocioł pelletowy), przełączać się między nimi i dodawać nowe rodzaje bez przebudowy całości.

Moduł odpowiada za:

- **listę sterowników** i wybór tego, z którym użytkownik pracuje;
- **samodzielne zgłaszanie się sterowników**: nowy sterownik po podłączeniu do internetu sam pojawia się w aplikacji, nie trzeba go nigdzie wpisywać;
- **nazwy sterowników** i **sterownik domyślny**, otwierany po uruchomieniu aplikacji;
- **menu i ekrany zależne od rodzaju sterownika** (pompa ma harmonogramy, hydrofor i kocioł nie);
- **wspólne usługi**: temperaturę zewnętrzną (IMGW), kalendarz polskich świąt, szybkie powiadamianie sterownika i przeglądarki (WebSocket).

## Dla kogo

- **Właściciel instalacji** — wybiera sterownik, nadaje mu nazwę, ustawia domyślny. Korzysta z aplikacji na komputerze i na telefonie.
- **Instalator** (zwykle ta sama osoba) — podłącza nowy sterownik; wystarczy, że sterownik ma Wi-Fi, reszta dzieje się sama.

## Co użytkownik może zrobić

| Czynność | Gdzie |
|---|---|
| Zobaczyć wszystkie sterowniki i wybrać jeden | ekran „Wybierz urządzenie” (`/devices`) |
| Nadać lub zmienić nazwę sterownika | ołówek na kafelku albo „Zmień” w Ustawieniach |
| Ustawić sterownik domyślny | gwiazdka na kafelku |
| Przełączyć się na inny sterownik | stopka „Aktywne urządzenie” (widoczna, gdy sterowników jest co najmniej dwa) |
| Zobaczyć Root ID i identyfikator sterownika | popup „Dane sterownika”, sekcja „Sterownik” w Ustawieniach |

![Lista sterowników](img/lista-sterownikow.png)

*Lista sterowników: kafelek z ikoną rodzaju (kropla — hydrofor, fale — pompa ciepła, płomień — kocioł pelletowy), nazwą i identyfikatorem; gwiazdka oznacza sterownik domyślny, ołówek otwiera dane sterownika.*

![Dane sterownika](img/dane-sterownika.png)

*Popup „Dane sterownika”: Root ID i Device ID tylko do odczytu, nazwę można zmienić.*

| Telefon — pompa ciepła | Telefon — hydrofor |
|---|---|
| ![Menu pompy](img/menu-i-stopka-pompa-telefon.png) | ![Menu hydroforu](img/menu-i-stopka-hydrofor-telefon.png) |

*Menu zależy od rodzaju sterownika: pompa ma pięć pozycji (z Harmonogramem), hydrofor cztery, kocioł pelletowy trzy (Kocioł, Dane, Ustawienia). Na telefonie menu pokazuje same ikony. Na dole stopka z aktywnym sterownikiem i przyciskiem przełączania.*

## Typowe scenariusze

1. **Nowy sterownik.** Instalator podłącza sterownik i ustawia mu Wi-Fi. Sterownik sam zgłasza się do chmury i pojawia się na liście — bez nazwy, z samym identyfikatorem (SN). Użytkownik nadaje mu nazwę ołówkiem.
2. **Codzienna praca.** Aplikacja po otwarciu od razu pokazuje sterownik domyślny. Jeśli sterownik jest tylko jeden, wybiera go sama.
3. **Kilka sterowników.** Użytkownik przełącza się stopką. Wybór obowiązuje do zamknięcia przeglądarki; przy kolejnym otwarciu znów startuje sterownik domyślny.
4. **Wymiana sterownika albo wyczyszczenie jego pamięci.** Sterownik zgłasza się ponownie z tym samym SN i dostaje ten sam rekord — historia danych zostaje.
5. **Sterownik z kilkoma rolami.** Jeden fizyczny sterownik może występować w aplikacji jako kilka urządzeń o tym samym identyfikatorze (SN), każde z własnym Root ID, menu i historią danych. Tak było 2026-10-01–02, gdy `co` obsługiwał pompę ciepła i kocioł pelletowy; od 2026-10-03 kocioł ma osobny sterownik pieca, a mechanizm ról został w aplikacji.

## Ograniczenia i ryzyka

- **Brak logowania i klucza API.** Aplikacja zakłada jednego użytkownika. Kontrola klucza API na serwerze jest wyłączona, więc każdy, kto zna adres serwera i Root ID sterownika, może odczytać dane i wysłać polecenie. Root ID nie powinien trafiać do publicznych miejsc (zrzuty w tej dokumentacji mają zmyślone identyfikatory).
- **Sterownika nie da się usunąć z aplikacji.** Usunięcie wymaga zmiany w bazie danych.
- **Część danych jest w pamięci serwera** (ostatnia telemetria, operacje ręczne, dane urządzeń). Restart serwera je czyści; sterownik odtwarza je przy kolejnej wysyłce.
- **Temperatura zewnętrzna** pochodzi z jednej stacji IMGW (Zakopane) — dla instalacji w innym miejscu trzeba zmienić stację w kodzie.

## Słownik

| Pojęcie | Znaczenie |
|---|---|
| **Sterownik** | urządzenie przy instalacji, które łączy się z chmurą: `co` (pompa ciepła), sterownik hydroforu, sterownik pieca (kocioł pelletowy) albo włącznik |
| **Rodzaj sterownika** (`deviceType`) | `heat_pump`, `water-pressure-tank`, `pellet-boiler-pelux200` albo `switch`; decyduje o menu, ekranach i obsłudze danych |
| **Rola sterownika** | jedno zadanie fizycznego sterownika (np. `co` jako pompa ciepła albo jako kocioł); każda rola to osobne urządzenie w aplikacji |
| **SN** (`deviceId`) | numer seryjny sterownika — fabryczny adres MAC układu ESP32, 12 znaków szesnastkowych; wspólny dla wszystkich ról tego samego sterownika |
| **Root ID** (`rootId`) | identyfikator urządzenia (roli) w bazie danych; aplikacja i sterownik podają go przy każdym zapytaniu |
| **Zgłoszenie sterownika** | zapytanie, które sterownik wysyła przy starcie; tworzy urządzenie albo zwraca istniejące |
| **Sterownik domyślny** | sterownik otwierany po uruchomieniu aplikacji; najwyżej jeden |
| **Ustawienia** (`properties`) | ustawienia sterownika zapisane w chmurze (np. temperatury pompy, czas kompresora hydroforu) |
| **Rejestr rodzajów sterowników** | miejsce w kodzie, gdzie każdy rodzaj opisuje swoje menu, ekrany i ustawienia domyślne |
