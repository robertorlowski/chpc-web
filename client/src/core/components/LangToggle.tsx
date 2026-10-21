// Przełącznik języka w pasku ekranu logowania (bez konta): przycisk z kodem języka, na który przełączy („EN” w polskim,
// „PL” w angielskim). Po zalogowaniu język zmienia się w menu konta (UserMenu) i zapisuje w koncie.
import { setLang, useLang } from '../i18n';

export function LangToggle() {
  const { lang, t } = useLang();
  const next = lang === 'pl' ? 'en' : 'pl';
  return (
    <button type="button" className="icon-button lang-toggle" aria-label={t(`lang.switch.${next}`)} title={t(`lang.switch.${next}`)}
      onClick={() => setLang(next)}>{next.toUpperCase()}</button>
  );
}
