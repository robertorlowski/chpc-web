// Widok główny kotła pelletowego (/): ostatni odczyt ze sterownika (GET /pellet-boiler-pelux200/last),
// odświeżany co 30 s, ze znacznikiem nieaktualnych danych (starszych niż 3 interwały odpytywania).
// Na górze stan kotła z płomieniem (gdy się pali), tryb zima/lato i tryb pracy pompa ciepła/pellet
// (z ostatniego odczytu ustawień), pompy CO i CWU; niżej kafelki: kocioł, CWU, mieszacze 1 i 2
// (aktualna i zadana; kocioł i CWU jako „od–do”: zadana − histereza z ustawień nr 17 i 123) oraz
// pozostałe odczyty. Przy ładowaniu CWU w trybie pompy ciepła pasek „Ładowanie CWU od …” (i „pompa ciepła
// wyłączona”, gdy pompa jest w trybie OFF), GET /pellet-boiler-pelux200/cwu-loading razem z odczytem.
// Czerwony komunikat o automatycznym przejściu na Pellet (kocioł rozpalił się w trybie pompy ciepła),
// GET …/auto-pellet, do kliknięcia „OK” (POST …/auto-pellet/ack).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { PelletBoilerRequests } from '../api';
import { FlameIcon, PumpIcon, ValveIcon } from '../components/icons';
import { AlertsBanner } from '../components/Alerts';
import { PelletBoilerAutoPellet, PelletBoilerCwuLoading, PelletBoilerReading, PelletBoilerSettings } from '../types';
import {
  DEFAULT_POLL_SECONDS, todayWarsaw, findParameter, formatDateTime, formatNumber, formatPercent, formatTemp, isBurning, isStale,
  heatPumpWorking, readingStateName, summerModeName, valveText, workModeName,
} from '../utils/boiler';
import './style.css';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';
import { OfflineBanner } from '../../../core/components/OfflineBanner';

const REFRESH_MS = 30_000;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><span className="label">{label}:</span><span>{children}</span></div>
);

// Pompa: niebieska ikona w pracy, szara w spoczynku, „---” bez odczytu.
const Pump: React.FC<{ label: string; on?: boolean }> = ({ label, on }) => (
  <span className={`boiler-pump${on ? ' boiler-pump-on' : ''}`}
    title={`${label}: ${on === undefined ? 'brak odczytu' : on ? 'pracuje' : 'stoi'}`}>
    <PumpIcon className="boiler-pump-icon" />
    {label}
  </span>
);

// Zawór mieszacza jak pompa: ikona (strzałka = kierunek ruchu) i słowo „zawór”, pełny stan w podpowiedzi;
// w ruchu niebieski jak pracująca pompa, w spoczynku szary.
const Valve: React.FC<{ opening?: boolean; closing?: boolean }> = ({ opening, closing }) => {
  const movement = opening ? 'opening' : closing ? 'closing' : undefined;
  return (
    <span className={`boiler-pump${movement ? ' boiler-pump-on' : ''}`} title={`zawór: ${valveText(opening, closing)}`}>
      <ValveIcon className="boiler-pump-icon" movement={movement} />
      zawór
    </span>
  );
};

// hysteresis: zadana „od–do” (od = zadana − histereza: tu kocioł rozpala / zaczyna się ładowanie CWU);
// wide: kafelek na pół rzędu (mieszacze: dwa wypełniają rząd pod kotłem, CWU i pelletem)
const Tile: React.FC<{
  title: string; current?: number; target?: number; hysteresis?: number; wide?: boolean; children?: React.ReactNode;
}> = ({ title, current, target, hysteresis, wide, children }) => (
  <div className={wide ? 'boiler-tile boiler-tile-wide' : 'boiler-tile'}>
    <div className="boiler-tile-title">{title}</div>
    <div className="boiler-tile-current">{formatTemp(current)}</div>
    <div className="boiler-tile-target">
      zadana {target !== undefined && hysteresis !== undefined
        ? `${formatNumber(target - hysteresis, 0)}–${formatTemp(target)}`
        : formatTemp(target)}
    </div>
    {children}
  </div>
);

