// Wersja językowa serwera (2026-10-21): teksty, które serwer buduje dla aplikacji (kafelki listy sterowników
// GET /devices/summary), w języku żądania. Język: nagłówek Accept-Language od klienta (core/http.ts wysyła 'pl' albo
// 'en'), inaczej język konta (users.language), inaczej polski. Słownik tutaj (klucz → tekst), ten sam zapis co
// w kliencie (client/src/core/i18n): podstawianie {nazwa}, liczebniki przez Intl.PluralRules (pl: one / few / many,
// en: one / other). Chipy kafelków ('Online', 'Offline', 'Brak danych', 'Brak uruchomień') zostają po polsku jako
// identyfikatory — porównuje je klient i wartownik powiadomień; klient tłumaczy je przy rysowaniu.
import type { Request } from 'express';

export type Lang = 'pl' | 'en';
export const DEFAULT_LANG: Lang = 'pl';

export const isLang = (value: unknown): value is Lang => value === 'pl' || value === 'en';

// Język żądania: Accept-Language ('en', 'en-GB,en;q=0.9' → en; 'pl' → pl), bez nagłówka język konta, inaczej polski.
export function requestLang(req: Pick<Request, 'headers' | 'user'>): Lang {
  const header = String(req.headers['accept-language'] ?? '').trim().toLowerCase();
  if (header.startsWith('en')) return 'en';
  if (header.startsWith('pl')) return 'pl';
  const account = (req.user as { language?: string } | undefined)?.language;
  return isLang(account) ? account : DEFAULT_LANG;
}

export const locale = (lang: Lang): string => (lang === 'pl' ? 'pl-PL' : 'en-GB');

type Params = Record<string, string | number>;
const fill = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

const pl: Record<string, string> = {
  'when.today': 'dziś {time}',
  'when.yesterday': 'wczoraj {time}',
  'when.tomorrow': 'jutro {time}',
  'age.days': '{n} dni',
  // pompa ciepła
  'hp.mode.auto': 'automatyczny',
  'hp.mode.autoPv': 'automatyczny z PV',
  'hp.mode.manual': 'ręczny',
  'hp.locked': 'Blokada po {n} błędach.',
  'hp.lockedLast': ' Ostatni: {code} {text}',
  'hp.error': 'Błąd {code}: {text}',
  'hp.errorPast': 'Błąd z ostatnich 24 h: {code} {text} ({when}), już ustąpił',
  'hp.minMax': 'min–max',
  'hp.fromTo': 'od–do',
  'hp.power': 'moc',
  'hp.tCompressor': 'T. sprężarki',
  'hp.tOut': 'T. wody wyj.',
  'hp.tank': 'zbiornik',
  // kocioł
  'boiler.alarm': 'Regulator zgłasza alarm kotła',
  'boiler.alarmCode': ' (kod {code})',
  'boiler.lowFuel': 'Mało pelletu ({value})',
  'boiler.commandFailed': 'Zmiana „{label}” nie powiodła się ({when})',
  'boiler.parameter': 'parametru',
  'boiler.mixer': 'Mieszacz {n}',
  'boiler.co': 'CO',
  'boiler.cwu': 'CWU',
  'boiler.boiler': 'kocioł',
  // fotowoltaika
  'pv.noDtu': 'Brak odczytów z DTU (sprawdź sterownik co)',
  'pv.panelAlarm': 'Alarm panelu {key} (kod {code})',
  'pv.panelsAlarm': 'Alarm na {n} panelach',
  'pv.panelOffline': 'Panel {key} nie odpowiada',
  'pv.panelsOffline': '{n} panele nie odpowiadają',
  'pv.today': 'dziś',
  'pv.panels': 'paneli',
  'pv.now': 'teraz',
  'pv.inverters': 'falowniki',
  // włącznik
  'switch.relay': 'Przekaźnik {n}',
  'switch.offManual': 'wyłączony ręcznie',
  'switch.onUnlimited': 'wł. ręcznie bez limitu',
  'switch.switchingOn': 'włączanie…',
  'switch.onUntil': 'wł. ręcznie do {time}',
  'switch.pausedUntil': 'wył. do {time} · potem harmonogram',
  'switch.scheduleOnUntil': 'wł. do {time} · harmonogram',
  'switch.scheduleNext': 'wył. · następne {when}',
  'switch.scheduleOff': 'wył. · harmonogram',
  'switch.unknown': 'stan nieznany',
  'switch.notReported': 'Sterownik jeszcze się nie zgłosił',
  'switch.blocked': '{name}: tryb „Wyłączony” blokuje harmonogram',
  'switch.unlimitedDay': '{name}: włączony bez limitu czasu od ponad doby',
  // hydrofor
  'tank.longRun': 'Pompa pracuje bez przerwy ponad 30 min (wyciek albo praca na sucho?)',
  'tank.noFlow': 'Brak przepływu: wpisz kolejny odczyt wodomierza, żeby liczyć litry',
  'tank.approximate': 'Uruchomienie z czasem przybliżonym (wysłane z kolejki po braku sieci)',
  'tank.today': 'dziś',
  'tank.month': 'miesiąc',
  'tank.pump': 'pompa',
  'tank.runs': 'uruchomień',
  'tank.on': 'wł.',
  'tank.compressor': 'kompresor',
};

