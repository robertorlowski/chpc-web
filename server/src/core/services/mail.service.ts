// Maile kont użytkowników (2026-10-11): kod i link logowania, zmiana e-maila, usunięcie konta, udostępnienie
// sterownika, powiadomienie administratora o rejestracji. SMTP tylko ze zmiennych środowiskowych (SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_ADMIN; Render: Environment, lokalnie server/.env).
// Bez SMTP_HOST (testy, środowisko bez poczty) mail trafia do outbox w pamięci i do logu.
// Office 365 wysyła tylko z adresu konta SMTP_USER, chyba że ma ono uprawnienie „Send As” do MAIL_FROM
// (próba 2026-10-11: inny nadawca = 5.2.252 SendAsDenied), dlatego przy odmowie mail idzie z SMTP_USER.
import nodemailer, { Transporter } from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** maile wysłane bez SMTP (testy); najnowszy na końcu */
export const outbox: OutgoingMail[] = [];

let transport: Transporter | null = null;
const smtpTransport = () => {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
};

export const adminEmail = () => process.env.MAIL_ADMIN ?? '';

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const smtp = smtpTransport();
  if (!smtp) {
    outbox.push(mail);
    console.log(`[mail] (bez SMTP) do ${mail.to}: ${mail.subject}`);
    return;
  }
  const user = process.env.SMTP_USER ?? '';
  const from = process.env.MAIL_FROM || user;
  try {
    await smtp.sendMail({ from: `MyHome <${from}>`, ...mail });
  } catch (error) {
    // brak „Send As” do MAIL_FROM: wysyłka z adresu konta, odpowiedzi na MAIL_FROM
    if (from === user || !/SendAsDenied|5\.2\.252/.test(String((error as { response?: string }).response ?? error))) throw error;
    await smtp.sendMail({ from: `MyHome <${user}>`, replyTo: from, ...mail });
  }
}

// Adres klienta dla linków w mailach: Origin żądania, gdy jest na liście CLIENT_URL (po przecinku) albo jest
// lokalny (localhost, 127.0.0.1, sieć 192.168.x.x — środowisko deweloperskie); inaczej pierwszy z CLIENT_URL.
// Obcy Origin nie trafia do linku (link z tokenem logowania prowadziłby na cudzą stronę).
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
export function clientBaseUrl(origin?: string): string {
  const allowed = (process.env.CLIENT_URL ?? '').split(',').map((url) => url.trim().replace(/\/$/, '')).filter(Boolean);
  if (origin && (allowed.includes(origin) || LOCAL_ORIGIN.test(origin))) return origin;
  return allowed[0] ?? 'http://localhost:5173';
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Wspólny wygląd maila: pasek w kolorze aplikacji, akapity, opcjonalny kod i przycisk.
function layout(options: { paragraphs: string[]; code?: string; button?: { label: string; url: string; danger?: boolean }; footer: string; danger?: boolean }) {
  const color = options.danger ? '#b3261e' : '#1481a5';
  const body = options.paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('');
  const code = options.code
    ? `<div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:12px;background:#f0f0f0;border-radius:6px;margin:0 0 14px">${escapeHtml(options.code)}</div>`
    : '';
  const button = options.button
    ? `<p style="text-align:center;margin:0 0 14px"><a href="${escapeHtml(options.button.url)}" style="display:inline-block;padding:12px 24px;background:${options.button.danger ? '#b3261e' : '#1481a5'};color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(options.button.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:520px">`
    + `<div style="height:8px;background:${color}"></div><div style="padding:20px">${body}${code}${button}`
    + `<p style="margin:0;font-size:13px;color:#555">${escapeHtml(options.footer)}</p></div></div>`;
}

const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
const until = (expiresAt: Date) => expiresAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });

