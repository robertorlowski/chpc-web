// Typy hydroforu: uruchomienia pompy, przepływ, podsumowania i wodomierz.
// Kontrakt z modułem server/src/modules/water-pressure-tank (kolekcje water_pressure_tank i water_meter).
// Wodę liczy serwer: efektywny czas pracy pompy (bez ręcznej pracy kompresora) × przepływ
// z odczytów wodomierza; null, dopóki nie ma dwóch odczytów z pracą pompy między nimi.

// Uruchomienie pompy hydroforu (GET /water-pressure-tank/runs). Daty liczy serwer ze swojego zegara;
// timeApproximate = uruchomienie wysłane z kolejki po braku sieci, inProgress = ostatnia wiadomość
// sterownika młodsza niż 5 s. pumpSeconds i waterLiters liczone przy każdym odczycie (nowy odczyt
// wodomierza zmienia przepływ, więc i wodę w historii).
export type WaterPressureTankRun = {
  _id: string;
  runId: number;
  pumpStart: string;
  pumpEnd: string;
  compressorStart?: string;
  compressorEnd?: string;
  restarts?: number;
  /** czas ręcznego włączenia kompresora [s] */
  manualSeconds?: number;
  /** efektywny czas pracy pompy [s] */
  pumpSeconds: number;
  waterLiters: number | null;
  timeApproximate: boolean;
  inProgress: boolean;
  // kompresor włączony teraz (tylko przy inProgress; liczy serwer z ostatniej wiadomości)
  compressorRunning?: boolean;
};

// Przepływ pompy (GET /water-pressure-tank/flow): suma litrów z wodomierza / suma czasu pompy
// ze wszystkich okresów między odczytami.
export type WaterFlow = {
  litersPerMinute: number | null;
  periods: number;
  meterLiters: number;
  pumpSeconds: number;
};

export type WaterSummaryPeriod = 'day' | 'month' | 'year';

// key kubełka: godzina (day), dzień miesiąca (month) albo numer miesiąca 1–12 (year)
export type WaterSummary = {
  period: WaterSummaryPeriod;
  date: string;
  buckets: { key: number; pumpSeconds: number; waterLiters: number | null; runs: number }[];
  flow: WaterFlow;
};

export type WaterMeterReading = {
  _id: string;
  readAt: string;
  valueM3: number;
  note?: string;
};

export type WaterMeterSummary = {
  year?: number;
  periods: { from: string; to: string; meterLiters: number; pumpSeconds: number; estimatedLiters: number | null }[];
  months: { month: number; meterLiters: number | null; estimatedLiters: number | null }[];
  flow: WaterFlow;
};
