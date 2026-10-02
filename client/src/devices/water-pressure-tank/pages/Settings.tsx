// Zakładka Ustawienia hydroforu (/settings): czas kompresora, progi presostatu i zbiorniki
// (PUT /device/properties), podgląd wody na uruchomienie, kalkulator k oraz dane sterownika.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import { WaterTank } from '../types';
import Notification from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { IconButton } from '../../../core/components/IconButton';
import { PlusIcon, TrashIcon } from '../../../core/components/icons';
import { useDevice } from '../../../core/context/DeviceContext';
import { cylinderLiters, estimatedWaterPerRun, formatLiters, tankWaterLiters } from '../utils/water';
import './style.css';

// przecinek dziesiętny z polskiej klawiatury; pusty napis daje 0
const toNumber = (value: string) => Number(value.replace(',', '.'));

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
const CalculatorIcon = () => icon(<><rect x="5" y="3" width="14" height="18" rx="2" />
  <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>);

// Zbiornik w formularzu: liczby jako napisy, żeby dało się wpisywać przecinek i czyścić pole.
// fromForm zapisuje tylko parametr właściwy dla rodzaju (precharge dla przepony, k dla poduszki).
type TankForm = Omit<WaterTank, 'volumeLiters' | 'precharge' | 'k'> & {
  volumeLiters: string;
  precharge: string;
  k: string;
};

const toForm = (tank: WaterTank): TankForm => ({
  ...tank,
  volumeLiters: String(tank.volumeLiters ?? ''),
  precharge: tank.precharge === undefined ? '' : String(tank.precharge),
  k: tank.k === undefined ? '1' : String(tank.k),
});

const fromForm = (tank: TankForm): WaterTank => ({
  name: tank.name?.trim(),
  kind: tank.kind,
  volumeLiters: toNumber(tank.volumeLiters),
  enabled: tank.enabled,
  ...(tank.kind === 'membrane' ? { precharge: toNumber(tank.precharge || '0') } : { k: toNumber(tank.k || '1') }),
});