export function loginMail(to: string, code: string, url: string, expiresAt: Date): OutgoingMail {
  const footer = `Kod i link są ważne 10 minut (do ${until(expiresAt)}) i działają tylko raz. Jeśli to nie Ty, zignoruj tę wiadomość.`;
  return {
    to,
    subject: `Kod logowania: ${formatCode(code)}`,
    text: `Dzień dobry,\n\nTwój kod logowania: ${formatCode(code)}\n\nMożesz też zalogować się linkiem: ${url}\n\n${footer}`,
    html: layout({
      paragraphs: ['Dzień dobry,', 'Twój kod logowania:'], code: formatCode(code),
      button: { label: 'Zaloguj się', url }, footer,
    }),
  };
}

export function emailChangeMail(to: string, code: string, expiresAt: Date): OutgoingMail {
  const footer = `Kod jest ważny 10 minut (do ${until(expiresAt)}). Jeśli to nie Ty, zignoruj tę wiadomość.`;
  return {
    to,
    subject: `Potwierdź nowy adres: ${formatCode(code)}`,
    text: `Dzień dobry,\n\nKod potwierdzenia nowego adresu e-mail: ${formatCode(code)}\n\n${footer}`,
    html: layout({ paragraphs: ['Dzień dobry,', 'kod potwierdzenia nowego adresu e-mail:'], code: formatCode(code), footer }),
  };
}

export function emailChangedMail(to: string, newEmail: string): OutgoingMail {
  const text = `Adres e-mail konta został zmieniony na ${newEmail}. Kolejne logowania — tym adresem.`;
  const footer = 'Jeśli to nie Ty, skontaktuj się z administratorem.';
  return {
    to,
    subject: 'Zmiana adresu e-mail konta',
    text: `Dzień dobry,\n\n${text}\n\n${footer}`,
    html: layout({ paragraphs: ['Dzień dobry,', text], footer }),
  };
}

export function deleteAccountMail(to: string, url: string, devices: number): OutgoingMail {
  const warning = `Usunięcie konta spowoduje usunięcie wszystkich danych: konta, ${devices} sterowników i całej ich historii `
    + '(pomiary, harmonogramy, ustawienia). Tego nie da się cofnąć.';
  const footer = 'Link jest ważny 10 minut i działa tylko raz. Jeśli to nie Ty, zignoruj tę wiadomość — konto zostanie bez zmian.';
  return {
    to,
    subject: 'Potwierdź usunięcie konta',
    text: `Dzień dobry,\n\notrzymaliśmy prośbę o usunięcie konta ${to}.\n\n${warning}\n\nUsuń konto: ${url}\n\n${footer}`,
    html: layout({
      paragraphs: ['Dzień dobry,', `otrzymaliśmy prośbę o usunięcie konta ${to}.`, warning],
      button: { label: 'Usuń konto i wszystkie dane', url, danger: true }, footer, danger: true,
    }),
  };
}

export function shareMail(to: string, ownerName: string, deviceName: string, tabs: string, url: string, hasAccount: boolean): OutgoingMail {
  const intro = `${ownerName} udostępnia Ci sterownik „${deviceName}”.`;
  const access = `Dostęp do zakładek: ${tabs}.`;
  const login = hasAccount
    ? 'Sterownik jest już na ekranie głównym aplikacji.'
    : `Zaloguj się adresem ${to} — przy pierwszym logowaniu założymy konto.`;
  const footer = 'Jeśli nie znasz tej osoby, zignoruj tę wiadomość.';
  return {
    to,
    subject: `${ownerName} udostępnia Ci sterownik`,
    text: `Dzień dobry,\n\n${intro}\n${access}\n\n${login}\n${url}\n\n${footer}`,
    html: layout({ paragraphs: ['Dzień dobry,', intro, access, login], button: { label: 'Otwórz aplikację', url }, footer }),
  };
}

export function registrationAdminMail(to: string, email: string): OutgoingMail {
  const text = `Nowe konto: ${email} (${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}).`;
  return { to, subject: `Nowe konto: ${email}`, text, html: layout({ paragraphs: [text], footer: 'Powiadomienie administratora.' }) };
}
