// Widok główny hydroforu (/): podgląd ustawień, szacunek wody na uruchomienie i dzisiejsze
// uruchomienia pompy (GET /water-pressure-tank/runs).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { WaterPressureTankRequests } from '../api';
import { DeviceProperties } from '../../../core/types';
import { WaterPressureTankRun } from '../types';
import {
  compressorSeconds, estimatedWaterPerRun, formatLiters, formatTime, pumpSeconds, sumWater,
  tankKindLabel, tankWaterLiters, todayWarsaw,
} from '../utils/water';
import './style.css';

// Uruchomienia odświeżane co 10 s (sterownik wysyła stan co 1 s, bieżące uruchomienie ma
// inProgress); ustawienia (GET /device/properties) tylko przy wejściu.
const REFRESH_MS = 10_000;

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

  return (
    <div className="settings water-page">
      <h2>Hydrofor</h2>
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
                      <td>{compressorSeconds(run) ?? (run.inProgress ? 'pracuje' : '---')}</td>
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
