// Panel „Ustawienia zaawansowane” w Ustawieniach pieca: wszystkie parametry regulatora z ostatniego
// odczytu sterownika (GET /pellet-boiler-pelux200/settings), w grupach, z opisem i oceną zmiany
// (docs/parametry-kotla.md). Gdy ADVANCED_SETTINGS_EDIT w config.ts jest włączone, każdy parametr z nazwą
// ma ikonę zmiany — ten sam panel co w „Głównych
// parametrach” (MainParameters.tsx), przy parametrach serwisowych z dodatkowym potwierdzeniem.
// Zwinięty na start; dane pobierane przy pierwszym rozwinięciu i po każdym zleceniu zmiany.
import { useCallback, useEffect, useState } from 'react';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon } from '../../../core/components/icons';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerParameter, PelletBoilerSettings } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';
import { COMMANDS_CHANGED, EditPanel, Item, ratingClass } from './MainParameters';
import { ADVANCED_SETTINGS_EDIT } from '../config';
import { ModeProfiles } from './ModeProfiles';
import { useLastReading } from '../utils/useLastReading';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';

const formatValue = (parameter: PelletBoilerParameter, value: number) => {
  if (parameter.kind === 'switch' && parameter.min === 0 && parameter.max === 1) return value ? 'wł.' : 'wył.';
  const unit = parameter.unit ? ` ${parameter.unit}` : '';
  return `${formatNumber(value, 2)}${unit}`;
};

const ParameterRow: React.FC<{ parameter: PelletBoilerParameter; onEdit: () => void; disabled?: boolean }> = ({ parameter, onEdit, disabled }) => (
  <li className="boiler-parameter">
    <div className="boiler-parameter-head">
      <span className="boiler-parameter-label">{parameter.label ?? parameter.name ?? `Parametr nr ${parameter.index}`}</span>
      <span className="boiler-parameter-value">
        {parameter.name ? formatValue(parameter, parameter.value) : `surowo ${parameter.raw.join(', ')}`}
        {parameter.name && ADVANCED_SETTINGS_EDIT && (
          <IconButton label={`Zmień: ${parameter.label ?? parameter.name}`} icon={<EditIcon />} disabled={disabled} onClick={onEdit} />
        )}
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
  // kocioł nie przesyła danych: ołówki zmian nieaktywne (jak w MainParameters)
  const { responding } = useLastReading();
  // nastawy trybów Pompa ciepła / Pellet tylko z powiązaną pompą ciepła (definicja kotła)
  const heatPumpLinked = useHeatPumpLinked();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PelletBoilerSettings | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ item: Item; parameter: PelletBoilerParameter } | null>(null);

  const reload = useCallback(() => { PelletBoilerRequests.getSettings().then(setSettings); }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && settings === undefined) reload();
  };
  // nowe wartości po zleceniu (stąd albo z „Głównych parametrów”), gdy panel był już wczytany
  useEffect(() => {
    if (settings === undefined) return undefined;
    window.addEventListener(COMMANDS_CHANGED, reload);
    return () => window.removeEventListener(COMMANDS_CHANGED, reload);
  }, [settings, reload]);

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
                {ADVANCED_SETTINGS_EDIT
                  ? 'Ołówek zleca zmianę (sterownik wyśle ją do regulatora w ciągu ok. 15–30 s); parametry serwisowe wymagają potwierdzenia.'
                  : 'Tylko podgląd: zmiana tych parametrów jest wyłączona w konfiguracji aplikacji (config.ts).'}
              </div>
              {heatPumpLinked && (
                <details className="boiler-group">
                  <summary>Pompa ciepła / Pellet <span className="boiler-hint">(nastawy trybów)</span></summary>
                  <ModeProfiles settings={settings} />
                </details>
              )}
              {settings.groups?.map((group) => (
                <details key={group.key} className="boiler-group">
                  <summary>{group.label} <span className="boiler-hint">({group.parameters.length})</span></summary>
                  <ul>{group.parameters.map((p) => (
                    <ParameterRow key={p.index} parameter={p}
                      disabled={!responding} onEdit={() => setEditing({ item: { kind: 'ecomax', index: p.index }, parameter: p })} />
                  ))}</ul>
                </details>
              ))}
              {settings.mixers?.map((mixer) => (
                <details key={`mixer-${mixer.mixer}`} className="boiler-group">
                  <summary>Mieszacz {mixer.mixer} <span className="boiler-hint">({mixer.parameters.length})</span></summary>
                  <ul>{mixer.parameters.map((p) => (
                    <ParameterRow key={p.index} parameter={p}
                      disabled={!responding} onEdit={() => setEditing({ item: { kind: 'mixer', mixer: mixer.mixer, index: p.index }, parameter: p })} />
                  ))}</ul>
                </details>
              ))}
            </>
          )}
        </div>
      )}
      {editing && (
        <EditPanel item={editing.item} parameter={editing.parameter} onClose={() => setEditing(null)}
          onSent={() => setEditing(null)} />
      )}
    </div>
  );
};
