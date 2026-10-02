# Archiwum danych z bazy produkcyjnej

Dane pomiarowe przeniesione z MongoDB (baza `hpdb`, Atlas) do repozytorium i usunięte z bazy, żeby zmieścić się w limicie współdzielonego planu.

| Plik | Kolekcja | Zakres (`createdAt`, czas warszawski) | Rekordów | SHA-256 | Usunięte z bazy |
|---|---|---|---|---|---|
| `2025/hp-2025.jsonl.gz` | `hp` (telemetria pompy ciepła) | rok 2025; faktycznie 15.08.2025 18:04 – 21.09.2025 08:46 | 93 484 | `47acf8178d453a225df89de5609161cc74138c0c47bdd37d52921edcab9ee1c3` | 2026-10-02 |

Z 2025 roku w bazie była tylko kolekcja `hp`. Pozostałe kolekcje danych (`pv`, `water_pressure_tank`, `water_meter`, `pellet_boiler_pelux200`) zaczynają się w 2026. Dokument `settings` z 2025 to konfiguracja, nie dane, i został w bazie.

## Format

Plik `.jsonl.gz` to JSON Lines spakowany gzipem: jeden dokument MongoDB na wiersz, w kanonicznym Extended JSON (`{"$oid": …}`, `{"$date": …}`), więc `_id`, daty i liczby mają te same typy co w bazie. Kolejność rosnąco po `createdAt`. Pola rekordu opisuje `CLAUDE.md`, punkt 4 (`hp`).

Przed usunięciem archiwum zostało sprawdzone: odczytane od nowa, każdy wiersz sparsowany, liczba i identyfikatory zgodne z bazą, żaden rekord spoza roku. Z bazy usunięto dokładnie identyfikatory z pliku.

## Eksport kolejnego roku

```bash
cd server   # MONGODB_URI w server/.env
node ../archiwum/export-year.cjs hp 2026 ../archiwum/2026/hp-2026.jsonl.gz
```

Usuwanie z bazy jest osobnym krokiem, po sprawdzeniu pliku.

## Przywrócenie

Do lokalnej bazy (`npm run local -- --db`, port 27027) albo innej:

```bash
gzip -dc archiwum/2025/hp-2025.jsonl.gz > hp-2025.jsonl
mongoimport --uri "mongodb://127.0.0.1:27027/hpdb" --collection hp --file hp-2025.jsonl
```

`mongoimport` czyta Extended JSON wprost. Przy przywracaniu do bazy, w której rekordy już są, duplikaty `_id` zostaną odrzucone.
