# Kocioł Pellux 200 Touch — sprzęt i ustawienia regulatora

Ustalenia z 2026-10-03: co jest zamontowane w kotle, jak regulator decyduje o rozpaleniu i
pracy pomp oraz plan ustawień na czas pracy drugiego źródła ciepła (pompy ciepła). Dokument
jest uzupełniany w miarę kolejnych ustaleń. Podłączenie sterownika pieca do magistrali:
[piec-pellux200.md](piec-pellux200.md) i [rysunek](img/podlaczenie-kotla.svg).

## 1. Zamontowany sprzęt

Zdjęcia z kotła (numery seryjne zamaskowane):

| Element | Oznaczenie z tabliczki | Zdjęcie |
|---|---|---|
| Regulator, moduł A | **Biawar ecoMAX 860P2**, wykonanie N, oprogramowanie **v18.21.84**, rok 2019, 230 V, IP20 | [kociol-modul-a-ecomax860p2.png](img/kociol-modul-a-ecomax860p2.png) |
| Panel sterujący | **Biawar ecoTOUCH 3**, wariant **ecoMAX860P2-N T5**, gniazdo RJ: `5…12V`, `D+`, `D−`, `GND` | [kociol-panel-ecotouch3.png](img/kociol-panel-ecotouch3.png) |
| Sterownik siłownika zaworu (ochrona powrotu) | **Biawar ecoDRIVE**, 230 V, 30 W, rok 2019 | [kociol-ecodrive.png](img/kociol-ecodrive.png) |

![Moduł A ecoMAX 860P2](img/kociol-modul-a-ecomax860p2.png)

Wnioski dla sterownika pieca:

- Panel ecoTOUCH 3 łączy się z modułem A kablem z wtykiem RJ (G2): zasilanie 5…12 V,
  **D+, D−** i GND. Zaciski śrubowe `12V DC / D+ / D− / GND` modułu A to **G4** — wejście
  panelu pokojowego; jest do nich podłączony sterownik pokojowy (2026-10-03). Panel kotła,
  panel pokojowy i ecoNET dzielą jedną magistralę RS-485 ecoMAX, więc ramki `SensorData`
  powinny być na G4 tak samo jak na G2 (do potwierdzenia odczytem).
- **Punkt podłączenia sterownika pieca: G4**, tylko **D+ i D−**, pod te same zaciski co
  przewody sterownika pokojowego (równolegle; sterownik pieca tylko słucha, więc nie
  przeszkadza). 12V DC i GND z G4 nie podłączamy. Zapasowo: para D+/D− kabla panelu (G2).
  Rysunek: [podlaczenie-kotla.svg](img/podlaczenie-kotla.svg).
- Mimo sterownika pokojowego (eSTER_x80) regulator ma `Wybór termostatu = 0` (wyłączony) —
  odczyt parametrów 2026-10-03 (punkt 4). Wejście termostatu jest więc wolne dla wariantu
  automatycznego w punkcie 3.
- Zaciski 36/37 (`D+`, `D−`, opis `B`) to osobna magistrala do modułu B/C — druga opcja,
  gdyby na magistrali panelu nie było ramek.
- Instrukcja regulatora wprost dla „ecoMAX 860P2” nie została znaleziona; najbliższe są
  instrukcja panelu ecoMAX ze strony Pellux (niżej, źródło 1) i instrukcje 860P/860P3.
  Nazwy pozycji menu na panelu mogą się nieznacznie różnić.

## 1a. Co jest na magistrali (nasłuch 2026-10-03, zaciski G4)

Wersje z panelu (`Informacje 8/8`): panel 18.11.7, moduł A 18.21.85P1, panel pokojowy
**eSTER_x80 T1** 1.25.93, moduł internetowy **ISM_X-SMART** 1.22.41. Na magistrali ok. 290
poprawnych ramek na minutę, 0 błędów, polaryzacja normalna (firmware pieca 1.0.2/1.0.3,
diagnostyka na konsoli USB):

| Typ ramki | Od → do | Rozmiar | Co to jest |
|---|---|---|---|
| `0x08` | regulator `0x45` → wszyscy `0x00`, co 2 s | 313 B | **RegulatorData** — bieżące dane regulatora (mapa niżej) |
| `0x30` | `0x45` → `0x56`, co 2 s | 0 B | CheckDevice: regulator szuka ecoNET pod `0x56` — fabryczny ecoNET jest wyłączony; od firmware 1.1.0 odpowiada sterownik pieca |
| `0x40` | `0x45` → `0x57`, `0x58` | 0 B | ProgramVersion (inne moduły) |
| `0x0a` | `0x45` → `0x50`, `0x55` | 0 B | zapytania do paneli |
| `0x89` | `0x50` (panel kotła), `0x51` (eSTER) → wszyscy | 26 / 48 B | zaczynają się od „TIME”; eSTER niesie m.in. 20,0 i 21,8 °C |
| `0x6b` / `0xeb` | `0x45` ↔ `0x59` | 31 / 256 B | prawdopodobnie moduł ISM X-SMART |
| `0x6a` / `0xea` | `0x50` ↔ `0x59` | 5 / 14 B | panel ↔ ISM |

**SensorData (`0x35`) bez ecoNET nie występuje**: regulator wysyła ją dopiero, gdy moduł
ecoNET przedstawi się na CheckDevice. Od firmware 1.1.0 (etap 2, 2026-10-03) sterownik pieca
odpowiada jako ecoNET (`DeviceAvailable 0xB0`, nadawanie GPIO20 → RXD modułu HW-519) i po
ok. 1 s regulator nadaje SensorData **do wszystkich (`0x00`)** co ok. 2,5 s, 196 B (zadane
67 / 55 °C zgodne z panelem). Sterownik odpowiada dopiero po minucie samego nasłuchu i milknie
na 30 min, gdy usłyszy inny moduł pod `0x56` (fabryczny ecoNET kotła może zostać włączony).

