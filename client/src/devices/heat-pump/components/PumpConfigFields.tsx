// Konfiguracja pompy ciepła w oknie „Dane sterownika” (DefinitionFields rejestru): podłączenie
// CWU / CO ze schematem, pojemność zbiornika i fotowoltaika (DTU Hoymiles, wymuszenie przy PV > 2 kW).
// Ustawiana raz przy montażu; zmiana nie zmienia trybu pracy ani temperatur. Zapis razem z nazwą.
import { useEffect, useState } from 'react';
import { DeviceDefinitionFieldsProps, PumpConfig, PumpConnection } from '../../../core/types';
import './pumpConfig.css';

// Pojemność podpowiadana dla podłączenia; zakres jak na serwerze (device.service.ts).
const DEFAULT_TANK_LITERS: Record<PumpConnection, number> = { cwu: 300, co: 200 };
const TANK_LITERS_MIN = 20;
const TANK_LITERS_MAX = 2000;

// Sterownik bez zapisanej definicji: podłączenie CWU, jak działała pompa do tej pory.
const initialConfig = (config?: PumpConfig): PumpConfig =>
  config ?? { connection: 'cwu', tankLiters: DEFAULT_TANK_LITERS.cwu, pvDtu: false, pvForce: false };

export function PumpConfigFields({ device, onChange }: DeviceDefinitionFieldsProps) {
  const [config, setConfig] = useState<PumpConfig>(() => initialConfig(device.pumpConfig));
  const [liters, setLiters] = useState(String(config.tankLiters));

  const litersValue = Number(liters);
  const litersValid = /^\d+$/.test(liters.trim()) && litersValue >= TANK_LITERS_MIN && litersValue <= TANK_LITERS_MAX;

  // okno zapisuje zawsze komplet (także definicję widoczną, ale jeszcze niezapisaną)
  useEffect(() => {
    onChange(litersValid ? { pumpConfig: { ...config, tankLiters: litersValue, pvForce: config.pvDtu && config.pvForce } } : null);
  }, [config, litersValid, litersValue, onChange]);

  // zmiana podłączenia podpowiada pojemność, chyba że wpisano własną
  const pickConnection = (connection: PumpConnection) => {
    if (connection === config.connection) return;
    if (litersValue === DEFAULT_TANK_LITERS[config.connection]) setLiters(String(DEFAULT_TANK_LITERS[connection]));
    setConfig({ ...config, connection });
  };

  return (
    <section className="pump-config" aria-labelledby="pump-config-title">
      <h3 id="pump-config-title">Konfiguracja pompy</h3>
      <div className="pump-config-line">
        <span className="pump-config-label">Podłączenie pompy:</span>
        <div className="pump-config-seg" role="group" aria-label="Podłączenie pompy">
          {(['cwu', 'co'] as const).map((connection) => (
            <button
              key={connection}
              type="button"
              className={config.connection === connection ? 'on' : ''}
              aria-pressed={config.connection === connection}
              onClick={() => pickConnection(connection)}
            >
              {connection.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="pump-config-line">
        <label className="pump-config-label" htmlFor="pump-config-liters">Pojemność zbiornika:</label>
        <input
          id="pump-config-liters"
          type="number"
          inputMode="numeric"
          min={TANK_LITERS_MIN}
          max={TANK_LITERS_MAX}
          step={1}
          value={liters}
          aria-invalid={!litersValid}
          onChange={(event) => setLiters(event.currentTarget.value)}
        />
        <span>l</span>
      </div>
      {!litersValid && <p className="device-modal-error">Pojemność: pełne litry {TANK_LITERS_MIN}–{TANK_LITERS_MAX}.</p>}

      <div className="pump-config-pv-title">Fotowoltaika</div>
      <label className="pump-config-check">
        <input
          type="checkbox"
          checked={config.pvDtu}
          onChange={(event) => setConfig({ ...config, pvDtu: event.currentTarget.checked })}
        />
        <span>Panele Hoymiles podłączone przez DTU (RS-485)</span>
      </label>
      <label className={`pump-config-check${config.pvDtu ? '' : ' disabled'}`}>
        <input
          type="checkbox"
          disabled={!config.pvDtu}
          checked={config.pvDtu && config.pvForce}
          onChange={(event) => setConfig({ ...config, pvForce: event.currentTarget.checked })}
        />
        <span>Wymuś pracę przy produkcji PV &gt; 2 kW</span>
      </label>

      <div className="pump-config-schema">
        <div className="pump-config-schema-title">
          Schemat podłączenia: {config.connection === 'cwu' ? 'zasobnik CWU' : 'bufor CO / piec'}
        </div>
        <ConnectionSchema connection={config.connection} liters={litersValid ? litersValue : null} />
      </div>
      <p className="pump-config-note">Zmiana podłączenia nie zmienia trybu pracy ani temperatur.</p>
    </section>
  );
}

// Schemat hydrauliczny: gorąca woda z pompy do górnego króćca, zimna z dołu zbiornika do pompy.
function ConnectionSchema({ connection, liters }: { connection: PumpConnection; liters: number | null }) {
  const cwu = connection === 'cwu';
  const hot = '#c62828';
  const cold = '#1565c0';
  return (
    <svg
      viewBox="0 0 300 220"
      width="100%"
      role="img"
      aria-label={cwu ? 'Schemat: pompa ciepła podłączona do zasobnika CWU' : 'Schemat: pompa ciepła podłączona do bufora CO lub pieca'}
    >
      <defs>
        <marker id="pump-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={hot} />
        </marker>
        <marker id="pump-arrow-cold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={cold} />
        </marker>
      </defs>
      <rect x="70" y="20" width="80" height="180" rx={cwu ? 30 : 8} fill="#fff" stroke="#455a64" strokeWidth="2" />
      <text x="110" y="98" textAnchor="middle" fontSize="12" fontWeight="600" fill="#222">{cwu ? 'Zasobnik' : 'Bufor CO'}</text>
      <text x="110" y="114" textAnchor="middle" fontSize="12" fontWeight="600" fill="#222">{cwu ? 'CWU' : '/ piec'}</text>
      {liters !== null && <text x="110" y="131" textAnchor="middle" fontSize="11" fill="#444">{liters} l</text>}
      <rect x="215" y="85" width="75" height="60" rx="6" fill="#1481a5" />
      <text x="252" y="111" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">Pompa</text>
      <text x="252" y="126" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">ciepła</text>
      <path d="M232 85 V45 H152" fill="none" stroke={hot} strokeWidth="4" markerEnd="url(#pump-arrow-hot)" />
      <text x="190" y="38" textAnchor="middle" fontSize="10" fill={hot}>{cwu ? 'gorąca → górny króciec' : 'gorąca → góra'}</text>
      <path d="M152 180 H232 V145" fill="none" stroke={cold} strokeWidth="4" markerEnd="url(#pump-arrow-cold)" />
      <text x="192" y="196" textAnchor="middle" fontSize="10" fill={cold}>zimna ← z dołu</text>
      <path d="M68 40 H10" fill="none" stroke={hot} strokeWidth="3" markerEnd="url(#pump-arrow-hot)" />
      <text x="8" y="32" fontSize="10" fill={hot}>{cwu ? 'do kranów' : 'zasilanie CO'}</text>
      <path d="M10 185 H68" fill="none" stroke={cold} strokeWidth="3" markerEnd="url(#pump-arrow-cold)" />
      <text x="8" y="205" fontSize="10" fill={cold}>{cwu ? 'woda z sieci' : 'powrót CO'}</text>
    </svg>
  );
}