export const PelletBoilerHome: React.FC = () => {
  const [reading, setReading] = useState<PelletBoilerReading | null>(null);
  const [settings, setSettings] = useState<PelletBoilerSettings | null>(null);
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_POLL_SECONDS);
  const [cwuLoading, setCwuLoading] = useState<PelletBoilerCwuLoading | null>(null);
  const [autoPellet, setAutoPellet] = useState<PelletBoilerAutoPellet | null>(null);
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
  const cleanSchedule = settings?.schedules?.find((schedule) => schedule.index === 4);
  // bez powiązanej pompy ciepła kocioł pracuje tylko na pellecie: bez „Praca: Pompa ciepła / Pellet”
  const heatPumpLinked = useHeatPumpLinked();
  // „Wybór termostatu” (nr 111): 0 = termostat nie wpływa na kocioł (u nas wyłączony, 2026-10-07)
  const thermostatMode = settings?.groups?.flatMap((group) => group.parameters).find((p) => p.index === 111);
  const burning = isBurning(reading?.state);
  const hasMixers = reading?.mixer1_temp !== undefined || reading?.mixer2_temp !== undefined;

  return (
    <div className="settings boiler-page">
      <h2 className="boiler-title">
        Kocioł
        {reading?.state !== undefined && (
          <>: <span className={reading.alarm || reading.state === 8 ? 'boiler-alarm' : heatPumpWorking(reading) ? 'boiler-heat-pump-work' : ''}>{readingStateName(reading)}</span></>
        )}
        {reading?.state !== undefined && (
          <FlameIcon className={`boiler-flame${burning ? ' boiler-flame-on' : ''}`} filled={burning} />
        )}
      </h2>
      <section>
        {reading === null && <div className="resource">Wczytywanie…</div>}
        {empty && <div className="resource">Brak danych od sterownika</div>}
        {reading && !empty && (
          <>
            <AlertsBanner />
            {autoPellet && (
              <div className="resource boiler-auto-pellet" role="alert">
                <span>
                  Kocioł rozpalił się w trybie pompy ciepła o{' '}
                  {new Date(autoPellet.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })}
                  {' '}— przełączono na tryb Pellet.
                  {autoPellet.error && <> Błąd zlecenia nastaw: {autoPellet.error}</>}
                </span>
                <button type="button" onClick={acknowledge}>OK</button>
              </div>
            )}
            {cwuLoading?.active && (
              <div className="resource cwu-loading">
                <strong>Ładowanie CWU</strong>
                {cwuLoading.since && <span> od {new Date(cwuLoading.since).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })}</span>}
                {cwuLoading.heatPumpOff && <span className="cwu-loading-off"> — pompa ciepła wyłączona</span>}
              </div>
            )}
            <div className="resource boiler-status">
              {/* brak odczytu: czerwony pasek „Offline od …” w górnym panelu (nad trybem i pompami) */}
              {stale && <OfflineBanner since={reading?.createdAt} />}
              <span className="boiler-chip"><span className="boiler-chip-label">Tryb</span>{summerModeName(settings)}</span>
              {heatPumpLinked && <span className="boiler-chip"><span className="boiler-chip-label">Praca</span>{workModeName(settings)}</span>}
              <Pump label="Pompa CO" on={reading.heating_pump} />
              <Pump label="Pompa CWU" on={reading.water_heater_pump} />
            </div>

            <div className="resource">
              <div className="boiler-tiles">
                {/* bez licznika pelletu (firmware przed 1.7.1) kocioł i CWU dzielą rząd na pół */}
                <Tile title="Kocioł" wide={fuel.today === null} current={reading.heating_temp} target={reading.heating_target}
                  hysteresis={findParameter(settings, 17)?.value} />
                <Tile title="CWU" wide={fuel.today === null} current={reading.water_heater_temp} target={reading.water_heater_target}
                  hysteresis={findParameter(settings, 123)?.value} />
                {/* spalony pellet jak kafelek CWU: dziś duża liczba, pod nią miesiąc (licznik ze sterownika od 1.7.1) */}
                {fuel.today !== null && (
                  <div className="boiler-tile boiler-fuel-tile">
                    <div className="boiler-tile-title">Spalony pellet dziś</div>
                    <div className="boiler-fuel-values">
                      <span className="boiler-tile-current">{formatNumber(fuel.today)} kg</span>
                      <span className="boiler-tile-target">w miesiącu {formatNumber(fuel.month ?? 0)} kg</span>
                    </div>
                  </div>
                )}
                {hasMixers && (
                  <>
                    <Tile title="Mieszacz 1 (grzejniki)" wide current={reading.mixer1_temp} target={reading.mixer1_target}>
                      <div className="boiler-tile-extra">
                        <Pump label="pompa" on={reading.mixer1_pump} />
                        <Valve opening={reading.mixer1_opening} closing={reading.mixer1_closing} />
                      </div>
                    </Tile>
                    <Tile title="Mieszacz 2" wide current={reading.mixer2_temp} target={reading.mixer2_target}>
                      <div className="boiler-tile-extra">
                        <Pump label="pompa" on={reading.mixer2_pump} />
                        <Valve opening={reading.mixer2_opening} closing={reading.mixer2_closing} />
                      </div>
                    </Tile>
                  </>
                )}
              </div>
              {!hasMixers && <div className="boiler-hint">Mieszacze pojawią się po wgraniu firmware 1.2.0 na sterownik.</div>}
            </div>

            <div className="resource boiler-other">
              <h3 className="settings-section-title">Pozostałe</h3>
              <Row label="Zewnętrzna">{formatTemp(reading.outside_temp)}</Row>
              {/* termostat pokojowy eSTER (firmware pieca od 1.8.0): pokój i zadana; czy steruje kotłem — nr 111 */}
              <Row label="Temperatura pokojowa">
                {formatTemp(reading.room_temp)}
                {reading.room_target_temp !== undefined && <span className="boiler-hint"> (zadana {formatTemp(reading.room_target_temp)})</span>}
              </Row>
              <Row label="Termostat">{thermostatMode === undefined ? '---' : thermostatMode.raw[0] === 0 ? 'sterowanie wyłączone' : 'sterowanie włączone'}</Row>
              <Row label="Poziom paliwa">{formatPercent(reading.fuel_level)}</Row>
              <Row label="Wentylator">{formatPercent(reading.fan_power)}</Row>
              <Row label="Moc">{reading.boiler_power === undefined ? '---' : `${formatNumber(reading.boiler_power)} kW`}</Row>
              <Row label="Cyrkulacja">{reading.circulation_pump === undefined ? '---' : reading.circulation_pump ? 'pracuje' : 'stoi'}</Row>
              {/* przełącznik harmonogramu czyszczenia (nr 4) z ostatniego odczytu ustawień; zmiana w Ustawieniach */}
              <Row label="Czyszczenie">{cleanSchedule === undefined ? '---' : cleanSchedule.enabled ? 'tak' : 'nie'}</Row>
              <Row label="Alarm">
                <span className={reading.alarm ? 'boiler-alarm' : ''}>
                  {reading.alarm === undefined ? '---' : reading.alarm ? 'tak' : 'nie'}
                </span>
              </Row>
              <Row label="Ostatni odczyt">{formatDateTime(reading.createdAt)}</Row>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