Regulator obsługuje urządzenia po kolei, w oknach co ok. 300 ms; odpytane urządzenie
odpowiada w 10–30 ms. Zapytanie ecoNET wysłane 50 ms po odpowiedzi na CheckDevice regulator
przyjmuje i odpowiada po ok. 65 ms, także **do wszystkich (`0x00`)**; zapytanie doklejone
tuż za odpowiedzią pomija.

Mapa RegulatorData niżej powstała, zanim był dostępny SensorData; schemat RegulatorData
(275 pól) jest w kopii ustawień (punkt 4).

Mapa RegulatorData tego regulatora (offset = bajt danych ramki, od 0; float32 LE; NaN =
czujnik niepodłączony). Porównanie zrzutów z panelem przy postoju kotła (kocioł 23,0 °C,
pogodowa 11,0, mieszacz 1 19,8, mieszacz 2 20,0, CWU 24,3, zadana CWU 55, zadane mieszaczy
40 / 27):

| Offset | Typ | Znaczenie | Pewność |
|---|---|---|---|
| 81 | float | 22,6–22,9 °C — CWU albo podajnik | do potwierdzenia |
| 85 | float | temperatura mieszacza 1 | potwierdzone |
| 89 | float | temperatura mieszacza 2 | potwierdzone |
| 93 | float | temperatura zewnętrzna (pogodowa) | potwierdzone |
| 97, 113–165 | float NaN | czujniki niepodłączone (spaliny, powrót, bufor…) | zgodne z „---” na panelu |
| 105 | float | **temperatura kotła** | potwierdzone |
| 169 | bajt | **temperatura zadana CWU** (55) | potwierdzone |
| 170 / 171 | bajt | temperatury zadane mieszacza 1 / 2 (40 / 27) | potwierdzone |
| 175 | bajt | **temperatura zadana kotła** (67) | potwierdzone |

Do ustalenia przy pracy kotła: stan (rozpalanie, praca, nadzór…), płomień, moc, wyjścia
(nadmuch, podajnik, pompy). Układ ramki zależy od schematu regulatora (PyPlumIO pobiera go
zapytaniem `0x55`), więc mapa dotyczy tego regulatora i tej wersji oprogramowania.

## 1b. Sterowanie ręczne z panelu (nagranie 2026-10-03)

Próba przy wyłączonym kotle: na panelu `Menu główne → Sterowanie ręczne` (dostępne tylko przy
wyłączonym kotle, instrukcja ecoMAX 860P str. 16) włączono i wyłączono **pompę mieszacza 1**
(grzejniki). Nagranie: `test/fixtures/kociol-2026-10-03-sterowanie-reczne.txt`.

| Czas | Panel `0x50`, ramka `0x89` do wszystkich (co 2 s) | Regulator | SensorData `0x35` |
|---|---|---|---|
| 11:08:47 wejście do menu | bajt 14: `00 → 01` | RegulatorData bajt 32: `00 → 06` (po 2 s) | stan `0 → 9` (MANUAL, „ręczny”) |
| pompa mieszacza 1 włączona | bajt 15: `0x40` (bit 6) | RegulatorData bajt 33: `0x40` | mieszacz 1, bajt stanu: bit 0 = 1 |
| 11:10:35 pompa wyłączona | bajt 15: `0x40 → 0x00` | bajt 33: `0x40 → 0x00` (11:10:37) | bajt 162: `0x09 → 0x08` (11:10:37) |
| 11:12:26 wyjście z menu | bajt 14: `01 → 00` | bajt 32: `06 → 00` (11:12:28) | stan `9 → 0` |

Wnioski:

- **Panel nie wysyła regulatorowi polecenia** — stan sterowania ręcznego (tryb i maska
  włączonych urządzeń) jest polem we własnej ramce `0x89`, rozsyłanej co 2 s. Sterownik pieca
  mógłby to naśladować tylko jako drugi panel, a prawdziwy panel co 2 s nadpisuje stan, więc
  **do sterowania z aplikacji ta droga się nie nadaje**; w protokole ecoNET komendy pracy
  ręcznej nie ma.
- **Do odczytu się nadaje:** stan 9 w SensorData = kocioł w sterowaniu ręcznym; pompa
  mieszacza 1 w części mieszaczy SensorData. Część mieszaczy (od bajtu 155 tej ramki, 196 B):
  liczba mieszaczy (5), potem na mieszacz 8 B: temperatura (float), zadana (bajt), bajt `0x08`
  (znaczenie nieznane), **bajt stanu z bitem 0 = pompa**, bajt `0x00`. Odczyt: mieszacz 1
  19,9 °C / zadana 40, mieszacz 2 20,6 °C / zadana 27 (mieszacz 2 jest więc obsługiwany,
  choć w odpowiedzi z parametrami nie ma wartości). Układ zgodny z PyPlumIO
  (`structures/sensor_data.py`, `_decode_mixer_sensors`: temperatura NaN = mieszacz
  niepodłączony; pompa = bit 0 bajtu zadana+2); nasz dekoder `decodeSensorData` tej części
  jeszcze nie czyta.
- RegulatorData ma 313 B, a po pojawieniu się ecoNET 324 B: regulator dopisuje stan sieci,
  który ecoNET zgłosił w DeviceAvailable (m.in. IP i SSID — w nagraniach zamaskowane);
  offsety w punkcie 1a dotyczą wersji 313 B.

### Mapa sterowania ręcznego (nauka z panelu, 2026-10-03 wieczorem)

Użytkownik wykonywał na panelu kolejne czynności i podawał ich godziny; każdą dopasowano do
ramek co do sekundy. Nagranie z listą czynności w nagłówku:
`test/fixtures/kociol-2026-10-03-sterowanie-mieszacze.txt`. Kotła nie rozpalano (pompa ciepła
grzała wodę w kotle, ok. 26–29 °C).

**Panel `0x50`, ramka `0x89` (co 2 s, do wszystkich) — bajty 14–17; regulator powtarza je
1–2 s później w RegulatorData (324 B) w bajtach 32–35:**

