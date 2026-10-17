// Widok główny kotła pelletowego (/), układ „Instrument” z makiety (#s-boiler-podglad): ostatni odczyt ze sterownika
// (GET /pellet-boiler-pelux200/last), odświeżany co 30 s, ze znacznikiem nieaktualnych danych (starszych niż
// 3 interwały odpytywania; czerwony pasek „Offline od …”). Karta hero: temperatura kotła, zadana „od–do” (zadana −
// histereza nr 17), stan z płomieniem przy paleniu, chipy sezonu (nr 125) i trybu pracy pompa ciepła/pellet
// (z ostatniego odczytu ustawień), KPI moc / obciążenie / paliwo / spaliny. Niżej trzy karty obiegów: CWU (zadana,
// ładowanie od zadana − histereza nr 123, chip pompy), mieszacz 1 i 2 (zadana, ruch zaworu). Karta „Urządzenia
// kotła”: przełączniki tylko do odczytu (wentylator z mocą, podajnik, pompy, zapalarka) i alarm regulatora.
// „Pozostałe”: temperatura zewnętrzna i pokojowa (eSTER), termostat, czyszczenie, spalony pellet dziś / w miesiącu.
// Przy ładowaniu CWU w trybie pompy ciepła pasek „Ładowanie CWU od …” (GET …/cwu-loading); komunikat
// o automatycznym przejściu na Pellet (GET …/auto-pellet) do kliknięcia „OK”; na karcie CWU ostrzeżenie, gdy w trybie
// pompy ciepła zadana CWU jest wyższa niż temperatura włączonej pompy ciepła (GET …/schedules/current, cwuTooHigh).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { OfflineBanner } from '../../../core/components/OfflineBanner';
import { PelletBoilerRequests } from '../api';
import { AlertsBanner } from '../components/Alerts';
import { Alert, Icon, hourMinute } from '../components/ui';
import { PelletBoilerAutoPellet, PelletBoilerCurrentSchedule, PelletBoilerCwuLoading, PelletBoilerReading, PelletBoilerSettings } from '../types';
import {
  DEFAULT_POLL_SECONDS, findParameter, formatDateTime, formatNumber, formatTemp, heatPumpDataMissing, heatPumpWorking, isBurning,
  isStale, readingStateName, summerModeName, todayWarsaw, valveText, workModeName,
} from '../utils/boiler';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';
import './style.css';

const REFRESH_MS = 30_000;

// „67” i „°C” osobno (duża liczba w kroju liczbowym), „---” bez odczytu
const Big: React.FC<{ value?: number; unit?: string; className?: string }> = ({ value, unit = '°C', className = 'big' }) => (
  <>
    <span className={className}>{value === undefined || value === null ? '---' : formatNumber(value)}</span>
    <span className="unit">{unit}</span>
  </>
);

// Chip pompy obiegu: zielony „pompa” w pracy, szary „pompa stoi”, bez odczytu „---”.
const PumpChip: React.FC<{ on?: boolean }> = ({ on }) => (
  on === undefined
    ? <span className="chip chip-off">---</span>
    : on ? <span className="chip chip-ok"><i className="dot" />pompa</span> : <span className="chip chip-off">pompa stoi</span>
);

// Ruch zaworu mieszacza: „zawór otwiera ↑”, „zawór zamyka ↓”, „zawór w spoczynku”.
const Valve: React.FC<{ opening?: boolean; closing?: boolean }> = ({ opening, closing }) => {
  const text = valveText(opening, closing);
  if (text === '---') return <>zawór ---</>;
  if (text === 'stoi') return <>zawór w spoczynku</>;
  return <span className="nowrap">zawór {text} <Icon name={opening ? 'up' : 'down'} className="inline-icon" /></span>;
};

