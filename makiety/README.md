# Makiety nowego wyglądu My Home

Statyczne prototypy HTML nowego wyglądu aplikacji (klient React w `client/`).
Nie są częścią builda ani klienta; nie mają zależności poza czcionkami z Google Fonts.

**Stan wdrożenia (2026-10-17, commit 630f1a7):** pełna makieta kierunku B jest wdrożona w kliencie w całości — każdy ekran `#s-…` z `makieta.html` ma stronę React o tej samej strukturze i klasach, a CSS komponentów z `src/baza.css`, `src/makieta.css` i `src/wariant-b.css` jest przeniesiony do `client/src/makieta.css`. Makieta pozostaje źródłem wyglądu: zmianę zaczyna się tu, potem przenosi do klienta (i do `client/src/makieta.css`, gdy dotyczy komponentu wspólnego). Różnice względem aplikacji: makieta startuje w motywie ciemnym, aplikacja bez wyboru użytkownika w jasnym; makieta pokazuje też dane, których API jeszcze nie daje (czas pracy sprężarki i palenia w kafelku i pasku, COP i produkcja w miesiącu na kafelkach, T. CWU pompy, „Konto od” i stan zapamiętania w Koncie).

## Etap 1 (2026-10-16): trzy propozycje kierunku

| Plik | Propozycja | Charakter |
|---|---|---|
| [`propozycja-a.html`](propozycja-a.html) | **A „Spokojny panel”** | ciągłość z obecnym turkusem; białe karty na chłodnym, szarym tle; cienkie linie i delikatny cień; zakładki w górnym pasku (komputer), dolna nawigacja (telefon) |
| [`propozycja-b.html`](propozycja-b.html) | **B „Instrument”** | ciemny domyślnie; grafitowe warstwy oddzielone wyraźnymi liniami; kolorowa krawędź kafelka wg rodzaju sterownika; bursztyn (ciepło) i cyjan (woda); boczne menu na komputerze |
| [`propozycja-c.html`](propozycja-c.html) | **C „Dom”** | jasny domyślnie, miękkie zaokrąglenia, duże liczby; karty bez linii, rozdzielone kontrastem tła i cieniem; granatowy nagłówek sterownika; zakładki jako pigułki |

Każda propozycja zawiera te same trzy ekrany, żeby dało się porównać:

1. **Lista sterowników** (`#lista`): pasek pogody domu, kafelki: pogoda „Dom”, pompa ciepła, fotowoltaika, hydrofor, włącznik (dwa przekaźniki), piec Pellux 200; stopka z zajętością bazy.
2. **Pompa ciepła – podgląd** (`#pompa`): temperatura zbiornika z zakresem 38–45, stan sprężarki, moc / PV / COP / temperatura zewnętrzna, przekaźniki obiegu, energia dnia z kosztem G12w, pomiary.
3. **Harmonogram** (`#harmonogram`): tryb pracy, temperatura domyślna, wpisy z zaznaczeniem działającego i pozycją „Poza harmonogramem”.

Dane na makietach są przykładowe (wzięte z lokalnej bazy demo), nie z produkcji.

### Jak oglądać

- Otwórz plik w przeglądarce (działa z dysku, bez serwera). Na telefonie: ten sam plik, np. z udziału sieciowego lub `npx serve makiety`.
- Pasek na dole ekranu (**Jasny / Ciemny / System**) przełącza motyw; „System” bierze ustawienie telefonu lub komputera. Pasek nie jest częścią aplikacji.
- Nawigacja działa klikaniem: kafelek pompy → podgląd, zakładka / dolna nawigacja „Harmonogram”, strzałka wstecz → lista. Pozostałe zakładki (Dane, Wykres, Operacje, Ustawienia) są atrapami do etapu 2.
- Sprawdzane szerokości: **360 px** (Samsung Galaxy S20, telefon docelowy wg `CLAUDE.md`), **412 px** (większe telefony z Androidem) i **1280 px** (komputer). Układ telefonu obowiązuje do 899 px, komputera od 900 px.

### Założenia wspólne dla wszystkich propozycji

- **Rozdzielenie elementów bez polegania na obramowaniach:** tło strony i karty mają zawsze inny odcień (w obu motywach), karty mają cień albo cienką linię o niskim kontraście, wiersze w kartach rozdziela linia `--line-soft`, a sekcje w kafelku oddziela odstęp i linia nad faktami. Ciemny motyw nie jest odwróconym jasnym: ma własne wartości tokenów.
- **Tokeny kolorów** w `:root` (jasny) i w dwóch blokach ciemnych (`prefers-color-scheme: dark` bez jawnego wyboru oraz `[data-theme="dark"]`), więc ten sam zestaw tokenów można przenieść do `client/src/style.css`.
- **Kolory rodzajów sterowników** (`--c-heat`, `--c-water`, `--c-sun`, `--c-switch`, `--c-fire`, `--c-sky`) są osobne od koloru akcentu i od kolorów stanów (ok / ostrzeżenie / praca).
- Dolna nawigacja na telefonie ma 5 pozycji: cztery najczęstsze widoki i „Więcej” (Operacje, Ustawienia); na komputerze wszystkie zakładki są widoczne.
- Liczby mają stałą szerokość cyfr (`tabular-nums`), jednostki są mniejsze i jaśniejsze od wartości.

