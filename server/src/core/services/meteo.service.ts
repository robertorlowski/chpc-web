// Temperatura zewnętrzna z czujnika zewnętrznego kotła pelletowego (outside_temp z odczytu sterownika pieca).
// Od 2026-10-04 zamiast stacji IMGW Zakopane (decyzja użytkownika). Ustawia ją moduł kotła przy każdym
// odczycie i po starcie serwera z ostatniego odczytu w bazie (core nie importuje modułów). Trafia do
// rekordów hp (t_out), do odpowiedzi /hp/add dla ekranu sterownika co i do GET /temperature. Trzymana
// tylko w pamięci; pomiar starszy niż OUTDOOR_MAX_AGE_MS jest pomijany (null), np. przy wyłączonym sterowniku pieca.

export const OUTDOOR_MAX_AGE_MS = 15 * 60 * 1000;

let outdoor: { value: number; at: Date } | null = null;

// Nowy pomiar z czujnika kotła (moduł pellet-boiler-pelux200); starszy niż zapamiętany jest pomijany.
export function setOutdoorTemperature(value: number, at = new Date()) {
  if (!Number.isFinite(value)) return;
  if (outdoor && outdoor.at > at) return;
  outdoor = { value, at };
}

// Ostatni świeży pomiar albo null.
export function getTemperature(now = new Date()): number | null {
  if (!outdoor || now.getTime() - outdoor.at.getTime() > OUTDOOR_MAX_AGE_MS) return null;
  return outdoor.value;
}
