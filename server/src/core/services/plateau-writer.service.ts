// Zapis odczytów bez identycznych powtórzeń (decyzja użytkownika 2026-10-07): hp, pellet_boiler_pelux200, pv.
// Pomiar produkcji 5–6.10: 39–77 % rekordów hp było identycznych z poprzednim (postój), piec i PV podobnie.
//
// Seria identycznych odczytów (ten sam klucz porównania) zostawia w bazie rekord początkowy i jeden rekord
// końcowy, który przy każdym kolejnym takim samym odczycie dostaje treść tego odczytu i createdAt = teraz.
// Co PLATEAU_MAX_MS rekord końcowy zostaje na stałe, a następny identyczny odczyt zakłada nowy. Dzięki temu:
//   - ostatni rekord ma zawsze aktualny createdAt, więc sprawdzanie świeżości (kocioł odpowiada, „Dane
//     nieaktualne”, PV do rekordów hp, temperatura zewnętrzna) działa bez zmian;
//   - odstępy między rekordami są ≤ PLATEAU_MAX_MS, a bilans energii (monthly-summary, koszt G12w) odrzuca
//     przerwy > 15 min; na zmianie stanu poprzedni rekord jest sprzed chwili, więc całkowanie mocy jest dokładne.
// Stan serii jest w pamięci per rootId; po restarcie serwera pierwszy odczyt zawsze tworzy nowy rekord.
// Rekord końcowy jest aktualizowany sterownikiem MongoDB (collection.updateOne), bo Mongoose nie pozwala
// zmienić createdAt (pole niezmienne przy timestamps); treść przechodzi wcześniej przez schemat (new Model).
import { Model, Types } from 'mongoose';

export const PLATEAU_MAX_MS = 10 * 60 * 1000;

type Series = {
  key: string;
  // createdAt rekordu, od którego liczy się bieżące okno PLATEAU_MAX_MS
  anchorAt: number;
  endId?: Types.ObjectId;
  endAt?: number;
};

// Klucz porównania: JSON bez pól pominiętych (omit) i z zaokrągleniem liczb w polach round
// (np. temperatury pieca do 0,5 °C). Kolejność kluczy wynika ze schematu, więc jest stała.
export function comparisonKey(
  value: unknown,
  omit: readonly string[],
  round: { test: (key: string) => boolean; step: number } | null = null,
): string {
  const skipped = new Set(['_id', 'createdAt', 'updatedAt', '__v', ...omit]);
  return JSON.stringify(value, (key, field) => {
    if (skipped.has(key)) return undefined;
    if (round && typeof field === 'number' && round.test(key)) return Math.round(field / round.step) * round.step;
    return field;
  });
}

export function createPlateauWriter<T>(model: Model<T>) {
  const seriesByRoot = new Map<string, Series>();

  // payload: dokument do zapisania; key: comparisonKey(...) z wartości po schemacie (keyOf).
  // Zwraca zapisany dokument (zwykły obiekt z _id i createdAt) i czy powstał nowy rekord.
  return async function write(
    rootId: string,
    payload: Record<string, unknown>,
    keyOf: (cast: Record<string, unknown>) => string,
  ): Promise<{ doc: Record<string, unknown>; inserted: boolean }> {
    const cast = new model(payload).toObject() as Record<string, unknown>;
    delete cast._id;
    const key = keyOf(cast);
    const now = Date.now();
    const series = seriesByRoot.get(rootId);

    if (series && series.key === key && series.endId && now - series.anchorAt < PLATEAU_MAX_MS) {
      const at = new Date(now);
      const set = { ...cast, createdAt: at, updatedAt: at };
      const result = await model.collection.updateOne({ _id: series.endId }, { $set: set });
      if (result.matchedCount === 1) {
        series.endAt = now;
        return { doc: { ...set, _id: series.endId }, inserted: false };
      }
      // rekord końcowy zniknął (np. usunięty ręcznie): zwykły zapis niżej
    }

    const created = await model.create(payload);
    const doc = created.toObject() as Record<string, unknown>;
    const createdAt = new Date(doc.createdAt as Date).getTime();
    if (series && series.key === key) {
      // ta sama seria: nowy rekord końcowy; po upływie okna poprzedni końcowy zostaje i otwiera nowe okno
      if (series.endId && series.endAt !== undefined) series.anchorAt = series.endAt;
      series.endId = created._id as Types.ObjectId;
      series.endAt = createdAt;
    } else {
      seriesByRoot.set(rootId, { key, anchorAt: createdAt });
    }
    return { doc, inserted: true };
  };
}
