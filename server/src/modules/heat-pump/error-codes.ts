// Opisy kodów błędów CHPC (HP.ERR, error_code) do kafelka sterownika. Źródło: ERRC_* w
// devices/chpc/src/CHPC_firmware.ino; ta sama lista jest w client/src/devices/heat-pump/utils/errors.ts
// (zmieniać razem).
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

export const errorDescription = (code: number) => ERROR_DESCRIPTIONS[code] ?? `Nieznany błąd (kod ${code})`;
