# Analiza pracy pompy ciepła – 26.09.2026

Obserwacja jednego pełnego cyklu grzania CWU (wymuszony start), uzupełniona o historię z 24–26.09 i pomiary ręczne wykonane w trakcie pracy. Cel: ocenić sprawność i wskazać, co zmienić, żeby pompa pracowała wydajniej.

## 1. Najważniejsze wnioski

1. **Sprężarka i obieg chłodniczy pracują poprawnie.** Brak błędów, stabilna moc, parownik dobrze wykorzystany (czynnik paruje ~3 K poniżej temperatury wody wylotowej).
2. **Sprawność całego układu jest niska: COP ≈ 2,0–2,9 (średnio ~2,4)** przy źródle 11,6 °C i grzaniu wody do 48 °C. Dobrze dobrana pompa woda-woda osiąga w takich warunkach COP ~4.
3. **Straty są w instalacji wokół pompy, nie w sterowniku:**
   - **strona gorąca** – wąż ½" między pompą a zbiornikiem daje przepływ rzędu 3–4 L/min; zbiornik grzeje się warstwowo (góra 46 °C, dół 20 °C), a pompa od początku skrapla przy ~50 °C;
   - **strona zimna** – pompa głębinowa śrubowa (do 60 m) w zbiorniku deszczówki o głębokości 3 m pracuje przy ~12 m oporów, daje 25 L/min i pobiera ~0,47–0,49 kW; obie pompy razem ~0,57 kW, czyli ~18% mocy całego układu;
   - **ostatnie 3 °C kosztują połowę energii** – od 45 do 48 °C zużyto 2,10 kWh z 4,14 kWh całego cyklu.
4. **Pomiary sterownika są częściowo mylące:** czujniki `Tae`/`Tbe` na rurach czytają za wysoko, pojedynczy czujnik `Ttarget` nie widzi uwarstwienia zbiornika (stąd zaniżony COP liczony przez `co`: 0,8–1,5), a obie pompy są podłączone do przekaźnika strony gorącej, więc `HCS`/`CCS` nie opisują ich osobno.
5. **Ochrona przed zamarznięciem wymiennika jest niepełna** przy wodzie bez glikolu: brak czujnika `Tco`, progi −2 °C dobrane do glikolu, brak ochrony po temperaturze parowania `Tbe`.

**Trzy zmiany o największym efekcie:** (1) rura 1" + nowoczesna pompa obiegowa po stronie gorącej, (2) mniejsze opory i właściwa pompa po stronie zimnej, (3) niższa temperatura CWU, jeśli wystarcza.

## 2. Instalacja (stan na dzień pomiaru)

| Element | Stan |
|---|---|
| Źródło dolne | deszczówka, przepompowywana z jednego zbiornika do drugiego; lustro wody ~3 m poniżej |
| Pompa źródła | IBO 3" SQIBO 0,37 (śrubowa, maks. 30 L/min, maks. 60 m, 3,4 A) |
| Przepływ źródła (pomiar wiadrem) | ~22,5 L w 53 s = **25,4 L/min** (dla wiadra walcowego ∅29 × 34 cm; przy wiadrze zwężanym ~21 L/min) |
| Temperatura źródła | wlot 11,6 °C; wylot 8,0 °C (16:07) i 9,5 °C (16:33) |
| Strona gorąca | zbiornik 300 L, woda z pompy płynie przez zbiornik bezpośrednio, **wąż ½"** |
| Pompa obiegowa | stara, 80–100 W |
| Sterowanie pomp | **obie pompy (obiegowa i głębinowa) na przekaźniku strony gorącej** (`HCS`, pin 7); przekaźnik strony zimnej (`CCS`) bez odbiornika |
| Zbiornik podczas cyklu (~16:40) | góra 46 °C, `Ttarget` 45 °C, **dół 20 °C** |
| Pomiar mocy `Watts` | przekładnik na całym zasilaniu: sprężarka + pompy |
| Czujniki | `Tae`, `Tbe`, `Ttarget`, `Tsump`, `Tho`; `Tco` pokazuje stale 0,0 (niepodłączony); brak `Thi`, `Tbc` |
| Ustawienia | CWU 25/48 °C, CO 35/45 °C, EEV max 60 (test 64), EEV min 49, zadane przegrzanie 0,5 K, limit mocy 3800 W |