const en: Record<keyof typeof pl, string> = {
  'when.today': 'today {time}',
  'when.yesterday': 'yesterday {time}',
  'when.tomorrow': 'tomorrow {time}',
  'age.days': '{n} days',
  'hp.mode.auto': 'automatic',
  'hp.mode.autoPv': 'automatic with PV',
  'hp.mode.manual': 'manual',
  'hp.locked': 'Locked after {n} errors.',
  'hp.lockedLast': ' Last: {code} {text}',
  'hp.error': 'Error {code}: {text}',
  'hp.errorPast': 'Error in the last 24 h: {code} {text} ({when}), already cleared',
  'hp.minMax': 'min–max',
  'hp.fromTo': 'from–to',
  'hp.power': 'power',
  'hp.tCompressor': 'Compressor T.',
  'hp.tOut': 'Outlet water T.',
  'hp.tank': 'tank',
  'boiler.alarm': 'The controller reports a boiler alarm',
  'boiler.alarmCode': ' (code {code})',
  'boiler.lowFuel': 'Low pellet level ({value})',
  'boiler.commandFailed': 'Change “{label}” failed ({when})',
  'boiler.parameter': 'of a parameter',
  'boiler.mixer': 'Mixer {n}',
  'boiler.co': 'CH',
  'boiler.cwu': 'DHW',
  'boiler.boiler': 'boiler',
  'pv.noDtu': 'No readings from the DTU (check the co controller)',
  'pv.panelAlarm': 'Panel {key} alarm (code {code})',
  'pv.panelsAlarm': 'Alarm on {n} panels',
  'pv.panelOffline': 'Panel {key} does not respond',
  'pv.panelsOffline': '{n} panels do not respond',
  'pv.today': 'today',
  'pv.panels': 'panels',
  'pv.now': 'now',
  'pv.inverters': 'inverters',
  'switch.relay': 'Relay {n}',
  'switch.offManual': 'switched off manually',
  'switch.onUnlimited': 'on manually, no limit',
  'switch.switchingOn': 'switching on…',
  'switch.onUntil': 'on manually until {time}',
  'switch.pausedUntil': 'off until {time} · then schedule',
  'switch.scheduleOnUntil': 'on until {time} · schedule',
  'switch.scheduleNext': 'off · next {when}',
  'switch.scheduleOff': 'off · schedule',
  'switch.unknown': 'state unknown',
  'switch.notReported': 'The controller has not reported yet',
  'switch.blocked': '{name}: “Off” mode blocks the schedule',
  'switch.unlimitedDay': '{name}: on without a time limit for over a day',
  'tank.longRun': 'The pump has been running for over 30 min (leak or dry run?)',
  'tank.noFlow': 'No flow rate: enter another water meter reading to count litres',
  'tank.approximate': 'A run with an approximate time (sent from the queue after a network outage)',
  'tank.today': 'today',
  'tank.month': 'month',
  'tank.pump': 'pump',
  'tank.runs': 'runs',
  'tank.on': 'on',
  'tank.compressor': 'compressor',
};

const DICTS: Record<Lang, Record<string, string>> = { pl, en };

export function t(lang: Lang, key: string, params?: Params): string {
  return fill(DICTS[lang][key] ?? pl[key] ?? key, params);
}
