// Dziennik alarmów kotła (GET /pellet-boiler-pelux200/alerts, firmware pieca od 1.7.0): nazwy kodów, opis czasu
// i wybór alarmów do paska na stronie głównej. Kody za PyPlumIO (const.py, AlertType); nazwy po polsku jak
// w instrukcji kotła, gdzie się dało.
import { PelletBoilerAlert } from '../types';

const ALERT_NAMES: Record<number, string> = {
  0: 'Zanik zasilania',
  1: 'Uszkodzony czujnik temperatury kotła',
  2: 'Przekroczona maksymalna temperatura kotła',
  3: 'Uszkodzony czujnik temperatury podajnika',
  4: 'Przekroczona maksymalna temperatura podajnika',
  5: 'Uszkodzony czujnik temperatury spalin',
  6: 'Przekroczona maksymalna temperatura spalin',
  7: 'Nieudana próba rozpalenia',
  8: 'Brak paliwa',
  9: 'Wykryty wyciek',
  10: 'Uszkodzony czujnik ciśnienia',
  11: 'Awaria wentylatora',
  12: 'Za niskie ciśnienie powietrza',
  13: 'Nieudane wygaszanie',
  14: 'Uszkodzony czujnik płomienia',
  15: 'Zablokowany siłownik',
  16: 'Nieprawidłowe parametry',
  17: 'Ostrzeżenie o kondensacji',
  18: 'Zadziałanie STB kotła',
  19: 'Zadziałanie STB podajnika',
  20: 'Za niskie ciśnienie wody',
  21: 'Za wysokie ciśnienie wody',
  22: 'Zablokowany podajnik',
  23: 'Zanik płomienia',
  24: 'Awaria wentylatora wyciągowego',
  25: 'Awaria podajnika zewnętrznego',
  26: 'Uszkodzony czujnik kolektora słonecznego',
  27: 'Uszkodzony czujnik obiegu solarnego',
  28: 'Uszkodzony czujnik obiegu H1',
  29: 'Uszkodzony czujnik obiegu H2',
  30: 'Uszkodzony czujnik obiegu H3',
  31: 'Uszkodzony czujnik temperatury zewnętrznej',
  32: 'Uszkodzony czujnik temperatury CWU',
  33: 'Uszkodzony czujnik obiegu H0',
  34: 'Ochrona przed zamarzaniem bez źródła ciepła',
  35: 'Ochrona przed zamarzaniem ze źródłem ciepła',
  36: 'Przekroczona temperatura kolektora słonecznego',
  37: 'Przekroczona temperatura ogrzewania podłogowego',
  38: 'Schładzanie kotła',
  39: 'Brak połączenia z modułem ecoLAMBDA',
};

export const POWER_LOSS = 0;
// pasek na stronie głównej: alarm, który trwa albo skończył się w ostatnich 24 h
export const BANNER_HOURS = 24;

export const alertName = (code: number) => ALERT_NAMES[code] ?? `Alarm nr ${code}`;

export const formatAlertTime = (iso: string, withYear = true) =>
  new Date(iso).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit',
  });

// Koniec wcześniejszy niż początek: koniec zapisany z nieustawionego zegara regulatora (np. 2018 po zaniku zasilania).
export const endUnknown = (alert: PelletBoilerAlert) => !!alert.to && new Date(alert.to) < new Date(alert.from);

export function alertDuration(alert: PelletBoilerAlert, now = Date.now()): string {
  if (endUnknown(alert)) return '—';
  const end = alert.to ? new Date(alert.to).getTime() : now;
  const minutes = Math.max(0, Math.round((end - new Date(alert.from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} dni ${hours % 24} h`;
}

// Pasek na stronie głównej: alarm trwający (zawsze) albo nowy (nie z pierwszego przesłania), który skończył się
// w ostatnich BANNER_HOURS; bez zaników zasilania i bez dat niepewnych.
export function bannerAlerts(alerts: PelletBoilerAlert[], now = Date.now()): PelletBoilerAlert[] {
  return alerts.filter((alert) => {
    if (alert.code === POWER_LOSS || alert.uncertain) return false;
    if (alert.active) return true;
    if (alert.initial || !alert.to) return false;
    return now - new Date(alert.to).getTime() <= BANNER_HOURS * 3600 * 1000;
  });
}