## 3. Przebieg obserwacji

| Czas | Zdarzenie |
|---|---|
| 15:40 | Restart sterownika po wgraniu firmware; kalibracja zaworu widoczna w telemetrii (EEV 232 → 381 → 30 → 45) |
| 15:42 | T min zmienione z 25 na 23 °C (delta 23 → 25) bez komendy z `co` – najpewniej przyciskami; przywrócone przełączeniem `co` na CLOUD |
| 15:53 | `co` w trybie CLOUD/CWU, pompa 48/25 °C |
| 15:55:49 | **Start sprężarki** wymuszony ręcznym `force: "1"` z chpc-web |
| 16:02–16:10 | Test: EEV max 60 → 64 → 60 (bez wpływu na parowanie, patrz 5.4) |
| 16:07, 16:33 | Pomiary temperatury wody źródła |
| ~16:40 | Pomiar temperatur zbiornika (góra/dół) |
| 17:14:34 | **Stop** – `Ttarget` 48,0 °C; ręczne force wyłączone (`"0"`) przed stopem |
| 17:14:44 / 17:16:14 | Dobieg pomp: przekaźnik strony zimnej / gorącej wyłączony |

## 4. Wyniki cyklu

- czas pracy: **79 min** (15:55:49 – 17:14:24), 474 odczyty co 10 s;
- energia elektryczna (licznik sterownika `lt_pow`): **4,14 kWh**, moc średnia 3157 W (od 2945 W na początku do 3345 W na końcu);
- `Ttarget` 36,9 → 48,0 °C; `Tho` maks. 54,0 °C; `Tsump` maks. 55,5 °C;
- przegrzanie wg czujników (`Tae − Tbe`) średnio 2,6 K; zawór 49 → 60 w 7 min, potem stale na ograniczniku;
- błędy: brak.

| Czas | Min | Moc W | Zawór | Tae−Tbe K | Tae | Tbe | Tsump | Tho | Ttarget | Tsump−Tho | Tho−Ttarget | kWh |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 15:55 | 0 | 1743 | 49 | 0,6 | 15,1 | 14,5 | 15,4 | 19,1 | 36,9 | -3,7 | -17,8 | 0,00 |
| 16:00 | 5 | 2945 | 57 | 2,2 | 10,3 | 8,1 | 41,7 | 37,2 | 39,8 | 4,5 | -2,6 | 0,25 |
| 16:06 | 10 | 2975 | 64 | 2,2 | 10,5 | 8,3 | 45,4 | 42,1 | 41,6 | 3,3 | 0,5 | 0,50 |
| 16:11 | 15 | 2957 | 60 | 2,4 | 10,8 | 8,4 | 46,2 | 43,3 | 42,4 | 2,9 | 0,9 | 0,75 |
| 16:16 | 20 | 2983 | 60 | 2,4 | 11,0 | 8,6 | 46,8 | 44,0 | 43,0 | 2,8 | 1,0 | 1,00 |
| 16:21 | 25 | 3038 | 60 | 2,5 | 11,3 | 8,8 | 47,6 | 44,9 | 43,5 | 2,7 | 1,4 | 1,25 |
| 16:26 | 30 | 3065 | 60 | 2,6 | 11,8 | 9,2 | 49,0 | 46,4 | 44,1 | 2,6 | 2,3 | 1,51 |
| 16:31 | 35 | 3166 | 60 | 2,5 | 12,3 | 9,8 | 50,9 | 48,6 | 44,5 | 2,3 | 4,1 | 1,77 |
| 16:36 | 40 | 3241 | 60 | 2,7 | 12,8 | 10,1 | 52,4 | 50,4 | 45,0 | 2,0 | 5,4 | 2,03 |
| 16:41 | 45 | 3233 | 60 | 2,6 | 13,1 | 10,5 | 53,4 | 51,5 | 45,4 | 1,9 | 6,1 | 2,30 |
| 16:46 | 50 | 3279 | 60 | 2,8 | 13,4 | 10,6 | 54,0 | 52,3 | 45,7 | 1,7 | 6,6 | 2,58 |
| 16:51 | 55 | 3259 | 60 | 2,8 | 13,5 | 10,7 | 54,2 | 52,6 | 46,1 | 1,6 | 6,5 | 2,85 |
| 16:56 | 60 | 3279 | 60 | 2,9 | 13,6 | 10,7 | 54,4 | 52,8 | 46,4 | 1,6 | 6,4 | 3,12 |
| 17:01 | 65 | 3345 | 60 | 2,9 | 13,8 | 10,9 | 54,9 | 53,3 | 46,7 | 1,6 | 6,6 | 3,40 |
| 17:06 | 70 | 3325 | 60 | 2,9 | 13,9 | 11,0 | 55,2 | 53,6 | 47,1 | 1,6 | 6,5 | 3,68 |
| 17:11 | 75 | 3330 | 60 | 2,9 | 13,9 | 11,0 | 55,3 | 53,9 | 47,6 | 1,4 | 6,3 | 3,96 |
| 17:14 | 79 | 3328 | 60 | 3,1 | 14,1 | 11,0 | 55,5 | 54,0 | 48,0 | 1,5 | 6,0 | 4,14 |

