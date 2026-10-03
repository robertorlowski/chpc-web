# Parametry regulatora kotła — co da się odczytać i zmienić

Lista parametrów regulatora kotła **Pellux 200 Touch** (regulator ecoMAX 860P2, panel
ecoTOUCH 3), które biblioteka PyPlumIO potrafi odczytać i zmienić. Każdy parametr ma opis
działania, wartość z naszego kotła i ocenę, czy nadaje się do zmiany z aplikacji. Dokument
służy właścicielowi do wyboru parametrów, które aplikacja ma ustawiać. Wybór należy do
właściciela.

## Jak czytać ten dokument

**Skąd lista.** Nazwy i numery parametrów pochodzą z biblioteki PyPlumIO (lista dla
regulatorów ecoMAX P: `parameters/ecomax.py`, `parameters/mixer.py`). Opisy pochodzą z
instrukcji producenta (źródła na końcu). PyPlumIO ma poprawki numeracji tylko dla jednego
modelu (ecoMAX 860D3-HB). Nasz regulator 860P2 do nich nie należy, więc obowiązuje lista
podstawowa. Zgodność numeracji potwierdzają zakresy z naszego kotła: zadana kotła (nr 98) ma
zakres 65–80 °C, a nr 99 i 100 (min. i maks. temperatura kotła) mają wartości 65 i 80 °C.
Tak samo zadana CWU (nr 119) i nr 120–121. Odczyt nr 119 na panelu się zgadza, a zapis nr 119
zadziałał.

**Numer (Nr)** to indeks parametru w ramce zapisu `0x33` (`[nr, wartość]`). Mieszacz ma
osobną numerację i ramkę `0x34` (punkt „Mieszacze”).

**Wartość surowa.** Ramka niesie jeden bajt (0–255). Część parametrów ma krok albo
przesunięcie. Przykłady: krzywa grzewcza 0,7 to surowo 7, przesunięcie krzywej 0 °C to
surowo 20, wydajność podajnika 9,6 kg/h to surowo 48. Kolumna „Jednostka/krok” podaje to
przy parametrach, których dotyczy.

**Kolumna „U nas”** to wartość i zakres (min–max) odczytane z regulatora 2026-10-03
([ustawienia-kotla-2026-10-03.json](ustawienia-kotla-2026-10-03.json), punkt 4 w
[kociol-ustawienia.md](kociol-ustawienia.md)). **„Brak w kotle”** znaczy, że regulator nie
podał wartości (zgłasza pozycję jako nieużywaną, bajty `FF FF FF`). Takiego parametru nasz
kocioł nie obsługuje albo nie ma podłączonego osprzętu. Z 140 pozycji wartość ma 60.

**Kolumna „Nazwa na panelu”** podaje nazwę z instrukcji. Na ecoTOUCH 3 nazwa może się
nieznacznie różnić. Znak zapytania oznacza przypisanie prawdopodobne, ale niepotwierdzone.
„—” oznacza brak w instrukcjach.

**Opisy.** Przy każdym opisie jest źródło, np. „(instr. 860P str. 41)”. Gdy instrukcje nic
nie mówią, opis wynika z nazwy PyPlumIO i ma dopisek „(opis z nazwy, niepotwierdzony)”.

**Ocena:**

- **Bezpieczny z aplikacji** — zmienia sposób grzania, nie spalanie. Błąd da się cofnąć bez
  szkody dla kotła.
- **Ostrożnie** — da się zmieniać, ale zła wartość może schłodzić kocioł, przegrzać
  instalację albo wyłączyć ochronę. Warto ograniczyć zakres w aplikacji.
- **Tylko serwis** — spalanie, podajnik, nadmuch, rozpalanie. Nastawy dobiera producent
  kotła. Zła wartość grozi wygaśnięciem, przesypaniem paliwa, przegrzaniem albo cofnięciem
  płomienia.
- **Nie ruszać** — bezpieczeństwo, kalibracja albo parametr o niepewnym znaczeniu.
- **Nie dotyczy** — brak w kotle.

**Stan zmian z aplikacji.** Zmiana z aplikacji jeszcze nie istnieje. Dziś sterownik pieca
zmienia jeden parametr kotła poleceniem `set <nr> <wartość>` na konsoli USB (wartość
surowa). Sprawdzono to na nr 119: zadana CWU 55 → 50 °C, 2026-10-03
([kociol-ustawienia.md](kociol-ustawienia.md), punkt 4a). Sterownik przyjmuje zmianę tylko w
zakresie min–max podanym przez regulator i tylko przy **stanie kotła 0**. Stan 0 to
„Kocioł wyłączony” na panelu, a nie POSTÓJ (POSTÓJ to inny stan). Planowane sterowanie z
aplikacji ma tak samo działać tylko przy zatrzymanym kotle.

## 1. Temperatura zadana i histereza kotła

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 98 | `heating_target_temp` | Temperatura zadana kotła | Temperatura wody w kotle, do której kocioł grzeje. Regulator sam ją podnosi na czas ładowania CWU i mieszaczy. Przy włączonym sterowaniu pogodowym regulator pomija tę nastawę (instr. 860P str. 10). | °C, 1 | 67 (65–80) | Bezpieczny z aplikacji. Dolna granica zależy od nr 99. |
| 99 | `min_heating_target_temp` | Minimalna temperatura kotła | Najniższa zadana, jaką może ustawić użytkownik i jaką regulator może ustawić sam (obniżenia nocne, sterowanie pogodowe, termostat) (instr. 860P str. 41, Pellux str. 44). Dziś blokuje zadaną poniżej 65 °C. | °C, 1 | 65 (30–80) | Ostrożnie. Menu serwisowe. Niska wartość pozwala na zimny kocioł i roszenie, gdy kocioł się pali. Potrzebna do planu z pompą ciepła ([kociol-ustawienia.md](kociol-ustawienia.md), punkt 3). |
| 100 | `max_heating_target_temp` | Maksymalna temperatura kotła | Najwyższa zadana, jaką może ustawić użytkownik i regulator (instr. 860P str. 41, Pellux str. 44). | °C, 1 | 80 (30–90) | Nie ruszać. Nie ma potrzeby zmiany. Wyższa wartość zbliża kocioł do progu alarmu. |
| 17 | `heating_hysteresis` | Histereza kotła | Kocioł rozpala, gdy temperatura spadnie poniżej zadanej minus histereza (instr. 860P str. 12 i 41, Pellux str. 41). U nas start przy 67 − 10 = 57 °C. Fabrycznie 10 °C (Pellux str. 41). | °C, 1 | 10 (1–30) | Bezpieczny z aplikacji. Mała histereza daje częste rozpalanie. |

