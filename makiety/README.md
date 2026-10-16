# Makiety nowego wyglądu chpc-web

Statyczne prototypy HTML nowego wyglądu aplikacji (klient React w `client/`), do późniejszego wdrożenia.
Nie są częścią builda ani klienta; nie mają zależności poza czcionkami z Google Fonts.

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
- `build.mjs` – składa pliki `propozycja-*.html` (`node makiety/src/build.mjs`).

Edytować należy pliki w `src/` i złożyć ponownie; `propozycja-*.html` są wynikiem składania.

## Etap 2 (po wyborze kierunku)

Pełna makieta wybranej propozycji: wszystkie rodzaje sterowników (pompa ciepła, fotowoltaika, hydrofor, włącznik, piec) i wszystkie zakładki (Dane, Wykres, Operacje, Ustawienia, Harmonogram), okna (dane sterownika, kafelek pogody, udostępnianie), logowanie i konto, tryb „Zmień układ” i projektant kafelka, stany pusty / offline / błąd.