**Podział energii:** od 36,9 do 45,0 °C (8,1 K `Ttarget`) – 40 min i 2,03 kWh; od 45,0 do 48,0 °C (3 K) – 38 min i **2,10 kWh**.

### Poprzednie cykle (telemetria chpc-web)

| Start | Tryb | Czas | Energia | Moc śr. | Tae−Tbe | Zawór | Ttarget | Tho maks. | Tsump maks. |
|---|---|---|---|---|---|---|---|---|---|
| 24.09 04:31 | CWU | 54 min | 2,53 kWh | 3141 W | 1,8 K | 49–60 | 39,1 → 45,0 | 50,6 | 52,1 |
| 25.09 04:31 | CWU | 56 min | 2,53 kWh | 3097 W | 2,0 K | 49–60 | 37,7 → 45,0 | 51,2 | 52,7 |
| 26.09 02:48 | A (CO) | 180 min | 7,91 kWh | 2977 W | 2,3 K | 49–60 | 28,6 → 48,0 | 47,0 | 49,1 |
| 26.09 13:11 | CWU | 8 min | 0,38 kWh | 2957 W | 2,0 K | 49–60 | przerwany trybem OFF | 40,8 | 44,6 |
| **26.09 15:55** | CWU (force) | **79 min** | **4,14 kWh** | 3157 W | 2,6 K | 49–64 | 36,9 → 48,0 | 54,0 | 55,5 |

Cykle są długie, bez krótkiego taktowania; zawór w każdym cyklu dochodzi do ograniczenia `EEVmax`.

## 5. Analiza

### 5.1 Bilans energii i COP

**Metoda po stronie źródła** (jedyna z pomiarem przepływu):
ciepło ze źródła = przepływ × 1,163 Wh/(L·K) × ΔT; ciepło oddane = ciepło ze źródła + moc sprężarki (moc całkowita − pompy ~0,6 kW).

| Chwila | ΔT źródła | Ciepło ze źródła | Moc całkowita | Ciepło oddane | COP układu | COP sprężarki |
|---|---|---|---|---|---|---|
| 16:07 (`Tho` 42 °C) | 3,6 K | 6,4 kW | 2,99 kW | ~8,8 kW | **~2,9** | ~3,7 |
| 16:33 (`Tho` 49 °C) | 2,1 K | 3,7 kW | 3,22 kW | ~6,3 kW | **~2,0** | ~2,4 |

Średnio w cyklu ~2,4. Niepewność jest duża (±30%): przy ΔT 2–4 K błąd termometru ±0,5 K na każdym pomiarze znacząco zmienia wynik. Trend jest jednak jednoznaczny: im gorętsza woda na wyjściu, tym mniej ciepła ze źródła i więcej prądu.

