// Ostatni odczyt kotła (GET /last) odświeżany co 30 s i po zmianie refreshKey (np. listy zleceń),
// z flagą responding: czy kocioł przesyła dane. Gdy nie przesyła (regulator milczy na magistrali,
// brak zasilania, przerwany przewód), przyciski zmian w Ustawieniach są nieaktywne, a serwer i tak
// odrzuca zlecenia (409, isBoilerResponding w pellet-boiler-pelux200.service.ts).
import { useCallback, useEffect, useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';

const REFRESH_MS = 30_000;

export const NOT_RESPONDING_TEXT = 'Kocioł nie przesyła danych — zmiany są niedostępne do czasu, gdy kocioł znów zacznie je wysyłać.';

export function useLastReading(refreshKey?: unknown) {
  // undefined: jeszcze nie wczytano (przyciski nie są wtedy blokowane), null: brak odpowiedzi serwera
  const [reading, setReading] = useState<PelletBoilerReading | null | undefined>(undefined);
  const refresh = useCallback(() => PelletBoilerRequests.getLast().then((last) => setReading(last ?? null)), []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh, refreshKey]);
  // brak pola responding (starszy serwer) przy istniejącym odczycie = odpowiada
  const responding = reading === undefined || (!!reading?.createdAt && reading.responding !== false);
  return { reading: reading ?? null, setReading, responding };
}
