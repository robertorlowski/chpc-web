import type { THPL } from "../api/type";

export type G12wZone = "peak" | "offPeak";

export type G12wCostOptions = {
  /**
   * Wymagane, gdy THPL.time ma format HH:MM:SS.
   * Przykład: "2026-07-14".
   */
  dateForTimeOnly?: string;

  /**
   * Opcjonalne zabezpieczenie przed naliczaniem energii przez długie luki
   * w telemetrii. Interwały dłuższe od tej wartości zostaną pominięte.
   * Brak wartości oznacza brak limitu.
   */
  maxGapMinutes?: number;
};

export type G12wCostResult = {
  consumptionKWh: number;
  pvGenerationKWh: number;
  pvUsedKWh: number;
  gridEnergyKWh: number;
  peakGridEnergyKWh: number;
  offPeakGridEnergyKWh: number;
  energySaleCostPLN: number;
  variableDistributionCostPLN: number;
  totalVariableCostPLN: number;
  skippedIntervals: number;
};

/**
 * Stawki brutto TAURON dla taryfy G12w, obowiązujące w 2026 roku.
 *
 * Cena sprzedaży energii:
 * - szczyt:       0,7712 zł/kWh
 * - poza szczytem 0,5141 zł/kWh
 *
 * Zmienne opłaty dystrybucyjne łącznie:
 * - szczyt:       0,4590 zł/kWh
 * - poza szczytem 0,1164 zł/kWh
 *
 * Opłaty stałe miesięczne nie są tu uwzględniane, ponieważ nie zależą
 * bezpośrednio od bieżącego zużycia ani autokonsumpcji PV.
 */
export const TAURON_G12W_2026_GROSS = {
  salePLNPerKWh: {
    peak: 0.7712,
    offPeak: 0.5141,
  },
  variableDistributionPLNPerKWh: {
    peak: 0.4590,
    offPeak: 0.1164,
  },
} as const;

type NormalizedSample = {
  timeMs: number;
  watts: number;
  pvWatts: number;
};

const TIME_ONLY_RE = /^(\d{2}):(\d{2}):(\d{2})$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const HAS_TIME_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const WARSAW_TIME_ZONE = "Europe/Warsaw";

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type WarsawParts = CalendarDate & {
  hour: number;
  minute: number;
  second: number;
};

const warsawFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WARSAW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getWarsawParts(date: Date): WarsawParts {
  const values: Record<string, string> = {};

  for (const part of warsawFormatter.formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function calendarKey(date: CalendarDate): string {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Zamienia lokalny czas Polski na czas epokowy niezależnie od strefy czasowej
 * komputera lub serwera uruchamiającego kod.
 */
function warsawDateTimeToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond = 0,
): number {
  const desiredUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  let guess = desiredUtc;

  for (let i = 0; i < 4; i += 1) {
    const rendered = getWarsawParts(new Date(guess));
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
      0,
    );
    const guessWithoutMs = Math.floor(guess / 1000) * 1000;
    const offsetMs = renderedAsUtc - guessWithoutMs;
    const corrected = desiredUtc - offsetMs;

    if (corrected === guess) break;
    guess = corrected;
  }

  return guess;
}

/** Algorytm Meeusa/Jonesa/Butchera dla Wielkanocy w kalendarzu gregoriańskim. */
function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { year, month, day };
}

/** Ustawowo wolne dni w Polsce, istotne dla taryfy G12w. */
function polishPublicHolidayKeys(year: number): Set<string> {
  const easter = easterSunday(year);
  const holidays: CalendarDate[] = [
    { year, month: 1, day: 1 },
    { year, month: 1, day: 6 },
    easter,
    addCalendarDays(easter, 1),
    { year, month: 5, day: 1 },
    { year, month: 5, day: 3 },
    addCalendarDays(easter, 49),
    addCalendarDays(easter, 60),
    { year, month: 8, day: 15 },
    { year, month: 11, day: 1 },
    { year, month: 11, day: 11 },
    { year, month: 12, day: 25 },
    { year, month: 12, day: 26 },
  ];

  // Wigilia jest dniem ustawowo wolnym od pracy od 2025 roku.
  if (year >= 2025) {
    holidays.push({ year, month: 12, day: 24 });
  }

  return new Set(holidays.map(calendarKey));
}

const holidayCache = new Map<number, Set<string>>();

function isPolishPublicHoliday(parts: CalendarDate): boolean {
  let keys = holidayCache.get(parts.year);

  if (!keys) {
    keys = polishPublicHolidayKeys(parts.year);
    holidayCache.set(parts.year, keys);
  }

  return keys.has(calendarKey(parts));
}

/**
 * G12w TAURON:
 * - strefa szczytowa w dni robocze: 06:00-13:00 i 15:00-22:00,
 * - strefa pozaszczytowa w dni robocze: 13:00-15:00 i 22:00-06:00,
 * - soboty, niedziele i święta ustawowe: cała doba poza szczytem.
 */