**Metoda ze zbiornika** (tak liczy `co`: 300 L × wzrost `Ttarget`) daje COP 1,4–1,5 i jest **niewiarygodna**: zbiornik jest uwarstwiony (góra 46 °C, dół 20 °C), gorąca warstwa rośnie w dół, a czujnik przy górze prawie tego nie widzi. Przykładowo ogrzanie 150 L z ~25 do 46 °C to ~3,7 kWh, podczas gdy `Ttarget` rośnie w tym czasie o kilka kelwinów.

### 5.2 Strona gorąca – główne wąskie gardło

- Wąż ½" (~12–13 mm): przy potrzebnych ~20–25 L/min prędkość ~2,8 m/s i opór ~7 m słupa wody na 10 m węża. Stara pompa obiegowa (maks. ~4–6 m) daje przez niego kilka L/min.
- Rachunek z uwarstwienia: ~7 kW / (1,163 × 30 K) ≈ **3–4 L/min**, zamiast ~20–25 L/min potrzebnych przy ΔT ~5 K.
- Skutki widoczne w danych: `Tho − Ttarget` rośnie z 0,5 K do 6,6 K; `Tho` 54 °C przy 48 °C w zbiorniku; pompa skrapla wysoko przez cały cykl, a nie tylko na końcu. Na starcie `Tho` (19 °C) było niższe od `Ttarget` (36,9 °C) – powrót do pompy idzie z zimnego dołu zbiornika.

### 5.3 Strona zimna

- Z charakterystyki SQIBO 0,37 (`dane/charakterystyka-SQIBO-0.37.jpg`) zmierzone 25 L/min odpowiada **~12 m** podnoszenia, z czego ~3 m to wysokość geometryczna, a **~9 m to opory** (węże, złączki, filtr, wymiennik).
- Opory rosną z kwadratem przepływu: przy 45 L/min te same przewody dałyby ~29 m – dlatego sama wymiana pompy na tańszą zatapialną (np. Kärcher SP 2 Flat, maks. 5 m, albo Pedrollo TOP 1/2, maks. 7/9 m) **nie pomoże**, dopóki nie zmniejszy się oporów. Pompa wibracyjna (1080 L/h) daje za mały przepływ i nie nadaje się do pracy ciągłej.
- Pompa śrubowa pobiera ~0,47–0,49 kW (obie pompy razem ~570 W – patrz 5.6), czyli ~15% mocy układu.

### 5.4 Zawór rozprężny i przegrzanie

- Zadane przegrzanie 0,5 K jest nieosiągalne; zmierzone 2–3 K. Regulator stale chce otwierać, zawór stoi na `EEVmax` = 60 – pompa pracuje w praktyce na stałym otwarciu.
- Test 60 → 64 → 60: temperatura parowania (`Tbe`) bez zmian (8,3 °C), przegrzanie 2,1 → 2,4 K, moc bez zmian. **Większe otwarcie nic nie daje** – przegrzanie ogranicza temperatura wody źródła, nie zawór. `EEVmax` pozostawiono na 60.
- Czujniki czytają za wysoko: `Tbe` 8,4 °C przy wodzie wylotowej 8,0 °C, `Tae` 12,4 °C przy wodzie wlotowej 11,6 °C – fizycznie czynnik musi być zimniejszy. Rzeczywiste parowanie ~5–6 °C, rzeczywiste przegrzanie raczej ~4–5 K niż 2,5 K.

### 5.5 Sprężarka

`Tsump − Tho` maleje z 4,5 K do 1,4 K w miarę nagrzewania (tak samo w poprzednich cyklach: 52,1 °C przy 50,6 °C). Obudowa sprężarki niewiele cieplejsza od temperatury skraplania. Przy rzeczywistym przegrzaniu ~4–5 K (5.4) mokra praca jest mało prawdopodobna, ale bez czujnika na rurze tłocznej (`Tbc`) nie da się tego rozstrzygnąć.

### 5.6 Pomiar mocy i przekaźniki pomp

Dobieg po zatrzymaniu (firmware: pompa zimna 10 s, gorąca 60 s):

| Czas | Stan | Moc |
|---|---|---|
| 17:14:34 | sprężarka stop, obie pompy | 575 W |
| 17:14:44 | przekaźnik strony zimnej (`CCS`) wyłączony | 576 W |
| 17:15:44 | tylko przekaźnik strony gorącej (`HCS`) | 569 W |
| 17:16:14 | `HCS` wyłączony | 20 W |

