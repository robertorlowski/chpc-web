import { THPL } from "./type";

// type Point = { time: string | number | Date; Watts: number };

/** Zwraca energię w kWh dla serii (czas, moc[W]) */
export function energyKWh(data: THPL[]): number {
  if (!data || data.length < 2) return 0;

  // zamiana time -> ms od epoki
  const toMs = (t: THPL["time"]) => {
    if (!t) return 0;
    // if (t instanceof Date) return t.getTime();
    // if (typeof t === "number") return t; // zakładamy ms
    // "HH:MM:SS" lub ISO
    if (/^\d{2}:\d{2}:\d{2}$/.test(t)) {
      const [H, M, S] = t.split(":").map(Number);
      const d = new Date(); d.setHours(H, M, S, 0);
      return d.getTime();
    }
    return new Date(t).getTime();
  };

  // upewnij się, że rośnie po czasie
  const sorted = [...data].sort((a, b) => toMs(a.time) - toMs(b.time));

  let wh = 0; // będziemy liczyć w Wh
  for (let i = 1; i < sorted.length; i++) {
    const t0 = toMs(sorted[i - 1].time);
    const t1 = toMs(sorted[i].time);
    const dt_h = (t1 - t0) / 3_600_000;        // różnica czasu w godzinach
    const p0 = sorted[i - 1].Watts ?? 0;
    const p1 = sorted[i].Watts ?? 0;
    wh += ((p0 + p1) / 2) * dt_h;              // całka trapezami w Wh
  }
  return wh / 1000; // kWh
}
