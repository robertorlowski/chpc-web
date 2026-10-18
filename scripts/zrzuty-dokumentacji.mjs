// Zrzuty ekranów do dokumentacji (docs/moduly/*/img) z działającej instalacji — domyślnie produkcyjnej.
// Przeglądarka Edge przez Playwright z test/e2e, token sesji z pliku, dane osobowe maskowane w DOM przed zrzutem.
//
// Przygotowanie (pliki poza gitem, scripts/zrzuty.local.json):
//   {
//     "token": "<token sesji: POST /api/auth/start {email}, POST /api/auth/verify {email, code} → token>",
//     "replace": [["Jan Nowak", "Jan Kowalski"], ["jan@domena.pl", "jan.kowalski@example.com"], ["Ulica 1", "Przykładowa 1"]]
//   }
// `replace` to pary [tekst w aplikacji, tekst na zrzucie]: imię, e-mail, adres, współrzędne. SN, Root ID, skrócone
// SN/Root ID z paska, adresy IP 192.168.x.y i numery mikrofalowników Hoymiles skrypt maskuje sam.
//
// Uruchomienie: node scripts/zrzuty-dokumentacji.mjs [filtr-nazwy] [--web URL] [--api URL]
// Wynik: scripts/zrzuty/<moduł>/<nazwa>.png — po obejrzeniu skopiować do docs/moduly/<moduł>/img/.
// Zrzuty „dnia” (dane, wykresy) są dla wczoraj, bo dzisiejsze o różnych porach bywają prawie puste.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, '..', 'test', 'e2e', 'package.json'));
const { chromium } = require('playwright');

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const WEB = arg('--web', 'https://hpweb.onrender.com');
const API = arg('--api', 'https://chpc-web.onrender.com/api');
const FILTER = process.argv.slice(2).find((a) => !a.startsWith('--') && !process.argv[process.argv.indexOf(a) - 1]?.startsWith('--')) ?? '';
const OUT = join(HERE, 'zrzuty');
const local = JSON.parse(readFileSync(join(HERE, 'zrzuty.local.json'), 'utf8'));
const { token } = local;
const headers = { Authorization: `Bearer ${token}` };

const devices = await (await fetch(`${API}/devices`, { headers })).json();
const byType = Object.fromEntries(devices.map((d) => [d.deviceType, d]));
const weatherTiles = await (await fetch(`${API}/weather-tiles`, { headers })).json();
const weatherId = weatherTiles.find((t) => !t.home)?.id ?? weatherTiles[0]?.id;

