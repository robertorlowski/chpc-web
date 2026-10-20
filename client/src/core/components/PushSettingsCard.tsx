// Karta „Powiadomienia” na stronie konta (/account, 2026-10-21): powiadomienia Web Push na telefon i do przeglądarki.
// Góra: „Włącz / Wyłącz na tym urządzeniu” (zgoda przeglądarki → subskrypcja PushManager → POST /push/subscriptions,
// core/push.ts) i lista przeglądarek konta z usuwaniem oraz „Wyślij próbne”. Dół: reguły — dla każdego sterownika
// konta lista zdarzeń z katalogu serwera (GET /push/settings: events według rodzaju; pierwsze zaznaczenie sterownika
// wstawia zdarzenia domyślne) i cisza nocna (pilne zdarzenia idą mimo niej); „Zapisz” → PUT /push/rules.
// Stany bez przycisku: brak wsparcia w przeglądarce, iPhone bez dodania do ekranu początkowego, zgoda cofnięta
// w przeglądarce, serwer bez kluczy VAPID.
import { useEffect, useMemo, useState } from 'react';
import { PushRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { ApiError } from '../http';
import { browserLabel, currentSubscription, permissionState, PushDenied, pushSupport, subscribe, unsubscribe } from '../push';
import { DeviceType, PushRule, PushSettings } from '../types';
import Notification, { useSaveNotice } from './Notification';

const message = (error: unknown) => (error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Coś poszło nie tak — spróbuj ponownie.');
const when = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });

