# Dokumentacja kotła Pellux 200 Touch i sterownika ecoMAX

Materiały źródłowe do rodzaju sterownika `pellet-boiler-pelux200`. Pliki PDF są
własnością producenta (Plum / Pellux) i pochodzą z publicznych stron dystrybutorów;
pobrano je 2026-09-30.
Pliki PDF **nie są w repozytorium** (`.gitignore`): po sklonowaniu trzeba je pobrać
z adresów z kolumny „Źródło” i położyć w tym katalogu pod podanymi nazwami.

| Plik | Co zawiera | Źródło |
|---|---|---|
| `kociol-Pellux-200-Touch-instrukcja.pdf` | instrukcja kotła (PL, 29-10-2019): menu, alarmy, schemat elektryczny, komunikacja panelu z modułem A po RS485, współpraca z ecoNET300 | <https://pellux.pl/app/uploads/2020/03/25185-PELLUX-200-Touch-PL-29-10-2019-min.pdf> |
| `ecoMAX-860P-TOUCH-instrukcja.pdf` | instrukcja regulatora ecoMAX860P TOUCH (wykonanie ecoMAX920P1-F), najbliższa generacja sterownika z panelem dotykowym | <https://metalfachtg.com.pl/wp-content/uploads/2025/05/Instrukcja-sterownik-PLATINUM-PELLET-4.3c-07_2020.pdf> |
| `ecoMAX-850P2-C-DTR-PL.pdf` | instrukcja starszego regulatora ecoMAX850P2-C (dla porównania) | <https://warmes.pl/images/PDF/ecoMAX-850P2-C_DTR_PL_wydanie_1.2.pdf> |
| `ecoMAX-modul-B-C-instrukcja.pdf` | moduły rozszerzeń B i C serii ecoMAX | <https://metalfachtg.com.pl/wp-content/uploads/2025/05/2017-06-Instrukcja-Modul-B-i-C.pdf> |
| `ecoNET300-DTR-PL.pdf`, `ecoNET300-DTR-EN.pdf` | moduł internetowy ecoNET300 (Wi-Fi/LAN, econet24.com) | <https://www.kawah.pl/wp-content/uploads/2018/02/ecoNET300_DTR_PL_wydanie_1.1.pdf>, <https://hvac.plum.pl/wp-content/uploads/2024/02/ecoNET300_DTR_EN_wydanie_1.2.pdf> |

## Ustalenia

- Instrukcja kotła nie podaje dokładnego modelu regulatora. Pisze o „regulatorze
  ecoMAX, moduł A” z osobnym panelem dotykowym połączonym łączem RS485 i o
  opcjonalnym module ecoNET300. To układ generacji TOUCH (860P / 920P), a nie
  starszego 800P.
- Kocioł współpracuje z **ecoNET300** (Wi-Fi/LAN) — instrukcja kotła i instrukcja
  ecoNET300 to potwierdzają.
- Dokładny model trzeba odczytać z etykiety albo z menu panelu (Informacje).

## Dwie drogi pobierania danych

1. **Lokalne HTTP przez ecoNET300 (prostsze dla `co`).** Moduł wystawia w sieci
   lokalnej (Basic Auth, fabrycznie `admin`/`admin`) JSON-y, m.in.
   `/econet/regParams`, `/econet/sysParams`, `/econet/rmCurrentDataParams`.
   Obiekt `curr` ma m.in. `tempCO`, `tempCWU`, `tempFlueGas`, `tempFeeder`,
   `mode`, `pumpCOWorks`, `pumpCWUWorks`, `boilerPower`, `fanPower`, `fuelLevel`.
   Źródło: społecznościowe (Home Assistant, elektroda), nieoficjalne —
   do sprawdzenia na naszym module. Wymaga zakupu ecoNET300 i tylko Wi-Fi ESP32,
   bez dotykania magistrali RS-485 kotła.
2. **Bezpośrednio RS-485 (PyPlumIO).** Opis ramek w
   [piec-pellux200.md](../piec-pellux200.md). Wymaga
   konwertera i wpięcia w magistralę kotła; ryzyko kolizji, brak oficjalnej
   specyfikacji.

## Podłączenie RS-485 na module A

Schemat z instrukcji kotła (rozdział 12, strona 55 w druku, strona 24 w PDF):
[schemat-polaczen-elektrycznych-str24.png](schemat-polaczen-elektrycznych-str24.png),
powiększenie zacisków: [schemat-modul-A-zaciski-RS485.png](schemat-modul-A-zaciski-RS485.png).

![Zaciski RS-485 modułu A](schemat-modul-A-zaciski-RS485.png)

Na płytce modułu A nie ma gniazda RJ11, tylko zaciski śrubowe:

| Gniazdo | Zaciski | Do czego służy |
|---|---|---|
| G2 | 5V, D+, D−, GND | panel kotła („Boiler's panel” BP) |
| G4 | 12V DC, D+, D−, GND | panel pokojowy ecoSTER TOUCH („Room panel” RP) |
| G3 | 36 = D+, 37 = D− | magistrala dwuprzewodowa do modułu B/C i sondy lambda (λ, B) |
| G1 | USB | aktualizacja oprogramowania |

Zasady z dokumentacji producenta:

- Do modułów B/C łączy się **wyłącznie dwuprzewodowo** (D+ i D−); połączenie czterema
  przewodami grozi uszkodzeniem regulatora (instrukcja modułów B i C).
- Instrukcja ecoNET300 każe wpinać interfejs równolegle do przewodów panelu, przy
  zaciskach sterownika.
- Nie podłączać 5 V ani 12 V do naszego odbiornika.

Niezweryfikowane (do sprawdzenia nasłuchem pasywnym):

- czy ramki `RegulatorData` (`0x08`) są na linii panelu (G2/G4), czy na G3 (36/37).
  Panel pobiera dane od sterownika, więc najbardziej prawdopodobne jest G2 albo G4,
  a G3 służy modułom rozszerzeń i może mieć inny protokół,
- kolejność D+/D− przy konwerterze (zamiana nic nie uszkadza).

## Uwaga o repozytorium

PDF-y mają razem ok. 18 MB i są cudzymi materiałami z prawami autorskimi. Nie zostały
dodane do gita; zdecyduj, czy je commitować, czy dodać katalog do `.gitignore`.
