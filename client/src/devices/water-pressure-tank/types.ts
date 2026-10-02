// Typy hydroforu: zbiorniki w ustawieniach, uruchomienia pompy, podsumowania i wodomierz.
// Kontrakt z modułem server/src/modules/water-pressure-tank (kolekcje water_pressure_tank i water_meter).

// Zbiornik hydroforu: 'air' — poduszka powietrzna (k), 'membrane' — przeponowy (precharge).
export type WaterTankKind = 'air' | 'membrane';

export type WaterTank = {
  name?: string;
  kind: WaterTankKind;
  volumeLiters: number;
  enabled: boolean;
  precharge?: number;
  k?: number;
};

// Uruchomienie pompy hydroforu (GET /water-pressure-tank/runs). Daty liczy serwer ze swojego zegara;
// timeApproximate = uruchomienie wysłane z kolejki po braku sieci, inProgress = ostatnia wiadomość
// sterownika młodsza niż 5 s. waterLiters policzone przy utworzeniu rekordu (nie zmienia się po zmianie ustawień).
export type WaterPressureTankRun = {
  _id: string;
  runId: number;
  pumpStart: string;
  pumpEnd: string;
  compressorStart?: string;
  compressorEnd?: string;
  restarts?: number;
  waterLiters: number;
  timeApproximate: boolean;
  inProgress: boolean;
  // kompresor włączony teraz (tylko przy inProgress; liczy serwer z ostatniej wiadomości)
  compressorRunning?: boolean;
};

export type WaterSummaryPeriod = 'day' | 'month' | 'year';

// key kubełka: godzina (day), dzień miesiąca (month) albo numer miesiąca 1–12 (year)
export type WaterSummary = {
  period: WaterSummaryPeriod;
  date: string;
  buckets: { key: number; waterLiters: number; runs: number }[];
};

export type WaterMeterReading = {
  _id: string;
  readAt: string;
  valueM3: number;
  note?: string;
};

export type WaterMeterSummary = {
  year?: number;
  periods: { from: string; to: string; meterLiters: number; estimatedLiters: number }[];
  months: { month: number; meterLiters: number | null; estimatedLiters: number | null }[];
  suggestedK: number | null;
};
