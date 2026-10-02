// Formaty włącznika: czasy w Europe/Warsaw, opis trybu przekaźnika, odliczanie, CSV włączeń.
import { SwitchActivation, SwitchRelay } from '../types';

const TIME_ZONE = 'Europe/Warsaw';

export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

export const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : '---';

export const formatTimeSeconds = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE }) : '---';

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// godzina, a dla innego dnia niż dziś także data („pt 06:00”, „12.10 06:00”)
export const formatMoment = (iso?: string | null) => {
  if (!iso) return '---';
  if (dayOf(iso) === todayWarsaw()) return formatTime(iso);
  const date = new Date(iso).toLocaleDateString('pl-PL', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });
  return `${date} ${formatTime(iso)}`;
};

// „1 h 05 min”, „4 min”, „35 s”
export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
};

// odliczanie hh:mm:ss (albo mm:ss poniżej godziny) do chwili until
export const formatCountdown = (until: string, now: number) => {
  const total = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
};

const sourceLabel = (source: string | null | undefined) => source === 'controller' ? 'ze sterownika' : 'z aplikacji';

// Opis trybu pod nazwą przekaźnika; danger — wyłączony z blokadą harmonogramu.
export const describeMode = (relay: SwitchRelay): { text: string; danger?: boolean } => {
  switch (relay.mode) {
    case 'on':
      return { text: `Włączony ręcznie (bez limitu) ${sourceLabel(relay.modeSource)}, od ${formatMoment(relay.modeChangedAt)}` };
    case 'timer':
      return { text: `Włączony na czas ${sourceLabel(relay.modeSource)}, do ${formatMoment(relay.until)}` };
    case 'off':
      return { text: 'Wyłączony · harmonogram zablokowany', danger: true };
    default:
      if (relay.desiredOn) return { text: `Harmonogram · włączony do ${formatMoment(relay.until)}` };
      return {
        text: relay.nextStart
          ? `Harmonogram · wyłączony, następne włączenie ${formatMoment(relay.nextStart)}`
          : 'Harmonogram · wyłączony, brak zaplanowanych włączeń',
      };
  }
};

export const relayLabel = (relay: Pick<SwitchRelay, 'relay' | 'name'>) => relay.name?.trim() || `Przekaźnik ${relay.relay}`;

// przesunięcie Warszawy względem UTC w chwili date [ms]
const warsawOffset = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
};

// Doba warszawska YYYY-MM-DD jako [start, end) w ms, niezależnie od strefy przeglądarki.
export const warsawDayBounds = (date: string) => {
  const midnight = (day: string) => {
    const guess = new Date(`${day}T00:00:00Z`);
    return guess.getTime() - warsawOffset(guess);
  };
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnight(date), end: midnight(next.toISOString().slice(0, 10)) };
};

// Część włączenia przypadająca na dzień [dayStart, dayEnd) w sekundach (włączenia przez północ).
export const secondsInDay = (activation: SwitchActivation, dayStart: number, dayEnd: number, now: number) => {
  const on = Math.max(new Date(activation.onAt).getTime(), dayStart);
  const off = Math.min(activation.offAt ? new Date(activation.offAt).getTime() : now, dayEnd);
  return Math.max(0, (off - on) / 1000);
};

// CSV dla Excela z polskimi ustawieniami (separator ';').
export const activationsToCsv = (activations: SwitchActivation[], names: Map<number, string>) => {
  const header = ['Przekaźnik', 'Włączenie', 'Wyłączenie', 'Czas [s]', 'Czas przybliżony'];
  const rows = activations.map((activation) => [
    names.get(activation.relay) ?? `Przekaźnik ${activation.relay}`,
    new Date(activation.onAt).toLocaleString('pl-PL', { timeZone: TIME_ZONE }),
    activation.offAt ? new Date(activation.offAt).toLocaleString('pl-PL', { timeZone: TIME_ZONE }) : '',
    activation.durationS,
    activation.approximate ? 'tak' : '',
  ].join(';'));
  return [header.join(';'), ...rows].join('\n');
};

export const downloadText = (content: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