export function getTauronG12wZone(date: Date): G12wZone {
  const parts = getWarsawParts(date);
  const dayOfWeek = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (weekend || isPolishPublicHoliday(parts)) {
    return "offPeak";
  }

  const minutes = parts.hour * 60 + parts.minute;
  const peakMorning = minutes >= 6 * 60 && minutes < 13 * 60;
  const peakAfternoon = minutes >= 15 * 60 && minutes < 22 * 60;

  return peakMorning || peakAfternoon ? "peak" : "offPeak";
}

function nextTariffBoundaryMs(date: Date): number {
  const parts = getWarsawParts(date);
  const current = date.getTime();
  const nextDay = addCalendarDays(parts, 1);
  const candidates = [
    warsawDateTimeToEpochMs(parts.year, parts.month, parts.day, 6, 0, 0),
    warsawDateTimeToEpochMs(parts.year, parts.month, parts.day, 13, 0, 0),
    warsawDateTimeToEpochMs(parts.year, parts.month, parts.day, 15, 0, 0),
    warsawDateTimeToEpochMs(parts.year, parts.month, parts.day, 22, 0, 0),
    warsawDateTimeToEpochMs(nextDay.year, nextDay.month, nextDay.day, 0, 0, 0),
  ];

  for (const candidate of candidates) {
    if (candidate > current) {
      return candidate;
    }
  }

  return warsawDateTimeToEpochMs(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    0,
    0,
    0,
  );
}

function parseTimestampInWarsaw(time: string): number {
  if (!HAS_TIME_ZONE_RE.test(time)) {
    const match = time.match(LOCAL_DATE_TIME_RE);

    if (match) {
      const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));

      return warsawDateTimeToEpochMs(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] ?? 0),
        milliseconds,
      );
    }
  }

  return new Date(time).getTime();
}

function assertFiniteNumber(value: unknown, field: string, time: string): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`Nieprawidłowa wartość ${field} dla czasu ${time}`);
  }

  return numberValue;
}

function normalizeSamples(
  data: THPL[],
  dateForTimeOnly?: string,
): NormalizedSample[] {
  const allTimeOnly = data.every(item => TIME_ONLY_RE.test(item.time));
  const anyTimeOnly = data.some(item => TIME_ONLY_RE.test(item.time));

  if (anyTimeOnly && !allTimeOnly) {
    throw new Error("Nie mieszaj czasu HH:MM:SS z pełnymi znacznikami daty i czasu.");
  }

  if (allTimeOnly) {
    const baseMatch = dateForTimeOnly?.match(DATE_ONLY_RE);

    if (!baseMatch) {
      throw new Error(
        "Dla czasu HH:MM:SS podaj options.dateForTimeOnly w formacie YYYY-MM-DD.",
      );
    }

    const [, yText, mText, dText] = baseMatch;
    const year = Number(yText);
    const month = Number(mText) - 1;
    const day = Number(dText);

    let dayOffset = 0;
    let previousSeconds: number | undefined;

    return data.map(item => {
      const match = item.time.match(TIME_ONLY_RE);

      if (!match) {
        throw new Error(`Nieprawidłowy czas: ${item.time}`);
      }

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);

      if (hours > 23 || minutes > 59 || seconds > 59) {
        throw new Error(`Nieprawidłowy czas: ${item.time}`);
      }

      const secondsOfDay = hours * 3600 + minutes * 60 + seconds;

      if (
        previousSeconds !== undefined &&
        secondsOfDay < previousSeconds
      ) {
        dayOffset += 1;
      }

      previousSeconds = secondsOfDay;

      return {
        timeMs: (() => {
          const sampleDate = addCalendarDays(
            { year, month: month + 1, day },
            dayOffset,
          );

          return warsawDateTimeToEpochMs(
            sampleDate.year,
            sampleDate.month,
            sampleDate.day,
            hours,
            minutes,
            seconds,
          );
        })(),
        watts: Math.max(0, assertFiniteNumber(item.Watts, "Watts", item.time)),
        pvWatts: Math.max(0, assertFiniteNumber(item.pv ?? 0, "pv", item.time)),
      };
    });
  }

  return data
    .map(item => {
      const timeMs = parseTimestampInWarsaw(item.time);

      if (!Number.isFinite(timeMs)) {
        throw new Error(`Nieprawidłowy czas: ${item.time}`);
      }

      return {
        timeMs,
        watts: Math.max(0, assertFiniteNumber(item.Watts, "Watts", item.time)),
        pvWatts: Math.max(0, assertFiniteNumber(item.pv ?? 0, "pv", item.time)),
      };
    })
    .sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Energia dodatniej części funkcji liniowej pomiędzy p0 i p1.
 * Obsługuje dokładnie sytuację, w której moc netto przecina zero.
 */