| Bajt panelu (regulatora) | Bit / wartość | Znaczenie | Potwierdzenie |
|---|---|---|---|
| 14 (32) | `01` (regulator `06`) | menu „Sterowanie ręczne” otwarte | wejście / wyjście z menu |
| 15 (33) | bit 4 `0x10` | **mieszacz 1: otwieranie** | 22:39:05–22:40:14 |
| 15 (33) | bit 5 `0x20` | **mieszacz 1: zamykanie** | 22:37:47–22:38:53 |
| 15 (33) | bit 6 `0x40` | **pompa mieszacza 1** | wył. 22:44:48, wł. 22:45:16 (i rano 11:08–11:10) |
| 15 (33) | bit 7 `0x80` | **pompa mieszacza 2** | wył. 22:43:39, wł. 22:44:04 |
| 16 (34) | bit 0 `0x01` | **mieszacz 2: otwieranie** | 22:42:07–22:43:18 (także 22:30:11–22:31:20 i 14 s o 22:44:23) |
| 16 (34) | bit 1 `0x02` | **mieszacz 2: zamykanie** | 22:40:37–22:41:46 (także do 22:29:43) |
| 16 (34) | bit 3 `0x08` | **pompa CWU** | 22:45:36–22:46:23; SensorData `outputs` bit 3 (`water_heater_pump`) = 1 |
| 15 bity 0–3, 16 bit 2 i 4–7, 17 | — | nieustalone (prawdopodobnie wentylator, podajnik, zapalarka, pompa CO, cyrkulacja) | **nie próbować** bez nagrania z panelu |

**SensorData `0x35`, część mieszaczy, bajt stanu mieszacza** (od bajtu 155: liczba, potem 8 B
na mieszacz; bajt stanu = 7. bajt wpisu, dla mieszacza 1 bajt 162, dla mieszacza 2 bajt 170):
bit 0 = pompa, **bit 1 = otwieranie, bit 2 = zamykanie**, bit 3 = zawsze 1 (nieustalone).
Pompy mieszaczy nie są w `outputs`; pompa CWU jest (bit 3).

**Czas pełnego przejścia zaworu** (od włączenia do wyłączenia przez użytkownika, gdy panel
pokazał koniec ruchu): mieszacz 1 — zamykanie 66 s, otwieranie 69 s; mieszacz 2 — zamykanie
69 s, otwieranie 71 s i 69 s. **Siłowniki potrzebują ok. 70 s na pełny ruch.** Temperatura
mieszacza po zamknięciu spada o ok. 3 °C w minutę, po otwarciu wraca w 1–2 min.

Wnioski do sterowania: wszystkie te polecenia idą wyłącznie w ramce panelu (pole jego stanu,
nadpisywane co 2 s przez prawdziwy panel), a regulator przyjmuje je tylko w menu ręcznym przy
wyłączonym kotle. Sterownik pieca nie ma jak ich wysłać bez udawania panelu — do sterowania z
aplikacji pozostają parametry (`0x33`/`0x34`, np. zadana mieszacza) i włączanie regulatora;
mapa służy do **odczytu** stanu sterowania ręcznego i siłowników.

## 1c. Kocioł bez panelu (próba 2026-10-03, 22:56–23:12)

Kocioł wyłączony zasilaniem, odłączona wtyczka RJ panelu (G2), zasilanie włączone na ok. 8 min,
potem panel z powrotem (przy wyłączonym zasilaniu). Nagranie z godzinami czynności:
`test/fixtures/kociol-2026-10-03-bez-panelu.txt`.

- **Regulator bez panelu pracuje normalnie** (zgodnie z instrukcją 860P str. 46: „nie wyłącza
  regulacji i pracuje normalnie z zaprogramowanymi wcześniej parametrami”): RegulatorData i
  SensorData co ok. 2,3 s, stan 0, bez alarmu w SensorData. Panel po podłączeniu nie pokazał
  alarmu.
- **Regulator szuka panelu:** co ok. 2,3 s `ProgramVersion` (`0x40`) do `0x50` (168 razy w
  6,5 min); zwykłego odpytywania `0x0a` panelu nie ma, dopóki panel się nie przedstawi.
- **Start panelu:** `0x40` → panel `0xC0` (36 B: wersja, „Aug 29 2019 07:46:34”, adres `0x50`);
  potem regulator odpytuje `0x0a`, a panel rozsyła `0x89` (na starcie 20 B, potem 26 B); panel
  wysyła też `0x61` (`ff 00`), `0x63`, `0x62` (znaczenie nieznane) i `0xD6` (52 B); regulator
  pobiera z panelu **dziennik alarmów**: `0x3D` `[od, ff]` co 10 pozycji (0…90) → `0xBD` 93 B
  (typy alarmów w PyPlumIO) — dziennik alarmów jest w panelu.
- **Wejście w sterowanie ręczne** to tylko bajt 14 ramki `0x89` (`00 → 01`), bez osobnego
  polecenia.

Wniosek: sterownik pieca mógłby zastąpić panel (adres `0x50`) i sterować pompami i zaworami
w menu ręcznym, ale musiałby odtworzyć przedstawienie się (`0xC0`), ramki `0x61`/`0x62`/
`0x63`/`0xD6` i dziennik alarmów; bez panelu nie ma też obsługi na miejscu. Na razie nie
podjęte.

## 2. Kiedy kocioł rozpala i kiedy pracują pompy

