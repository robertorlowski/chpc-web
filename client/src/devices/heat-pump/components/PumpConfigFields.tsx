// Konfiguracja pompy ciepła w oknie „Dane sterownika” (DefinitionFields rejestru): podłączenie
// CWU / CO ze schematem, pojemność zbiornika i fotowoltaika (DTU Hoymiles, wymuszenie przy PV > 2 kW).
// Ustawiana raz przy montażu; zmiana nie zmienia trybu pracy ani temperatur. Zapis razem z nazwą.
import { useEffect, useState } from 'react';
import { DeviceDefinitionFieldsProps, PumpConfig, PumpConnection } from '../../../core/types';
import { useLang } from '../../../core/i18n';
import './pumpConfig.css';

// Pojemność podpowiadana dla podłączenia; zakres jak na serwerze (device.service.ts).
const DEFAULT_TANK_LITERS: Record<PumpConnection, number> = { cwu: 300, co: 200 };
const TANK_LITERS_MIN = 20;
const TANK_LITERS_MAX = 2000;

// Sterownik bez zapisanej definicji: podłączenie CWU i DTU, jak działała pompa do tej pory (serwer też tak
// zakłada), a pojemność zbiornika pusta, dopóki użytkownik jej nie wpisze. Serwer nadaje taką definicję
// automatycznie przy zgłoszeniu sterownika (INITIAL_PUMP_CONFIG).
const initialConfig = (config?: PumpConfig): PumpConfig =>
  config ?? { connection: 'cwu', pvDtu: true, pvForce: false };

export function PumpConfigFields({ device, onChange }: DeviceDefinitionFieldsProps) {
  const { t } = useLang();
  const [config, setConfig] = useState<PumpConfig>(() => initialConfig(device.pumpConfig));
  // pusty tekst = pojemność niewpisana (zapis bez tankLiters, serwer podaje co wtedy domyślne 300 l)
  const [liters, setLiters] = useState(config.tankLiters === undefined ? '' : String(config.tankLiters));

  const litersEmpty = liters.trim() === '';
  const litersValue = Number(liters);
  const litersValid = litersEmpty
    || (/^\d+$/.test(liters.trim()) && litersValue >= TANK_LITERS_MIN && litersValue <= TANK_LITERS_MAX);

  // okno zapisuje zawsze komplet (także definicję widoczną, ale jeszcze niezapisaną); pojemność tylko gdy wpisana
  useEffect(() => {
    const { tankLiters: _tank, ...rest } = config;
    onChange(litersValid
      ? { pumpConfig: { ...rest, ...(litersEmpty ? {} : { tankLiters: litersValue }), pvForce: config.pvDtu && config.pvForce } }
      : null);
  }, [config, litersValid, litersEmpty, litersValue, onChange]);

  // zmiana podłączenia podpowiada pojemność tylko wtedy, gdy była wpisana domyślna dla poprzedniego (puste zostaje puste)
  const pickConnection = (connection: PumpConnection) => {
    if (connection === config.connection) return;
    if (!litersEmpty && litersValue === DEFAULT_TANK_LITERS[config.connection]) setLiters(String(DEFAULT_TANK_LITERS[connection]));
    setConfig({ ...config, connection });
  };

  return (
    <section className="pump-config" aria-labelledby="pump-config-title">
      <h3 id="pump-config-title">{t('hp.config.title')}</h3>
      <div className="pump-config-line">
        <span className="pump-config-label">{t('hp.config.connection')}:</span>
        <div className="pump-config-seg" role="group" aria-label={t('hp.config.connection')}>
          {(['cwu', 'co'] as const).map((connection) => (
            <button
              key={connection}
              type="button"
              className={config.connection === connection ? 'on' : ''}
              aria-pressed={config.connection === connection}
              onClick={() => pickConnection(connection)}
            >
              {connection === 'cwu' ? t('tile.cwu') : t('hp.co')}
            </button>
          ))}
        </div>
      </div>
      <div className="pump-config-line">
        <label className="pump-config-label" htmlFor="pump-config-liters">{t('hp.config.tankLiters')}:</label>
        <input
          id="pump-config-liters"
          type="number"
          inputMode="numeric"
          min={TANK_LITERS_MIN}
          max={TANK_LITERS_MAX}
          step={1}
          value={liters}
          placeholder={t('hp.config.none')}
          aria-invalid={!litersValid}
          onChange={(event) => setLiters(event.currentTarget.value)}
        />
        <span>l</span>
      </div>
      {!litersValid && <p className="device-modal-error">{t('hp.config.litersError', { min: TANK_LITERS_MIN, max: TANK_LITERS_MAX })}</p>}

      <div className="pump-config-pv-title">{t('type.photovoltaic')}</div>
      <label className="pump-config-check">
        <input
          type="checkbox"
          checked={config.pvDtu}
          onChange={(event) => setConfig({ ...config, pvDtu: event.currentTarget.checked })}
        />
        <span>{t('hp.config.pvDtu')}</span>
      </label>
      <label className={`pump-config-check${config.pvDtu ? '' : ' disabled'}`}>
        <input
          type="checkbox"
          disabled={!config.pvDtu}
          checked={config.pvDtu && config.pvForce}
          onChange={(event) => setConfig({ ...config, pvForce: event.currentTarget.checked })}
        />
        <span>{t('hp.config.pvForce')}</span>
      </label>

      <div className="pump-config-schema">
        <div className="pump-config-schema-title">
          {t('hp.config.schema')}: {config.connection === 'cwu' ? t('hp.config.cwuTank') : t('hp.config.coBuffer')}
        </div>
        <ConnectionSchema connection={config.connection} liters={litersValid && !litersEmpty ? litersValue : null} />
      </div>
    </section>
  );
}

