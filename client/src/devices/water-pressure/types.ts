// Typy hydroforu: zbiorniki w ustawieniach, uruchomienia pompy, podsumowania i wodomierz.

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

// Uruchomienie pompy hydroforu (GET /water-pressure/runs).
export type WaterPressureRun = {
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
};

export type WaterSummaryPeriod = 'day' | 'month' | 'year';

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