~570 W pobierają **obie pompy podłączone do przekaźnika strony gorącej** (obiegowa 80–100 W + głębinowa ~470–490 W); przekaźnik strony zimnej nic nie zasila, więc jego wyłączenie nie zmienia mocy. Historia pokazuje to samo (10 odczytów `HCS=1, CCS=0`: 570–586 W). Konsekwencje:
- po zatrzymaniu obie pompy pracują 60 s (dobieg strony gorącej); dobieg strony zimnej (10 s) nie ma znaczenia;
- ochrona przed zamarzaniem strony gorącej (`frost_protect`) włącza też pompę głębinową (~0,5 kW), choć wystarczyłaby obiegowa;
- opóźnione wyłączanie strony zimnej w firmware (zatrzymanie pompy źródła dopiero przy `Tae`, `Tbe` > 0 °C) nie działa, bo pompa źródła nie jest na tym przekaźniku;
- `HCS`/`CCS` w telemetrii i w chpc-web nie opisują pomp osobno.

Uwaga: przekładnik mierzy prąd × 230 V (moc pozorna) minus stałe 120 W, więc przy małych obciążeniach wartości są orientacyjne.

### 5.7 Ochrona przed zamarznięciem wymiennika

Deszczówka (bez glikolu) zamarza przy 0 °C. Obecnie działają: przymykanie zaworu przy `Tae` < 0,2 °C i stop przy `Tae` < −2 °C. To za mało:
- `Tae` to najcieplejsze miejsce czynnika w parowniku; lód tworzy się przy wlocie czynnika (`Tbe`), który może mieć −3 °C przy `Tae` +0,5 °C;
- `Tae` czyta za wysoko (5.4);
- przymykanie zaworu obniża temperaturę parowania – chroni sprężarkę, nie wymiennik;
- czujnik `Tco` (ochrona po stronie wody: przymykanie < 0 °C, stop < −2 °C) nie jest podłączony, a jego progi są dla glikolu.

Dopóki to nie zostanie uzupełnione, **nie należy testować słabszych pomp źródła podczas pracy sprężarki**.

### 5.8 Sterowanie (znalezione przy okazji)

- **Ręczne force z chpc-web działało bez końca:** CHPC kasuje force po zatrzymaniu, ale `co` wysyłał je ponownie, bo ręczne nadpisanie zostawało na serwerze – pompa trzymałaby zbiornik w 45–48 °C. Poprawione w chpc-web (`consumeManualForceOnStart`): ręczne force znika po pierwszym starcie sprężarki, force z harmonogramu (`forceStart`) obowiązuje przez cały wpis. Wymaga wdrożenia serwera.
- **T min 23 °C zamiast 25 °C:** zmiana delty o 2 K (4 kroki po 0,5 K) o 15:42, gdy `co` był w trybie OFF/MANUAL_CWU i nie wysyłał temperatur – najpewniej przyciskami. Przeliczenie min/max → delta w `co` działa poprawnie (potwierdzone w historii).
- **Tryby `co`:** w MANUAL_CO/MANUAL_CWU `co` nie wysyła ustawień (pełne sterowanie lokalne); w L-OFF wyłącza CO i force przy każdym odczycie.

## 6. Zalecenia

