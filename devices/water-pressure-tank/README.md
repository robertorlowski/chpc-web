# Hydrofor — sterownik `water-pressure-tank`

Sterownik ESP32 DevKit (moduł WROOM-32), który przy każdym uruchomieniu pompy hydroforu raz włącza kompresor dobijający powietrze do zbiornika, a dane uruchomienia wysyła do chpc-web.

Dokumentacja: **[1. Opis biznesowy](docs/1-opis-biznesowy.md)** (z listą kontrolną przed wdrożeniem) · [2. Zasada działania](docs/2-zasada-dzialania.md) · [3. Dokumentacja techniczna](docs/3-dokumentacja-techniczna.md) (schemat podłączenia) · [English](docs/en/1-business-description.md). Pierwotna specyfikacja: [docs/water-pressure-tank.md](docs/water-pressure-tank.md).

## Budowanie i wgrywanie

```sh
cp src/secrets.example.h src/secrets.h   # nazwa i hasło AP, login /install
pio run                                  # build (esp32dev)
pio run -t upload                        # wgranie (bez działającego mostka USB: docs, „Wgranie przez przejściówkę USB-TTL”)
pio device monitor                       # konsola (UART0, 115200)
pio test -e native                       # testy logiki na PC
```

## Pliki

| Plik | Zawartość |
|---|---|
| `src/water-pressure-tank.cpp` | start kompresora przed Wi-Fi, punkt dostępowy, strony `/`, `/state.json`, `/restart`, `/compressor/on`, `/compressor/off`, `/install`, zgłoszenie w chmurze, wysyłka co 1 s |
| `src/firmware.hpp` | typ, wersja, pin i poziom przekaźnika (`RELAY_ACTIVE_HIGH`), czasy kompresora, adres chmury |
| `src/compressor.*` | czas pracy kompresora (start, ponowne uruchomienie, praca ręczna „Włącz”/„Wyłącz” z limitem 30 min, wyłączenie po czasie) |
| `src/settings.*` | ustawienia z chmury (JSON, tylko czas kompresora); wodę liczy chmura z czasu pompy i wodomierza |
| `src/run_report.*` | JSON wysyłki, kolejka uruchomień bez sieci w NVS |
| `test/test_logic` | testy `native` powyższej logiki |

## Stała konfiguracja w kodzie

- Przekaźnik na `GPIO26` (pin „P26”), moduł sterowany stanem niskim (`RELAY_ACTIVE_HIGH = false`) z rezystorem 10 kΩ z `IN` do `3V3` ESP32. Przy module sterowanym stanem wysokim (zworka H) zmień na `true` i daj rezystor do masy.
- Kompresor startuje 1 s po podaniu zasilania (`COMPRESSOR_START_DELAY_MS`).
- Punkt dostępowy pod adresem `10.11.16.1`, jak w poprzednim szkicu.
- Zasilanie 5 V na pin `5V`/`VIN`, nigdy na `3V3`; nic na `CMD`, `SD0–SD3`, `CLK` ani `GPIO12` (płytka nie startuje: `invalid header`).

Poprzednia wersja (szkic Arduino) leży w `D:\DevLocal\arduino_src\hydrofor\hydrofor.ino`.