// Ustawienia hydroforu: czas kompresora, progi presostatu i zbiorniki. Sterownik
// pobiera je przy swoim następnym starcie (zgłoszenie w chmurze).
export const WaterPressureTankSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [compressor, setCompressor] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [tanks, setTanks] = useState<TankForm[]>([]);
  const [calculator, setCalculator] = useState<number | null>(null);
  const [circumference, setCircumference] = useState('');
  const [levelDrop, setLevelDrop] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => {
      const loaded = result ?? {};
      setProperties(loaded);
      setCompressor(String(loaded.compressor_seconds ?? 30));
      setLow(String(loaded.pressure_low ?? ''));
      setHigh(String(loaded.pressure_high ?? ''));
      setTanks((loaded.tanks ?? []).map(toForm));
    });
  }, []);

  // podgląd szacunku z bieżących (jeszcze niezapisanych) wartości formularza
  const preview: DeviceProperties = {
    pressure_low: toNumber(low),
    pressure_high: toNumber(high),
    tanks: tanks.map(fromForm),
  };

  const updateTank = (index: number, patch: Partial<TankForm>) =>
    setTanks((list) => list.map((tank, position) => position === index ? { ...tank, ...patch } : tank));

  // Kalkulator zbiornika ocynkowanego (tylko rodzaj „poduszka”): woda na cykl z obwodu i różnicy słupa
  // wody między startem a zatrzymaniem pompy. „Wstaw” dobiera k tak, żeby
  // szacunek zbiornika (wzór w serwerze, kliencie i sterowniku) dał tę ilość.
  const measuredLiters = cylinderLiters(toNumber(circumference), toNumber(levelDrop));
  // k = zmierzone litry / szacunek przy k = 1, zaokrąglone do 0,001; null, gdy nie ma z czego liczyć.
  // Obwód i różnica słupa są wspólne dla wszystkich zbiorników (jeden otwarty kalkulator naraz).
  const kForMeasured = (tank: TankForm) => {
    const base = tankWaterLiters({ ...fromForm(tank), k: 1 }, preview.pressure_low, preview.pressure_high);
    return base > 0 && measuredLiters > 0 ? Math.round((measuredLiters / base) * 1000) / 1000 : null;
  };

  const addTank = () => setTanks((list) => [...list, {
    name: '', kind: 'air', volumeLiters: '300', enabled: true, precharge: '', k: '1',
  }]);

  // Walidacja w kliencie; serwer sprawdza tylko zakresy pól (kompresor 1–3600 s, progi ≥ 0), a nie
  // relację progów. Serwer zastępuje całe properties ($set), dlatego zapis rozszerza wczytany obiekt.
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const seconds = toNumber(compressor);
    const pressureLow = toNumber(low);
    const pressureHigh = toNumber(high);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
      return setError('Czas pracy kompresora: pełne sekundy od 1 do 3600.');
    }
    if (!Number.isFinite(pressureLow) || !Number.isFinite(pressureHigh) || pressureLow < 0 || pressureHigh <= pressureLow) {
      return setError('Progi presostatu: dolny ≥ 0 i górny większy od dolnego.');
    }
    const parsed = tanks.map(fromForm);
    if (parsed.some((tank) => !(tank.volumeLiters > 0)
      || (tank.kind === 'membrane' && !((tank.precharge ?? -1) >= 0))
      || (tank.kind === 'air' && !((tank.k ?? -1) > 0)))) {
      return setError('Zbiornik: pojemność > 0, ciśnienie wstępne ≥ 0, współczynnik k > 0.');
    }
    setError('');
    try {
      const saved = await DeviceRequests.updateDeviceProperties({
        ...properties,
        compressor_seconds: seconds,
        pressure_low: pressureLow,
        pressure_high: pressureHigh,
        tanks: parsed,
      });
      setProperties(saved);
      setNotice('Zapisano. Sterownik pobierze ustawienia przy następnym uruchomieniu pompy.');
      window.setTimeout(() => setNotice(''), 4000);
    } catch {
      setError('Nie udało się zapisać ustawień.');
    }
  };

  return (
    <div className="settings water-page">
      <Notification message={notice} />
      <h2>Ustawienia</h2>
      <section>
        <form className="resource water-form water-settings-form" onSubmit={save}>
          <h3 className="settings-section-title">Kompresor i presostat</h3>
          <label>
            <span className="label">Czas pracy kompresora [s]:</span>
            <input type="number" min={1} max={3600} value={compressor}
              onChange={(event) => setCompressor(event.currentTarget.value)} />
          </label>
          <label>
            <span className="label">Próg dolny [bar]:</span>
            <input type="number" step="0.1" min={0} value={low} onChange={(event) => setLow(event.currentTarget.value)} />
          </label>
          <label>
            <span className="label">Próg górny [bar]:</span>
            <input type="number" step="0.1" min={0} value={high} onChange={(event) => setHigh(event.currentTarget.value)} />
          </label>
          <div className="water-hint">Progi odczytaj z manometru: przy starcie i przy zatrzymaniu pompy.</div>

          <h3 className="settings-section-title water-section-title">
            Zbiorniki
            <IconButton label="Dodaj zbiornik" icon={<PlusIcon />} onClick={addTank} />
          </h3>
          {tanks.map((tank, index) => (
            <div key={index} className="water-tank-edit">
              <IconButton className="water-tank-remove" variant="danger" label="Usuń zbiornik" icon={<TrashIcon />}
                onClick={() => window.confirm('Usunąć zbiornik z konfiguracji?') && setTanks((list) => list.filter((_, position) => position !== index))} />
              <label>
                <input type="checkbox" checked={tank.enabled}
                  onChange={(event) => updateTank(index, { enabled: event.currentTarget.checked })} />
                Włączony
              </label>
              <label>
                <span className="label">Nazwa:</span>
                <input type="text" value={tank.name ?? ''} placeholder={`Zbiornik ${index + 1}`}
                  onChange={(event) => updateTank(index, { name: event.currentTarget.value })} />
              </label>
              <label>
                <span className="label">Rodzaj:</span>
                <select value={tank.kind}
                  onChange={(event) => updateTank(index, { kind: event.currentTarget.value as WaterTank['kind'] })}>
                  <option value="air">poduszka powietrzna</option>
                  <option value="membrane">przeponowy (worek)</option>
                </select>
              </label>
              <label>
                <span className="label">Pojemność [l]:</span>
                <input type="number" min={1} value={tank.volumeLiters}
                  onChange={(event) => updateTank(index, { volumeLiters: event.currentTarget.value })} />
              </label>
              {tank.kind === 'membrane' ? (
                <label title="Odczyt manometrem na zaworze powietrza przy spuszczonej wodzie">
                  <span className="label">Ciśnienie wstępne p0 [bar]:</span>
                  <input type="number" step="0.1" min={0} value={tank.precharge}
                    onChange={(event) => updateTank(index, { precharge: event.currentTarget.value })} />
                </label>
              ) : (
                <label title="Korekta szacunku; kalkulator niżej albo podpowiedź na Wykresie (Rok, odczyty z wodomierza)">
                  <span className="label">Współczynnik k:</span>
                  <input type="number" step="0.01" min={0} value={tank.k}
                    onChange={(event) => updateTank(index, { k: event.currentTarget.value })} />
                </label>
              )}
              <div className="water-tank-estimate">
                <span className="water-hint">
                  ≈ {formatLiters(tankWaterLiters(fromForm(tank), preview.pressure_low, preview.pressure_high))} l na uruchomienie
                </span>
                {tank.kind === 'air' && (
                  <IconButton label="Kalkulator wody na cykl" icon={<CalculatorIcon />} active={calculator === index}
                    onClick={() => setCalculator(calculator === index ? null : index)} />
                )}
              </div>
              {tank.kind === 'air' && calculator === index && (
                <div className="water-calc">
                  <div className="water-hint">Woda na jedno uruchomienie z poziomu wody w zbiorniku przy starcie i przy zatrzymaniu pompy.</div>
                  <label className="water-field">Obwód zbiornika [cm]
                    <input type="number" min={1} value={circumference}
                      onChange={(event) => setCircumference(event.currentTarget.value)} />
                  </label>
                  <label className="water-field">Różnica słupa wody [cm]
                    <input type="number" min={0.1} step="0.1" value={levelDrop}
                      onChange={(event) => setLevelDrop(event.currentTarget.value)} />
                  </label>
                  <div className="water-calc-result">
                    <span>
                      = <strong>{formatLiters(measuredLiters)} l</strong> na cykl
                      {kForMeasured(tank) !== null && <> (k = {String(kForMeasured(tank)).replace('.', ',')})</>}
                    </span>
                    <button type="button" disabled={kForMeasured(tank) === null}
                      onClick={() => {
                        updateTank(index, { k: String(kForMeasured(tank)) });
                        setCalculator(null);
                      }}>
                      Wstaw
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="water-hint">Razem ≈ <strong>{formatLiters(estimatedWaterPerRun(preview))} l</strong> na uruchomienie</div>

          {error && <div className="water-error">{error}</div>}
          <div className="water-actions">
            <button type="submit" disabled={properties === null}>Zapisz</button>
          </div>
        </form>

        <div className="resource settings-device">
          <h3 className="settings-section-title">Sterownik</h3>
          <div><span className="label">Nazwa:</span><span>{device?.name?.trim() || '---'}</span></div>
          <div><span className="label">Identyfikator:</span><code>{device?.deviceId ?? '---'}</code></div>
          <div><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>
          <DeviceAddress device={device} />
          <FirmwareStatus device={device} />
          <div className="water-actions">
            <button type="button" disabled={!device} onClick={() => setEditingDevice(true)}>Zmień</button>
          </div>
        </div>
      </section>

      {editingDevice && device && (
        <DeviceEditModal
          device={device}
          onClose={() => setEditingDevice(false)}
          onSaved={(updated) => { selectDevice(updated); setEditingDevice(false); }}
        />
      )}
    </div>
  );
};