// Karta obiegu (CWU, mieszacz): nagłówek z chipem pompy, duża temperatura, pod nią zadana i reszta opisu.
const Circuit: React.FC<{ title: string; pump?: boolean; current?: number; children: React.ReactNode }> = ({ title, pump, current, children }) => (
  <section className="card card-circuit">
    <header className="card-head"><h2>{title}</h2><PumpChip on={pump} /></header>
    <div className="circuit-val"><Big value={current} /></div>
    <span className="circuit-sub">{children}</span>
  </section>
);

// Przełącznik tylko do odczytu w „Urządzeniach kotła”.
const Toggle: React.FC<{ name: string; on?: boolean; detail?: string }> = ({ name, on, detail }) => (
  <li>
    <span className="t-name">{name}{detail && <> <small>{detail}</small></>}</span>
    <span className={`switch is-disabled${on ? ' is-on' : ''}`} role="switch" aria-checked={!!on} aria-disabled="true" aria-label={name}
      title={on === undefined ? 'brak odczytu' : on ? 'pracuje' : 'stoi'} />
  </li>
);

export const PelletBoilerHome: React.FC = () => {
  const [reading, setReading] = useState<PelletBoilerReading | null>(null);
  const [settings, setSettings] = useState<PelletBoilerSettings | null>(null);
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_POLL_SECONDS);
  const [cwuLoading, setCwuLoading] = useState<PelletBoilerCwuLoading | null>(null);
  const [autoPellet, setAutoPellet] = useState<PelletBoilerAutoPellet | null>(null);
  // stan harmonogramu: ostrzeżenie o zadanej CWU za wysokiej dla pompy ciepła (cwuTooHigh)
  const [schedule, setSchedule] = useState<PelletBoilerCurrentSchedule | null>(null);
  // spalony pellet dziś i w tym miesiącu (licznik ze sterownika, firmware pieca od 1.7.1)
  const [fuel, setFuel] = useState<{ today: number | null; month: number | null }>({ today: null, month: null });
  const acknowledge = async () => {
    await PelletBoilerRequests.acknowledgeAutoPellet();
    setAutoPellet(await PelletBoilerRequests.getAutoPellet());
  };

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((properties) => {
      if (properties?.poll_interval_seconds) setPollSeconds(properties.poll_interval_seconds);
    });
    PelletBoilerRequests.getSettings().then(setSettings);
    const load = () => {
      PelletBoilerRequests.getLast().then((result) => result && setReading(result));
      PelletBoilerRequests.getCwuLoading().then(setCwuLoading);
      PelletBoilerRequests.getAutoPellet().then(setAutoPellet);
      PelletBoilerRequests.getCurrentSchedule().then(setSchedule);
      const today = todayWarsaw();
      Promise.all([PelletBoilerRequests.getFuel('day', today), PelletBoilerRequests.getFuel('month', today)])
        .then(([day, month]) => setFuel({
          today: day?.counterKg !== null && day?.counterKg !== undefined ? day.totalKg : null,
          month: month?.counterKg !== null && month?.counterKg !== undefined ? month.totalKg : null,
        }));
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const empty = reading !== null && !reading.createdAt;
  const stale = !!reading?.createdAt && isStale(reading.createdAt, pollSeconds);
  const cleanSchedule = settings?.schedules?.find((entry) => entry.index === 4);
  // bez powiązanej pompy ciepła kocioł pracuje tylko na pellecie: bez chipu „Tryb: pompa ciepła / pellet”
  const heatPumpLinked = useHeatPumpLinked();
  // „Wybór termostatu” (nr 111): 0 = termostat nie wpływa na kocioł (u nas wyłączony, 2026-10-07)
  const thermostatMode = findParameter(settings, 111);
  const burning = isBurning(reading?.state);
  const workMode = workModeName(settings, schedule?.pelletCwu);
  // tryb Pompa ciepła bez świeżych danych pompy: nie wiadomo, czy sprężarka pracuje (dopisek przy stanie)
  const pumpDataMissing = !stale && heatPumpDataMissing(reading, !!heatPumpLinked && workMode === 'Pompa ciepła');
  const hasMixers = reading?.mixer1_temp !== undefined || reading?.mixer2_temp !== undefined;
  const alarm = !!reading?.alarm || reading?.state === 8;
  const running = burning || heatPumpWorking(reading);
  const hysteresis = findParameter(settings, 17)?.value;
  const cwuHysteresis = findParameter(settings, 123)?.value;
  const cwuOff = findParameter(settings, 122)?.value === 0;
  const season = summerModeName(settings);
  const pollText = pollSeconds % 60 === 0 ? `co ${pollSeconds / 60} min` : `co ${pollSeconds} s`;
  // „zadana 67 · histereza 10” albo samo „zadana 67”
  const targetNote = (target?: number, hyst?: number) => (
    target === undefined ? 'zadana ---' : hyst === undefined ? `zadana ${formatNumber(target)}` : `zadana ${formatNumber(target)} · histereza ${formatNumber(hyst)}`
  );

  return (
    <div className="page page-device boiler-page">
      {reading === null && <section className="card"><span className="help">Wczytywanie…</span></section>}
      {empty && <section className="card"><span className="help">Brak danych od sterownika</span></section>}
      {reading && !empty && (
        <>
          {/* brak odczytu: czerwony pasek „Offline od …” nad kartami */}
          {stale && <OfflineBanner since={reading.createdAt} />}
          <AlertsBanner />
          {autoPellet && (
            <Alert kind="warn" title={<>Kocioł rozpalił się w trybie pompy ciepła o {hourMinute(autoPellet.at)} — przełączono na tryb Pellet.</>}>
              {autoPellet.error && <>Błąd zlecenia nastaw: {autoPellet.error} </>}
              <button type="button" className="btn btn-sm boiler-alert-btn" onClick={acknowledge}>OK</button>
            </Alert>
          )}
          {cwuLoading?.active && (
            <div className="banner banner-run">
              <div>
                <strong>Ładowanie CWU{cwuLoading.since && ` od ${hourMinute(cwuLoading.since)}`}</strong>
                {cwuLoading.heatPumpOff && <span className="danger-text">pompa ciepła wyłączona</span>}
              </div>
            </div>
          )}

          <section className="card card-hero">
            <div className="hero-main">
              <span className="hero-label">Kocioł</span>
              <div className="hero-value"><Big value={reading.heating_temp} className="hero-num" /></div>
              <span className="hero-note">
                {targetNote(reading.heating_target, hysteresis)}
                {reading.state !== undefined && (
                  <> · <strong className={alarm ? 'danger-text' : ''}>{readingStateName(reading).toLowerCase()}</strong></>
                )}
                {pumpDataMissing && <> (brak danych z pompy ciepła)</>}
                {burning && <> · <span className="flame"><Icon name="fire" />płomień</span></>}
              </span>
            </div>
            <div className="hero-side">
              <div className="pill-row">
                {reading.state !== undefined && (
                  <span className={`state${alarm ? ' state-err' : running ? ' state-on is-running' : ''}`}>
                    <i className="dot" />{readingStateName(reading)}
                  </span>
                )}
                <span className="chip chip-off">{season}</span>
                {heatPumpLinked && <span className="chip chip-off">Tryb: {workMode}</span>}
              </div>
              <div className="hero-kpis">
                <div className="kpi"><span className="kpi-label">Moc</span><span className="kpi-value">{formatNumber(reading.boiler_power)}<small>kW</small></span></div>
                <div className="kpi"><span className="kpi-label">Obciążenie</span><span className="kpi-value">{formatNumber(reading.boiler_load, 0)}<small>%</small></span></div>
                <div className="kpi"><span className="kpi-label">Paliwo</span><span className="kpi-value">{formatNumber(reading.fuel_level, 0)}<small>%</small></span></div>
                <div className="kpi"><span className="kpi-label">Spaliny</span><span className="kpi-value">{formatNumber(reading.exhaust_temp, 0)}<small>°C</small></span></div>
              </div>
            </div>
          </section>

          <div className="grid-3">
            <Circuit title="CWU" pump={reading.water_heater_pump} current={reading.water_heater_temp}>
              {cwuOff ? (
                <span className="danger-text">CWU wyłączone w regulatorze</span>
              ) : (
                <>
                  zadana {formatNumber(reading.water_heater_target)}
                  {reading.water_heater_target !== undefined && cwuHysteresis !== undefined && (
                    <> · ładowanie od {formatNumber(reading.water_heater_target - cwuHysteresis)} °C</>
                  )}
                </>
              )}
              {schedule?.cwuTooHigh && <><br /><span className="danger-text">Za wysoka temp. CWU dla pompy ciepła</span></>}
            </Circuit>
            {hasMixers ? (
              <>
                <Circuit title="Mieszacz 1 · CO" pump={reading.mixer1_pump} current={reading.mixer1_temp}>
                  zadana {formatNumber(reading.mixer1_target)} · <Valve opening={reading.mixer1_opening} closing={reading.mixer1_closing} />
                </Circuit>
                <Circuit title="Mieszacz 2" pump={reading.mixer2_pump} current={reading.mixer2_temp}>
                  zadana {formatNumber(reading.mixer2_target)} · <Valve opening={reading.mixer2_opening} closing={reading.mixer2_closing} />
                </Circuit>
              </>
            ) : (
              <section className="card card-circuit">
                <header className="card-head"><h2>Mieszacze</h2></header>
                <span className="help">Mieszacze pojawią się po wgraniu firmware 1.2.0 na sterownik.</span>
              </section>
            )}
          </div>

          <section className="card">
            <header className="card-head"><h2>Urządzenia kotła</h2><span className="card-hint">odczyt {hourMinute(reading.createdAt)} · {pollText}</span></header>
            <ul className="toggle-list cols-2">
              <Toggle name="Wentylator" on={reading.fan} detail={reading.fan_power !== undefined ? `${formatNumber(reading.fan_power, 0)} %` : undefined} />
              <Toggle name="Podajnik" on={reading.feeder} />
              <Toggle name="Pompa CO" on={reading.heating_pump} />
              <Toggle name="Pompa CWU" on={reading.water_heater_pump} />
              <Toggle name="Pompa cyrkulacji" on={reading.circulation_pump} />
              <Toggle name="Zapalarka" on={reading.lighter} />
            </ul>
            {reading.alarm && <Alert kind="warn" title="Alarm regulatora">alarm regulatora ecoMAX · szczegóły w zakładce Alarmy</Alert>}
          </section>

          <section className="card">
            <header className="card-head"><h2>Pozostałe</h2></header>
            <dl className="measures">
              <div><dt>Zewnętrzna</dt><dd>{formatTemp(reading.outside_temp)}</dd></div>
              {/* termostat pokojowy eSTER (firmware pieca od 1.8.0): pokój i zadana; czy steruje kotłem — nr 111 */}
              <div><dt>Temperatura pokojowa</dt><dd>{formatTemp(reading.room_temp)}{reading.room_target_temp !== undefined && <small>zadana {formatTemp(reading.room_target_temp)}</small>}</dd></div>
              <div><dt>Termostat</dt><dd>{thermostatMode === undefined ? '---' : thermostatMode.raw[0] === 0 ? 'sterowanie wyłączone' : 'sterowanie włączone'}</dd></div>
              {/* przełącznik harmonogramu czyszczenia (nr 4) z ostatniego odczytu ustawień; zmiana w Ustawieniach */}
              <div><dt>Czyszczenie</dt><dd>{cleanSchedule === undefined ? '---' : cleanSchedule.enabled ? 'tak' : 'nie'}</dd></div>
              {/* spalony pellet (licznik ze sterownika od 1.7.1) */}
              {fuel.today !== null && (
                <div><dt>Spalony pellet dziś</dt><dd>{formatNumber(fuel.today)} kg<small>w miesiącu {formatNumber(fuel.month ?? 0)} kg</small></dd></div>
              )}
              <div><dt>Ostatni odczyt</dt><dd>{formatDateTime(reading.createdAt)}</dd></div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
};
