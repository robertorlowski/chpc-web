# Firmware co — opis biznesowy

[← Dokumentacja systemu](../../../docs/README.md) · **1. Opis biznesowy** · [2. Zasada działania](2-zasada-dzialania.md) · [3. Dokumentacja techniczna](3-dokumentacja-techniczna.md) · [English](en/1-business-description.md)

## Po co jest ten sterownik

`co` to mały komputer (ESP32) zamontowany przy pompie ciepła. Jest **tłumaczem między pompą a chmurą**:

- czyta stan pompy ciepła (sterownik CHPC) i instalacji fotowoltaicznej (mikrofalowniki Hoymiles),
- wysyła te dane do aplikacji chpc-web,
- odbiera z chmury ustawienia (tryb, temperatury, wymuszenie…) i przekazuje je pompie,
- pilnuje, żeby pompa naprawdę miała te ustawienia — CHPC nie potwierdza poleceń, więc `co` sprawdza i w razie potrzeby powtarza.

Bez `co` pompa działa samodzielnie na ostatnich ustawieniach, ale nie da się nią sterować z aplikacji ani zbierać danych.

## Dla kogo

- **Właściciel** — nie musi nic robić; sterownik działa sam. Może zajrzeć na jego stronę w sieci domowej albo na ekran.
- **Instalator** — przy montażu ustawia Wi-Fi (przez punkt dostępowy `HP-CO-setup` i stronę `/install`); sterownik sam zgłasza się do chmury.
- **Serwisant** — przyciskiem na obudowie może odciąć pompę od chmury (tryb lokalny) albo przełączyć ją ręcznie na CO lub CWU.

## Co umożliwia

| Funkcja | Opis |
|---|---|
| Sterowanie z chmury | tryb pracy, temperatury CO i CWU, wymuszenie, pompy obiegowe, zawór EEV, limit mocy, odblokowanie i restart pompy |
| Dane pompy | co 10 s (sprężarka pracuje) albo 30 s (postój) |
| Fotowoltaika | co 60 s: moc, produkcja, temperatury i stan każdego mikrofalownika |
| Szacunek COP | efektywność każdego cyklu grzania zbiornika 300 l |
| Tryb PV | wymuszenie startu pompy, gdy PV produkuje co najmniej 2000 W |
| Praca bez chmury | przycisk: `OFF` (pompa zatrzymana), `MANUAL_CO`, `MANUAL_CWU` |
| Podgląd na miejscu | ekran kolorowy i strona WWW w sieci domowej |

## Ekran i strony sterownika

![Ekran sterownika](ekran-podglad.png)

*Ekran (emulacja): u góry data, godzina i tryb (`C-A` = chmura, tryb CO Harmonogram), moc i produkcja PV, temperatura falowników. Duże „T” to temperatura w środku zbiornika — żółta, gdy pracuje sprężarka, czerwona przy błędzie pompy. Pod nią temperatura zewnętrzna z chmury, a niżej parametry pompy.*

| Strona `/` (telefon) | Strona `/install` (telefon) |
|---|---|
| ![Strona główna](img/strona-glowna-telefon.png) | ![Instalacja](img/instalacja-telefon.png) |

*Strona `/` odświeża się co 5 s: sterownik, pompa, cykl i COP, diagnostyka, fotowoltaika z tabelą mikrofalowników. Strona `/install` (chroniona hasłem) służy do ustawienia Wi-Fi i pokazuje SN, Root ID i stan rejestracji.*

## Tryby sterownika (przycisk)

| Tryb | Na ekranie | Działanie |
|---|---|---|
| `CLOUD` | `C-…` | wykonuje ustawienia z chmury (tryb domyślny) |
| `OFF` | `L-OFF` | wyłącza pompę (CO, wymuszenie, pompy obiegowe) i przekaźniki; pilnuje, żeby tak zostało |
| `MANUAL_CO` | `M-CO` | przekaźniki CO/CWU włączone, pompa działa na własnych ustawieniach |
| `MANUAL_CWU` | `M-CWU` | przekaźniki wyłączone, pompa grzeje tylko ciepłą wodę |

Pierwsze naciśnięcie tylko pokazuje tryb; kolejne przechodzą dalej: `OFF → CLOUD → MANUAL_CO → MANUAL_CWU → OFF`. Wybrany tryb zaczyna działać 5 s po ostatnim naciśnięciu i przetrwa restart. Dane do chmury idą we wszystkich trybach.

## Ograniczenia

- Polecenia z chmury docierają do pompy przy najbliższej wymianie (10–30 s), szybciej tylko akcje odblokowania i restartu — **i tylko w trybie `CLOUD`**; w innych trybach te akcje przepadają.
- Punkt dostępowy `HP-CO-setup` jest otwarty (bez hasła) i działa tylko przez pierwsze minuty albo gdy nie ma Wi-Fi lub chmury.
- Login i hasło do `/install` są wpisane w kod; strony `/` i `/telemetry.json` są otwarte dla każdego w sieci domowej.
- Sterownik nie weryfikuje certyfikatu serwera (HTTPS bez sprawdzania).

## Słownik

| Pojęcie | Znaczenie |
|---|---|
| **RS-485** | dwuprzewodowa magistrala, na której są pompa (adres 0x41), DTU (0x69) i `co` (0x10) |
| **DTU** | bramka mikrofalowników Hoymiles (Modbus RTU) |
| **SN** | numer seryjny `co` — adres MAC układu ESP32 |
| **Root ID** | identyfikator sterownika w chmurze, zapisany w pamięci `co` |
| **NVS** | trwała pamięć ESP32 (Wi-Fi, Root ID, tryb) |
| **Operacja** | ustawienia z chmury w odpowiedzi na dane pompy |
