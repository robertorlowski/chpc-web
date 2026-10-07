// Alarmy kotła w aplikacji (firmware pieca od 1.7.0, dziennik z panelu przez sterownik): karta „Alarmy” w Ustawieniach
// (cała karta prowadzi na /alarms), pasek na stronie głównej (alarm trwający albo nowy z ostatnich 24 h, sam znika)
// i strona /alarms z listą. Kasowania nie ma: historię alarmów kasuje tylko serwis z panelu (instrukcja kotła).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton } from '../../../core/components/IconButton';
import { BackIcon } from '../../../core/components/icons';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerAlert, PelletBoilerAlerts } from '../types';
import { alertDuration, alertName, bannerAlerts, endUnknown, formatAlertTime, POWER_LOSS } from '../utils/alerts';

const REFRESH_MS = 60_000;

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
  !alert.to ? 'trwa' : endUnknown(alert) ? 'koniec nieznany' : formatAlertTime(alert.to);
const period = (alert: PelletBoilerAlert) => `${formatAlertTime(alert.from)} – ${endText(alert)}`;

// Ustawienia (na górze strony): trwające alarmy na czerwono i ostatni zakończony (bez zaników zasilania), bez
// etykiet „Aktywne” / „Ostatni” (uwaga użytkownika 2026-10-07); kliknięcie w kartę otwiera listę.
export const AlertsCard: React.FC = () => {
  const data = useAlerts();
  const list = data?.alerts ?? [];
  const active = list.filter((alert) => alert.active);
  const last = list.find((alert) => alert.code !== POWER_LOSS && !alert.active);
  return (
    <Link to="/alarms" className="resource boiler-alerts-card" aria-label="Alarmy: otwórz listę">
      <span className="boiler-alerts-card-title">Alarmy<span aria-hidden="true">›</span></span>
      {data === undefined && <span>Wczytywanie…</span>}
      {data === null && <span>Brak danych</span>}
      {data && (
        <>
          {active.map((alert) => (
            <strong key={`${alert.code}-${alert.from}`} className="boiler-error">
              {alertName(alert.code)}, od {formatAlertTime(alert.from)}, trwa
            </strong>
          ))}
          {last && <span>{alertName(last.code)}, {period(last)}</span>}
          {!active.length && !last && <span>Brak alarmów</span>}
          {!data.readAt && <span className="boiler-hint">Dziennik jeszcze nie przesłany (sterownik od wersji 1.7.0).</span>}
        </>
      )}
    </Link>
  );
};

// Strona główna: pasek tylko wtedy, gdy jest powód (alarm trwa albo nowy skończył się w ostatnich 24 h).
export const AlertsBanner: React.FC = () => {
  const data = useAlerts();
  const items = bannerAlerts(data?.alerts ?? []);
  if (!items.length) return null;
  return (
    <Link to="/alarms" className="resource boiler-alert-banner" role="alert">
      {items.map((alert) => (
        <span key={`${alert.code}-${alert.from}`}>
          ⚠ <strong>{alertName(alert.code)}</strong>
          {alert.active ? `, od ${formatAlertTime(alert.from, false)}, trwa` : `, ${period(alert)}`}
        </span>
      ))}
    </Link>
  );
};

// Strona /alarms (wejście z karty w Ustawieniach): trwające na górze, potem od najnowszego; zaniki zasilania
// domyślnie ukryte (prawie cały dziennik).
export const PelletBoilerAlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const data = useAlerts();
  const [showPowerLoss, setShowPowerLoss] = useState(false);
  const list = (data?.alerts ?? []).filter((alert) => showPowerLoss || alert.code !== POWER_LOSS);
  return (
    <div className="settings boiler-page boiler-alerts-page">
      <div className="boiler-alerts-header">
        <IconButton label="Wróć do Ustawień" icon={<BackIcon />} onClick={() => navigate('/settings')} />
        <h2>Alarmy</h2>
      </div>
      <section>
        <div className="resource">
          <label className="boiler-alerts-filter">
            <input type="checkbox" checked={showPowerLoss} onChange={(event) => setShowPowerLoss(event.currentTarget.checked)} />
            Pokaż zaniki zasilania
          </label>
          {data === undefined && <div>Wczytywanie…</div>}
          {data === null && <div className="boiler-error">Nie udało się wczytać dziennika.</div>}
          {data && list.length === 0 && <div>Brak alarmów.</div>}
          {list.length > 0 && (
            <table className="boiler-alerts-table">
              <thead>
                <tr><th>Alarm</th><th>Od</th><th>Do</th><th>Czas</th></tr>
              </thead>
              <tbody>
                {list.map((alert) => (
                  <tr key={`${alert.code}-${alert.from}`}
                    className={alert.active ? 'boiler-alert-active' : alert.uncertain ? 'boiler-alert-uncertain' : ''}>
                    <td>
                      {alert.active && <span className="boiler-alert-badge">TRWA</span>}
                      {alertName(alert.code)}
                      {(alert.uncertain || endUnknown(alert)) && <span className="boiler-hint"> · data niepewna</span>}
                    </td>
                    <td>{formatAlertTime(alert.from)}</td>
                    <td>{endText(alert)}</td>
                    <td>{alertDuration(alert)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data?.readAt && <div className="boiler-hint">Dziennik z panelu kotła, odczyt {formatAlertTime(data.readAt)}</div>}
        </div>
      </section>
    </div>
  );
};