| # | Zmiana | Szacowany efekt | Uwagi |
|---|---|---|---|
| 1 | **Strona gorąca:** wąż ½" → rura 1" (DN25), izolowana; powrót do pompy z dołu zbiornika, zasilanie wyżej | **+15–25% COP** | przepływ ~20–25 L/min, ΔT ~5 K; zbiornik grzany równomiernie od dołu |
| 2 | **Pompa obiegowa:** wymiana na elektroniczną 15–30 W (klasa 25-60) | −60–80 W; warunek dla #1 | stara pompa nie przetłoczy potrzebnego przepływu |
| 3 | **Strona zimna – najpierw opory:** wąż 1", czysty filtr o dużej powierzchni, przepłukanie wymiennika płytowego; sprawdzić przepływ wiadrem z obecną pompą | część zysku bez zakupu | deszczówka zamula wymiennik |
| 4 | **Strona zimna – potem pompa:** zatapialna odśrodkowa do czystej wody, ≥ 40–50 L/min przy ~6 m, P1 ≤ 0,4–0,5 kW, pływak zablokowany, na podstawce nad dnem | **+10–15% COP** | nie pompa obiegowa na ssaniu (kawitacja, zapowietrzenie) |
| 5 | **Temperatura CWU:** 45 °C zamiast 48 °C, jeśli wystarcza | do ~50% energii cyklu CWU | ostatnie 3 K zużyły 2,10 z 4,14 kWh |
| 6 | **Czujnik `Tco`** na wyjściu wody z wymiennika; w firmware `T_COLD_MIN` dla wody ~+2 °C | bezpieczeństwo | przed jakimikolwiek zmianami strony zimnej |
| 7 | **Ochrona po `Tbe`** w firmware: stop, gdy `Tbe` < −1 °C dłużej niż 60 s, kod błędu 13 w chpc-web | bezpieczeństwo | **zrobione** (firmware po 26.09, `ERR: Temp. Tbe`) |
| 8 | **Rozdzielić pompy na przekaźniki:** obiegowa na `HCS` (pin 7), głębinowa na `CCS` (pin 10) | ochrona przed zamarzaniem bez pompy głębinowej, właściwy dobieg, osobne `HCS`/`CCS` w telemetrii | 5.6 |
| 9 | **Czujniki `Tae`/`Tbe`:** pasta termoprzewodząca, opaska, izolacja; potem zadane przegrzanie 4–5 K zamiast 0,5 K | regulacja zaworu zacznie działać | `EEVmax` zostawić 60 |
| 10 | **Dodatkowe czujniki:** `Thi` (powrót do pompy), `Tbc` (tłoczenie), drugi czujnik w zbiorniku (środek/dół) | rzetelny COP i diagnostyka | firmware obsługuje `Thi` i `Tbc` |
| 11 | **Wdrożyć poprawkę force** w chpc-web | koniec niechcianych wymuszonych startów | 5.8 |

## 7. Pomiary do wykonania po zmianach

1. przepływ źródła wiadrem (przed i po zmianie oporów);
2. temperatury wody źródła: wlot i wylot jednocześnie, na początku, w środku i na końcu cyklu;
3. temperatura powrotu do pompy (`Thi`) i zasilania (`Tho`) – ΔT strony gorącej;
4. temperatury zbiornika: góra i dół na starcie i na końcu cyklu;
5. ponowna analiza tym samym skryptem.

## 8. Dane i skrypty

| Plik | Zawartość |
|---|---|
| `dane/serwer-2026-09-26.json` | telemetria z chpc-web (`GET /api/hp/4day?date=2026-09-26`), rekordy co 10–30 s |
| `dane/cykl.csv` | wyciąg 15:50–17:20 (separator `;`) |
| `dane/log-praca-sprezarki.log` | log odczytów `GET /api/hp` co 10 s zbierany w trakcie obserwacji |
| `dane/charakterystyka-SQIBO-0.37.jpg` | wykres producenta (hypo.pl) |
| `skrypty/analiza.js` | podsumowanie cyklu, tabela co 5 min, dobieg pomp: `node skrypty/analiza.js dane/serwer-2026-09-26.json "2026.09.26 15:50" "2026.09.26 17:20"` |

Źródła danych technicznych: [IBO 3" SQIBO 0,37 – hypo.pl](https://hypo.pl/pompa-glebinowa-3-sqibo-0-37-kw-z-15m-przewodem-ibo,id2402.html), [Pedrollo TOP 1 – Hydromet](https://hydromet.net.pl/pompa-pedrollo-top-1-230v-p-1612.html), [Pedrollo TOP 2 – Hydros](https://sklep-hydros.pl/pompy-zatapialne/3378-pompa-zatapialna-top2-floor-pedrollo-8052230022675.html), [Kärcher SP 2 Flat – Godimex](https://www.godimex.pl/produkt/sp-2-flat/).
