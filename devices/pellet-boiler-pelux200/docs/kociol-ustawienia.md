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
- Przy sterowniku pokojowym regulator ma prawdopodobnie `Wybór termostatu = ecoSTER`; to
  wpływa na wariant automatyczny w punkcie 3 (jedno źródło termostatu). Model sterownika
  pokojowego — do uzupełnienia.
- Zaciski 36/37 (`D+`, `D−`, opis `B`) to osobna magistrala do modułu B/C — druga opcja,
  gdyby na magistrali panelu nie było ramek.
- Instrukcja regulatora wprost dla „ecoMAX 860P2” nie została znaleziona; najbliższe są
  instrukcja panelu ecoMAX ze strony Pellux (niżej, źródło 1) i instrukcje 860P/860P3.
  Nazwy pozycji menu na panelu mogą się nieznacznie różnić.

## 2. Kiedy kocioł rozpala i kiedy pracują pompy

| Zachowanie | Parametr (menu) | Wartość fabryczna | U nas (obserwacja) |
|---|---|---|---|
| Rozpalenie, gdy temperatura kotła < **temperatura zadana − histereza** | Temperatura zadana kotła (`Menu → Ustawienia kotła`) | — | ok. 60 °C |
| | Histereza kotła (`Ustawienia serwisowe → Ustawienia kotła → Modulacja mocy`) | **5 °C** (źródło 1, str. 26) | rozpala przy 55 °C |
| Pompa CO pracuje dopiero powyżej progu (ochrona kotła przed wychłodzeniem i roszeniem) | Temperatura załączenia pompy CO (`Ustawienia serwisowe → Ustawienia CO i CWU`) | nie podana w dokumentacji Pellux | pompy stoją poniżej 50 °C |
| Obniżenie temperatury zadanej przy rozwartym styku termostatu | Termostat pokojowy kotła (`Ustawienia serwisowe → Ustawienia kotła → Modulacja mocy`) | **0 °C**, maks. 30 °C (źródło 1, str. 26) | — |
| Wejście termostatu | Wybór termostatu (`Ustawienia serwisowe → Ustawienia kotła`): Wyłączony / Uniwersalny / ecoSTER | — | — |
| Dolna granica temperatury zadanej — także ustawianej automatycznie (obniżenia, termostat) | Minimalna temperatura kotła (`Ustawienia serwisowe → Ustawienia kotła`) | — | — |
| Przymknięcie zaworu przy zimnym powrocie | Ochrona powrotu: Minimalna temperatura powrotu (ecoDRIVE) | — | 40 °C |
| Progi zmniejszania mocy w pracy (nie start) | 50% Histereza H2 / 30% Histereza H1 | 3 °C / 1 °C (źródło 1, str. 26) | — |

„—” = brak w znalezionej dokumentacji; wartość odczytać na panelu.

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
   - **ręcznie:** Histereza kotła 5 → 20 °C (przy zadanej 60 °C start przy 40 °C); po
     zakończeniu pracy pompy ciepła z powrotem 5 °C i pompa CO 50 °C;
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

Sterownik pieca (`devices/pellet-boiler-pelux200`) tylko odczytuje magistralę i nie zmienia
ustawień regulatora. Zmiana nastaw z chmury wymagałaby nadawania na magistralę (etap 2,
niezaimplementowany).

## Źródła

1. [Instrukcja obsługi i montażu — Panel dotykowy ecoMAX (pellux.pl)](https://pellux.pl/app/uploads/2017/02/26571_Panel_dotykowy.pdf),
   str. 7 (POSTÓJ i rozpalenie), 22–26 (menu serwisowe, wartości domyślne), 29–30 (opisy
   parametrów kotła, CO i CWU).
2. [Instrukcja kotła Pellux 200 Touch](pellux200-dokumentacja/kociol-Pellux-200-Touch-instrukcja.pdf),
   str. 33–38 (menu użytkownika i serwisowe).
3. [Instrukcja ecoMAX 860P TOUCH](pellux200-dokumentacja/ecoMAX-860P-TOUCH-instrukcja.pdf),
   str. 8, 12, 41.
4. [Regulator ecoMAX860P3 — instrukcja (kipi.pl)](https://kipi.pl/wp-content/uploads/2021/03/Instrukcja-obslugi-regulatora-ecoMAX860P3-simTOUCH-ST4.pdf).
