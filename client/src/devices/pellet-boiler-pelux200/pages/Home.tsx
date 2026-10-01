// Widok główny kotła pelletowego (/): ostatni odczyt ze sterownika (GET /pellet-boiler-pelux200/last),
// odświeżany co 30 s, ze znacznikiem nieaktualnych danych (starszych niż 3 interwały odpytywania).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';
import {
  DEFAULT_POLL_SECONDS, formatDateTime, formatNumber, formatPercent, formatTemp, isStale, onOff, stateName,
} from '../utils/boiler';
import './style.css';

const REFRESH_MS = 30_000;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><span className="label">{label}:</span><span>{children}</span></div>
);

// Podgląd kotła: stan, temperatury, zadane, paliwo i moc oraz stany wyjść.
export const PelletBoilerHome: React.FC = () => {
  const [reading, setReading] = useState<PelletBoilerReading | null>(null);
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_POLL_SECONDS);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((properties) => {
      if (properties?.poll_interval_seconds) setPollSeconds(properties.poll_interval_seconds);
    });
    const load = () => PelletBoilerRequests.getLast().then((result) => result && setReading(result));
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const empty = reading !== null && !reading.createdAt;
  const stale = !!reading?.createdAt && isStale(reading.createdAt, pollSeconds);

  return (
    <div className="settings boiler-page">
      <h2>
        Kocioł
        {reading?.state !== undefined && (
          <>: <span className={reading.alarm || reading.state === 8 ? 'boiler-alarm' : ''}>{stateName(reading.state)}</span></>
        )}
      </h2>
      <section>
        {reading === null && <div className="resource">Wczytywanie…</div>}
        {empty && <div className="resource">Brak danych od sterownika</div>}
        {reading && !empty && (
          <>
            <div className="resource">
              <h3 className="settings-section-title">Temperatury</h3>
              <Row label="Kocioł (CO)">{formatTemp(reading.heating_temp)}</Row>
              <Row label="CWU">{formatTemp(reading.water_heater_temp)}</Row>
              <Row label="Zewnętrzna">{formatTemp(reading.outside_temp)}</Row>
              <Row label="Powrót">{formatTemp(reading.return_temp)}</Row>
              <Row label="Spaliny">{formatTemp(reading.exhaust_temp)}</Row>
              <Row label="Podajnik">{formatTemp(reading.feeder_temp)}</Row>
              <Row label="Czujnik optyczny">{formatTemp(reading.optical_temp)}</Row>
              <Row label="Bufor góra">{formatTemp(reading.upper_buffer_temp)}</Row>
              <Row label="Bufor dół">{formatTemp(reading.lower_buffer_temp)}</Row>
            </div>

            <div className="resource">
              <h3 className="settings-section-title">Wartości zadane</h3>
              <Row label="Kocioł zadana">{formatTemp(reading.heating_target)}</Row>
              <Row label="CWU zadana">{formatTemp(reading.water_heater_target)}</Row>
              <Row label="Status CO">{formatNumber(reading.heating_status, 0)}</Row>
              <Row label="Status CWU">{formatNumber(reading.water_heater_status, 0)}</Row>
            </div>

            <div className="resource">
              <h3 className="settings-section-title">Praca kotła</h3>
              <Row label="Poziom paliwa">{formatPercent(reading.fuel_level)}</Row>
              <Row label="Wentylator">{formatPercent(reading.fan_power)}</Row>
              <Row label="Obciążenie">{formatPercent(reading.boiler_load)}</Row>
              <Row label="Moc">{reading.boiler_power === undefined ? '---' : `${formatNumber(reading.boiler_power)} kW`}</Row>
              <Row label="Zużycie paliwa">{reading.fuel_consumption === undefined ? '---' : `${formatNumber(reading.fuel_consumption, 2)} kg/h`}</Row>
              <Row label="Lambda">{formatPercent(reading.lambda_level)}</Row>
            </div>

            <div className="resource">
              <h3 className="settings-section-title">Wyjścia</h3>
              {([
                ['Wentylator', reading.fan],
                ['Podajnik', reading.feeder],
                ['Pompa CO', reading.heating_pump],
                ['Pompa CWU', reading.water_heater_pump],
                ['Cyrkulacja', reading.circulation_pump],
                ['Zapalarka', reading.lighter],
              ] as [string, boolean | undefined][]).map(([label, value]) => (
                <Row key={label} label={label}><span className={value ? 'boiler-on' : ''}>{onOff(value)}</span></Row>
              ))}
              <Row label="Alarm">
                <span className={reading.alarm ? 'boiler-alarm' : ''}>
                  {reading.alarm === undefined ? '---' : reading.alarm ? 'tak' : 'nie'}
                </span>
              </Row>
            </div>

            <div className="resource">
              <Row label="Ostatni odczyt">{formatDateTime(reading.createdAt)}</Row>
              {stale && <div className="boiler-stale">Dane nieaktualne</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