| Zachowanie | Parametr (menu) | Wartość fabryczna | U nas (obserwacja) |
|---|---|---|---|
| Rozpalenie, gdy temperatura kotła < **temperatura zadana − histereza** | Temperatura zadana kotła (`Menu → Ustawienia kotła`) | — | **67 °C** (panel i bajt 175 RegulatorData) |
| | Histereza kotła (`Ustawienia serwisowe → Ustawienia kotła → Modulacja mocy`) | **5 °C** (źródło 1, str. 26) | **10 °C** (panel, 2026-10-03) → rozpala przy **57 °C** (67 − 10) |
| Pompa CWU włącza się, gdy CWU < **zadana CWU − histereza zasobnika CWU** | Temperatura zadana CWU, Histereza zasobnika CWU (`Menu → Ustawienia CWU`) | — | zadana CWU **55 °C**, histereza CWU **15 °C** (panel, 2026-10-03) → ładowanie CWU poniżej 40 °C |
| Pompa CO pracuje dopiero powyżej progu (ochrona kotła przed wychłodzeniem i roszeniem) | Temperatura załączenia pompy CO (`Ustawienia serwisowe → Ustawienia CO i CWU`) | nie podana w dokumentacji Pellux | pompy stoją poniżej 50 °C |
| Obniżenie temperatury zadanej przy rozwartym styku termostatu | Termostat pokojowy kotła (`Ustawienia serwisowe → Ustawienia kotła → Modulacja mocy`) | **0 °C**, maks. 30 °C (źródło 1, str. 26) | 0 °C (odczyt) |
| Wejście termostatu | Wybór termostatu (`Ustawienia serwisowe → Ustawienia kotła`): Wyłączony / Uniwersalny / ecoSTER | — | **0 = wyłączony** (odczyt) |
| Dolna granica temperatury zadanej — także ustawianej automatycznie (obniżenia, termostat) | Minimalna temperatura kotła (`Ustawienia serwisowe → Ustawienia kotła`) | — | **65 °C** (odczyt; zakres 30–80) |
| Przymknięcie zaworu przy zimnym powrocie | Ochrona powrotu: Minimalna temperatura powrotu (ecoDRIVE) | — | 40 °C |
| Progi zmniejszania mocy w pracy (nie start) | 50% Histereza H2 / 30% Histereza H1 | 3 °C / 1 °C (źródło 1, str. 26) | 5 °C / 4 °C (odczyt) |

„—” = brak w znalezionej dokumentacji. „Odczyt” = parametr z regulatora (punkt 4).

## 3. Plan: pompa ciepła jako drugie źródło (do 50 °C)

Problem: pompa ciepła grzeje wodę najwyżej do 50 °C, a przy obecnych nastawach kocioł
rozpala przy 55 °C, a pompy CO stoją poniżej 50 °C — ciepło z pompy ciepła nie dochodzi do
instalacji, a kocioł i tak się rozpala.

Na czas pracy pompy ciepła:

1. **Temperatura załączenia pompy CO → ok. 40 °C**, żeby pompy pracowały na wodzie 40–50 °C.
   Ochrona przed roszeniem dotyczy palącego się kotła; gdy wodę grzeje pompa ciepła, kocioł
   stoi.
2. **Próg rozpalenia poniżej tego, co daje pompa ciepła (np. ok. 40 °C)** — kocioł zostaje
   rezerwą. Dwie drogi:
   - **ręcznie, bez menu serwisowego:** obniżyć temperaturę zadaną kotła z 67 °C do ok.
     **50 °C** (przy histerezie 10 °C start przy 40 °C). **Minimalna temperatura kotła to
     65 °C** (odczyt 2026-10-03), więc najpierw trzeba ją obniżyć w menu serwisowym (np. do
     45 °C), inaczej panel nie przyjmie zadanej poniżej 65 °C. Albo w menu serwisowym histereza kotła 10 → 27 °C przy
     zadanej 67 °C. Po zakończeniu pracy pompy ciepła z powrotem 67 °C (i ewentualnie
     histereza 10 °C) oraz pompa CO 50 °C;
   - **automatycznie, przez wejście termostatu:** Wybór termostatu = Uniwersalny, Termostat
     pokojowy kotła = 20 °C (rozwarty styk obniża zadaną 60 → 40 °C, start przy 35 °C),
     **Minimalna temperatura kotła ≤ 40 °C** (inaczej obniżenie się nie zmieści). Styk
     przełącza się przy włączaniu pompy ciepła — może to robić przekaźnik **Włącznika**
     (`devices/switch`): rozwarty, gdy pracuje pompa ciepła.
3. **Ochrona powrotu 40 °C** bez zmian — przy 45–50 °C nie zadziała (chyba że woda z pompy
   ciepła wraca przez zawór ochrony powrotu; zależy od hydrauliki).

Do sprawdzenia przed wdrożeniem:

- hasło do menu serwisowego (instrukcje go nie podają; serwis / producent) i zgoda serwisu
  Pellux na zmiany (gwarancja);
- który stan styku termostatu (zwarty / rozwarty) daje obniżenie — sprawdzić na kotle;
- czy przy obniżeniu z termostatu pompy CO nadal pracują;
- schemat hydrauliki: gdzie pompa ciepła oddaje ciepło (do kotła, do powrotu, do bufora).

Sterownik pieca (`devices/pellet-boiler-pelux200`) odczytuje dane i ustawienia regulatora i
od 2026-10-03 umie zmienić **jeden parametr kotła** (ramka `0x33`), na razie tylko poleceniem
z konsoli USB (punkt 4a). Z aplikacji tego nie ma; plan: sterowanie przy zatrzymanym kotle.

## 4a. Zmiana parametru przez sterownik (2026-10-03)

Na prośbę użytkownika: **temperatura zadana CWU 55 → 50 °C** (parametr nr 119), kocioł
zatrzymany (stan 0). Polecenie na konsoli USB sterownika: `set 119 50` (Enter).

| Czas | Co | Ramka |
|---|---|---|
| 11:25:05 | sterownik: zapytanie 50 ms po odpowiedzi na CheckDevice | `68 0c 00 45 56 30 05 33 77 32 34 16` (`0x33`, nr 119, wartość 50) |
| +140 ms | regulator: potwierdzenie do wszystkich | `68 0a 00 00 45 88 00 b3 1c 16` (`0xB3`, bez danych) |
| 11:25:07 | ponowny odczyt ustawień | nr 119: `[55, 20, 70] → [50, 20, 70]`; pozostałe 139 parametrów, mieszacze, termostaty i harmonogramy bez zmian |
| 11:25:20 | SensorData | zadana CWU 50 |

