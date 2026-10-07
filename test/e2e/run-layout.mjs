// Układ widoków pozostałych rodzajów sterowników (piec, hydrofor, włącznik, fotowoltaika) na lokalnym chpc-web:
// dla każdego urządzenia danego rodzaju z lokalnej bazy każdy widok przy 360, 768 i 1280 px — strona bez
// przewijania w poziomie (wyjątek: tabele i wykresy we własnym przewijanym kontenerze), bez błędów konsoli,
// zrzut ekranu. Pompę ciepła sprawdza run-e2e.mjs (krok 12).
//
// Wymaga uruchomionego "npm run local" i urządzeń w bazie lokalnej (np. scripts/seed-local.mjs,
// scripts/seed-pv-local.mjs --keep, symulatory). Wyniki: test/raport-testow/uklad-wyniki.json i zrzuty
// test/raport-testow/zrzuty/uklad-<rodzaj>-<widok>-<szerokość>.png (poza gitem).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'raport-testow');
const SHOTS = join(OUT, 'zrzuty');
mkdirSync(SHOTS, { recursive: true });

const API = 'http://localhost:4001/api';
const WEB = 'http://localhost:5173';
const WIDTHS = [360, 768, 1280];
// widoki z menu rodzaju (client/src/devices/<rodzaj>/device-type.tsx) i strony spoza menu
const VIEWS = {
  'pellet-boiler-pelux200': ['/', '/data', '/chart', '/schedules', '/settings', '/alarms'],
  'water-pressure-tank': ['/', '/data', '/chart', '/settings'],
  switch: ['/', '/data', '/schedules', '/settings'],
  photovoltaic: ['/', '/data', '/chart', '/settings'],
};

const results = [];
const check = (step, ok, detail = '') => {
  results.push({ step, ok: !!ok, detail: String(detail) });
  console.log('[uklad]', ok ? 'OK  ' : 'BŁĄD', step, detail ? `- ${detail}` : '');
};

const devices = await (await fetch(`${API}/devices`)).json();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(String(error)));
await page.addInitScript(() => sessionStorage.setItem('chpc.defaultApplied', '1'));

for (const [type, views] of Object.entries(VIEWS)) {
  const device = devices.find((d) => d.deviceType === type);
  if (!device) {
    check(`${type}: urządzenie w bazie lokalnej`, false, 'brak — pominięto widoki');
    continue;
  }
  await page.goto(`${WEB}/devices`);
  await page.evaluate((d) => localStorage.setItem('chpc.selectedDevice', JSON.stringify(d)),
    { rootId: device.rootId, deviceId: device.deviceId, deviceType: device.deviceType, name: device.name ?? '' });
  for (const view of views) {
    for (const width of WIDTHS) {
      consoleErrors.length = 0;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}${view}`);
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        // elementy wychodzące poza ekran, poza przewijanymi kontenerami (tabele, wykresy)
        const scrollable = (e) => {
          for (let p = e.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
          }
          return false;
        };
        const over = [...document.querySelectorAll('body *')]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'
              && (b.right > vw + 1 || b.left < -1) && !scrollable(e);
          })
          .slice(0, 5)
          .map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} (${Math.round(e.getBoundingClientRect().right)} px)`);
        return { scrollWidth: document.documentElement.scrollWidth, vw, over, path: location.pathname };
      });
      const name = `uklad-${type}-${view === '/' ? 'glowny' : view.slice(1)}-${width}`;
      await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
      const ok = r.scrollWidth <= r.vw + 1 && r.over.length === 0;
      check(`${type} ${view} @ ${width}px: bez przewijania w poziomie`, ok,
        ok ? '' : `szerokość ${r.scrollWidth}px > ${r.vw}px; ${r.over.join('; ')}`);
      // 4xx/5xx z API i błędy skryptu; ostrzeżenia Reacta/Recharts pomijane
      const errors = consoleErrors.filter((e) => !/Warning:|width\(0\) and height\(0\)/.test(e));
      check(`${type} ${view} @ ${width}px: bez błędów konsoli`, errors.length === 0, errors.slice(0, 3).join(' | '));
      check(`${type} ${view} @ ${width}px: widok otwarty (bez przekierowania)`, r.path === view, r.path);
    }
  }
}

await browser.close();
writeFileSync(join(OUT, 'uklad-wyniki.json'), JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`[uklad] WYNIK: ${results.length - failed.length}/${results.length} sprawdzeń OK`);
process.exit(failed.length ? 1 : 0);
