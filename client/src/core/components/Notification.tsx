// Krótki komunikat po zapisie (np. „Polecenie wysłane do sterownika.”) i hook useSaveNotice,
// którego używają wszystkie strony z przyciskiem zapisu.
//
// Zasada dla całej aplikacji (uwaga użytkownika 2026-10-05): przycisk zapisu jest nieaktywny w trakcie
// zapisu i dopóki widać komunikat; włącza się, gdy komunikat zniknie. Wcześniej można było nacisnąć
// go kilka razy, a komunikat nie mówił, czy zapis już poszedł.
//
// Użycie:
//   const { notice, showNotice, run, busy } = useSaveNotice();
//   const save = () => run(async () => { await api.save(); showNotice('Zapisano.'); });
//   <Notification message={notice} />
//   <button disabled={busy || …} onClick={save}>Zapisz</button>
import { useCallback, useEffect, useRef, useState } from 'react';
import './notification.css';

type NotificationProps = {
  message: string;
};

export default function Notification({ message }: NotificationProps) {
  if (!message) return null;
  return <span className="notification" role="status">{message}</span>;
}

export const NOTICE_MS = 3000;

export function useSaveNotice(durationMs = NOTICE_MS) {
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // komunikat znika po durationMs (albo ms); nowy komunikat zastępuje poprzedni i liczy czas od nowa
  const showNotice = useCallback((message: string, ms = durationMs) => {
    window.clearTimeout(timer.current);
    setNotice(message);
    timer.current = window.setTimeout(() => setNotice(''), ms);
  }, [durationMs]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // zapis w toku: busy także przed odpowiedzią serwera (bez podwójnego kliknięcia)
  const run = useCallback(async <T,>(save: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try {
      return await save();
    } finally {
      setSaving(false);
    }
  }, []);

  return { notice, showNotice, run, saving, busy: saving || notice !== '' };
}
