// Web Push po stronie przeglądarki (2026-10-21): wsparcie, rejestracja service workera (public/sw.js),
// subskrypcja PushManager z kluczem publicznym VAPID serwera i jej cofnięcie. Dane subskrypcji trafiają do
// PushRequests (api.ts). Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego
// (iOS 16.4+), co pokazuje karta „Powiadomienia” (needsHomeScreen).

export type PushSupport = 'ok' | 'unsupported' | 'insecure' | 'needs-home-screen';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  if (isIos() && !standalone() && !('PushManager' in window)) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

export const permissionState = (): NotificationPermission => ('Notification' in window ? Notification.permission : 'denied');

/** opis przeglądarki do listy subskrypcji („Chrome · Android”) */
export function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Przeglądarka';
  const system = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return system ? `${browser} · ${system}` : browser;
}

const registration = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

/** istniejąca subskrypcja tej przeglądarki (bez pytania o zgodę) albo null */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const ready = await navigator.serviceWorker.getRegistration('/');
  return (await ready?.pushManager.getSubscription()) ?? null;
}

export class PushDenied extends Error {}

/** pyta o zgodę (gdy trzeba) i subskrybuje; rzuca PushDenied, gdy użytkownik odmówił */
export async function subscribe(publicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushDenied('Przeglądarka nie zgodziła się na powiadomienia.');
  const ready = await registration();
  await navigator.serviceWorker.ready;
  const existing = await ready.pushManager.getSubscription();
  const subscription = existing ?? await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  return subscription.toJSON();
}

export async function unsubscribe(): Promise<void> {
  const subscription = await currentSubscription();
  await subscription?.unsubscribe();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