## Źródła i składanie

Katalog [`src/`](src/):

- `szkielet.html` – wspólny HTML trzech ekranów i skrypt makiety (motyw, przełączanie ekranów);
- `baza.css` – wspólny układ i komponenty (kafelki, karty, przełączniki, formularze, nawigacja), zbudowane z tokenów;
- `wariant-a.css`, `wariant-b.css`, `wariant-c.css` – tokeny i akcenty każdej propozycji; blok `/*DARK*/ … /*/DARK*/` to wartości ciemne, powielane przy składaniu do obu bloków ciemnych;
- `makieta.html`, `makieta.css` – pełna makieta etapu 2 (ekrany, okna, skrypt nawigacji i wykresów);
- `sprawdz.mjs` – test automatyczny makiety (niżej);
- `build.mjs` – składa `propozycja-*.html` i `makieta.html` (`node makiety/src/build.mjs`).

Edytować należy pliki w `src/` i złożyć ponownie; `propozycja-*.html` są wynikiem składania.

## Etap 2 (2026-10-16): pełna makieta w kierunku B „Instrument”

Wybrano propozycję **B**. Pełna makieta to [`makieta.html`](makieta.html) (jeden samodzielny plik; źródła `src/makieta.html`, `src/makieta.css`, tokeny `src/wariant-b.css`). Pasek na dole ma listę ekranów do szybkiego skoku i przełącznik motywu; w aplikacji działa też zwykła nawigacja (kafelki, zakładki, dolna nawigacja, „Więcej”, strzałka wstecz, menu konta).

Ekrany:

| Ekran | Adres | Co pokazuje |
|---|---|---|
| Lista sterowników | `#lista` | pasek pogody domu, kafelki 5 rodzajów + „Dom”, ołówek i trybik firmware po najechaniu, tryb **„Zmień układ”** (ikona siatki): strzałki i oko na kafelkach, puste pole „+ kafelek pogody”, kafelek ukryty |
| Pompa · Podgląd | `#hp-podglad` | temperatura zbiornika z zakresem, sprężarka, moc / PV / COP / na zewnątrz, przekaźniki obiegu, energia dnia, pomiary |
| Pompa · Dane | `#hp-dane` | nawigacja po dniu, „Wszystkie odczyty”, CSV, tabela odczytów (przewijana w poziomie tylko w kontenerze), wiersz z błędem podświetlony |
| Pompa · Wykres | `#hp-wykres` | dzień / miesiąc / rok, kafelki pobór / PV / koszt G12w / czas pracy, **dwa wykresy z jedną osią każdy** (temperatury; moc i PV) ze wspólnym kursorem i dymkiem po najechaniu, legenda |
| Pompa · Harmonogram | `#hp-harmonogram` | tryb pracy, temperatura domyślna, wpisy z zaznaczeniem działającego, „Poza harmonogramem”, okno **Wpis harmonogramu** |
| Pompa · Operacje | `#hp-operacje` | dzień, filtr Wszystkie / Użytkownik / System, oś czasu zdarzeń (kolor krawędzi = źródło, stan jako chip) |
| Pompa · Ustawienia | `#hp-ustawienia` | polecenie do sterownika (tryb, temperatury, limit mocy, EEV, przełączniki ze stanem z pompy, wyszarzone gdy pompa steruje sama), komunikat po wysłaniu, **błędy sterownika** z Odblokuj / Restart (okno potwierdzenia), karta **Sterownik** (SN, Root ID, IP, firmware, Aktualizuj), **udostępnianie** |
| Fotowoltaika · Podgląd | `#pv-podglad` | moc teraz, dziś / miesiąc / łącznie / temperatura, krzywa mocy dnia, panele z paskiem względem szczytu i stanem (słabszy panel oznaczony) |
| Fotowoltaika · Wykres | `#pv-wykres` | produkcja dzienna w miesiącu (słupki), statystyki |
| Hydrofor · Podgląd | `#tank-podglad` | **pasek Offline** z przyczyną, woda dziś, przełączniki pompy i kompresora, czas kompresora i przepływ, dzisiejsze uruchomienia, zużycie w tygodniu |
| Włącznik · Podgląd | `#switch-podglad` | karta na przekaźnik: przełącznik, tryb, odliczanie, Włącz / Wyłącz / Harmonogram, czas włączenia; przekaźnik zablokowany na czerwono; tabela „Dziś” |
| Piec · Podgląd | `#boiler-podglad` | kocioł z płomieniem, stan / sezon / tryb, moc, obciążenie, paliwo, spaliny, karty CWU i mieszaczy, urządzenia kotła, alarm podajnika |
| Logowanie | `#logowanie` | e‑mail → kod (dwa kroki) |
| Konto | `#konto` | dane, zapamiętanie, lista sterowników własnych i udostępnionych, usunięcie konta (okno potwierdzenia) |
| Okna | — | Dane sterownika (ołówek), Kafelek pogody (z wyszukiwarką), Udostępnij sterownik (zakładki), Wpis harmonogramu, potwierdzenia, menu konta (awatar), arkusz „Więcej” (telefon) |