Nagranie: `test/fixtures/kociol-2026-10-03-zmiana-cwu.txt` (test `testParameterChangeRecording`).

Zabezpieczenia w sterowniku (`startParameterSet` w `pellet.cpp`): zmiana tylko przy świeżym
odczycie z **kotłem zatrzymanym (stan 0)**, tylko w zakresie min–max, który podał regulator
w ostatnim odczycie ustawień, jedna naraz; brak potwierdzenia po 3 próbach (4 s każda) =
komunikat „sprawdź wartość na panelu”. Po potwierdzeniu sterownik czyta ustawienia od nowa.
Powrót: `set 119 55` albo na panelu (`Menu → Ustawienia CWU`).

## 4b. Dwa zestawy ustawień: praca na pellecie i kocioł bez palenia (2026-10-04)

Kocioł ma na razie tylko rozprowadzać ciepłą wodę z pompy ciepła (pompy i mieszacze), bez
palenia. Ustawienia „bez palenia” zmniejszają szansę rozpalenia: próg rozpalenia (zadana −
histereza) jak najniżej, mieszacz 1 nie podnosi zadanej kotła powyżej 32 °C, CWU nie wywołuje
rozpalenia. **Sprawdzone 2026-10-04 00:53–01:23:** regulator stosuje histerezę także do zadanej
podniesionej przez mieszacz — przy zadanej kotła 37 °C (mieszacz 1: 35 + 2) i wodzie w kotle
30,6 °C kocioł został w postoju (stan 5), bez rozpalania (próg 37 − 30 = 7 °C). Rozpalenie i
tak nie byłoby według użytkownika groźne. Ustawia użytkownik na panelu; sterownik sprawdza wynik
odczytem ustawień.

| # | Parametr (nr ecoNET) | Gdzie na panelu | **Praca na pellecie** (powrót) | **Bez palenia** |
|---|---|---|---|---|
| 1 | Minimalna temperatura kotła (99) | `Ustawienia serwisowe → Ustawienia kotła` | 65 °C | 30 °C |
| 2 | Temperatura zadana kotła (98) | `Menu → Ustawienia kotła` | 67 °C | 30 °C |
| 3 | Histereza kotła (17) | `Ustawienia serwisowe → Ustawienia kotła → Modulacja mocy` | 10 °C | 20 °C (2026-10-04 najpierw 30) |
| 4 | Tryb pracy pompy CWU (122) | `Menu → Ustawienia CWU` | Bez priorytetu (2) | Wyłączony (0) |
| 5 | Podwyższenie temp. kotła od CWU i mieszacza (105) | `Ustawienia serwisowe → Ustawienia CO i CWU` | 5 °C | 5 °C (2026-10-04 najpierw 2; zbędne, bo histereza działa i przy podniesionej zadanej) |
| 6 | Minimalna temperatura mieszacza 1 (mieszacz, nr 1) | `Ustawienia serwisowe → Ustawienia mieszacza 1` | 40 °C | 30 °C |
| 7 | Maksymalna temperatura mieszacza 1 (mieszacz, nr 2) | to samo menu | 50 °C | 30 °C |
| 8 | Temperatura załączenia pompy CO (101) | `Ustawienia serwisowe → Ustawienia CO i CWU` | 50 °C | 30 °C |

Punkt 8 dopisany po pierwszym włączeniu regulatora (2026-10-04 00:53): przy 50 °C i wodzie w
kotle 46,7 °C pompy CO i obu mieszaczy stały mimo zapotrzebowania; po obniżeniu ruszyły
(00:57:00). Regulator w stanie 5 (postój), zadana kotła 33 °C (30 podbite przez mieszacz 1:
31 + 2), bez rozpalania. Po włączeniu regulatora zawór mieszacza 1 zamykał się bez przerwy
4 min 42 s (00:53:21–00:58:03), mimo temperatury obiegu poniżej zadanej, potem regulator
otwierał go impulsami 2–14 s — najpewniej kalibracja położenia zaworu po starcie (instr.
850P2 str. 31: mieszacz 1 kalibruje się samoczynnie; czasu nie podaje). Do potwierdzenia przy
kolejnym włączeniu.

Kolejność: przy przejściu na „bez palenia” 1 przed 2 i 6 przed 7 (panel nie przyjmie zadanej
poniżej minimum ani minimum powyżej maksimum); przy powrocie odwrotnie — 2 przed 1 (najpierw
zadana 67, potem minimum 65) i 7 przed 6 (najpierw max 50, potem min 40). Bez zmian w obu
zestawach: temperatura załączenia pompy CO 50 °C, sterowanie pogodowe mieszacza 1 włączone.
CWU w odczycie 2026-10-04: zadana 45 °C (nr 119; 2026-10-03 rano 55, potem 50 ze sterownika),
histereza 10 °C (nr 123; kopia z punktu 4 ma 15) — zmienione na panelu poza tą listą.

Odczyt 2026-10-04 po ustawieniu „bez palenia” na panelu: nr 99, 98, 17, 122, 105 i min
mieszacza 1 zgodne z tabelą; **max mieszacza 1 = 40 °C** (zamiast 30), więc zadana mieszacza
1 z krzywej to 30–40 °C, a zadana kotła rośnie od mieszacza najwyżej do 42 °C. Harmonogramy
bez zmian.

**Stan faktyczny 2026-10-04 ok. 01:40** (odczyt ustawień, pełna kopia:
[ustawienia-kotla-2026-10-04.json](ustawienia-kotla-2026-10-04.json)) — „bez palenia” z
poprawkami użytkownika: min. kotła 30, zadana 30, histereza kotła 30, pompa CO od 30 °C,
podwyższenie 5; **CWU: zadana 40, histereza 5, tryb Priorytet** (nr 122 = 1 — potwierdza
kolejność 0 Wyłączony / 1 Priorytet / 2 Bez priorytetu); **mieszacz 1: sterowanie pogodowe
wyłączone, stała zadana 35 °C** (min 30, max 40; zaraz potem max z powrotem 50 — kopia JSON ma jeszcze 40). Pompa ciepła trzyma wodę w kotle ok. 45 °C
bez odbioru i ok. 31 °C przy pracujących grzejnikach; przy Priorytecie pompa CO stoi na czas
ładowania CWU, woda w kotle rośnie i ładuje zasobnik bez palenia.

