// Service worker aplikacji (powiadomienia Web Push, 2026-10-21). Nie buforuje stron ani API: służy tylko do odbioru
// powiadomień z serwera (core/services/push.service.ts) i otwarcia aplikacji po kliknięciu. Rejestruje go
// core/push.ts po „Włącz na tym urządzeniu” w karcie „Powiadomienia” (/account); na iPhonie działa dopiero
// po dodaniu aplikacji do ekranu początkowego.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// treść z serwera: {title, body, url, tag, event, at}; tag = sterownik:zdarzenie, więc nowe powiadomienie tego samego
// rodzaju zastępuje poprzednie zamiast układać się w stos
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'My Home';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    timestamp: data.at ? Date.parse(data.at) : Date.now(),
    data: { url: data.url || '/devices' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// kliknięcie: istniejące okno aplikacji dostaje adres, inaczej nowe okno
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/devices', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client);
      if (open) {
        return open.focus().then((client) => (client && 'navigate' in client ? client.navigate(url) : undefined));
      }
      return self.clients.openWindow(url);
    }),
  );
});