### Etap 2b: wszystkie zakładki i okna

Makieta obejmuje każdy widok z menu każdego rodzaju sterownika (34 ekrany, 13 okien), więc ekran zastępczy nie jest już używany:

| Sterownik | Ekrany |
|---|---|
| Fotowoltaika | + Dane (`#pv-dane`: odczyty dnia / dni miesiąca, filtr panelu, CSV), Ustawienia (`#pv-ustawienia`: instalacja z DTU, parametry mikrofalownika, sterownik źródłowy) |
| Hydrofor | + Dane (`#tank-dane`: uruchomienia w miesiącu z „≈” przy czasie przybliżonym, odczyty wodomierza z dodawaniem i usuwaniem), Wykres (`#tank-wykres`: woda w dniach miesiąca), Operacje (`#tank-operacje`), Ustawienia (`#tank-ustawienia`: czas kompresora, przepływ pompy z wodomierza, sterownik z dostępną aktualizacją i oknem potwierdzenia „Aktualizuj”) |
| Włącznik | + Dane (`#switch-dane`: włączenia w dniu, filtr przekaźnika), Harmonogram (`#switch-harmonogram`: wpisy po przekaźnikach, przekaźnik zablokowany trybem, okno wpisu), Operacje (`#switch-operacje`), Ustawienia (`#switch-ustawienia`: nazwy przekaźników, domyślny czas włączenia, sterownik) |
| Piec | + Dane (`#boiler-dane`: główne kolumny / wszystkie parametry, alarm w wierszu), Wykres (`#boiler-wykres`: temperatury z wyborem serii chipami, pas palenia pod osią), Harmonogram (`#boiler-harmonogram`: praca kotła, lista trybu, wpisy CWU i pracy kotła, okno wpisu), Alarmy (`#boiler-alarmy`: aktywne i historia), Operacje (`#boiler-operacje`: zlecenia parametrów ze statusem), Ustawienia (`#boiler-ustawienia`: tryb pracy i sezon, główne parametry z oknem grupy, ostatnie zmiany, interwał, ustawienia zaawansowane zwinięte, sterownik) |
| Firmware | `#firmware-tank`, `#firmware-switch`, `#firmware-boiler` (trybik na kafelku / „Wersje firmware” w ustawieniach): aktualna wersja z opisem i przełącznikiem „Aktualizacje”, sterowniki tego rodzaju, poprzednie wersje (przywróć, usuń), okno „Dodaj wersję” |

### Test automatyczny makiety

```bash
node makiety/src/sprawdz.mjs           # wynik w konsoli, kod wyjścia 1 przy problemach
node makiety/src/sprawdz.mjs --shots   # dodatkowo zrzuty każdego ekranu i okna do makiety/zrzuty/ (poza gitem)
```

Wymaga pakietu `playwright` (jest w `test/e2e/package.json`; inna ścieżka przez `PLAYWRIGHT=<…/playwright/index.mjs>`). Dla każdego z 34 ekranów przy 360, 412 i 1280 px w motywie jasnym i ciemnym sprawdza: brak przewijania strony w poziomie, żaden element nie wystaje poza okno, treść kart nie jest ucięta, pasek górny jest, na telefonie ekran sterownika ma dolną nawigację (a na komputerze nie), wykresy są narysowane, brak błędów konsoli. Dodatkowo: każdy widok z menu ma ekran, każdy przycisk prowadzi do istniejącego ekranu, każde okno otwiera się i zamyka klawiszem Esc, nawigacja kafelek → podgląd → zakładka → wstecz działa. Ostatni przebieg (2026-10-16): 298 sprawdzeń, 0 problemów.

Zasady wykresów: jedna oś na wykres (temperatury i moc osobno, zamiast dwóch osi Y), cienkie słupki i linie 2 px, legenda przy ≥ 2 seriach, dymek i kursor po najechaniu, paleta serii sprawdzona pod kątem daltonizmu osobno dla motywu jasnego i ciemnego (`--ch-1…4` w `wariant-b.css`).

Sprawdzone: 15 ekranów × 360 / 1280 px × jasny / ciemny bez przewijania w poziomie i bez błędów konsoli; okna na 360 i 1280 px.