export function PushSettingsCard() {
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState(permissionState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rules, setRules] = useState<PushRule[]>([]);
  const [quietFrom, setQuietFrom] = useState('');
  const [quietTo, setQuietTo] = useState('');
  const { notice, showNotice, run, busy: saving } = useSaveNotice();
  const support = useMemo(pushSupport, []);

  const load = async () => {
    try {
      const loaded = await PushRequests.settings();
      setSettings(loaded);
      setRules(loaded.rules);
      setQuietFrom(loaded.quietFrom ?? '');
      setQuietTo(loaded.quietTo ?? '');
    } catch (caught) {
      setLoadError(message(caught));
    }
  };

  useEffect(() => {
    void load();
    void currentSubscription().then((subscription) => setEndpoint(subscription?.endpoint ?? null));
  }, []);

  const thisDevice = settings?.subscriptions.find((subscription) => subscription.endpoint === endpoint) ?? null;

  const enable = async () => {
    if (!settings?.publicKey) return;
    setBusy(true);
    setError('');
    try {
      const subscription = await subscribe(settings.publicKey);
      setPermission(permissionState());
      await PushRequests.subscribe(subscription, browserLabel());
      setEndpoint(subscription.endpoint ?? null);
      // pierwsze włączenie: zdarzenia domyślne dla każdego sterownika, żeby nie zaczynać od pustych reguł
      if (!rules.length) setRules(settings.devices.map((device) => ({ rootId: device.rootId, events: defaults(settings, device.deviceType) })));
      await load();
    } catch (caught) {
      setPermission(permissionState());
      setError(caught instanceof PushDenied ? 'Przeglądarka nie zgodziła się na powiadomienia. Zgodę można zmienić w ustawieniach strony.' : message(caught));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      if (thisDevice) await PushRequests.unsubscribe(thisDevice.id);
      await unsubscribe();
      setEndpoint(null);
      await load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await PushRequests.unsubscribe(id);
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError('');
    try {
      const { sent } = await PushRequests.test();
      showNotice(sent === 1 ? 'Wysłano próbne powiadomienie.' : `Wysłano próbne powiadomienie do ${sent} przeglądarek.`);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const eventsOf = (rootId: string) => rules.find((rule) => rule.rootId === rootId)?.events ?? [];
  const toggle = (rootId: string, key: string) => setRules((current) => {
    const events = eventsOf(rootId);
    const next = events.includes(key) ? events.filter((event) => event !== key) : [...events, key];
    const rest = current.filter((rule) => rule.rootId !== rootId);
    return next.length ? [...rest, { rootId, events: next }] : rest;
  });
  const setAll = (rootId: string, events: string[]) => setRules((current) => {
    const rest = current.filter((rule) => rule.rootId !== rootId);
    return events.length ? [...rest, { rootId, events }] : rest;
  });

  const save = () => run(async () => {
    setError('');
    try {
      const saved = await PushRequests.saveRules(rules, quietFrom || null, quietTo || null);
      setRules(saved.rules);
      showNotice('Zapisano.');
    } catch (caught) {
      setError(message(caught));
    }
  });

  const status = (() => {
    if (!settings) return null;
    if (!settings.configured) return 'Powiadomienia są wyłączone na serwerze (brak kluczy VAPID).';
    if (support === 'insecure') return 'Powiadomienia wymagają połączenia HTTPS.';
    if (support === 'needs-home-screen') return 'Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu początkowego (Udostępnij → „Do ekranu początkowego”). Otwórz ją stamtąd i włącz tutaj.';
    if (support === 'unsupported') return 'Ta przeglądarka nie obsługuje powiadomień.';
    if (permission === 'denied') return 'Przeglądarka blokuje powiadomienia dla tej strony. Odblokuj je w ustawieniach strony (kłódka przy adresie) i spróbuj ponownie.';
    return null;
  })();
  const canToggle = settings?.configured && support === 'ok' && permission !== 'denied';

  return (
    <section className="card push-card">
      <header className="card-head">
        <h2>Powiadomienia</h2>
        {settings && settings.subscriptions.length > 0 && <span className="card-hint">{settings.subscriptions.length === 1 ? '1 urządzenie' : `${settings.subscriptions.length} urządzenia`}</span>}
      </header>
      <p className="help">
        Powiadomienia systemowe na telefon i do przeglądarki: start sprężarki, rozpalanie kotła, włączenie przekaźnika,
        błąd albo brak łączności ze sterownikiem. Włącz je na każdym urządzeniu osobno; wybór zdarzeń jest wspólny dla konta.
      </p>
      {loadError && <div className="alert alert-err" role="alert"><div><strong>{loadError}</strong></div></div>}
      {status && <p className="help push-status">{status}</p>}

      {settings && (
        <>
          <div className="actions actions-gap push-actions">
            {settings.subscriptions.length > 0 && <button type="button" className="btn btn-ghost" onClick={sendTest} disabled={busy}>Wyślij próbne</button>}
            {canToggle && (thisDevice
              ? <button type="button" className="btn" onClick={disable} disabled={busy}>Wyłącz na tym urządzeniu</button>
              : <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>Włącz na tym urządzeniu</button>)}
          </div>
          {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}

          {settings.subscriptions.length > 0 && (
            <ul className="toggle-list push-subscriptions">
              {settings.subscriptions.map((subscription) => (
                <li key={subscription.id}>
                  <div>
                    <div className="push-sub-label">{subscription.label || 'Przeglądarka'}{subscription.id === thisDevice?.id && <span className="chip chip-ok">to urządzenie</span>}</div>
                    <small>włączone {when(subscription.createdAt)}{subscription.lastUsedAt ? ` · ostatnie powiadomienie ${when(subscription.lastUsedAt)}` : ''}</small>
                  </div>
                  <button type="button" className="link-btn" onClick={() => void remove(subscription.id)}>usuń</button>
                </li>
              ))}
            </ul>
          )}

          {settings.devices.length > 0 ? (
            <div className="push-rules">
              {settings.devices.map((device) => {
                const events = settings.events[device.deviceType] ?? [];
                const chosen = eventsOf(device.rootId);
                return (
                  <fieldset key={device.rootId} className="checks push-device">
                    <legend>
                      {device.name}{typeLabel(device.deviceType) !== device.name && <span className="push-type">{typeLabel(device.deviceType)}</span>}
                      <span className="push-legend-links">
                        <button type="button" className="link-btn" onClick={() => setAll(device.rootId, defaults(settings, device.deviceType))}>domyślne</button>
                        {chosen.length > 0 && <button type="button" className="link-btn" onClick={() => setAll(device.rootId, [])}>żadne</button>}
                      </span>
                    </legend>
                    {events.map((event) => (
                      <label key={event.key} className="check">
                        <input type="checkbox" checked={chosen.includes(event.key)} onChange={() => toggle(device.rootId, event.key)} />
                        <span>{event.label}</span>
                        {event.urgent && <small>także w ciszy nocnej</small>}
                      </label>
                    ))}
                  </fieldset>
                );
              })}

              <div className="push-quiet">
                <div className="push-quiet-head">Cisza nocna</div>
                <div className="push-quiet-fields">
                  <label className="field"><span>od</span><input type="time" value={quietFrom} onChange={(event) => setQuietFrom(event.target.value)} /></label>
                  <label className="field"><span>do</span><input type="time" value={quietTo} onChange={(event) => setQuietTo(event.target.value)} /></label>
                  {(quietFrom || quietTo) && <button type="button" className="link-btn" onClick={() => { setQuietFrom(''); setQuietTo(''); }}>wyłącz</button>}
                </div>
                <p className="help">W tych godzinach idą tylko zdarzenia pilne (błąd sterownika, alarm kotła). Puste pola = bez ciszy.</p>
              </div>

              <div className="actions">
                <Notification message={notice} />
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>Zapisz</button>
              </div>
            </div>
          ) : (
            <p className="help">To konto nie ma sterowników, o których można powiadamiać.</p>
          )}
        </>
      )}
    </section>
  );
}

// rodzaj pod nazwą sterownika (pomijany, gdy nazwa to to samo słowo); rodzaje bez etykiety w rejestrze po polsku
const TYPE_NAMES: Partial<Record<DeviceType, string>> = {
  [DeviceType.HP]: 'Pompa ciepła', [DeviceType.PELLET_BOILER_PELUX200]: 'Piec pelletowy', [DeviceType.SWITCH]: 'Włącznik', [DeviceType.WATER_PRESSURE_TANK]: 'Hydrofor',
};
const typeLabel = (deviceType: DeviceType) => TYPE_NAMES[deviceType] ?? getDeviceTypeView(deviceType).label ?? deviceType;

const defaults = (settings: PushSettings, deviceType: PushSettings['devices'][number]['deviceType']) =>
  (settings.events[deviceType] ?? []).filter((event) => event.default).map((event) => event.key);
