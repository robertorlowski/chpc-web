// Widok główny kotła pelletowego (/): ostatni odczyt ze sterownika (GET /pellet-boiler-pelux200/last),
// odświeżany co 30 s, ze znacznikiem nieaktualnych danych (starszych niż 3 interwały odpytywania).
// Na górze stan kotła z płomieniem (gdy się pali), tryb zima/lato i tryb pracy pompa ciepła/pellet
// (z ostatniego odczytu ustawień), pompy CO i CWU; niżej kafelki: kocioł, CWU, mieszacze 1 i 2
// (aktualna i zadana; kocioł i CWU jako „od–do”: zadana − histereza z ustawień nr 17 i 123) oraz
// pozostałe odczyty.
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { PelletBoilerRequests } from '../api';
import { FlameIcon, PumpIcon } from '../components/icons';
import { PelletBoilerReading, PelletBoilerSettings } from '../types';
import {
  DEFAULT_POLL_SECONDS, findParameter, formatDateTime, formatNumber, formatPercent, formatTemp, isBurning, isStale,
  stateName, summerModeName, valveText, workModeName,
} from '../utils/boiler';
import './style.css';

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

// hysteresis: zadana „od–do” (od = zadana − histereza: tu kocioł rozpala / zaczyna się ładowanie CWU)
const Tile: React.FC<{
  title: string; current?: number; target?: number; hysteresis?: number; children?: React.ReactNode;
}> = ({ title, current, target, hysteresis, children }) => (
  <div className="boiler-tile">
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

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((properties) => {
      if (properties?.poll_interval_seconds) setPollSeconds(properties.poll_interval_seconds);
    });
    PelletBoilerRequests.getSettings().then(setSettings);
    const load = () => PelletBoilerRequests.getLast().then((result) => result && setReading(result));
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const empty = reading !== null && !reading.createdAt;
  const stale = !!reading?.createdAt && isStale(reading.createdAt, pollSeconds);
  const burning = isBurning(reading?.state);
  const hasMixers = reading?.mixer1_temp !== undefined || reading?.mixer2_temp !== undefined;

  return (
    <div className="settings boiler-page">
      <h2 className="boiler-title">
        Kocioł
        {reading?.state !== undefined && (
          <>: <span className={reading.alarm || reading.state === 8 ? 'boiler-alarm' : ''}>{stateName(reading.state)}</span></>
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
            <div className="resource boiler-status">
              <span className="boiler-chip"><span className="boiler-chip-label">Tryb</span>{summerModeName(settings)}</span>
              <span className="boiler-chip"><span className="boiler-chip-label">Praca</span>{workModeName(settings)}</span>
              <Pump label="Pompa CO" on={reading.heating_pump} />
              <Pump label="Pompa CWU" on={reading.water_heater_pump} />
            </div>

            <div className="resource">
              <div className="boiler-tiles">
                <Tile title="Kocioł" current={reading.heating_temp} target={reading.heating_target}
                  hysteresis={findParameter(settings, 17)?.value} />
                <Tile title="CWU" current={reading.water_heater_temp} target={reading.water_heater_target}
                  hysteresis={findParameter(settings, 123)?.value} />
                {hasMixers && (
                  <>
                    <Tile title="Mieszacz 1 (grzejniki)" current={reading.mixer1_temp} target={reading.mixer1_target}>
                      <div className="boiler-tile-extra">
                        <Pump label="pompa" on={reading.mixer1_pump} />
                        <span>zawór {valveText(reading.mixer1_opening, reading.mixer1_closing)}</span>
                      </div>
                    </Tile>
                    <Tile title="Mieszacz 2" current={reading.mixer2_temp} target={reading.mixer2_target}>
                      <div className="boiler-tile-extra">
                        <Pump label="pompa" on={reading.mixer2_pump} />
                        <span>zawór {valveText(reading.mixer2_opening, reading.mixer2_closing)}</span>
                      </div>
                    </Tile>
                  </>
                )}
              </div>
              {!hasMixers && <div className="boiler-hint">Mieszacze pojawią się po wgraniu firmware 1.2.0 na sterownik.</div>}
            </div>

            <div className="resource">
              <h3 className="settings-section-title">Pozostałe</h3>
              <Row label="Zewnętrzna">{formatTemp(reading.outside_temp)}</Row>
              <Row label="Poziom paliwa">{formatPercent(reading.fuel_level)}</Row>
              <Row label="Wentylator">{formatPercent(reading.fan_power)}</Row>
              <Row label="Moc">{reading.boiler_power === undefined ? '---' : `${formatNumber(reading.boiler_power)} kW`}</Row>
              <Row label="Cyrkulacja">{reading.circulation_pump === undefined ? '---' : reading.circulation_pump ? 'pracuje' : 'stoi'}</Row>
              <Row label="Alarm">
                <span className={reading.alarm ? 'boiler-alarm' : ''}>
                  {reading.alarm === undefined ? '---' : reading.alarm ? 'tak' : 'nie'}
                </span>
              </Row>
              <Row label="Ostatni odczyt">{formatDateTime(reading.createdAt)}</Row>
              {stale && <div className="boiler-stale">Dane nieaktualne</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