**Histereza kotła 20 °C — kocioł jako rezerwa pompy ciepła** (ustawione 2026-10-04 ok. 01:50):
kocioł rozpala, gdy woda spadnie poniżej zadanej kotła − 20. Zadana kotła: grzejniki 35 + 5 =
40 °C → rozpala poniżej **20 °C**; ładowanie CWU 40 + 5 = 45 °C → rozpala poniżej **25 °C**.
Przy pracującej pompie ciepła woda w kotle ma ok. 31 °C (grzejniki pracują) do 45 °C (bez
odbioru), więc kocioł nie rozpala; gdy pompa ciepła stanie i woda ostygnie, kocioł przejmuje
grzanie. Histereza 30 = nie rozpala nigdy (progi 10/15 °C). Zadana mieszacza 1 powyżej 35 °C
podnosi próg dla grzejników (np. 50 → zadana kotła 55, próg 35 °C — rozpalałby przy pracy
pompy ciepła). Do potwierdzenia odczytem ustawień (kopia JSON z 01:40 ma jeszcze 30).

Dobór histerezy kotła (przy zadanej mieszacza 1 = 35 °C, zadanej CWU = 40 °C, podwyższeniu 5 °C;
woda z pompy ciepła ok. 31 °C przy pracujących grzejnikach — od takiej zwykle zaczyna się też
ładowanie CWU — i ok. 45 °C bez odbioru):

| Histereza kotła | Rozpala dla grzejników poniżej (40 − h) | Rozpala dla CWU poniżej (45 − h) | Co to daje |
|---|---|---|---|
| 30 | 10 °C | 15 °C | nie rozpala nigdy, nawet gdy pompa ciepła stanie |
| **20 (wybrane)** | **20 °C** | **25 °C** | rozpala tylko wtedy, gdy pompa ciepła przestanie grzać (rezerwa) |
| 15 | 25 °C | 30 °C | mały zapas, może rozpalić przy początku ładowania CWU |
| 10 | 30 °C | 35 °C | rozpala prawie zawsze przy ładowaniu CWU |

Skutki „bez palenia”: grzejniki dostają najwyżej 30 °C (zadana mieszacza 1 stała 30 °C);
zasobnika CWU kocioł nie grzeje. Plan na później: tryb pompy CWU **Priorytet** — przy niskiej
CWU regulator zatrzymuje pompę CO, podnosi zadaną kotła do zadanej CWU + nr 105 i rozpala,
żeby naładować CWU; wtedy ustawić też „Postój pompy CO podczas ładowania CWU” (nr 102, dziś 0),
żeby grzejniki nie wystygły. Opis parametrów: [parametry-kotla.md](parametry-kotla.md).

## 4c. Czujnik CWU: podejrzenie złego styku (noc 2026-10-03/04)

Nocny podgląd (SensorData co 30 s z magistrali i odczyty z chmury co 5 min), kocioł w postoju,
pompa CWU kotła cały czas wyłączona, pompa ciepła ok. 38 °C, kocioł 34–38 °C: temperatura CWU
rosła nierówno (skoki ±0,5–1,5 °C co 30 s) do 61,9 °C (04:32), 65,7 °C (05:53) i 67,6 °C (06:06),
a potem spadała **skokowo w ciągu 30 s**: 58,6 → 42,9 °C (04:43), 65,4 → 58,3 °C (05:55),
67,1 → 55,4 °C (06:08), 49,6 → 44,9 °C (06:16). Po skoku odczyt był równy (42,8–43,0 °C przez
kilka minut) — to najpewniej prawdziwa temperatura wody. Zasobnik nie stygnie o 16 °C w 30 s, a
żadne źródło ciepła nie dawało > 50 °C, więc to błąd pomiaru, najpewniej rosnąca rezystancja na
złączu lub przewodzie czujnika (użytkownik też podejrzewa czujnik).

Skutki: przy zawyżonym odczycie regulator uznaje CWU za nagrzaną i nie ładuje zasobnika
(tryb Priorytet); przekłamanie do ok. 70 °C mogłoby uruchomić ochronę przed przegrzaniem CWU.
Do sprawdzenia: złącze czujnika CWU w module A (dokręcić, śniedź), przewód i łączenia, osadzenie
czujnika w tulei zasobnika, porównanie z termometrem.

## 4. Kopia ustawień regulatora (2026-10-03)

Wartości instalacji odczytane z regulatora 2026-10-03 przy kotle uruchomionym, ale
wyłączonym — **punkt odniesienia do przywrócenia po awarii** (wymiana regulatora, reset do
ustawień fabrycznych). Pełna kopia z surowymi bajtami: [ustawienia-kotla-2026-10-03.json](ustawienia-kotla-2026-10-03.json).

Jak powstała: sterownik pieca (firmware 1.1.0) jako ecoNET wysłał zapytania `0x31`
(parametry kotła), `0x32` (mieszacze), `0x5C` (termostaty), `0x36` (harmonogramy) i `0x55`
(schemat RegulatorData); odpowiedzi rozkodowano kodem PyPlumIO dla ecoMAX P. Nazwy
parametrów są z PyPlumIO, opisy po polsku orientacyjne — nazwę pozycji w menu sprawdzić w
instrukcji (źródła 1–3). Pogrubione wartości są potwierdzone na panelu.

Jak odczytać ponownie: sterownik czyta ustawienia sam po każdym starcie (po minucie
nasłuchu); ponownie na polecenie `p` z konsoli USB. Wynik: linie `SETTINGS …` na konsoli i
strona sterownika `/boiler-settings.json` (surowe dane, link „pobierz” na stronie `/`).
Dekodowanie: `python tools/dekoduj_ustawienia.py <log albo boiler-settings.json> archiwum.json
tabela.md <data>` (wymaga `pip install pyplumio`, sprawdzone z 0.6.8). Drugi odczyt z
2026-10-03 (w nagraniu `test/fixtures/kociol-2026-10-03.txt`) dał bajt w bajt to samo.

