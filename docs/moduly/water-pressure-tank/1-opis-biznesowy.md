# Moduł water-pressure-tank — opis biznesowy

[← Dokumentacja systemu](../../README.md) · **1. Opis biznesowy** · [2. Zasada działania](2-zasada-dzialania.md) · [3. Dokumentacja techniczna](3-dokumentacja-techniczna.md) · [English](../../en/moduly/water-pressure-tank/1-business-description.md)

## Po co jest ten moduł

Moduł obsługuje w aplikacji **hydrofor**: domową instalację wody ze studni, w której pompa napełnia zbiorniki ciśnieniowe, a presostat włącza ją przy spadku ciśnienia i wyłącza po jego odbudowie. W zbiorniku z poduszką powietrzną powietrze stopniowo rozpuszcza się w wodzie, dlatego przy każdym starcie pompy sterownik hydroforu włącza na chwilę **kompresor**, który uzupełnia powietrze.

Moduł pozwala:

- **ustawić czas pracy kompresora**;
- **widzieć każde uruchomienie pompy**: kiedy i jak długo pracowała pompa i kompresor;
- **liczyć zużycie wody** bez wodomierza elektronicznego: z czasu pracy pompy i jej przepływu, który aplikacja wylicza z ręcznych odczytów wodomierza;
- **porównać wodę z czasu pompy z wodomierzem** w kolejnych miesiącach.

## Dla kogo

**Właściciel domu** z hydroforem i sterownikiem hydroforu (ESP32). Sterownik ma zasilanie tylko wtedy, gdy pracuje pompa, więc nie trzeba go obsługiwać.

## Ekrany

Zrzuty ekranu pochodzą sprzed wersji 1.3.0, gdy wodę szacowano z objętości zbiorników. Układ widoków jest ten sam, a różnice opisują podpisy.

![Widok główny](img/glowny.png)

*Hydrofor (zrzut sprzed wersji 1.3.0): karta „Ustawienia” z czasem kompresora i przepływem pompy (z czego go policzono albo, bez dwóch odczytów wodomierza, co zrobić) oraz dzisiejsze uruchomienia z kolumnami Kompresor, Pompa (np. „4 min 10 s”; podpowiedź pokazuje odjętą ręczną pracę kompresora) i Woda. Uruchomienie w toku jest wyróżnione kolorem („pracuje”, „…”); widok odświeża się co 5 s. Pod nagłówkiem przełączniki (jak „CO pompa” pompy ciepła) pokazują, czy pracuje pompa wody i kompresor powietrza. Na zrzucie jest jeszcze dawna karta „Zbiorniki”.*

| Dane — uruchomienia pompy | Dane — odczyty wodomierza |
|---|---|
| ![Uruchomienia](img/dane-uruchomienia.png) | ![Odczyty wodomierza](img/dane-odczyty-wodomierza.png) |

*Dane: zakładka „Uruchomienia pompy” (tabela z wybranego miesiąca, czas pompy w minutach i sekundach, woda, „Razem: X l, pompa Y”, eksport CSV; „≈” oznacza czas przybliżony, czyli uruchomienie wysłane później, bo zabrakło sieci) i zakładka „Odczyty wodomierza” (dodawanie i usuwanie odczytów, zużycie między odczytami).*

| Wykres — dzień | Wykres — miesiąc |
|---|---|
| ![Dzień](img/wykres-dzien.png) | ![Miesiąc](img/wykres-miesiac.png) |

*Wykres: słupki wody w godzinach, dniach albo miesiącach. Dopóki nie ma przepływu, słupki pokazują czas pracy pompy w minutach, a pod wykresem jest podpowiedź o dwóch odczytach wodomierza.*

![Rok z wodomierzem](img/wykres-rok-wodomierz.png)

*Wykres roku z włączonym „Pokaż odczyty z wodomierza” (zrzut sprzed wersji 1.3.0): w każdym miesiącu zużycie z wodomierza i woda „z czasu pompy”, a pod wykresem przepływ, którym ją policzono. Dawny sugerowany współczynnik `k` nie istnieje.*

**Ustawienia** mają kartę „Kompresor” (czas pracy kompresora), kartę „Przepływ pompy” (wartość w l/min i z ilu okresów między odczytami wodomierza ją policzono albo instrukcja, jak ją uzyskać) i kartę „Sterownik”.

## Pierwsze uruchomienie

1. Sterownik po pierwszym starcie sam zgłasza się do chmury i dostaje ustawienie domyślne: kompresor 30 s.
2. Dodać **odczyty wodomierza** (Dane → Odczyty wodomierza): co najmniej dwa, między którymi pracowała pompa, najlepiej co kilka tygodni. Od drugiego odczytu aplikacja zna przepływ pompy i pokazuje wodę także w uruchomieniach z przeszłości.
3. Opcjonalnie oznaczyć hydrofor gwiazdką jako sterownik domyślny.

Zmiana czasu kompresora w aplikacji dociera do sterownika **przy następnym uruchomieniu pompy** (sterownik ma zasilanie tylko w czasie pracy pompy). Czas kompresora można też zmienić na stronie sterownika `/install`; trafi wtedy do chmury.

## Ograniczenia

- **Woda jest przybliżona.** Zakłada stały przepływ pompy. Przepływ to średnia ze wszystkich okresów między odczytami wodomierza, ważona czasem pracy pompy.
- **Przed dwoma odczytami wodomierza wody nie ma** (w aplikacji „---”). Czas pracy pompy jest widoczny od początku.
- **Każdy nowy odczyt wodomierza zmienia przepływ**, a więc i wodę w całej historii, bo woda nie jest zapisywana, tylko liczona przy odczycie.
- **Ręczna praca kompresora** („Włącz” na stronie sterownika) jest odejmowana od czasu pracy pompy, bo w tym czasie pompa nie tłoczy wody do odbioru.
- **Bez sieci** uruchomienie trafia do chmury przy następnym starcie, z czasem przybliżonym.
- **Czas uruchomienia** jest dokładny do ok. 1 s (sterownik nie ma zegara; czas liczy serwer).

## Słownik

| Pojęcie | Znaczenie |
|---|---|
| **Hydrofor** | pompa + zbiorniki ciśnieniowe + presostat |
| **Presostat** | włącznik ciśnieniowy: włącza pompę przy progu dolnym, wyłącza przy górnym |
| **Zbiornik z poduszką powietrzną** | zbiornik (np. ocynkowany), w którym woda styka się z powietrzem; powietrza ubywa, stąd kompresor |
| **Uruchomienie** | jeden cykl pompy od włączenia do wyłączenia przez presostat |
| **Czas pompy** | czas pracy pompy w uruchomieniu bez ręcznej pracy kompresora |
| **Przepływ pompy** | litry na minutę: suma wody z wodomierza podzielona przez sumę czasu pompy z okresów między odczytami |
| **Wodomierz** | licznik wody; odczyty wpisuje użytkownik |
