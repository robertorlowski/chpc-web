// Kody błędów sterownika CHPC (HP.ERR, error_code). Źródło: ERRC_* w chpc/src/CHPC_firmware.ino.
// Zmiana kodu wymaga zmiany w obu projektach.
export const ERROR_LOCKED = 11;
export const ERROR_LOCK_LIMIT = 5;

export const ERROR_DESCRIPTIONS: Record<number, string> = {
  1: 'Błąd czujnika temperatury',
  2: 'Przeciążenie: moc powyżej limitu',
  3: 'Brak przepływu',
  4: 'Sprężarka nie pracuje: za mała moc po starcie',
  5: 'Przegrzanie obiegu gorącego (Tho)',
  6: 'Przegrzanie sprężarki (Tsump)',
  7: 'Przegrzanie tłoczenia (Tbc)',
  8: 'Zamarzanie za parownikiem (Tae)',
  9: 'Zamarzanie obiegu zimnego (Tco)',
  10: 'Uszkodzony (sklejony) przekaźnik sprężarki',
  11: 'Przekroczono maksymalną liczbę błędów: sterowanie zablokowane',
  12: 'Za niska temperatura sprężarki (Tsump)',
  13: 'Zamarzanie parownika (Tbe poniżej -1 °C dłużej niż 60 s)',
};

export const errorDescription = (code?: number | null) =>
  code ? ERROR_DESCRIPTIONS[code] ?? `Nieznany błąd (kod ${code})` : '';

export const isLocked = (errorCount?: number | null) => (errorCount ?? 0) >= ERROR_LOCK_LIMIT;

// Błąd w dwóch liniach: data, a pod nią opis błędu; bez czasu zostaje sam opis.
export const errorLine = (entry?: { error_code?: number | null; time?: string } | null) => {
  if (!entry?.error_code) return '';
  const description = errorDescription(entry.error_code);
  return entry.time ? `${entry.time}\n${description}` : description;
};
