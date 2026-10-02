// Widok główny hydroforu (/): przełączniki pracy pompy i kompresora, podgląd ustawień, szacunek
// wody na uruchomienie i dzisiejsze uruchomienia pompy (GET /water-pressure-tank/runs).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { WaterPressureTankRequests } from '../api';
import { DeviceProperties } from '../../../core/types';
import { WaterPressureTankRun } from '../types';
import {
  compressorSeconds, estimatedWaterPerRun, formatLiters, formatTime, pumpSeconds, sumWater,
  tankKindLabel, tankWaterLiters, todayWarsaw,
} from '../utils/water';
import swith_on from '../../../assets/swith_on.svg';
import swith_off from '../../../assets/swith_off.svg';
import './style.css';

// Uruchomienia odświeżane co 5 s (sterownik wysyła stan co 1 s, bieżące uruchomienie ma
// inProgress i compressorRunning; kompresor pracuje zwykle 30 s, więc wskaźnik musi nadążać);
// ustawienia (GET /device/properties) tylko przy wejściu.
const REFRESH_MS = 5_000;

// Wskaźnik pracy jak „CO pompa” na widoku pompy ciepła: sam przełącznik, bez napisu.
const Switch: React.FC<{ on: boolean; title: string }> = ({ on, title }) => (
  <img className="water-switch" title={title} alt={title} src={on ? swith_on : swith_off} />
);

// Główne okno hydroforu (tylko podgląd): ustawienia, zbiorniki i dzisiejsze uruchomienia.
// „Dziś” to dzień czasu warszawskiego; lista od najnowszego (serwer zwraca rosnąco).
export const WaterPressureTankHome: React.FC = () => {
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [runs, setRuns] = useState<WaterPressureTankRun[] | null>(null);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => setProperties(result ?? {}));
    const loadRuns = () => {
      const today = todayWarsaw();
      WaterPressureTankRequests.getRuns(today, today).then((result) => result && setRuns(result));
    };
    loadRuns();
    const timer = window.setInterval(loadRuns, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const tanks = properties?.tanks ?? [];
  const sortedRuns = [...(runs ?? [])].reverse();
  // stan teraz z najnowszego uruchomienia (sterownik ma zasilanie tylko w czasie pracy pompy)
  const current = sortedRuns.find((run) => run.inProgress);

  return (
    <div className="settings water-page">
      <h2>Hydrofor</h2>
      <div className="water-switches">
        <span>
          Pompa wody:
          <Switch on={!!current} title="Pompa wody (presostat) — sterownik ma zasilanie tylko w czasie jej pracy" />
        </span>
        <span>
          Kompresor powietrza:
          <Switch on={!!current?.compressorRunning} title="Kompresor uzupełniający poduszkę powietrzną w zbiorniku" />
        </span>
      </div>
      <section>
        <div className="resource">
          <h3 className="settings-section-title">Ustawienia</h3>
          <div>
            <span className="label">Czas pracy kompresora:</span>
            <strong>{properties?.compressor_seconds ?? '---'} s</strong>
          </div>
          <div>
            <span className="label">Presostat:</span>
            <span>
              {properties?.pressure_low ?? '---'} – {properties?.pressure_high ?? '---'} bar
            </span>
          </div>
          <div>
            <span className="label">Woda na uruchomienie:</span>
            <span>≈ {formatLiters(estimatedWaterPerRun(properties ?? undefined))} l</span>
          </div>
        </div>

        <div className="resource">
          <h3 className="settings-section-title">Zbiorniki</h3>
          {tanks.length === 0 && <div>Brak zbiorników (Ustawienia).</div>}
          <ul className="water-tanks">
            {tanks.map((tank, index) => (
              <li key={index} className={tank.enabled ? '' : 'water-tank-off'}>
                <strong>{tank.name?.trim() || `Zbiornik ${index + 1}`}</strong>
                <span>{tank.volumeLiters} l, {tankKindLabel(tank.kind)}</span>
                <span>
                  {tank.enabled
                    ? `≈ ${formatLiters(tankWaterLiters(tank, properties?.pressure_low, properties?.pressure_high))} l na uruchomienie`
                    : 'wyłączony'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="resource">
          <h3 className="settings-section-title">Dzisiejsze uruchomienia</h3>
          {runs === null && <div>Wczytywanie…</div>}
          {runs?.length === 0 && <div>Dziś pompa jeszcze nie pracowała.</div>}
          {sortedRuns.length > 0 && (
            <>
              <table className="water-table">
                <thead>
                  <tr>
                    <th>Godzina</th>
                    <th>Kompresor [s]</th>
                    <th>Pompa [s]</th>
                    <th>Woda [l]</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRuns.map((run) => (
                    <tr key={run._id} className={run.inProgress ? 'water-run-active' : ''}>
                      <td title={run.timeApproximate ? 'Czas przybliżony: uruchomienie bez sieci' : undefined}>
                        {run.timeApproximate ? '≈ ' : ''}{formatTime(run.pumpStart)}
                      </td>
                      <td>{run.compressorRunning ? 'pracuje' : compressorSeconds(run) ?? (run.inProgress ? 'pracuje' : '---')}</td>
                      <td>{pumpSeconds(run)}{run.inProgress ? ' …' : ''}</td>
                      <td>{formatLiters(run.waterLiters)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="water-total">
                Razem: <strong>{formatLiters(sumWater(runs ?? []))} l</strong> w {runs?.length} uruchomieniach
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