function positiveLinearEnergyWh(
  p0W: number,
  p1W: number,
  durationHours: number,
): number {
  if (durationHours <= 0) return 0;

  if (p0W <= 0 && p1W <= 0) return 0;

  if (p0W >= 0 && p1W >= 0) {
    return ((p0W + p1W) / 2) * durationHours;
  }

  const crossing = -p0W / (p1W - p0W);

  if (p0W < 0) {
    const positiveDuration = durationHours * (1 - crossing);
    return (p1W / 2) * positiveDuration;
  }

  const positiveDuration = durationHours * crossing;
  return (p0W / 2) * positiveDuration;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Wylicza koszt energii pobranej z sieci po chwilowym odjęciu produkcji PV:
 * mocZSieci = max(0, Watts - pv).
 *
 * Nadwyżka PV nie obniża kosztu poniżej zera i nie jest wyceniana jako energia
 * oddana do sieci. To jest kalkulacja autokonsumpcji, a nie pełne rozliczenie
 * prosumenckie w systemie net-billing.
 *
 * Dla prawidłowego rozpoznawania weekendów i świąt THPL.time powinien zawierać
 * pełną datę, najlepiej ISO z przesunięciem strefy, np.:
 * 2026-07-14T21:30:00+02:00.
 */
export function energyCostG12w(
  data: THPL[],
  options: G12wCostOptions = {},
): G12wCostResult {
  const empty: G12wCostResult = {
    consumptionKWh: 0,
    pvGenerationKWh: 0,
    pvUsedKWh: 0,
    gridEnergyKWh: 0,
    peakGridEnergyKWh: 0,
    offPeakGridEnergyKWh: 0,
    energySaleCostPLN: 0,
    variableDistributionCostPLN: 0,
    totalVariableCostPLN: 0,
    skippedIntervals: 0,
  };

  if (!Array.isArray(data) || data.length < 2) {
    return empty;
  }

  const samples = normalizeSamples(data, options.dateForTimeOnly);
  const maxGapMs =
    options.maxGapMinutes !== undefined
      ? options.maxGapMinutes * 60_000
      : undefined;

  let consumptionWh = 0;
  let pvGenerationWh = 0;
  let peakGridWh = 0;
  let offPeakGridWh = 0;
  let skippedIntervals = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    const intervalMs = current.timeMs - previous.timeMs;

    if (intervalMs <= 0) {
      skippedIntervals += 1;
      continue;
    }

    if (maxGapMs !== undefined && intervalMs > maxGapMs) {
      skippedIntervals += 1;
      continue;
    }

    const intervalHours = intervalMs / 3_600_000;

    consumptionWh += positiveLinearEnergyWh(
      previous.watts,
      current.watts,
      intervalHours,
    );

    pvGenerationWh += positiveLinearEnergyWh(
      previous.pvWatts,
      current.pvWatts,
      intervalHours,
    );

    const net0W = previous.watts - previous.pvWatts;
    const net1W = current.watts - current.pvWatts;

    let segmentStartMs = previous.timeMs;

    while (segmentStartMs < current.timeMs) {
      const boundaryMs = nextTariffBoundaryMs(new Date(segmentStartMs));
      const segmentEndMs = Math.min(current.timeMs, boundaryMs);

      const startFraction =
        (segmentStartMs - previous.timeMs) / intervalMs;
      const endFraction =
        (segmentEndMs - previous.timeMs) / intervalMs;

      const segmentNet0W = lerp(net0W, net1W, startFraction);
      const segmentNet1W = lerp(net0W, net1W, endFraction);
      const segmentHours = (segmentEndMs - segmentStartMs) / 3_600_000;
      const segmentWh = positiveLinearEnergyWh(
        segmentNet0W,
        segmentNet1W,
        segmentHours,
      );

      const midpoint = new Date((segmentStartMs + segmentEndMs) / 2);
      const zone = getTauronG12wZone(midpoint);

      if (zone === "peak") {
        peakGridWh += segmentWh;
      } else {
        offPeakGridWh += segmentWh;
      }

      segmentStartMs = segmentEndMs;
    }
  }

  const consumptionKWh = consumptionWh / 1000;
  const pvGenerationKWh = pvGenerationWh / 1000;
  const peakGridEnergyKWh = peakGridWh / 1000;
  const offPeakGridEnergyKWh = offPeakGridWh / 1000;
  const gridEnergyKWh = peakGridEnergyKWh + offPeakGridEnergyKWh;
  const pvUsedKWh = Math.max(0, consumptionKWh - gridEnergyKWh);

  const energySaleCostPLN =
    peakGridEnergyKWh * TAURON_G12W_2026_GROSS.salePLNPerKWh.peak +
    offPeakGridEnergyKWh * TAURON_G12W_2026_GROSS.salePLNPerKWh.offPeak;

  const variableDistributionCostPLN =
    peakGridEnergyKWh *
      TAURON_G12W_2026_GROSS.variableDistributionPLNPerKWh.peak +
    offPeakGridEnergyKWh *
      TAURON_G12W_2026_GROSS.variableDistributionPLNPerKWh.offPeak;

  return {
    consumptionKWh,
    pvGenerationKWh,
    pvUsedKWh,
    gridEnergyKWh,
    peakGridEnergyKWh,
    offPeakGridEnergyKWh,
    energySaleCostPLN,
    variableDistributionCostPLN,
    totalVariableCostPLN:
      energySaleCostPLN + variableDistributionCostPLN,
    skippedIntervals,
  };
}
