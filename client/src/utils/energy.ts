import { THPL } from "../api/type";

export function energyKWh(data: THPL[], subtractPv: boolean): number {
  if (!Array.isArray(data) || data.length < 2) {
    return 0;
  }

  const timeOnlyRegex = /^(\d{2}):(\d{2}):(\d{2})$/;
  const allTimeOnly = data.every(item => timeOnlyRegex.test(item.time));

  let samples: Array<{
    timeMs: number;
    powerW: number;
  }>;

  if (allTimeOnly) {
    let dayOffsetMs = 0;
    let previousSeconds: number | undefined;

    samples = data.map(item => {
      const match = timeOnlyRegex.exec(item.time);

      if (!match) {
        throw new Error(`Nieprawidłowy czas: ${item.time}`);
      }

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);

      if (
        hours < 0 || hours > 23 ||
        minutes < 0 || minutes > 59 ||
        seconds < 0 || seconds > 59
      ) {
        throw new Error(`Nieprawidłowy czas: ${item.time}`);
      }

      const secondsOfDay =
        hours * 3600 +
        minutes * 60 +
        seconds;

      // Przejście przez północ.
      if (
        previousSeconds !== undefined &&
        secondsOfDay < previousSeconds
      ) {
        dayOffsetMs += 24 * 60 * 60 * 1000;
      }

      previousSeconds = secondsOfDay;

      const watts = Number(item.Watts);
      const pvWatts = Number(item.pv ?? 0);

      if (!Number.isFinite(watts) || !Number.isFinite(pvWatts)) {
        throw new Error(`Nieprawidłowa moc dla czasu ${item.time}`);
      }

      const powerW = subtractPv
        ? Math.max(0, watts - pvWatts)
        : Math.max(0, watts);

      return {
        timeMs: dayOffsetMs + secondsOfDay * 1000,
        powerW
      };
    });
  } else {
    samples = data
      .map(item => {
        const timeMs = Date.parse(item.time);
        const watts = Number(item.Watts);
        const pvWatts = Number(item.pv ?? 0);

        if (!Number.isFinite(timeMs)) {
          throw new Error(`Nieprawidłowy czas: ${item.time}`);
        }

        if (!Number.isFinite(watts) || !Number.isFinite(pvWatts)) {
          throw new Error(`Nieprawidłowa moc dla czasu ${item.time}`);
        }

        return {
          timeMs,
          powerW: subtractPv
            ? Math.max(0, watts - pvWatts)
            : Math.max(0, watts)
        };
      })
      .sort((a, b) => a.timeMs - b.timeMs);
  }

  let energyWh = 0;

  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];

    const durationHours =
      (current.timeMs - previous.timeMs) / 3_600_000;

    // Pomijamy duplikaty i nieprawidłową kolejność.
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      continue;
    }

    energyWh +=
      ((previous.powerW + current.powerW) / 2) *
      durationHours;
  }

  return energyWh / 1000;
}