Jak przywrócić: ręcznie na panelu kotła (menu użytkownika i serwisowe) według tabel albo,
przy zatrzymanym kotle, poleceniem `set <nr> <wartość>` na konsoli sterownika (punkt 4a).

**Zmiany po tej kopii:** 2026-10-03 11:25 temperatura zadana CWU (nr 119) **55 → 50 °C**
(punkt 4a). Tabela niżej ma wartości sprzed zmiany.

### Parametry kotła

60 z 140 pozycji ma wartość (pozostałe regulator zgłasza jako nieużywane, `FF FF FF`).
Grupa „nadmuch” (nr 0–2, 41, 55, 61, 68) ma wartości powyżej 100 przy jednostce `%`
według PyPlumIO — jednostka niepewna, ważna jest sama liczba.

| Nr | Parametr (PyPlumIO) | Opis | Wartość | Zakres |
|---|---|---|---|---|
| 0 | `airflow_power_100` | Nadmuch przy mocy 100% (jednostka niepewna) | 235 % | 171–255 |
| 1 | `airflow_power_50` | Nadmuch przy mocy 50% (jednostka niepewna) | 170 % | 101–234 |
| 2 | `airflow_power_30` | Nadmuch przy mocy 30% (jednostka niepewna) | 100 % | 10–169 |
| 14 | `cycle_duration` | Czas cyklu (podawanie + przerwa) | 20 s | 1–250 |
| 15 | `h2_hysteresis` | Histereza H2 (zmniejszenie mocy do 50%) | 5 °C | 1–30 |
| 16 | `h1_hysteresis` | Histereza H1 (zmniejszenie mocy do 30%) | 4 °C | 1–30 |
| 17 | `heating_hysteresis` | Histereza kotła | **10 °C** | 1–30 |
| 18 | `fuzzy_logic` | Tryb regulacji (1 = Fuzzy Logic) | 1 | 0–2 |
| 23 | `min_fan_power` | Minimalna moc nadmuchu | 9 % | 9–70 |
| 24 | `max_fan_power` | Maksymalna moc nadmuchu | 100 % | 30–100 |
| 41 | `kindling_airflow_power` | Rozpalanie: nadmuch (jednostka niepewna) | 60 % | 10–255 |
| 44 | `kindling_test_time` | Rozpalanie: czas testu | 60 s | 10–240 |
| 47 | `kindling_time` | Rozpalanie: czas rozpalania | 7 min | 1–20 |
| 48 | `warming_up_time` | Rozpalanie: czas nagrzewania | 30 min | 1–250 |
| 50 | `kindling_finish_threshold_temp` | Rozpalanie: przyrost temperatury spalin / próg zakończenia | 10 °C | 1–100 |
| 53 | `kindling_min_power_time` | Rozpalanie: czas pracy na mocy minimalnej | 3 min | 0–100 |
| 55 | `stabilization_airflow_power` | Stabilizacja: nadmuch (jednostka niepewna) | 115 % | 10–255 |
| 56 | `supervision_time` | Nadzór: czas nadzoru (0 = wyłączony) | 0 | 0–60 |
| 60 | `supervision_cycle_duration` | Nadzór: czas cyklu | 20 s | 1–250 |
| 61 | `supervision_airflow_power` | Nadzór: nadmuch (jednostka niepewna) | 60 % | 10–255 |
| 65 | `burning_off_max_time` | Wygaszanie: czas maksymalny | 15 min | 5–60 |
| 66 | `burning_off_min_time` | Wygaszanie: czas minimalny | 5 min | 1–15 |
| 68 | `burning_off_airflow_power` | Wygaszanie: nadmuch (jednostka niepewna) | 150 % | 10–255 |
| 69 | `burning_off_fan_work` | Wygaszanie: praca nadmuchu | 40 | 1–100 |
| 70 | `burning_off_fan_pause` | Wygaszanie: przerwa nadmuchu | 0 | 0–250 |
| 71 | `start_burning_off` | Wygaszanie: start | 10 % | 1–100 |
| 72 | `stop_burning_off` | Wygaszanie: stop | 5 % | 1–100 |
| 73 | `cleaning_begin_time` | Czyszczenie: czas na początku | 15 | 10–250 |
| 75 | `cleaning_airflow_power` | Czyszczenie: nadmuch | 0 % | 0–1 |
| 76 | `warming_up_pause_time` | Nagrzewanie: przerwa | 4 | 1–24 |
| 85 | `max_fuel_flow` | Maksymalna wydajność podajnika | 9,6 kg/h | 0,2–50 |
| 87 | `fuel_tank_capacity` | Pojemność zasobnika paliwa | 100 kg | 50–5000 |
| 88 | `fuel_calorific_value` | Kaloryczność paliwa | 5,2 kWh/kg | 0,1–25 |
| 89 | `fuel_detection_time` | Czas detekcji paliwa | 1 min | 0–5 |
| 98 | `heating_target_temp` | Temperatura zadana kotła | **67 °C** | 65–80 |
| 99 | `min_heating_target_temp` | Minimalna temperatura kotła | 65 °C | 30–80 |
| 100 | `max_heating_target_temp` | Maksymalna temperatura kotła | 80 °C | 30–90 |
| 101 | `heating_pump_enable_temp` | Temperatura załączenia pompy CO | **50 °C** | 30–80 |
| 102 | `pause_heating_for_water_heater` | Postój pompy CO przy ładowaniu CWU | 0 min | 0–99 |
| 105 | `increase_heating_temp_for_water_heater` | Podwyższenie temperatury kotła od CWU | 5 °C | 2–15 |
| 106 | `weather_control` | Sterowanie pogodowe kotła | 0 | 0–1 |
| 107 | `heating_curve` | Krzywa grzewcza kotła | 0,7 | 0,1–4 |
| 108 | `heating_curve_shift` | Przesunięcie krzywej grzewczej kotła | 0 °C | -20–20 |
| 109 | `weather_factor` | Współczynnik temperatury pokojowej | 1 | 0–100 |
| 111 | `thermostat_mode` | Wybór termostatu (0 wył., 1 uniwersalny, 2 ecoSTER) | 0 | 0–2 |
| 112 | `thermostat_decrease_target_temp` | Termostat pokojowy kotła (obniżenie zadanej) | 0 °C | 0–30 |
| 113 | `disable_pump_on_thermostat` | Wyłączenie pomp od termostatu | 0 | 0–1 |
| 114 | `boiler_alert_temp` | Temperatura alarmowa kotła (STB) | 88 °C | 85–95 |
| 116 | `external_boiler_temp` | Temperatura zewnętrzna wyłączenia kotła / parametr zewn. | 0 °C | 0–75 |
| 119 | `water_heater_target_temp` | Temperatura zadana CWU | **55 °C** | 20–70 |
| 120 | `min_water_heater_target_temp` | Minimalna temperatura CWU | 20 °C | 20–55 |
| 121 | `max_water_heater_target_temp` | Maksymalna temperatura CWU | 70 °C | 25–80 |
| 122 | `water_heater_work_mode` | Tryb pracy pompy CWU (0 wył., 1 priorytet, 2 bez priorytetu) | 2 | 0–2 |
| 123 | `water_heater_hysteresis` | Histereza zasobnika CWU | **15 °C** | 1–30 |
| 124 | `water_heater_disinfection` | Dezynfekcja CWU | 0 | 0–1 |
| 125 | `summer_mode` | Tryb LATO (0 wył., 1 wł., 2 auto) | 0 | 0–2 |
| 126 | `summer_mode_enable_temp` | Temperatura załączenia trybu LATO | 15 °C | 5–30 |
| 127 | `summer_mode_disable_temp` | Temperatura wyłączenia trybu LATO | 10 °C | 1–14 |
| 128 | `water_heater_work_extension` | Wydłużenie pracy pompy CWU | 3 min | 0–99 |
| 139 | `?` | — | — | surowo [50, 0, 100] |