## 2. Pompa CO i współpraca z CWU

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 101 | `heating_pump_enable_temp` | Temperatura załączenia pompy CO | Pompa CO włącza się dopiero powyżej tej temperatury kotła. Chroni kocioł przed roszeniem od zimnej wody powrotnej. Samo wyłączanie pompy nie wystarcza jako ochrona przed korozją (instr. 860P str. 42, Pellux str. 45). | °C, 1 | 50 (30–80) | Ostrożnie. Menu serwisowe. Niska wartość przy palącym się kotle sprzyja roszeniu. W planie z pompą ciepła ok. 40 °C. |
| 102 | `pause_heating_for_water_heater` | Postój pompy CO podczas ładowania CWU | Przy priorytecie CWU pompa CO stoi. Po tym czasie włącza się na stałe 30 s, żeby nie wychłodzić instalacji (instr. 860P str. 42). | min, 1 | 0 (0–99) | Bezpieczny z aplikacji. Działa tylko przy priorytecie CWU (nr 122 = Priorytet). |
| 105 | `increase_heating_temp_for_water_heater` | Podwyższenie temp. kotła od CWU i mieszacza | O ile regulator podnosi zadaną kotła, żeby załadować CWU, bufor i mieszacz. Podnosi tylko wtedy, gdy zadana kotła jest za niska (instr. 860P str. 42, Pellux str. 45). | °C, 1 | 5 (2–15) | Bezpieczny z aplikacji. |
| 118 | `pump_hysteresis` | — | Histereza włączania pompy (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |

## 3. CWU

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 119 | `water_heater_target_temp` | Temperatura zadana CWU | Temperatura wody w zasobniku CWU (instr. 860P str. 12, Pellux str. 16). | °C, 1 | **50** od 2026-10-03 11:25 (w kopii 55) (20–70) | Bezpieczny z aplikacji. Sprawdzony zapis z konsoli. |
| 120 | `min_water_heater_target_temp` | Minimalna temperatura CWU | Najniższa zadana CWU, jaką może ustawić użytkownik (instr. 860P str. 42). | °C, 1 | 20 (20–55) | Ostrożnie. Menu serwisowe. Zmiana potrzebna tylko wtedy, gdy zadana CWU ma zejść poniżej 20 °C. |
| 121 | `max_water_heater_target_temp` | Maksymalna temperatura CWU | Do tej temperatury regulator grzeje CWU, gdy zrzuca nadmiar ciepła z przegrzanego kotła. Za wysoka grozi poparzeniem, za niska odbiera kotłowi zrzut ciepła (instr. 860P str. 42 i 45). | °C, 1 | 70 (25–80) | Nie ruszać. Parametr bezpieczeństwa. |
| 122 | `water_heater_work_mode` | Tryb pracy pompy CWU | Wyłączony (bez ładowania CWU), Priorytet (pompa CO stoi do załadowania CWU), Bez priorytetu (pompy CO i CWU razem) (instr. 860P str. 12, Pellux str. 15). Kolejność 0/1/2 według kopii ustawień (niepotwierdzona). | wybór 0–2 | 2 = Bez priorytetu (0–2) | Bezpieczny z aplikacji. |
| 123 | `water_heater_hysteresis` | Histereza zasobnika CWU | Pompa CWU startuje, gdy CWU spadnie poniżej zadanej minus histereza. Mała histereza daje częstsze ładowanie (instr. 860P str. 12, Pellux str. 16). U nas ładowanie poniżej 50 − 15 = 35 °C. | °C, 1 | 15 (1–30) | Bezpieczny z aplikacji. |
| 124 | `water_heater_disinfection` | Dezynfekcja CWU | Raz w tygodniu, w nocy z niedzieli na poniedziałek o 2:00, regulator grzeje CWU do 70 °C i trzyma 10 min. Ryzyko poparzenia, domowników trzeba uprzedzić (instr. 860P str. 12–13, Pellux str. 15–16). | wył./wł. | 0 = wył. (0–1) | Ostrożnie. Ryzyko poparzenia. Nie włączać przy wyłączonej obsłudze CWU. |
| 128 | `water_heater_work_extension` | Wydłużenie pracy CWU | Po załadowaniu CWU pompa CWU pracuje dłużej, żeby schłodzić kocioł. Dotyczy zwłaszcza trybu LATO (instr. 860P str. 42, 850P2 str. 43). | min, 1 | 3 (0–99) | Ostrożnie. Za mało grozi przegrzaniem kotła latem, za dużo grzaniem CWU bez potrzeby. |

## 4. Cyrkulacja CWU

Pompa cyrkulacyjna wymaga modułu B (instr. 860P str. 12). U nas brak.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 129 | `circulation_control` | — | Włączenie obsługi pompy cyrkulacyjnej (opis z nazwy, niepotwierdzony). | wył./wł. | brak w kotle | Nie dotyczy. |
| 130 | `circulation_pause` | Czas postoju pompy cyrkulacyjnej | Przerwa między okresami pracy pompy cyrkulacyjnej. Zalecane 15–40 min (instr. 860P str. 42). | min | brak w kotle | Nie dotyczy. |
| 131 | `circulation_work` | Czas pracy pompy cyrkulacyjnej | Czas pracy pompy cyrkulacyjnej w cyklu. Instrukcja zaleca 60–120 s, a PyPlumIO podaje minuty (instr. 860P str. 42). | min wg PyPlumIO (niepewne) | brak w kotle | Nie dotyczy. |
| 132 | `circulation_start_temp` | Temperatura startu pompy cyrkulacyjnej | Temperatura CWU, przy której rusza pompa cyrkulacyjna (instr. 860P str. 42). | °C | brak w kotle | Nie dotyczy. |

## 5. Tryb LATO

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 125 | `summer_mode` | Tryb LATO (Lato / Zima / Auto) | Lato: kocioł grzeje tylko CWU, ogrzewanie CO jest wyłączone. Auto: przełączanie według czujnika pogodowego. Przy LATO wszystkie odbiorniki mogą być wyłączone, więc trzeba sprawdzić, czy kocioł się nie przegrzeje (instr. 860P str. 12, Pellux str. 11 i 16). Kolejność 0/1/2 według kopii ustawień (niepotwierdzona; u nas 0 przy grzaniu CO, więc 0 to prawdopodobnie Zima). | wybór 0–2 | 0 (0–2) | Bezpieczny z aplikacji. Nie włączać LATO przy niesprawnej pompie CWU (instr. 850P2 str. 13). |
| 126 | `summer_mode_enable_temp` | Temperatura włączenia trybu LATO | W trybie Auto: temperatura zewnętrzna, powyżej której włącza się LATO (instr. 850P2 str. 13, 860P str. 12). | °C, 1 | 15 (5–30) | Bezpieczny z aplikacji. |
| 127 | `summer_mode_disable_temp` | Temperatura wyłączenia trybu LATO | W trybie Auto: temperatura zewnętrzna, poniżej której LATO się wyłącza (instr. 850P2 str. 13, 860P str. 12). | °C, 1 | 10 (1–14) | Bezpieczny z aplikacji. |

## 6. Sterowanie pogodowe kotła

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 106 | `weather_control` | Sterowanie pogodowe kotła | Zadana kotła liczona z temperatury zewnętrznej według krzywej grzewczej. Ręczna zadana (nr 98) jest wtedy pomijana (instr. 860P str. 10 i 14). | wył./wł. | 0 = wył. (0–1) | Ostrożnie. Po włączeniu aplikacja nie ustawi już zadanej wprost. |
| 107 | `heating_curve` | Krzywa grzewcza kotła | Nachylenie krzywej. Wytyczne: podłoga 0,2–0,6, grzejniki 1,0–1,6, kocioł 1,8–4. Dobór doświadczalny, w odstępach kilku dni (instr. 860P str. 14, 850P2 str. 15). | krok 0,1 (surowo ×10) | 0,7 (0,1–4) | Bezpieczny z aplikacji. Działa tylko przy nr 106 = wł. |
| 108 | `heating_curve_shift` | Przesunięcie równoległe krzywej | Przesuwa krzywą w górę lub w dół. Temperatura pokojowa = 20 °C + przesunięcie (instr. 860P str. 13–14, Pellux str. 13). | °C, 1 (surowo +20) | 0 (−20–20) | Bezpieczny z aplikacji. Działa tylko przy nr 106 = wł. |
| 109 | `weather_factor` | Współczynnik temperatury pokojowej | Korekta zadanej od panelu pokojowego: (zadana pokojowa − zmierzona) × współczynnik / 10. 0 = bez korekty. Za duży daje wahania temperatury w pokoju (instr. 860P str. 13–14, Pellux str. 14). | 1 | 1 (0–100) | Bezpieczny z aplikacji. Działa przy sterowaniu pogodowym i panelu pokojowym. |

## 7. Termostat pokojowy kotła

U nas jest panel pokojowy eSTER_x80, ale wejście termostatu kotła jest wyłączone (nr 111 = 0).

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 111 | `thermostat_mode` | Wybór termostatu | Wyłączony (termostat nie wpływa na kocioł), Uniwersalny (styk zwierno-rozwierny), ecoSTER T1–T3 (sygnał z panelu pokojowego) (instr. 860P str. 41, Pellux str. 43). PyPlumIO opisuje go jako przełącznik, ale regulator podaje zakres 0–2. | wybór 0–2 | 0 = wyłączony (0–2) | Ostrożnie. Podstawa wariantu automatycznego w planie z pompą ciepła. |
| 112 | `thermostat_decrease_target_temp` | Termostat pokojowy kotła | O ile spada zadana kotła, gdy styk termostatu jest rozwarty (pokój nagrzany). Fabrycznie 0 °C (Pellux str. 41). | °C, 1 | 0 (0–30) | Bezpieczny z aplikacji. Obniżenie nie zejdzie poniżej nr 99. |
| 113 | `disable_pump_on_thermostat` | Wyłączenie pompy od termostatu | TAK: po rozwarciu styku termostatu zamyka mieszacz i wyłącza pompę (instr. 860P str. 41). Pompa CO stoi wtedy na „Czas postoju” i rusza na „Czas pracy” (nr 103/104) (instr. 860P str. 42). | nie/tak | 0 = nie (0–1) | Ostrożnie. Pokój może się wychłodzić. |
| 103 | `thermostat_pause` | Czas postoju pompy CO od termostatu | Ile pompa CO stoi po rozwarciu styku termostatu. Działa przy termostacie włączonym i nr 113 = TAK (instr. 860P str. 42). | brak jednostki w PyPlumIO | brak w kotle | Nie dotyczy. |
| 104 | `thermostat_work` | Czas pracy pompy CO od termostatu | Ile pompa CO pracuje między postojami od termostatu (instr. 860P str. 42). | brak jednostki w PyPlumIO | brak w kotle | Nie dotyczy. |
| 110 | `thermostat_operation` | — | Sposób działania termostatu (opis z nazwy, niepotwierdzony). W instr. 850P2 jest „Funkcja termostatu”: wyłącz palnik / wyłącz pompę / wyłącz wszystko (str. 37), ale przypisanie do tego numeru jest niepewne. | — | brak w kotle | Nie dotyczy. |

## 8. Moc i modulacja (nadmuch, podajnik przy 100/50/30 %)

Kocioł pracuje na trzech poziomach mocy: 100 % (MAX), 50 % (ŚRED), 30 % (MIN). W trybie
Standardowym poziom wybierają histerezy H2 i H1. W trybie Fuzzy Logic regulator dobiera moc
sam i histerez H1/H2 nie używa (instr. 850P2 str. 11, Pellux str. 41). U nas jest Fuzzy
Logic (nr 18 = 1).

**Jednostka nadmuchu.** PyPlumIO podaje `%`, a nasz regulator ma wartości do 255. Instrukcja
Pellux podaje moc nadmuchu w obr./min: fabrycznie 2650 / 2000 / 1300 obr./min, maksymalnie
2850 / 2640 / 1990 (Pellux str. 41). Wszystkie te liczby pasują dokładnie do wzoru
**obr./min = 10 × wartość + 300**: nasze 235 / 170 / 100 to 2650 / 2000 / 1300 obr./min
(nastawy fabryczne), a maksima zakresów 255 / 234 / 169 to 2850 / 2640 / 1990. To wniosek z
obliczenia, niepotwierdzony na panelu. Sprawdzenie: `Ustawienia serwisowe → Ustawienia kotła →
Modulacja mocy → Moc nadmuchu 100%` powinno pokazać 2650 obr./min. Zakresy trzech poziomów
są ze sobą powiązane: poziom 50 % musi leżeć między 30 % a 100 %.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 0 | `airflow_power_100` | Moc nadmuchu 100% | Obroty wentylatora przy mocy maksymalnej. Wpływa na spalanie (Pellux str. 37 i 41, instr. 860P str. 39). | `%` wg PyPlumIO, prawdopodobnie obr./min = 10 × w. + 300 | 235 ≈ 2650 obr./min (171–255) | Tylko serwis. |
| 1 | `airflow_power_50` | Moc nadmuchu 50% | Obroty wentylatora przy mocy pośredniej (Pellux str. 41). | jak wyżej | 170 ≈ 2000 obr./min (101–234) | Tylko serwis. |
| 2 | `airflow_power_30` | Moc nadmuchu 30% | Obroty wentylatora przy mocy minimalnej (Pellux str. 41). | jak wyżej | 100 ≈ 1300 obr./min (10–169) | Tylko serwis. |
| 3 | `boiler_power_100` | Maksymalna moc kotła | Moc kotła przypisana do poziomu 100 %. Na zrzucie w instrukcji 20 kW (Pellux str. 37 i 41). | kW | brak w kotle | Nie dotyczy. |
| 4 | `boiler_power_50` | Pośrednia moc kotła | Moc kotła przypisana do poziomu 50 %. Na zrzucie 10 kW (Pellux str. 41). | kW | brak w kotle | Nie dotyczy. |
| 5 | `boiler_power_30` | Minimalna moc kotła | Moc kotła przypisana do poziomu 30 %. Na zrzucie 6 kW (Pellux str. 41). | kW | brak w kotle | Nie dotyczy. |
| 6 | `max_fan_boiler_power` | — | Maksymalna moc wentylatora, prawdopodobnie wyciągowego (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 7 | `min_fan_boiler_power` | — | Minimalna moc wentylatora, prawdopodobnie wyciągowego (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 8 | `fuel_feeding_work_100` | — | Czas pracy podajnika w cyklu przy mocy 100 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 9 | `fuel_feeding_work_50` | — | Czas pracy podajnika przy mocy 50 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 10 | `fuel_feeding_work_30` | — | Czas pracy podajnika przy mocy 30 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 11 | `fuel_feeding_pause_100` | — | Przerwa podajnika w cyklu przy mocy 100 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 12 | `fuel_feeding_pause_50` | — | Przerwa podajnika przy mocy 50 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 13 | `fuel_feeding_pause_30` | — | Przerwa podajnika przy mocy 30 % (opis z nazwy, niepotwierdzony). | s | brak w kotle | Nie dotyczy. |
| 14 | `cycle_duration` | Cykl pracy podajnika (Czas cyklu PRACA) | Długość cyklu podajnika w trybie PRACA: czas podawania + czas postoju. Czas podawania regulator liczy z wymaganej mocy, wydajności podajnika i kaloryczności paliwa. Fabrycznie 20 s (Pellux str. 41, instr. 850P2 str. 10 i 35). | s, 1 | 20 (1–250) | Tylko serwis. |
| 15 | `h2_hysteresis` | 50% Histereza H2 | Próg przejścia z mocy 100 % na 50 % przy zbliżaniu się do zadanej. Fabrycznie 5 °C. Tylko w trybie Standardowym (Pellux str. 41, instr. 850P2 str. 11). | °C, 1 | 5 (1–30) | Ostrożnie. U nas bez znaczenia (Fuzzy Logic). |
| 16 | `h1_hysteresis` | 30% Histereza H1 | Próg przejścia z mocy 50 % na 30 %. Fabrycznie 3 °C. Tylko w trybie Standardowym (Pellux str. 41, instr. 850P2 str. 11). | °C, 1 | 4 (1–30) | Ostrożnie. U nas bez znaczenia (Fuzzy Logic). |
| 18 | `fuzzy_logic` | Tryb regulacji | Standardowy (trzy poziomy mocy) albo Fuzzy Logic (płynna moc, PID). Fabrycznie Fuzzy Logic. Przy samym grzaniu CWU (LATO bez bufora) instrukcje zalecają Standardowy. W Fuzzy Logic kocioł przechodzi do NADZORU dopiero po przekroczeniu zadanej o 5 °C (Pellux str. 41, instr. 860P str. 11, 850P2 str. 11). PyPlumIO opisuje go jako przełącznik, regulator podaje 0–2; 2 to prawdopodobnie „Lambda Fuzzy Logic” (850P2 str. 8, niepotwierdzone). | wybór 0–2 | 1 = Fuzzy Logic (0–2) | Ostrożnie. Zmienia sposób spalania. Lepiej zostawić Fuzzy Logic. |
| 19 | `min_fuzzy_logic_power` | Min moc kotła FL | Dolna granica mocy kotła w trybie Fuzzy Logic (instr. 850P2 str. 8 i 11). | % | brak w kotle | Nie dotyczy. |
| 20 | `max_fuzzy_logic_power` | Max moc kotła FL | Górna granica mocy kotła w trybie Fuzzy Logic (instr. 850P2 str. 8 i 11). | % | brak w kotle | Nie dotyczy. |
| 21 | `min_boiler_power` | — | Minimalna moc kotła (opis z nazwy, niepotwierdzony). | kW | brak w kotle | Nie dotyczy. |
| 22 | `max_boiler_power` | Ograniczenie max. mocy kotła? | Maksymalna moc kotła (opis z nazwy, niepotwierdzony). W menu Pellux jest „Ograniczenie max. mocy kotła” 20 kW (str. 33). | kW | brak w kotle | Nie dotyczy. |
| 23 | `min_fan_power` | Minimalna moc nadmuchu | Najmniejsza moc wentylatora, jaką może wybrać użytkownik. Ogranicza tylko zakres w menu, nie algorytm. Wentylator ma się obracać wolno, bez buczenia (Pellux str. 43, instr. 850P2 str. 36). | %, 1 | 9 (9–70) | Tylko serwis. |
| 24 | `max_fan_power` | Maksymalna moc nadmuchu | Największa moc wentylatora, jaką może wybrać użytkownik. Ogranicza tylko zakres w menu (Pellux str. 43). | %, 1 | 100 (30–100) | Tylko serwis. |
| 26 | `fan_power_gain` | Wzmocnienie reg. PI wentylatora? | Wzmocnienie regulacji mocy wentylatora (opis z nazwy, niepotwierdzony). W menu Pellux jest „Wzmocnienie reg. PI wentylatora” (str. 38), bez opisu. | % | brak w kotle | Nie dotyczy. |
| 27 | `fuzzy_logic_fuel_flow_correction` | — | Korekta ilości paliwa w trybie Fuzzy Logic (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 28 | `fuel_flow_correction` | Korekta paliwa? | Korekta ilości podawanego paliwa (opis z nazwy, niepotwierdzony). W menu Pellux jest „Korekta paliwa” 0 % (str. 33), bez opisu. | % | brak w kotle | Nie dotyczy. |
| 29 | `airflow_correction_100` | — | Korekta nadmuchu przy mocy 100 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 30 | `feeder_correction_100` | — | Korekta podajnika przy mocy 100 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 31 | `airflow_correction_50` | — | Korekta nadmuchu przy mocy 50 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 32 | `feeder_correction_50` | — | Korekta podajnika przy mocy 50 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 33 | `airflow_correction_30` | — | Korekta nadmuchu przy mocy 30 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 34 | `feeder_correction_30` | — | Korekta podajnika przy mocy 30 % (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |

## 9. Sonda lambda

Sonda lambda to osobny moduł (instr. 860P str. 47). U nas brak.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 79 | `lambda_control` | Praca z sondą Lambda | Włączone: regulator dobiera ilość powietrza do zadanej zawartości tlenu w spalinach (instr. 860P str. 40 i 47, Pellux str. 43). | wył./wł. | brak w kotle | Nie dotyczy. |
| 80 | `lambda_correction_range` | Zakres korekcji nadmuchu | Dopuszczalny zakres zmiany nadmuchu przy pracy z sondą (instr. 860P str. 40). | — | brak w kotle | Nie dotyczy. |
| 81 | `oxygen_100` | 100% Tlen | Zadana zawartość tlenu przy mocy 100 % (Pellux str. 37, instr. 850P2 str. 41). | — | brak w kotle | Nie dotyczy. |
| 82 | `oxygen_50` | 50% Tlen | Zadana zawartość tlenu przy mocy 50 % (Pellux str. 37, instr. 850P2 str. 41). | — | brak w kotle | Nie dotyczy. |
| 83 | `oxygen_30` | 30% Tlen | Zadana zawartość tlenu przy mocy 30 % (Pellux str. 37, instr. 850P2 str. 41). | — | brak w kotle | Nie dotyczy. |
| 84 | `fuzzy_logic_oxygen_correction` | — | Korekta tlenu w trybie Fuzzy Logic (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |

## 10. Rozpalanie

Po włączeniu kocioł robi test zapłonu, czyszczenie i rozpalanie. Po wykryciu płomienia
przechodzi przez rozżarzanie do PRACY. Trzy nieudane próby dają alarm „Nieudana próba
rozpalenia” i zatrzymanie kotła (Pellux str. 8–9, instr. 860P str. 10). Grupa nadmuchu ma tę
samą niepewną jednostkę co w punkcie 8. Wzór obr./min = 10 × wartość + 300 sprawdzono tylko
na nr 0–2, tu jest hipotezą.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 41 | `kindling_airflow_power` | Moc nadmuchu rozpalania | Nadmuch przy rozpalaniu. Za duży wydłuża rozpalanie albo daje nieudaną próbę (Pellux str. 42, instr. 860P str. 39). | `%` wg PyPlumIO, prawdopodobnie obr./min | 60 (10–255), wg wzoru ≈ 900 obr./min | Tylko serwis. |
| 42 | `kindling_low_airflow_power` | — | Niski nadmuch w części rozpalania (opis z nazwy, niepotwierdzony). | % | brak w kotle | Nie dotyczy. |
| 43 | `kindling_airflow_delay` | — | Opóźnienie albo wydłużenie nadmuchu przy rozpalaniu (opis z nazwy, niepotwierdzony). W 860P jest „Wydłużenie nadmuchu” w rozpalaniu (str. 39). | s | brak w kotle | Nie dotyczy. |
| 44 | `kindling_test_time` | Czas testu zapłonu | Czas sprawdzania, czy palenisko już się pali. Pracuje tylko wentylator. Przy jasnym płomieniu kocioł pomija rozpalanie i przechodzi do PRACY (instr. 860P str. 39, Pellux str. 42). | s, 1 | 60 (10–240) | Tylko serwis. |
| 45 | `kindling_feeder_work` | Czas podawania (rozpalanie) | Czas podawania dawki paliwa przy pierwszej próbie rozpalenia (instr. 860P str. 39). | — | brak w kotle | Nie dotyczy. |
| 46 | `kindling_feeder_dose` | Dawka paliwa | Masa paliwa przy pierwszej próbie rozpalenia. W kolejnych próbach mniej. Fabrycznie 170 g (Pellux str. 8 i 42). | g | brak w kotle | Nie dotyczy. |
| 47 | `kindling_time` | Czas rozpalania | Czas jednej próby rozpalenia. Potem kolejna próba, najwyżej 3 (Pellux str. 42). | min, 1 | 7 (1–20) | Tylko serwis. |
| 48 | `warming_up_time` | Czas rozgrzewania | Czas rozgrzewania zapalarki przed włączeniem wentylatora. Nie może być za długi, żeby nie uszkodzić grzałki (Pellux str. 42, instr. 860P str. 39). Wartość 30 min wygląda na dużą; jednostka niepewna. | min wg PyPlumIO (niepewne) | 30 (1–250) | Tylko serwis. |
| 49 | `kindling_finish_exhaust_temp` | — | Temperatura spalin kończąca rozpalanie (opis z nazwy, niepotwierdzony). Nasz kocioł wykrywa płomień czujnikiem optycznym. | °C | brak w kotle | Nie dotyczy. |
| 50 | `kindling_finish_threshold_temp` | Płomień końca rozpalenia? | PyPlumIO: próg temperatury (°C). Zakres 1–100 bardziej pasuje do „Płomień końca rozpalenia”: próg jasności płomienia w % światła, przy którym regulator uznaje palenisko za rozpalone; służy też do wykrywania braku paliwa i końca wygaszania (Pellux str. 42). Przypisanie niepotwierdzone. | °C wg PyPlumIO, prawdopodobnie % | 10 (1–100) | Nie ruszać. Znaczenie niepewne. |
| 51 | `kindling_fumes_delta_temp` | — | Przyrost temperatury spalin przy rozpalaniu (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |
| 52 | `kindling_delta_temp` | — | Przyrost temperatury przy rozpalaniu (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |
| 53 | `kindling_min_power_time` | Czas pracy z mocą minimalną (albo Czas rozżarzania?) | Czas pracy palnika z mocą minimalną po rozpaleniu (instr. 850P2 str. 35). W menu Pellux w tym miejscu jest „Czas rozżarzania”: czas rozżarzania po wykryciu płomienia (Pellux str. 42). Które z nich, niepotwierdzone. | min, 1 | 3 (0–100) | Tylko serwis. |
| 76 | `warming_up_pause_time` | Czyszczenie palnika? | PyPlumIO: przerwa przy rozgrzewaniu (opis z nazwy, niepotwierdzony). Zakres 1–24 pasuje do „Czyszczenie palnika”: maksymalny czas pracy palnika bez czyszczenia, 1–24 h, na zrzucie 6 h; po nim kocioł wygasza, czyści i rozpala ponownie (Pellux str. 34). Hipoteza: sprawdzić na panelu, czy `Ustawienia kotła → Czyszczenie palnika` pokazuje 4 h. | brak jednostki w PyPlumIO | 4 (1–24) | Nie ruszać, dopóki znaczenie jest niepewne. |
| 77 | `warming_up_cycle_time` | — | Czas cyklu przy rozgrzewaniu (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |

## 11. Stabilizacja i nadzór

NADZÓR podtrzymuje płomień, gdy kocioł osiągnął zadaną: podajnik i wentylator pracują rzadko.
Nastawy dobiera producent kotła. Temperatura w NADZORZE ma powoli spadać, inaczej grozi
przegrzanie (instr. 860P str. 11, 850P2 str. 11–12).

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 54 | `stabilization_time` | Czas stabilizacji | Czas pracy w trybie STABILIZACJA po rozpaleniu (instr. 860P str. 39). | min | brak w kotle | Nie dotyczy. |
| 55 | `stabilization_airflow_power` | Moc nadmuchu – stabilizacja (u Pellux może to być „Moc nadmuchu ROZŻARZANIE” albo „Nadmuch po rozpaleniu”) | Nadmuch w trybie STABILIZACJA (instr. 860P str. 39). Odpowiednik w menu Pellux niepotwierdzony (Pellux str. 37 i 42). | `%` wg PyPlumIO, prawdopodobnie obr./min | 115 (10–255), wg wzoru ≈ 1450 obr./min | Tylko serwis. |
| 56 | `supervision_time` | Czas nadzoru | Najdłuższy czas w NADZORZE, potem wygaszanie. 0 = kocioł pomija NADZÓR i od razu wygasza. 60 = NADZÓR bez limitu, aż temperatura spadnie i kocioł wróci do PRACY (Pellux str. 43). U nas 0: po przekroczeniu zadanej o 5 °C kocioł wygasza i czeka w POSTOJU na spadek do 57 °C. | min, 1 | 0 (0–60) | Tylko serwis. |
| 57 | `supervision_feeder_work` | Czas podawania (nadzór) | Czas podawania paliwa w NADZORZE. Ma być mały, tylko do podtrzymania płomienia. Za duży przegrzewa kocioł (instr. 860P str. 40). | s | brak w kotle | Nie dotyczy. |
| 58 | `supervision_feeder_dose` | — | Dawka paliwa w NADZORZE (opis z nazwy, niepotwierdzony). W menu Pellux jest „Moc kotła w trybie NADZÓR” (str. 43). | g | brak w kotle | Nie dotyczy. |
| 59 | `supervision_feeder_pause` | Czas przerwy (nadzór) | Przerwa w podawaniu paliwa w NADZORZE (instr. 860P str. 40). | min | brak w kotle | Nie dotyczy. |
| 60 | `supervision_cycle_duration` | Czas cyklu NADZÓR | Cykl podajnika w NADZORZE: czas podawania + czas postoju (Pellux str. 43). | s, 1 | 20 (1–250) | Tylko serwis. U nas nieużywany (nr 56 = 0). |
| 61 | `supervision_airflow_power` | Moc nadmuchu NADZÓR | Nadmuch w NADZORZE. Za duży grozi przegrzaniem albo cofnięciem płomienia do podajnika, za mały przesypaniem paliwa (Pellux str. 43, instr. 860P str. 40). | `%` wg PyPlumIO, prawdopodobnie obr./min | 60 (10–255), wg wzoru ≈ 900 obr./min | Tylko serwis. U nas nieużywany (nr 56 = 0). |
| 62 | `supervision_fan_pause` | — | Przerwa wentylatora w NADZORZE (opis z nazwy, niepotwierdzony). | min | brak w kotle | Nie dotyczy. |
| 63 | `supervision_fan_work` | — | Czas pracy wentylatora w NADZORZE (opis z nazwy, niepotwierdzony). W 860P jest „Wydłużenie nadmuchu”: wentylator pracuje po podaniu dawki, za długo przegrzewa kocioł (str. 40). | s | brak w kotle | Nie dotyczy. |
| 64 | `increase_fan_support_mode` | — | Tryb zwiększenia nadmuchu (opis z nazwy, niepotwierdzony). W 860P jest „Zwiększenie mocy nadmuchu” po czyszczeniu palnika (str. 40). | — | brak w kotle | Nie dotyczy. |

## 12. Wygaszanie i czyszczenie

W WYGASZANIU regulator zatrzymuje podajnik i przedmuchuje palenisko, aż płomień zgaśnie albo
minie maksymalny czas (instr. 860P str. 11–12).

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 65 | `burning_off_max_time` | Maksymalny czas wygaszania | Po tym czasie kocioł przechodzi do POSTOJU, nawet gdy czujnik nadal widzi płomień (Pellux str. 42, instr. 860P str. 39). | min, 1 | 15 (5–60) | Tylko serwis. |
| 66 | `burning_off_min_time` | Minimalny czas wygaszania | Wygaszanie trwa co najmniej tyle, nawet gdy płomienia już nie widać (Pellux str. 42). | min, 1 | 5 (1–15) | Tylko serwis. |
| 67 | `burning_off_time` | Czas wygaszania? | Czas wygaszania (opis z nazwy, niepotwierdzony). W 860P „Czas wygaszania” to czas minimalny (str. 39), co dubluje nr 66. | — | brak w kotle | Nie dotyczy. |
| 68 | `burning_off_airflow_power` | Nadmuch wygaszania | Obroty wentylatora przy wygaszaniu (Pellux str. 42). | `%` wg PyPlumIO, prawdopodobnie obr./min | 150 (10–255), wg wzoru ≈ 1800 obr./min | Tylko serwis. |
| 69 | `burning_off_fan_work` | Czas przedmuchu | Czas jednego przedmuchu przy dopalaniu paliwa w wygaszaniu (instr. 860P str. 39, 850P2 str. 35). | brak jednostki w PyPlumIO | 40 (1–100) | Tylko serwis. |
| 70 | `burning_off_fan_pause` | Przerwa przedmuchu | Przerwa między przedmuchami w wygaszaniu (instr. 860P str. 39). | brak jednostki w PyPlumIO | 0 (0–250) | Tylko serwis. |
| 71 | `start_burning_off` | Start przedmuchu | Jasność płomienia, przy której zaczynają się przedmuchy w wygaszaniu (instr. 860P str. 39, 850P2 str. 36). | %, 1 | 10 (1–100) | Tylko serwis. |
| 72 | `stop_burning_off` | Stop przedmuchu | Jasność płomienia, przy której przedmuchy się kończą (instr. 860P str. 39, 850P2 str. 36). | %, 1 | 5 (1–100) | Tylko serwis. |
| 73 | `cleaning_begin_time` | Czas czyszczenia rozpalanie? | Czas pracy wentylatora przy czyszczeniu paleniska podczas rozpalania (instr. 850P2 str. 36). Przypisanie z nazwy PyPlumIO, niepotwierdzone. | brak jednostki w PyPlumIO | 15 (10–250) | Tylko serwis. |
| 74 | `burning_off_cleaning_time` | Czas czyszczenia wygaszanie | Czas pracy wentylatora przy czyszczeniu paleniska podczas wygaszania (instr. 850P2 str. 36). | — | brak w kotle | Nie dotyczy. |
| 75 | `cleaning_airflow_power` | Nadmuch czyszczenia? | PyPlumIO: nadmuch przy czyszczeniu paleniska (Pellux str. 42). Zakres 0–1 nie pasuje do mocy; to raczej przełącznik, np. „Czyszczenie w ciszy” (Pellux str. 38 i 42). Znaczenie niepotwierdzone. | % wg PyPlumIO (niepewne) | 0 (0–1) | Nie ruszać. Znaczenie niepewne. |

## 13. Paliwo i podajnik

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 85 | `max_fuel_flow` | Wydajność podajnika | Ile paliwa podaje podajnik na godzinę. Regulator liczy z niej czas podawania (instr. 850P2 str. 10) i poziom paliwa (Pellux str. 17). Wynik testu wydajności podajnika. Na zrzucie w instrukcji 11,2 kg/h (Pellux str. 33). | kg/h, krok 0,2 (surowo ×5) | 9,6 (0,2–50) | Tylko serwis. Zła wartość zmienia ilość podawanego paliwa. |
| 86 | `feeder_calibration` | Test wydajności podajnika? | Kalibracja podajnika (opis z nazwy, niepotwierdzony). W menu Pellux jest „Test wydajności podajnika” (str. 33). | — | brak w kotle | Nie dotyczy. |
| 87 | `fuel_tank_capacity` | Pojemność zbiornika | Pojemność zasobnika do liczenia poziomu paliwa. Używana, dopóki nie zrobiono kalibracji poziomu paliwa (Pellux str. 44, instr. 850P2 str. 35). Nie wpływa na spalanie. | kg, krok 50 (surowo ×50) | 100 (50–5000) | Bezpieczny z aplikacji, ale wpływa tylko na wskaźnik poziomu paliwa. |
| 88 | `fuel_calorific_value` | Kaloryczność paliwa | Kaloryczność pelletu. Regulator liczy z niej czas podawania (instr. 850P2 str. 10 i 35). Na zrzucie w instrukcji 4,9 kWh/kg (Pellux str. 33). | kWh/kg, krok 0,1 (surowo ×10) | 5,2 (0,1–25) | Tylko serwis. Zmienia ilość podawanego paliwa. |
| 89 | `fuel_detection_time` | Czas detekcji braku paliwa | Czas liczony od spadku jasności płomienia poniżej progu. Potem kocioł próbuje rozpalić, po 3 nieudanych próbach alarm (Pellux str. 43). | min, 1 | 1 (0–5) | Tylko serwis. |
| 90 | `fuel_detection_exhaust_temp` | Temp. spalin przy braku paliwa | Gdy spaliny są chłodniejsze dłużej niż czas detekcji, regulator uznaje brak paliwa (instr. 860P str. 41). | °C | brak w kotle | Nie dotyczy. |
| 91 | `schedule_feeder_2` | — | Harmonogram podajnika 2 (bunkra) (opis z nazwy, niepotwierdzony). Podajnik bunkra wymaga modułu B (instr. 860P str. 47). | wył./wł. | brak w kotle | Nie dotyczy. |
| 92 | `feed2_h1` | — | Godzina 1 pracy podajnika 2 (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |
| 93 | `feed2_h2` | — | Godzina 2 pracy podajnika 2 (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |
| 94 | `feed2_h3` | — | Godzina 3 pracy podajnika 2 (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |
| 95 | `feed2_h4` | — | Godzina 4 pracy podajnika 2 (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |
| 96 | `feed2_work` | Czas pracy podajnika 2 | Czas pracy podajnika dodatkowego, który uzupełnia zasobnik z bunkra. 0 = podajnik wyłączony (instr. 860P str. 47). | — | brak w kotle | Nie dotyczy. |
| 97 | `feed2_pause` | — | Przerwa podajnika 2 (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |

## 14. Ruszt

Praca na ruszcie to palenie bez podajnika, z ręcznym załadunkiem (instr. 860P str. 16). Nasz
kocioł tego nie używa.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 25 | `reduction_airflow_temp` | Temperatura spalin – redukcja nadmuchu | Powyżej tej temperatury spalin regulator zmniejsza obroty wentylatora do minimum (instr. 860P str. 41). | °C | brak w kotle | Nie dotyczy. |
| 35 | `grate_airflow_power` | Moc nadmuchu – ruszt | Nadmuch przy pracy na ruszcie (instr. 850P2 str. 8 i 12). | % | brak w kotle | Nie dotyczy. |
| 36 | `grate_heating_hysteresis` | Histereza kotła (ruszt) | Histereza kotła osobno dla rusztu (instr. 850P2 str. 12). | °C | brak w kotle | Nie dotyczy. |
| 37 | `grate_fan_work` | Praca przedmuchu – nadzór | Czas przedmuchu w NADZORZE na ruszcie. Za długi przegrzewa wodę (instr. 860P str. 41). | s | brak w kotle | Nie dotyczy. |
| 38 | `grate_fan_pause` | Przerwa przedmuchu – nadzór | Przerwa między przedmuchami w NADZORZE na ruszcie (instr. 860P str. 41). | min | brak w kotle | Nie dotyczy. |
| 39 | `grate_heating_temp` | Temp. zadana kotła (ruszt) | Zadana kotła osobno dla rusztu (instr. 850P2 str. 12). | °C | brak w kotle | Nie dotyczy. |
| 40 | `grate_fuel_detection_time` | Czas detekcji braku paliwa (ruszt) | Czas liczony po spadku temperatury spalin poniżej progu; 0 = wykrywanie wyłączone (instr. 860P str. 40–41). | min | brak w kotle | Nie dotyczy. |

## 15. Alarmy i bezpieczeństwo

Przegrzanie kotła regulator obsługuje dwuetapowo: powyżej temperatury schładzania zrzuca
ciepło do CWU i otwiera mieszacze, a przy 95 °C włącza trwały alarm. Niezależny termostat
bezpieczeństwa STB wyłącza palnik sam (instr. 860P str. 45–46).

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 114 | `boiler_alert_temp` | Temperatura schładzania kotła? | PyPlumIO: temperatura alarmowa kotła. Zakres 85–95 pasuje do „Temperatury schładzania kotła”: powyżej niej regulator włącza pompę CWU i otwiera mieszacze, żeby schłodzić kocioł (instr. 860P str. 41, Pellux str. 44). Alarm przegrzania jest przy stałych 95 °C. Przypisanie niepotwierdzone. Kopia ustawień opisuje go jako „Temperatura alarmowa kotła (STB)”, ale STB to osobny termostat mechaniczny. | °C, 1 | 88 (85–95) | Nie ruszać. Bezpieczeństwo. |
| 115 | `max_feeder_temp` | Maksymalna temperatura podajnika | Powyżej tej temperatury podajnika alarm, wypchnięcie żaru z rury podajnika i wygaszanie. Ochrona przed cofnięciem płomienia (instr. 860P str. 40 i 45). | °C | brak w kotle | Nie dotyczy. |
| 117 | `alert_notify` | Sygnalizacja alarmów? | Wybór alarmów, przy których włącza się wyjście H (Pellux str. 44). Przypisanie z nazwy, niepotwierdzone; PyPlumIO podaje °C, co do tego nie pasuje. | °C wg PyPlumIO (niepewne) | brak w kotle | Nie dotyczy. |

## 16. Bufor

Bufor wymaga modułu B i czujników bufora (instr. 850P2 str. 38). U nas brak.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 133 | `buffer_control` | Obsługa bufora | Włącza pracę z buforem (instr. 860P str. 42). | wył./wł. | brak w kotle | Nie dotyczy. |
| 134 | `max_buffer_temp` | — | Maksymalna temperatura bufora (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |
| 135 | `min_buffer_temp` | — | Minimalna temperatura bufora (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |
| 136 | `buffer_hysteresis` | — | Histereza bufora (opis z nazwy, niepotwierdzony). | °C | brak w kotle | Nie dotyczy. |
| 137 | `buffer_load_start` | Temperatura rozpoczęcia ładowania bufora | Poniżej tej temperatury górnej części bufora zaczyna się ładowanie (instr. 860P str. 42). | °C | brak w kotle | Nie dotyczy. |
| 138 | `buffer_load_stop` | Temperatura zakończenia ładowania bufora | Ładowanie kończy się, gdy dolna część bufora osiągnie tę temperaturę (instr. 860P str. 42). | °C | brak w kotle | Nie dotyczy. |

## 17. Inne

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | U nas | Ocena |
|---|---|---|---|---|---|---|
| 116 | `external_boiler_temp` | Kocioł rezerwowy (temperatura załączenia)? | Temperatura kotła pelletowego, poniżej której regulator włącza kocioł rezerwowy (np. gazowy). 0 = bez kotła rezerwowego (instr. 860P str. 41, Pellux str. 47). Przypisanie z nazwy PyPlumIO („kocioł zewnętrzny”) i zakresu, niepotwierdzone. | °C, 1 | 0 (0–75) | Nie ruszać. Do sterowania drugim źródłem przez wyjście H; bez okablowania nic nie da. |
| 78 | `remind_time` | — | Czas przypomnienia, np. o czyszczeniu (opis z nazwy, niepotwierdzony). | — | brak w kotle | Nie dotyczy. |
| 139 | — | — | Pozycja bez nazwy w PyPlumIO (lista kończy się na nr 138). Znaczenie nieznane. | — | surowo [50, 0, 100] | Nie ruszać. |

## Mieszacze

Parametry mieszacza zmienia ramka `0x34` z bajtami `[mieszacz, nr, wartość]`. Według
PyPlumIO mieszacze w ramce liczy się od 0 (mieszacz 1 = 0); niesprawdzone. Lista PyPlumIO dla
ecoMAX P ma 14 parametrów mieszacza. Z menu serwisowego mieszacza nie ma w niej „Zakresu
proporcjonalności”, „Stałej czasu całkowania” ani „Czasu otwarcia zaworu” (instr. 860P str. 43,
Pellux str. 40 i 46), więc aplikacja ich nie zmieni.

**Mieszacz 1** (grzejniki) ma wartości w odpowiedzi regulatora. **Sterowanie pogodowe
mieszacza 1 jest włączone** (nr 4 = 1). Wtedy regulator pomija ręczną zadaną mieszacza i liczy
ją z krzywej, w granicach min–max (instr. 860P str. 10 i 14). U nas min to 40 °C, a max
50 °C, więc zadana mieszacza 1 to zawsze 40–50 °C.

**Mieszacz 2** w odpowiedzi z parametrami nie ma wartości, ale regulator go obsługuje: w
RegulatorData i SensorData ma zadaną 27 °C ([kociol-ustawienia.md](kociol-ustawienia.md),
punkt 1a i 1b). Na panelu Pellux wyjście 14–15 może sterować pompą mieszacza 2 (Pellux str.
47). Parametrów mieszacza 2 nie da się dziś odczytać, więc nie wiadomo, czy zapis zadziała.

| Nr | Parametr (PyPlumIO) | Nazwa na panelu | Co zmienia | Jednostka/krok | Mieszacz 1 u nas | Ocena |
|---|---|---|---|---|---|---|
| 0 | `mixer_target_temp` | Temperatura zadana mieszacza | Temperatura wody w obiegu mieszacza, np. 50 °C (instr. 860P str. 10 i 13). Pomijana przy sterowaniu pogodowym mieszacza. | °C, 1 | 40 (40–50) | Bezpieczny z aplikacji, ale u nas nic nie zmieni, dopóki nr 4 = 1. |
| 1 | `min_target_temp` | Minimalna temperatura mieszacza | Najniższa zadana mieszacza, także przy obniżeniach i sterowaniu pogodowym (instr. 860P str. 43). | °C, 1 | 40 (20–90) | Ostrożnie. Menu serwisowe. |
| 2 | `max_target_temp` | Maksymalna temperatura mieszacza | Najwyższa zadana mieszacza, także z krzywej. Przy obsłudze „Włączona podłoga” wyłącza pompę, gdy obieg przekroczy max + 5 °C; dla podłogi nie więcej niż 45–50 °C (instr. 860P str. 43). | °C, 1 | 50 (20–90) | Ostrożnie. Menu serwisowe. Dla grzejników nie chroni przed niczym, dla podłogi to ochrona. |
| 3 | `thermostat_decrease_target_temp` | Termostat pokojowy mieszacza (obniżenie temp. zadanej mieszacza) | O ile spada zadana mieszacza po zadziałaniu termostatu pokojowego. Dobór doświadczalny, np. 5 °C bez czujnika pogodowego, 2 °C z czujnikiem (instr. 860P str. 13). | °C, 1 | 0 (0–30) | Bezpieczny z aplikacji. |
| 4 | `weather_control` | Sterowanie pogodowe mieszacza | Zadana mieszacza liczona z temperatury zewnętrznej według krzywej (instr. 860P str. 13–14). | wył./wł. | 1 = wł. (0–1) | Ostrożnie. Wyłączenie przełącza mieszacz na stałą zadaną. |
| 5 | `heating_curve` | Krzywa grzewcza mieszacza | Nachylenie krzywej. Podłoga 0,2–0,6, grzejniki 1,0–1,6 (instr. 860P str. 14). | krok 0,1 (surowo ×10) | 0,7 (0,1–4) | Bezpieczny z aplikacji. Zmieniać małymi krokami, co kilka dni. |
| 6 | `heating_curve_shift` | Przesunięcie równoległe krzywej | Przesuwa krzywą. Temperatura pokojowa = 20 °C + przesunięcie, np. +2 °C daje ok. 22 °C (instr. 860P str. 13). | °C, 1 (surowo +20) | 0 (−20–20) | Bezpieczny z aplikacji. Najprostsza „cieplej/chłodniej” dla grzejników. |
| 7 | `weather_factor` | Współczynnik temperatury pokojowej | Korekta zadanej mieszacza od panelu pokojowego: (zadana pokojowa − zmierzona) × współczynnik / 10. 0 = bez korekty. Za duży daje wahania (instr. 860P str. 13–14). | 1 | 10 (0–100) | Bezpieczny z aplikacji. |
| 8 | `work_mode` | Obsługa mieszacza | Wyłączona / Włączona CO (grzejniki; mieszacz otwiera się w pełni przy przegrzaniu kotła) / Włączona podłoga (ograniczenie do max) / Tylko pompa (instr. 860P str. 43). Kolejność 0–3 według kopii ustawień. | wybór 0–3 | 1 = Włączona CO (0–3) | Nie ruszać. Zależy od instalacji; zła wartość może przegrzać podłogę albo wyłączyć obieg. |
| 9 | `mixer_input_dead_zone` | Nieczułość mieszacza | Martwa strefa: siłownik rusza, gdy temperatura obiegu różni się od zadanej o więcej niż ta wartość. Oszczędza siłownik (instr. 860P str. 43). | °C, krok 0,1 (surowo ×10) | 2,0 (0–4) | Tylko serwis. |
| 10 | `thermostat_operation` | — | Działanie termostatu mieszacza (opis z nazwy, niepotwierdzony). | wył./wł. | brak w kotle | Nie dotyczy. |
| 11 | `thermostat_mode` | Wybór termostatu (mieszacza) | Wyłączony / Uniwersalny / ecoSTER T1–T3 (instr. 860P str. 43, Pellux str. 46). | wybór 0–2 | 0 = wyłączony (0–2) | Ostrożnie. |
| 12 | `disable_pump_on_thermostat` | Wyłączenie pompy od termostatu | TAK: po rozwarciu styku termostatu zamyka mieszacz i wyłącza jego pompę. Instrukcja tego nie zaleca, pokój może się wychłodzić (instr. 860P str. 43). | nie/tak | 0 = nie (0–1) | Ostrożnie. |
| 13 | `summer_work` | — | Praca mieszacza w trybie LATO (opis z nazwy, niepotwierdzony). | wył./wł. | brak w kotle | Nie dotyczy. |

## Termostaty

PyPlumIO zmienia parametry termostatów pokojowych ramką `0x5D` (numer parametru, wartość,
przesunięcie zależne od numeru termostatu, rozmiar 1 albo 2 bajty). Lista PyPlumIO ma 15
pozycji na termostat: tryb, zadane party / wakacje / dzień / noc / przeciwzamrożeniowa /
grzania (krok 0,1 °C), korekta, histereza i liczniki czasu. Osobno jest profil termostatu
(na poziomie regulatora).

U nas odpowiedź o termostaty (159 B, 37 pozycji) zapisano tylko surowo. Do podziału na
termostaty potrzebna jest ich liczba z SensorData, której dekoder sterownika jeszcze nie
czyta. Panel pokojowy eSTER_x80 jest na magistrali, ale wejście termostatu kotła i mieszacza
jest wyłączone (nr 111 = 0, mieszacz nr 11 = 0). Wyboru parametrów termostatu nie da się dziś
zrobić; najpierw trzeba rozkodować odpowiedź.

## Harmonogramy

**Budowa.** Każdy harmonogram ma przełącznik (włączony / wyłączony), jeden parametr (u nas
„wartość obniżenia” 0–20 °C) i plan tygodnia: 7 dni po 48 półgodzin (00:00, 00:30 …
23:30). Zapis to ramka `0x37`: cały harmonogram jednego rodzaju naraz (przełącznik, parametr
i cały tydzień). PyPlumIO nie czeka na potwierdzenie tej ramki.

W menu harmonogramy to „Obniżenia nocne”: w zaznaczonych półgodzinach zadana spada o wartość
obniżenia. Przedział z obniżeniem 0 jest pomijany. Plan trzeba układać od 00:00 (instr. 860P
str. 14–15, Pellux str. 14–15).

**Co ma nasz regulator.** Regulator zwrócił 5 z 40 rodzajów znanych PyPlumIO:

| PyPlumIO | Nr | Nazwa na panelu | U nas |
|---|---|---|---|
| `heating` | 0 | Obniżenia nocne kotła (Pellux str. 34) | wyłączony, obniżenie 0 °C (0–20) |
| `water_heater` | 1 | Obniżenia nocne zasobnika CWU (Pellux str. 35) | wyłączony, 0 °C (0–20) |
| `boiler_clean` | 4 | Harmonogram czyszczenia palnika (Pellux str. 34) | **włączony**, codziennie 7:00–21:30 zaznaczone, parametr 0 (0–20) |
| `mixer_1` | 6 | Obniżenia nocne mieszacza 1 (Pellux str. 36) | wyłączony, 0 °C (0–20) |
| `mixer_2` | 7 | Obniżenia nocne mieszacza 2 | wyłączony, 0 °C (0–20) |

W wyłączonych harmonogramach cała doba ma bity „1”. W harmonogramie czyszczenia „1” jest w
dzień, a „0” w nocy. Wygląda więc na to, że „1” to praca zwykła (bez obniżenia, czyszczenie
dozwolone), a „0” to obniżenie (cisza nocna). To wniosek z odczytu, niepotwierdzony.

**Czego brakuje.** Regulator nie zwrócił harmonogramu `boiler_work` („Harmonogram ON/OFF”,
„Praca wg harmonogramu”: kocioł wygaszony poza wybranymi godzinami; instr. 860P str. 15,
850P2 str. 16) ani harmonogramu pompy cyrkulacyjnej. Bez nich aplikacja nie ustawi godzin
pracy kotła przez harmonogram.

**Co da się ustawić z aplikacji:** włączenie obniżeń, wartość obniżenia i plan tygodnia dla
kotła, CWU i mieszaczy 1–2. Ocena: bezpieczne (zmieniają tylko zadaną), ale zapis nie był
testowany, a ramka podmienia cały tydzień naraz.

## Włączanie i wyłączanie regulatora (`0x3B`)

PyPlumIO ma przełącznik `ecomax_control`: ramka `0x3B` z jednym bajtem, 1 = włącz, 0 =
wyłącz. To samo co „Włącz/Wyłącz regulator” w menu panelu:

- **Włączenie** z „Kocioł wyłączony”: test zapłonu, czyszczenie, rozpalanie, potem PRACA
  (Pellux str. 8, instr. 860P str. 10).
- **Wyłączenie:** kocioł przechodzi do WYGASZANIA (podajnik stop, wentylator do zgaśnięcia
  płomienia), dopiero potem „Kocioł wyłączony”. Wygaszania nie należy przerywać, np.
  odłączeniem zasilania (Pellux str. 8, instr. 860P str. 10).
- W stanie „Kocioł wyłączony” regulator nadal okresowo uruchamia pompy, żeby nie zastały
  (instr. 860P str. 47). Instrukcje nie mówią, czy w tym stanie pracuje pompa CO albo CWU,
  gdy wodę grzeje inne źródło. Trzeba to sprawdzić przed użyciem w planie z pompą ciepła.

Stan: **niesprawdzone** na naszym kotle. PyPlumIO ustawia ten przełącznik bez czekania na
potwierdzenie i loguje „ecoMAX control is not available”, gdy regulator nie przyjmie
polecenia. Ocena: **ostrożnie**. Włączenie zdalne rozpala kocioł bez nikogo przy nim, a
wyłączenie gasi go aż do ponownego włączenia.

## Propozycja do wyboru

Parametry, które wyglądają na sensowne i bezpieczne do ustawiania z aplikacji przy pracy z
pompą ciepła. To lista do wyboru, nie decyzja.

| Nr | Parametr | Dlaczego |
|---|---|---|
| 98 | Temperatura zadana kotła | Główna nastawa: obniżona zadana robi z kotła rezerwę za pompą ciepła. |
| 99 | Minimalna temperatura kotła | Bez obniżenia (dziś 65 °C) zadana nie zejdzie poniżej 65 °C; zmiana ostrożna, z dolną granicą w aplikacji. |
| 17 | Histereza kotła | Razem z zadaną wyznacza, przy jakiej temperaturze kocioł rozpala. |
| 101 | Temperatura załączenia pompy CO | Pozwala pompom CO pracować na wodzie 40–50 °C z pompy ciepła. |
| 119 | Temperatura zadana CWU | Ustawienie dzienne, zapis już sprawdzony. |
| 123 | Histereza zasobnika CWU | Decyduje, kiedy kocioł dogrzewa CWU, np. mniej, gdy CWU grzeje pompa ciepła. |
| 122 | Tryb pracy pompy CWU | Wyłączenie ładowania CWU z kotła, gdy CWU grzeje pompa ciepła. |
| 125 | Tryb LATO | Latem kocioł tylko na CWU albo wcale; łatwa zmiana sezonu. |
| 111 + 112 | Wybór termostatu i Termostat pokojowy kotła | Wariant automatyczny z planu: obniżenie zadanej stykiem, np. z przekaźnika Włącznika. |
| Mieszacz 1, nr 6 | Przesunięcie równoległe krzywej | „Cieplej/chłodniej” dla grzejników bez zmiany krzywej. |
| Mieszacz 1, nr 0 | Temperatura zadana mieszacza | Ma sens tylko po wyłączeniu sterowania pogodowego mieszacza (nr 4). |
| Harmonogram `heating` | Obniżenia nocne kotła | Obniżenie zadanej kotła na noc albo na godziny pracy pompy ciepła. |
| `0x3B` | Włącz / wyłącz regulator | Najprostsze „kocioł stoi, grzeje pompa ciepła”; wymaga testu na kotle. |

## Źródła

- **PyPlumIO** (lokalna kopia źródeł): `parameters/ecomax.py` (lista `PARAMETER_TYPES` dla
  ecoMAX P, kolejność = numer; `ECOMAX_CONTROL_PARAMETER`), `parameters/custom/` (poprawki
  tylko dla ecoMAX 860D3-HB), `parameters/mixer.py`, `parameters/thermostat.py`,
  `structures/schedules.py`, `frames/requests.py` (ramki `0x33`, `0x34`, `0x37`, `0x3B`,
  `0x5D`).
- **instr. 860P** — [Regulator ecoMAX860P TOUCH, instrukcja obsługi i montażu, wyd. 1.1, 11-2019](pellux200-dokumentacja/ecoMAX-860P-TOUCH-instrukcja.pdf).
  Menu użytkownika str. 8, obsługa str. 9–17, menu serwisowe str. 37–38, opisy ustawień
  serwisowych str. 39–44, alarmy str. 45–47. Wykonanie z wentylatorem wyciągowym i pięcioma
  poziomami mocy, więc część nazw różni się od naszego kotła.
- **instr. 850P2** — [Regulator ecoMAX850P2-C, instrukcja, wyd. 1.2, 12-2018](pellux200-dokumentacja/ecoMAX-850P2-C-DTR-PL.pdf).
  Menu użytkownika str. 8, tryby regulacji str. 11, menu serwisowe str. 33–34, opisy str.
  35–39. Ma trzy poziomy mocy MAX/ŚRED/MIN i histerezy H1/H2, jak PyPlumIO.
- **Pellux** — [Instrukcja kotła Pellux 200 Touch](pellux200-dokumentacja/kociol-Pellux-200-Touch-instrukcja.pdf).
  Włączanie str. 8, tryby pracy str. 9, menu str. 11–12, CWU i LATO str. 15–16, ustawienia
  kotła str. 33–36, menu serwisowe str. 37–40, opisy z wartościami fabrycznymi str. 41–47.
- Wartości z kotła: [ustawienia-kotla-2026-10-03.json](ustawienia-kotla-2026-10-03.json) i
  [kociol-ustawienia.md](kociol-ustawienia.md) (punkty 1a, 1b, 2, 3, 4, 4a).
