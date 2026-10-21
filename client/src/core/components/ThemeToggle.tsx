// Ikona zmiany motywu w pasku, obok awatara konta (także na ekranie logowania): przełącza między jasnym a ciemnym.
// Pokazuje motyw, na który przełączy (księżyc w jasnym, słońce w ciemnym). Trzy opcje z „Jak system” są w menu konta.
import { useLang } from '../i18n';
import { setTheme, useTheme } from '../theme';
import { IconButton } from './IconButton';

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
const MoonIcon = () => icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />);
const SunIcon = () => icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);

export function ThemeToggle() {
  const { effective } = useTheme();
  const { t } = useLang();
  const dark = effective === 'dark';
  return (
    <IconButton className="theme-toggle" label={dark ? t('theme.toLight') : t('theme.toDark')}
      icon={dark ? <SunIcon /> : <MoonIcon />} onClick={() => setTheme(dark ? 'light' : 'dark')} />
  );
}
