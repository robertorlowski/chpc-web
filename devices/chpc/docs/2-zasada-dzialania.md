# Firmware CHPC — zasada działania

[← Dokumentacja systemu](../../../docs/README.md) · [1. Opis biznesowy](1-opis-biznesowy.md) · **2. Zasada działania** · [3. Dokumentacja techniczna](3-dokumentacja-techniczna.md) · [English](en/2-how-it-works.md)

## Schemat

```mermaid
flowchart LR
    S["12 × DS18B20<br/>(OneWire D12)"] --> MCU["Arduino Pro Mini<br/>CHPC_firmware.ino"]
    CT["przekładnik prądowy A6"] --> MCU
    FL["czujnik przepływu A7"] --> MCU
    BT["przyciski A1–A3"] --> MCU
    MCU --> K["przekaźnik sprężarki D8"]
    MCU --> PH["pompa gorąca D7"]
    MCU --> PC["pompa zimna D10"]
    MCU --> SH["grzałka karteru D11"]
    MCU --> EEV["EEV D2–D5"]
    MCU --> LCD["LCD 1602 I2C"]
    MCU --> BZ["brzęczyk D6"]
    MCU <-- "RS-485 D0/D1<br/>adres 0x41" --> CO["co (ESP32)"]
```

## Start

1. Przekaźniki wyłączone, LCD pokazuje `ID: 0x41`, inicjalizacja RS-485.
2. Odczyt EEPROM (znacznik `0x50`): T max, delta, zgoda `CO`, przegrzanie, EEV min, EEV max, limit mocy, adresy czujników. Bez znacznika — wykrywanie czujników po kolei (wymagane Tae, Tbe, Ttarget); brak Tae lub Tbe zatrzymuje sterownik z komunikatem.
3. Pierwszy pomiar z czekaniem (pomija fałszywe 85 °C po włączeniu).
4. Kalibracja EEV: pełne otwarcie, pełne zamknięcie, powrót do pozycji oczekiwania.
5. **90 s pauzy** („Wait: N s.”): termostat i zabezpieczenia nie działają, RS-485 i EEV już tak.

## Pętla główna

```mermaid
flowchart TD
    L["loop()"] --> P["próbka prądu<br/>(co 2960 próbek: moc RMS)"]
    P --> E["krok EEV"]
    E --> O["przeciążenie"]
    O --> F["przepływ (A7 > 4 V przez > 9 s)"]
    F --> R["RS-485: komendy i odpowiedź JSON"]
    R --> LK{"blokada x5?"}
    LK -- tak --> L
    LK -- nie --> B["przyciski i menu"]
    B --> D["LCD co 5 s<br/>(tu też ochrona przepływu)"]
    D --> C{"minęła 1 s?"}
    C -- tak --> CY["cykl kontrolny"]
    C -- nie --> L
    CY --> L
```

W stanie blokady sterownik nadal odpowiada po RS-485, ale **cykl kontrolny nie działa** — temperatury w odpowiedzi JSON się nie zmieniają, a ochrona przed mrozem i reakcja na zablokowany przekaźnik nie działają.

## Cykl kontrolny (co 1 s)

```mermaid
stateDiagram-v2
    [*] --> Postój
    Postój --> Praca: CO=1, brak błędu, postój ≥ 20 min,<br/>EEV w pozycji oczekiwania,<br/>Ttarget < T max − delta<br/>(z wymuszeniem: < T max − 3),<br/>zabezpieczenia OK
    Praca --> Postój: Ttarget > T max albo CO=0<br/>(po ≥ 3 min pracy) — kasuje wymuszenie i licznik błędów
    Praca --> Postój: zabezpieczenie (stopOnError / stopByTemperature)
    Postój --> Blokada: 5. błąd liczony
    Blokada --> Postój: 0x10 (odblokowanie) albo 0x11 (restart)
```

Warunki startu (wszystkie naraz): Tsump 5–85 °C, Tae > −2 °C, Tbc < 70 °C, Tci i Tco > −2 °C.

**Pompy:**
- gorąca i zimna startują 2,25 s po sprężarce;
- gorąca pracuje jeszcze 60 s po zatrzymaniu i dłużej, dopóki Tho > Ttarget + 3 °C;
- zimna wyłącza się ≥ 10 s po zatrzymaniu, gdy Tbe i Tae > 0 °C;
- **ochrona przed mrozem** (sprężarka wyłączona): czujnik ≤ 0 °C włącza pompę gorącą, wszystkie ≥ 2 °C ją wyłączają;
- grzałka karteru: włączona przy Tsump < 10 °C;
- wymuszenia ręczne (przyciski, RS-485 `0x09`–`0x0B`) są sumowane z automatyką.

## Zawór EEV

Zawór utrzymuje przegrzanie (Tae − Tbe; liczone tylko przy mocy > 914 W) na nastawie (domyślnie 1,0 K):

| Sytuacja | Reakcja |
|---|---|
| przegrzanie poniżej nastawy | zamykanie po 1 kroku co 40 s |
| powyżej nastawy + 0,2 K | otwieranie co 40 s |
| powyżej nastawy + 4,2 K | otwieranie co 1,3 s |
| przegrzanie < 0,2 K, Tae < 0,2 °C, Tci/Tco < 0 °C | szybkie zamykanie (nie poniżej EEV min) |
| praca | zakres EEV min…EEV max; po starcie sprężarki szybkie otwarcie do min + 1 |
| postój / błąd | pełne zamknięcie i otwarcie do pozycji oczekiwania `min(45, EEV min − 4)` |
| 24 h postoju | ponowna kalibracja |

## RS-485

- Sterownik czyta z magistrali jednym ciągiem do 49 bajtów i przetwarza kolejne 5-bajtowe ramki `[0x41][cmd][d1][d2][0xFF]` **od początku bufora**. Obce bajty na początku (np. końcówka odpowiedzi DTU) powodują odrzucenie całego odczytu — dlatego `co` sprawdza skutek poleceń i je powtarza.
- Komendy zapisu nie mają odpowiedzi. Na `0x01` sterownik odpowiada jedną linią JSON (CRLF) z kluczami: `Tbe`, `Tae`, `Tco`, `Tho`, `Ttarget`, `Tsump`, `EEV_dt`, `Tmax`, `Tmin`, `Watts`, `EEV`, `EEV_pos`, `EEV_pulse`, `SHS`, `HCS`, `CCS`, `HPS`, `F`, `CO`, `WWatt`, `EEVmax`, `EEVmin`, `ERR`, `ERRn`, `ERRc`, `lt_pow`, `lt_hp_on`.
- Wymuszenie (`0x03`) jest przyjmowane tylko w postoju; w czasie pracy komenda jest pomijana w całości.

## Błędy i blokada

- `ERR` — kod ostatniego zdarzenia (nie wraca do 0), `ERRn` — numer zdarzenia (rośnie przy każdym), `ERRc` — licznik błędów liczonych.
- Błędy **liczone** (do blokady): przeciążenie (2), brak przepływu (3), za mała moc (4). Pozostałe zatrzymują sprężarkę bez zwiększania licznika.
- Normalne zatrzymanie termostatem zeruje licznik; w blokadzie do niego nie dochodzi, więc potrzebne jest `0x10` albo `0x11`.