### Mieszacz 1

Odpowiedź ma miejsce na 5 mieszaczy, wartości ma tylko mieszacz 1 (zadana 40 °C jak na panelu). Mieszacz 2 (zadana 27 °C w RegulatorData) w odpowiedzi nie ma wartości — do wyjaśnienia.

| Mieszacz | Nr | Parametr | Opis | Wartość | Zakres |
|---|---|---|---|---|---|
| 1 | 0 | `mixer_target_temp` | Temperatura zadana mieszacza | 40 °C | 40–50 |
| 1 | 1 | `min_target_temp` | Minimalna temperatura mieszacza | 40 °C | 20–90 |
| 1 | 2 | `max_target_temp` | Maksymalna temperatura mieszacza | 50 °C | 20–90 |
| 1 | 3 | `thermostat_decrease_target_temp` | Obniżenie zadanej mieszacza od termostatu | 0 °C | 0–30 |
| 1 | 4 | `weather_control` | Sterowanie pogodowe mieszacza | 1 | 0–1 |
| 1 | 5 | `heating_curve` | Krzywa grzewcza mieszacza | 0,7 | 0,1–4 |
| 1 | 6 | `heating_curve_shift` | Przesunięcie krzywej grzewczej mieszacza | 0 °C | -20–20 |
| 1 | 7 | `weather_factor` | Współczynnik temperatury pokojowej mieszacza | 10 | 0–100 |
| 1 | 8 | `work_mode` | Obsługa mieszacza (0 wył., 1 CO, 2 podłogowe, 3 tylko pompa) | 1 | 0–3 |
| 1 | 9 | `mixer_input_dead_zone` | Strefa nieczułości mieszacza | 2 °C | 0–4 |
| 1 | 11 | `thermostat_mode` | Wybór termostatu mieszacza (0 wył.) | 0 | 0–2 |
| 1 | 12 | `disable_pump_on_thermostat` | Wyłączenie pompy mieszacza od termostatu | 0 | 0–1 |

### Harmonogramy

Harmonogramy CO, CWU i mieszaczy 1 i 2 są wyłączone (przełącznik 0, obniżenie 0 °C; cała
doba zaznaczona jako praca). Włączony jest tylko harmonogram czyszczenia (`boiler_clean`):
7:00–21:30 codziennie. Pełny zapis (48 półgodzin na dzień) w pliku JSON.

### Termostaty i schemat

Odpowiedź o termostaty (159 B, 37 parametrów) zapisano tylko surowo: podział na termostaty
wymaga ich liczby z SensorData. Schemat RegulatorData (275 pól: identyfikator i typ) jest w
pliku JSON — posłuży do rozszyfrowania ramki `0x08` (punkt 1a).

## Źródła

1. [Instrukcja obsługi i montażu — Panel dotykowy ecoMAX (pellux.pl)](https://pellux.pl/app/uploads/2017/02/26571_Panel_dotykowy.pdf),
   str. 7 (POSTÓJ i rozpalenie), 22–26 (menu serwisowe, wartości domyślne), 29–30 (opisy
   parametrów kotła, CO i CWU).
2. [Instrukcja kotła Pellux 200 Touch](pellux200-dokumentacja/kociol-Pellux-200-Touch-instrukcja.pdf),
   str. 33–38 (menu użytkownika i serwisowe).
3. [Instrukcja ecoMAX 860P TOUCH](pellux200-dokumentacja/ecoMAX-860P-TOUCH-instrukcja.pdf),
   str. 8, 12, 41.
4. [Regulator ecoMAX860P3 — instrukcja (kipi.pl)](https://kipi.pl/wp-content/uploads/2021/03/Instrukcja-obslugi-regulatora-ecoMAX860P3-simTOUCH-ST4.pdf).
