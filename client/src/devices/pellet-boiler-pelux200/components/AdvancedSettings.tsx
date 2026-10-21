// Karta „Ustawienia zaawansowane” w Ustawieniach pieca (zwijana, .card-details z makiety): wszystkie parametry
// regulatora z ostatniego odczytu sterownika (GET /pellet-boiler-pelux200/settings), w zwijanych grupach jako lista
// .params (nazwa, numer, zakres, nazwa PyPlumIO; opis i ocena zmiany z docs/parametry-kotla.md w dymku „i”).
// Gdy ADVANCED_SETTINGS_EDIT w config.ts jest włączone, każdy parametr z nazwą ma ołówek — to samo okno zmiany co
// w „Głównych parametrach” (MainParameters.tsx), przy parametrach serwisowych z dodatkowym potwierdzeniem.
// Zwinięta na start; dane pobierane przy pierwszym rozwinięciu i po każdym zleceniu zmiany.
import { useCallback, useEffect, useState } from 'react';
import { InfoTip, TipParagraph } from '../../../core/components/InfoTip';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerParameter, PelletBoilerSettings } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';
import { COMMANDS_CHANGED, EditPanel, Item, ratingClass } from './MainParameters';
import { IconBtn } from './ui';
import { ADVANCED_SETTINGS_EDIT } from '../config';
import { ModeProfiles } from './ModeProfiles';
import { useLastReading } from '../utils/useLastReading';
import { useHeatPumpLinked } from '../utils/useHeatPumpLinked';
import { t as tr, useLang } from '../../../core/i18n';

const formatValue = (parameter: PelletBoilerParameter, value: number) => {
  if (parameter.kind === 'switch' && parameter.min === 0 && parameter.max === 1) return tr(value ? 'pb.onAbbr' : 'pb.offAbbr');
  const unit = parameter.unit ? ` ${parameter.unit}` : '';
  return `${formatNumber(value, 2)}${unit}`;
};

const ParameterRow: React.FC<{ parameter: PelletBoilerParameter; onEdit: () => void; disabled?: boolean }> = ({ parameter, onEdit, disabled }) => (
  <li>
    <span className="param-name">
      {parameter.label ?? parameter.name ?? tr('pb.paramN', { n: parameter.index })}
      {(parameter.description || parameter.rating) && (
        <InfoTip label={tr('pb.paramDescription')}>
          {parameter.description && <TipParagraph>{parameter.description}</TipParagraph>}
          {parameter.rating && <span className={`boiler-parameter-rating ${ratingClass(parameter.rating)}`}>{parameter.rating}</span>}
        </InfoTip>
      )}
      <small>
        {tr('pb.no')} {parameter.index}
        {parameter.name && <> · {formatValue(parameter, parameter.min)} – {formatValue(parameter, parameter.max)}</>}
        {parameter.name && <> · <code>{parameter.name}</code></>}
        {parameter.rating && <> · {parameter.rating.toLowerCase()}</>}
      </small>
    </span>
    <span className="param-val">{parameter.name ? formatValue(parameter, parameter.value) : `${tr('pb.raw')} ${parameter.raw.join(', ')}`}</span>
    {parameter.name && ADVANCED_SETTINGS_EDIT && (
      <IconBtn name="edit" label={`${tr('pb.change')}: ${parameter.label ?? parameter.name}`} disabled={disabled} onClick={onEdit} />
    )}
  </li>
);

export const AdvancedSettings: React.FC = () => {
  const { t } = useLang();
  // kocioł nie przesyła danych: ołówki zmian nieaktywne (jak w MainParameters)
  const { responding } = useLastReading();
  // nastawy trybów Pompa ciepła / Pellet tylko z powiązaną pompą ciepła (definicja kotła)
  const heatPumpLinked = useHeatPumpLinked();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PelletBoilerSettings | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ item: Item; parameter: PelletBoilerParameter } | null>(null);

  const reload = useCallback(() => { PelletBoilerRequests.getSettings().then(setSettings); }, []);
  const toggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    setOpen(next);
    if (next && settings === undefined) reload();
  };
  // nowe wartości po zleceniu (stąd albo z „Głównych parametrów”), gdy karta była już wczytana
  useEffect(() => {
    if (settings === undefined) return undefined;
    window.addEventListener(COMMANDS_CHANGED, reload);
    return () => window.removeEventListener(COMMANDS_CHANGED, reload);
  }, [settings, reload]);

  const count = (settings?.groups ?? []).reduce((sum, group) => sum + group.parameters.length, 0);
  const mixerCount = (settings?.mixers ?? []).filter((mixer) => !mixer.assumed).reduce((sum, mixer) => sum + mixer.parameters.length, 0);
  const hint = settings?.readAt
    ? t('pb.adv.hint', { count, mixerCount, mode: t(ADVANCED_SETTINGS_EDIT ? 'pb.adv.edit' : 'pb.adv.view') })
    : t('pb.adv.allParams');

  return (
    <details className="card card-details" open={open} onToggle={toggle}>
      <summary><h2>{t('pb.adv.title')}</h2><span className="card-hint">{hint}</span></summary>
      {settings === undefined && <p className="help">{t('common.loading')}</p>}
      {settings === null && <p className="help danger-text">{t('pb.adv.loadFailed')}</p>}
      {settings && !settings.readAt && (
        <p className="help">{t('pb.adv.noReading')}</p>
      )}
      {settings?.readAt && (
        <>
          <p className="help">
            {t('pb.adv.readAt', { time: formatDateTime(settings.readAt) })}{' '}
            {ADVANCED_SETTINGS_EDIT
              ? t('pb.adv.editHelp')
              : <>{t('pb.adv.viewHelpBefore')} (<code>ADVANCED_SETTINGS_EDIT = false</code>). {t('pb.adv.viewHelpAfter')}</>}
          </p>
          {heatPumpLinked && (
            <details className="boiler-group">
              <summary>
                {t('type.heat_pump')} / {t('pb.pellet')} <span className="card-hint">{t('pb.adv.modeProfiles')}</span>
                <InfoTip>{t('pb.adv.modeProfilesTip')}</InfoTip>
              </summary>
              <ModeProfiles settings={settings} />
            </details>
          )}
          {settings.groups?.map((group) => (
            <details key={group.key} className="boiler-group">
              <summary>{group.label} <span className="card-hint">{group.parameters.length}</span></summary>
              <ul className="params">{group.parameters.map((p) => (
                <ParameterRow key={p.index} parameter={p}
                  disabled={!responding} onEdit={() => setEditing({ item: { kind: 'ecomax', index: p.index }, parameter: p })} />
              ))}</ul>
            </details>
          ))}
          {settings.mixers?.filter((mixer) => !mixer.assumed).map((mixer) => (
            <details key={`mixer-${mixer.mixer}`} className="boiler-group">
              <summary>{t('boiler.mixer', { n: mixer.mixer })} <span className="card-hint">{mixer.parameters.length}</span></summary>
              <ul className="params">{mixer.parameters.map((p) => (
                <ParameterRow key={p.index} parameter={p}
                  disabled={!responding} onEdit={() => setEditing({ item: { kind: 'mixer', mixer: mixer.mixer, index: p.index }, parameter: p })} />
              ))}</ul>
            </details>
          ))}
        </>
      )}
      {editing && (
        <EditPanel item={editing.item} parameter={editing.parameter} reason="Zmiana w „Ustawienia zaawansowane”." onClose={() => setEditing(null)}
          onSent={() => setEditing(null)} />
      )}
    </details>
  );
};
