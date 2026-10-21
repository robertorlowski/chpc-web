// Alarmy kotła w aplikacji (firmware pieca od 1.7.0, dziennik z panelu przez sterownik), układ „Instrument”
// (#s-boiler-alarmy): na stronie głównej czerwony komunikat (.alert) z alarmem trwającym albo nowym z ostatnich 24 h
// (kliknięcie otwiera zakładkę Alarmy), a zakładka Alarmy (/alarms, w menu po Harmonogramie): pasek filtrów (zakres
// historii: Aktywne / 30 dni / Wszystkie, znacznik zaników zasilania), karta „Aktywne” z licznikiem i karta „Historia”
// jako oś czasu (.timeline: godzina i data, kto, nazwa z kodem i końcem, chip stanu). Kasowania nie ma: historię
// alarmów kasuje tylko serwis z panelu (instrukcja kotła).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerAlert, PelletBoilerAlerts } from '../types';
import { alertDuration, alertName, bannerAlerts, endUnknown, formatAlertTime, POWER_LOSS } from '../utils/alerts';
import { Alert, Icon, Segmented } from './ui';
import { getLang, locale, t as tr, useLang } from '../../../core/i18n';

const REFRESH_MS = 60_000;
const DAY_MS = 24 * 3600 * 1000;

function useAlerts(): PelletBoilerAlerts | null | undefined {
  const [alerts, setAlerts] = useState<PelletBoilerAlerts | null | undefined>(undefined);
  useEffect(() => {
    const load = () => PelletBoilerRequests.getAlerts().then(setAlerts);
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return alerts;
}

const endText = (alert: PelletBoilerAlert) =>
  !alert.to ? tr('sw.table.ongoing') : endUnknown(alert) ? tr('pb.alerts.endUnknown') : formatAlertTime(alert.to);
const period = (alert: PelletBoilerAlert) => `${formatAlertTime(alert.from)} – ${endText(alert)}`;

const TIME_ZONE = 'Europe/Warsaw';
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString(locale(getLang()), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
// „dziś”, „wczoraj” albo „12.10” (z rokiem, gdy inny niż bieżący)
const dayOf = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  const day = (value: Date) => value.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  if (day(date) === day(now)) return tr('wx.today');
  if (day(date) === day(new Date(now.getTime() - DAY_MS))) return tr('pb.yesterday');
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale(getLang()), { timeZone: TIME_ZONE, day: 'numeric', month: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};

// Strona główna: czerwony komunikat (jak w makiecie „alert”), tylko gdy jest powód (alarm trwa albo nowy skończył się
// w ostatnich 24 h); kliknięcie otwiera zakładkę Alarmy.
export const AlertsBanner: React.FC = () => {
  const { t } = useLang();
  const data = useAlerts();
  const items = bannerAlerts(data?.alerts ?? []);
  if (!items.length) return null;
  return (
    <Link to="/alarms" className="alert alert-err boiler-alert-link" role="alert">
      <Icon name="bell" />
      <div>
        {items.map((alert) => (
          <span key={`${alert.code}-${alert.from}`}>
            <strong>{alertName(alert.code)}</strong>
            {alert.active ? ` · ${t('pb.alerts.sinceOngoing', { time: formatAlertTime(alert.from, false) })}` : ` · ${period(alert)}`}
          </span>
        ))}
      </div>
    </Link>
  );
};

type Range = 'active' | '30' | 'all';
const ranges = (): { value: Range; label: string }[] => [
  { value: 'active', label: tr('pb.alerts.active') }, { value: '30', label: tr('pb.alerts.days30') }, { value: 'all', label: tr('ops.filter.all') },
];

// Zakładka Alarmy (/alarms): karta „Aktywne” zawsze; „Historia” według zakresu (Aktywne = tylko trwające,
// 30 dni = z ostatnich 30 dni, Wszystkie = cały dziennik), od najnowszego; zaniki zasilania domyślnie ukryte
// (prawie cały dziennik).
export const PelletBoilerAlertsPage: React.FC = () => {
  const { t, tn } = useLang();
  const data = useAlerts();
  const [range, setRange] = useState<Range>('30');
  const [showPowerLoss, setShowPowerLoss] = useState(false);
  const now = Date.now();
  const all = (data?.alerts ?? []).filter((alert) => showPowerLoss || alert.code !== POWER_LOSS);
  const active = all.filter((alert) => alert.active);
  const history = all.filter((alert) => range === 'all' || (range === 'active' ? alert.active : now - new Date(alert.from).getTime() <= 30 * DAY_MS));
  const historyHint = range === 'active' ? t('pb.alerts.ongoing') : range === '30' ? t('pb.alerts.last30') : t('pb.alerts.wholeLog');

  return (
    <div className="page page-device boiler-page">
      <div className="filters">
        <Segmented name="boiler-alerts-range" label={t('wt.data.scope')} inline value={range} options={ranges()} onChange={setRange} />
        <label className="check">
          <input type="checkbox" checked={showPowerLoss} onChange={(event) => setShowPowerLoss(event.currentTarget.checked)} />
          <span>{t('pb.alerts.powerLosses')}</span>
        </label>
        <span className="card-hint">{t('pb.alerts.hint')}</span>
      </div>
      <section className="card">
        <header className="card-head"><h2>{t('pb.alerts.active')}</h2><span className={`chip ${active.length ? 'chip-err' : 'chip-off'}`}>{active.length}</span></header>
        {data === undefined && <span className="help">{t('common.loading')}</span>}
        {data === null && <span className="help danger-text">{t('ops.loadFailed')}</span>}
        {data && active.length === 0 && <span className="help">{t('pb.alerts.noneActive')}</span>}
        {active.map((alert) => (
          <Alert key={`${alert.code}-${alert.from}`} kind="warn" title={alertName(alert.code)}>
            {t('pv.set.code')} {alert.code} · {t('hp.since', { time: formatAlertTime(alert.from, false) })} ({alertDuration(alert)}){alert.uncertain && ` · ${t('pb.alerts.uncertain')}`}
          </Alert>
        ))}
      </section>
      <section className="card">
        <header className="card-head"><h2>{t('pb.alerts.history')}</h2><span className="card-hint">{historyHint} · {tn('pb.alerts.count', history.length)}</span></header>
        {data && history.length === 0 && <span className="help">{t('pb.alerts.none')}</span>}
        {history.length > 0 && (
          <ol className="timeline">
            {history.map((alert) => (
              <li key={`${alert.code}-${alert.from}`} className={`tl ${alert.active ? 'tl-err' : 'tl-sys'}`}>
                <span className="tl-time">{hourOf(alert.from)}<small>{dayOf(alert.from)}</small></span>
                <span className="tl-who">{t('pb.alerts.regulator')}{(alert.uncertain || endUnknown(alert)) && ` · ${t('pb.alerts.uncertain')}`}</span>
                <span className="tl-what">
                  <strong>{alertName(alert.code)}</strong> {t('pv.set.code')} {alert.code}
                  {alert.active ? ` · ${t('hp.since', { time: formatAlertTime(alert.from, false) })} (${alertDuration(alert)})`
                    : endUnknown(alert) ? ` · ${t('pb.alerts.endUnknown')}`
                    : alert.to ? ` · ${t('pb.alerts.endedAt', { time: formatAlertTime(alert.to, false) })} · ${alertDuration(alert)}` : ''}
                </span>
                <span className={`tl-state chip ${alert.active ? 'chip-err' : 'chip-off'}`}>{alert.active ? t('pb.alerts.activeOne') : t('pb.alerts.ended')}</span>
              </li>
            ))}
          </ol>
        )}
        {data?.readAt && <span className="help">{t('pb.alerts.readAt', { time: formatAlertTime(data.readAt) })}</span>}
      </section>
    </div>
  );
};