// Schemat hydrauliczny: gorąca woda z pompy do górnego króćca, zimna z dołu zbiornika do pompy. Niski (300 × 150),
// opisy krótkie i nad / pod strzałkami, żeby się nie nakładały, a okno mieściło się na ekranie telefonu.
function ConnectionSchema({ connection, liters }: { connection: PumpConnection; liters: number | null }) {
  const { t } = useLang();
  const cwu = connection === 'cwu';
  const hot = 'var(--danger)';
  const cold = 'var(--c-water)';
  return (
    <svg
      viewBox="0 0 300 150"
      role="img"
      aria-label={cwu ? t('hp.config.schemaCwu') : t('hp.config.schemaCo')}
    >
      <defs>
        <marker id="pump-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={hot} />
        </marker>
        <marker id="pump-arrow-cold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={cold} />
        </marker>
      </defs>
      <rect x="100" y="8" width="70" height="134" rx={cwu ? 26 : 6} style={{ fill: 'var(--card)', stroke: 'var(--fg-3)' }} strokeWidth="2" />
      <text x="135" y="62" textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'var(--fg)' }}>{cwu ? t('hp.config.svgTank') : t('hp.config.svgBuffer')}</text>
      <text x="135" y="76" textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'var(--fg)' }}>{cwu ? t('tile.cwu') : t('hp.config.svgBoiler')}</text>
      {liters !== null && <text x="135" y="91" textAnchor="middle" fontSize="10" style={{ fill: 'var(--fg-2)' }}>{liters} l</text>}
      <rect x="226" y="52" width="68" height="46" rx="6" style={{ fill: 'var(--accent)' }} />
      <text x="260" y="72" textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'var(--accent-fg)' }}>{t('hp.config.svgPump1')}</text>
      <text x="260" y="86" textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'var(--accent-fg)' }}>{t('hp.config.svgPump2')}</text>
      <path d="M260 52 V26 H172" fill="none" stroke={hot} strokeWidth="3" markerEnd="url(#pump-arrow-hot)" />
      <text x="216" y="20" textAnchor="middle" fontSize="10" fill={hot}>{t('hp.config.svgHot')}</text>
      <path d="M172 122 H260 V98" fill="none" stroke={cold} strokeWidth="3" markerEnd="url(#pump-arrow-cold)" />
      <text x="216" y="138" textAnchor="middle" fontSize="10" fill={cold}>{t('hp.config.svgCold')}</text>
      <path d="M98 26 H8" fill="none" stroke={hot} strokeWidth="3" markerEnd="url(#pump-arrow-hot)" />
      <text x="8" y="20" fontSize="10" fill={hot}>{cwu ? t('hp.config.svgTaps') : t('hp.config.svgCoSupply')}</text>
      <path d="M8 122 H98" fill="none" stroke={cold} strokeWidth="3" markerEnd="url(#pump-arrow-cold)" />
      <text x="8" y="138" fontSize="10" fill={cold}>{cwu ? t('hp.config.svgMains') : t('hp.config.svgCoReturn')}</text>
    </svg>
  );
}
