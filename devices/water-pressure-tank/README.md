# Hydrofor — sterownik `water-pressure`

Sterownik ESP32-C3 SuperMini, który przy każdym uruchomieniu pompy hydroforu raz włącza kompresor dobijający powietrze do zbiornika, a dane uruchomienia wysyła do chpc-web.

Pełny opis działania, schemat podłączenia i sposób szacowania wody: **[docs/water-pressure-tank.md](docs/water-pressure-tank.md)**.

## Budowanie i wgrywanie

```sh
cp src/secrets.example.h src/secrets.h   # nazwa i hasło AP, login /install
pio run -e esp32c3                       # build
pio run -e esp32c3 -t upload             # wgranie przez USB-C
pio device monitor                       # konsola (USB CDC, 115200)
pio test -e native                       # testy logiki na PC
```

## Pliki

| Plik | Zawartość |
|---|---|
| `src/water-pressure-tank.cpp` | start kompresora przed Wi-Fi, punkt dostępowy, strony `/`, `/state.json`, `/restart`, `/install`, zgłoszenie w chmurze, wysyłka co 1 s |
| `src/firmware.hpp` | typ, pin i poziom przekaźnika (`RELAY_ACTIVE_HIGH`), adres chmury |
| `src/compressor.*` | czas pracy kompresora (start, ponowne uruchomienie, wyłączenie po czasie) |
| `src/settings.*` | ustawienia z chmury (JSON), szacunek wody — ten sam wzór co w serwerze |
| `src/run_report.*` | JSON wysyłki, kolejka uruchomień bez sieci w NVS |
| `test/test_logic` | testy `native` powyższej logiki |

## Stała konfiguracja w kodzie

- Przekaźnik na `GPIO10`, obecnie sterowany stanem niskim (`RELAY_ACTIVE_HIGH = false`). Po przestawieniu modułu na sterowanie stanem wysokim (zalecane) zmień na `true`.
- Kompresor startuje 1 s po podaniu zasilania (`COMPRESSOR_START_DELAY_MS`).
- Punkt dostępowy pod adresem `10.11.16.1`, jak w poprzednim szkicu.

Poprzednia wersja (szkic Arduino) leży w `D:\DevLocal\arduino_src\hydrofor\hydrofor.ino`.