// --- maskowanie: pary z pliku lokalnego + SN, Root ID (pełne i skrócone „F8B3…E964”), IP, numery mikrofalowników ---
const fakeRoot = Object.fromEntries(devices.map((d, i) => [d.rootId, `64f1a2b3c4d5e6f7a8b9c${String(i).padStart(3, '0')}`]));
const FAKE_SN = ['A0B1C2D3E4F5', 'B1C2D3E4F5A6', 'C2D3E4F5A6B7', 'D3E4F5A6B7C8', 'E4F5A6B7C8D9', 'F5A6B7C8D9E0'];
const fakeSn = Object.fromEntries([...new Set(devices.map((d) => d.deviceId))].map((sn, i) => [sn, FAKE_SN[i] ?? `E${i}F0A1B2C3D4`]));
const short = ([a, b]) => [`${a.slice(0, 4)}…${a.slice(-4)}`, `${b.slice(0, 4)}…${b.slice(-4)}`];
const REPLACE = [
  ...(local.replace ?? []),
  ...Object.entries(fakeRoot), ...Object.entries(fakeSn),
  ...Object.entries(fakeSn).map(short), ...Object.entries(fakeRoot).map(short),
];
const MASK = `(() => {
  const pairs = ${JSON.stringify(REPLACE)};
  const serials = new Map();
  const fix = (s) => {
    for (const [a, b] of pairs) s = s.split(a).join(b);
    // numery mikrofalowników Hoymiles: prefiks serii zostaje, reszta zmyślona
    s = s.replace(/\\b(11[46]4)(\\d{8})\\b/g, (m, p) => { if (!serials.has(m)) serials.set(m, p + String(10000000 + serials.size * 1111111).slice(0, 8)); return serials.get(m); });
    s = s.replace(/\\b192\\.168\\.\\d+\\.(\\d+)\\b/g, '192.168.0.$1');
    return s;
  };
  const walk = (n) => { if (n.nodeType === 3) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else for (const c of n.childNodes) walk(c); };
  walk(document.body);
  for (const el of document.querySelectorAll('input, textarea')) { const v = fix(el.value); if (v !== el.value) el.value = v; }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[href]')) for (const a of ['title', 'aria-label', 'placeholder', 'href']) { const v = el.getAttribute(a); if (v) el.setAttribute(a, fix(v)); }
  // mapa lokalizacji domu (Konto): rozmyta
  for (const el of document.querySelectorAll('.leaflet-tile-pane')) el.style.filter = 'blur(14px)';
  // inicjały w awatarze
  for (const el of document.querySelectorAll('.user-menu-avatar, .avatar-sm')) el.textContent = 'JK';
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: process.env.BROWSER_CHANNEL ?? 'msedge' });

async function newPage(width, height, { login = true, device = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', locale: 'pl-PL', timezoneId: 'Europe/Warsaw', deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(({ token, device, login }) => {
    localStorage.setItem('chpc.theme', 'light');
    if (login) localStorage.setItem('chpc.session', token);
    sessionStorage.setItem('chpc.startedOnList', '1');
    if (device) localStorage.setItem('chpc.selectedDevice', JSON.stringify(device));
  }, { token, device, login });
  return { context, page };
}

// nawigacja po dacie wstecz (pierwszy przycisk `.date-nav`)
async function prevDay(page, times = 1) {
  for (let i = 0; i < times; i++) {
    const btn = page.locator('.date-nav button').first();
    if (await btn.count()) { await btn.click(); await sleep(3000); }
  }
}
// przełącznik segmentowy (radiogroup z etykietami `label.seg`) albo zwykły tekst — klik po etykiecie
const seg = async (page, label) => {
  const l = page.locator('label.seg', { hasText: label }).first();
  if (await l.count()) await l.click(); else await page.getByText(label, { exact: true }).first().click();
  await sleep(2500);
};

const SHOTS = [
  // core
  { file: 'core/logowanie', w: 1280, h: 900, login: false, path: '/login' },
  { file: 'core/lista-sterownikow', w: 1280, h: 900, path: '/devices', wait: 4000 },
  { file: 'core/lista-sterownikow-telefon', w: 360, h: 800, path: '/devices', wait: 4000 },
  { file: 'core/zmien-uklad', w: 1280, h: 900, path: '/devices', wait: 4000, act: async (p) => { await p.getByRole('button', { name: 'Zmień układ kafelków' }).click(); await sleep(800); } },
  { file: 'core/dane-sterownika', w: 1280, h: 900, path: '/devices', wait: 4000, act: async (p) => {
    const tile = p.locator('.tile').first(); await tile.hover(); await sleep(300);
    await tile.locator('button').first().click(); await sleep(800); } },
  { file: 'core/nawigacja-pompa-telefon', w: 360, h: 800, type: 'heat_pump', path: '/' },
  { file: 'core/nawigacja-wiecej-telefon', w: 360, h: 800, type: 'heat_pump', path: '/', act: async (p) => { await p.locator('nav.bottom-nav button').filter({ hasText: 'Więcej' }).first().click(); await sleep(800); } },
  { file: 'core/operacje', w: 1280, h: 900, type: 'heat_pump', path: '/operations' },
  { file: 'core/firmware', w: 1280, h: 900, path: '/firmware/switch' },
  { file: 'core/pogoda', w: 1280, h: 900, path: `/weather/${weatherId}`, wait: 5000 },
  { file: 'core/pogoda-telefon', w: 360, h: 800, path: `/weather/${weatherId}`, wait: 5000 },
  { file: 'core/konto', w: 1280, h: 900, path: '/account' },
  // pompa ciepła
  { file: 'heat-pump/glowny', w: 1280, h: 900, type: 'heat_pump', path: '/' },
  { file: 'heat-pump/glowny-telefon', w: 360, h: 800, type: 'heat_pump', path: '/' },
  { file: 'heat-pump/dane', w: 1280, h: 900, type: 'heat_pump', path: '/data', act: (p) => prevDay(p) },
  { file: 'heat-pump/wykres-dzien', w: 1280, h: 900, type: 'heat_pump', path: '/chart', act: (p) => prevDay(p) },
  { file: 'heat-pump/wykres-miesiac', w: 1280, h: 900, type: 'heat_pump', path: '/chart', act: (p) => seg(p, 'Miesiąc') },
  { file: 'heat-pump/ustawienia', w: 1280, h: 900, type: 'heat_pump', path: '/settings' },
  { file: 'heat-pump/harmonogramy', w: 1280, h: 900, type: 'heat_pump', path: '/schedules' },
  { file: 'heat-pump/harmonogramy-telefon', w: 360, h: 800, type: 'heat_pump', path: '/schedules' },
  // piec
  { file: 'pellet-boiler-pelux200/piec-kociol', w: 1280, h: 900, type: 'pellet-boiler-pelux200', path: '/' },
  { file: 'pellet-boiler-pelux200/piec-kociol-telefon', w: 360, h: 800, type: 'pellet-boiler-pelux200', path: '/' },
  { file: 'pellet-boiler-pelux200/piec-dane', w: 1280, h: 900, type: 'pellet-boiler-pelux200', path: '/data', act: (p) => prevDay(p) },
  { file: 'pellet-boiler-pelux200/piec-wykres', w: 1280, h: 900, type: 'pellet-boiler-pelux200', path: '/chart', act: (p) => prevDay(p) },
  { file: 'pellet-boiler-pelux200/piec-harmonogram', w: 1280, h: 900, type: 'pellet-boiler-pelux200', path: '/schedules' },
  { file: 'pellet-boiler-pelux200/piec-ustawienia', w: 1280, h: 900, type: 'pellet-boiler-pelux200', path: '/settings', full: true },
  // fotowoltaika
  { file: 'photovoltaic/podglad-1280', w: 1280, h: 900, type: 'photovoltaic', path: '/', full: true },
  { file: 'photovoltaic/podglad-360', w: 360, h: 800, type: 'photovoltaic', path: '/' },
  { file: 'photovoltaic/ustawienia-1280', w: 1280, h: 900, type: 'photovoltaic', path: '/settings', full: true },
  { file: 'photovoltaic/wykres-miesiac-360', w: 360, h: 800, type: 'photovoltaic', path: '/chart', act: (p) => seg(p, 'Miesiąc') },
  { file: 'photovoltaic/wykres-panele-1280', w: 1280, h: 900, type: 'photovoltaic', path: '/chart', act: async (p) => { await prevDay(p); await seg(p, 'Produkcja paneli'); } },
  { file: 'photovoltaic/wykres-rok-1280', w: 1280, h: 900, type: 'photovoltaic', path: '/chart', act: (p) => seg(p, 'Rok') },
  // włącznik
  { file: 'switch/glowny', w: 1280, h: 900, type: 'switch', path: '/' },
  { file: 'switch/glowny-telefon', w: 360, h: 800, type: 'switch', path: '/' },
  { file: 'switch/dane', w: 1280, h: 900, type: 'switch', path: '/data', act: (p) => prevDay(p) },
  { file: 'switch/harmonogram', w: 1280, h: 900, type: 'switch', path: '/schedules' },
  { file: 'switch/ustawienia', w: 1280, h: 900, type: 'switch', path: '/settings' },
  // hydrofor
  { file: 'water-pressure-tank/glowny', w: 1280, h: 900, type: 'water-pressure-tank', path: '/' },
  { file: 'water-pressure-tank/glowny-telefon', w: 360, h: 800, type: 'water-pressure-tank', path: '/' },
  { file: 'water-pressure-tank/dane-uruchomienia', w: 1280, h: 900, type: 'water-pressure-tank', path: '/data' },
  { file: 'water-pressure-tank/dane-odczyty-wodomierza', w: 1280, h: 900, type: 'water-pressure-tank', path: '/data', act: (p) => seg(p, 'Odczyty wodomierza') },
  { file: 'water-pressure-tank/wykres-dzien', w: 1280, h: 900, type: 'water-pressure-tank', path: '/chart', act: (p) => prevDay(p) },
  { file: 'water-pressure-tank/wykres-miesiac', w: 1280, h: 900, type: 'water-pressure-tank', path: '/chart', act: (p) => seg(p, 'Miesiąc') },
  { file: 'water-pressure-tank/wykres-rok-wodomierz', w: 1280, h: 900, type: 'water-pressure-tank', path: '/chart', act: async (p) => { await seg(p, 'Rok'); const c = p.getByText('Pokaż odczyty z wodomierza').first(); if (await c.count()) { await c.click(); await sleep(1200); } } },
  { file: 'water-pressure-tank/ustawienia', w: 1280, h: 900, type: 'water-pressure-tank', path: '/settings' },
  { file: 'water-pressure-tank/ustawienia-telefon', w: 360, h: 800, type: 'water-pressure-tank', path: '/settings', full: true },
];

const failures = [];
for (const s of SHOTS) {
  if (FILTER && !s.file.includes(FILTER)) continue;
  const device = s.type ? byType[s.type] : null;
  if (s.type && !device) { failures.push(`${s.file}: brak urządzenia ${s.type}`); continue; }
  const { context, page } = await newPage(s.w, s.h, { login: s.login !== false, device });
  try {
    await page.goto(WEB + s.path, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(s.wait ?? 2500);
    if (s.act) await s.act(page);
    await page.evaluate(MASK);
    await sleep(200);
    mkdirSync(join(OUT, dirname(s.file)), { recursive: true });
    await page.screenshot({ path: join(OUT, `${s.file}.png`), fullPage: !!s.full });
    console.log('OK ', s.file);
  } catch (e) {
    failures.push(`${s.file}: ${String(e).split('\n')[0]}`);
    console.log('BŁĄD', s.file, String(e).split('\n')[0]);
  } finally {
    await context.close();
  }
}
await browser.close();
if (failures.length) { console.log('\nNieudane:\n' + failures.join('\n')); process.exitCode = 1; }
