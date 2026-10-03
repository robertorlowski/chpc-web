// Panel „Ustawienia zaawansowane” w Ustawieniach pieca: wszystkie parametry regulatora z ostatniego
// odczytu sterownika (GET /pellet-boiler-pelux200/settings), w grupach, z opisem i oceną zmiany
// (docs/parametry-kotla.md). Tylko podgląd — zmiany z aplikacji jeszcze nie ma. Zwinięty na start;
// dane pobierane przy pierwszym rozwinięciu.
import { useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerParameter, PelletBoilerSettings } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';

const formatValue = (parameter: PelletBoilerParameter, value: number) => {
  if (parameter.kind === 'switch' && parameter.min === 0 && parameter.max === 1) return value ? 'wł.' : 'wył.';
  const unit = parameter.unit ? ` ${parameter.unit}` : '';
  return `${formatNumber(value, 2)}${unit}`;
};

// kolor oceny: zielony = bezpieczny, pomarańczowy = ostrożnie, czerwony = serwis / nie ruszać
const ratingClass = (rating?: string) => {
  const text = (rating ?? '').toLowerCase();
  if (text.startsWith('bezpieczny')) return 'boiler-rating-safe';
  if (text.startsWith('ostrożnie')) return 'boiler-rating-careful';
  if (text.startsWith('tylko serwis') || text.startsWith('nie ruszać')) return 'boiler-rating-service';
  return '';
};

const ParameterRow: React.FC<{ parameter: PelletBoilerParameter }> = ({ parameter }) => (
  <li className="boiler-parameter">
    <div className="boiler-parameter-head">
      <span className="boiler-parameter-label">{parameter.label ?? parameter.name ?? `Parametr nr ${parameter.index}`}</span>
      <span className="boiler-parameter-value">
        {parameter.name ? formatValue(parameter, parameter.value) : `surowo ${parameter.raw.join(', ')}`}
      </span>
    </div>
    <div className="boiler-hint">
      nr {parameter.index}
      {parameter.name && <> · zakres {formatValue(parameter, parameter.min)} – {formatValue(parameter, parameter.max)}</>}
      {parameter.name && <> · <code>{parameter.name}</code></>}
    </div>
    {parameter.description && <div className="boiler-parameter-description">{parameter.description}</div>}
    {parameter.rating && <div className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</div>}
  </li>
);

export const AdvancedSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PelletBoilerSettings | null | undefined>(undefined);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && settings === undefined) PelletBoilerRequests.getSettings().then(setSettings);
  };

  const count = (settings?.groups ?? []).reduce((sum, group) => sum + group.parameters.length, 0);

  return (
    <div className="resource boiler-advanced">
      <h3 className="settings-section-title">
        <button type="button" className="boiler-advanced-toggle" aria-expanded={open} onClick={toggle}>
          <span>Ustawienia zaawansowane</span>
          <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        </button>
      </h3>
      {open && (
        <div className="boiler-advanced-body">
          {settings === undefined && <div className="boiler-hint">Wczytywanie…</div>}
          {settings === null && <div className="boiler-error">Nie udało się pobrać ustawień kotła.</div>}
          {settings && !settings.readAt && (
            <div className="boiler-hint">
              Brak odczytu. Sterownik pieca wysyła ustawienia regulatora po każdym uruchomieniu,
              gdy słyszy kocioł (firmware 1.1.0 lub nowszy).
            </div>
          )}
          {settings?.readAt && (
            <>
              <div className="boiler-hint">
                Odczyt z regulatora: {formatDateTime(settings.readAt)} · {count} parametrów kotła.
                Tylko podgląd: zmiana ustawień z aplikacji nie jest jeszcze dostępna.
              </div>
              {settings.groups?.map((group) => (
                <details key={group.key} className="boiler-group">
                  <summary>{group.label} <span className="boiler-hint">({group.parameters.length})</span></summary>
                  <ul>{group.parameters.map((p) => <ParameterRow key={p.index} parameter={p} />)}</ul>
                </details>
              ))}
              {settings.mixers?.map((mixer) => (
                <details key={`mixer-${mixer.mixer}`} className="boiler-group">
                  <summary>Mieszacz {mixer.mixer} <span className="boiler-hint">({mixer.parameters.length})</span></summary>
                  <ul>{mixer.parameters.map((p) => <ParameterRow key={p.index} parameter={p} />)}</ul>
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
