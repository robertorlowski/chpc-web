// Automatyczne sprawdzenie pełnej makiety (makiety/makieta.html) w Chromium (Playwright):
//   node makiety/src/sprawdz.mjs            wszystkie ekrany × 360 / 412 / 1280 px × jasny / ciemny
//   node makiety/src/sprawdz.mjs --shots    dodatkowo zrzuty do makiety/zrzuty/ (poza gitem)
// Wymaga pakietu playwright (np. z test/e2e: `npm install` tam, albo PLAYWRIGHT=<ścieżka do playwright/index.mjs>).
//
// Sprawdzane dla każdego ekranu: brak przewijania strony w poziomie, żaden element nie wystaje poza szerokość okna
// (poza wnętrzem kontenerów z własnym przewijaniem), brak błędów konsoli i wyjątków, tekst w kartach nie jest ucięty
// w pionie, pasek górny jest widoczny, na telefonie ekran sterownika ma dolną nawigację, każdy widok z menu sterownika
// ma swój ekran, każdy przycisk data-go prowadzi do istniejącego ekranu, każde okno (data-modal) się otwiera i zamyka
// klawiszem Esc, a widoczne wykresy mają narysowane SVG.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = pathToFileURL(join(HERE, '..', 'makieta.html')).href;
const SHOTS = process.argv.includes('--shots') ? join(HERE, '..', 'zrzuty') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const SIZES = [[360, 800], [412, 915], [1280, 900]];
const THEMES = ['dark', 'light'];
const problems = [];
const note = (msg) => { problems.push(msg); console.log('BŁĄD', msg); };

const browser = await chromium.launch();
const probe = await browser.newPage();
await probe.goto(FILE, { waitUntil: 'networkidle' });
const screens = await probe.evaluate(() => Array.from(document.querySelectorAll('.screen')).map((s) => s.id.replace(/^s-/, '')));
const modals = await probe.evaluate(() => Array.from(document.querySelectorAll('.modal, .popover, .sheet')).map((m) => m.id.replace(/^modal-/, '')));
// każdy widok z konfiguracji rodzajów ma ekran (brak klas is-stub w menu po wejściu na podgląd)
for (const dev of ['hp', 'pv', 'tank', 'switch', 'boiler']) {
  await probe.goto(`${FILE}#${dev}-podglad`, { waitUntil: 'networkidle' });
  await probe.waitForTimeout(200);
  const stubs = await probe.evaluate(() => Array.from(document.querySelectorAll('#topbar .tab.is-stub, #bottom-nav .is-stub')).map((a) => a.getAttribute('data-go')));
  if (stubs.length) note(`brak ekranu dla widoków: ${[...new Set(stubs)].join(', ')}`);
}
// każdy data-go prowadzi do istniejącego ekranu
const gos = await probe.evaluate(() => Array.from(document.querySelectorAll('[data-go]')).map((a) => a.getAttribute('data-go')));
for (const g of new Set(gos)) if (!screens.includes(g)) note(`data-go="${g}" nie ma ekranu`);
await probe.close();
console.log(`ekrany: ${screens.length}, okna: ${modals.length}`);

let checks = 0;
for (const [w, h] of SIZES) for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, isMobile: w < 700, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const id of screens) {
    await page.goto(`${FILE}#${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const out = { overflowPage: document.documentElement.scrollWidth > document.documentElement.clientWidth, sticking: [], clipped: [], topbar: !!document.querySelector('#topbar:not([hidden]) .topbar-inner') || !!document.querySelector('.screen:not([hidden]).screen-auth'), bottomNav: getComputedStyle(document.getElementById('bottom-nav')).display !== 'none', charts: 0, chartsDrawn: 0 };
      const vw = document.documentElement.clientWidth;
      const scrollers = Array.from(document.querySelectorAll('.table-wrap'));
      for (const el of document.querySelectorAll('.screen:not([hidden]) *')) {
        if (el.closest('.mock-bar') || el.closest('.modal-layer')) continue;
        if (scrollers.some((s) => s !== el && s.contains(el))) continue;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) { out.sticking.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').split(' ')[0]} ${Math.round(b.left)}–${Math.round(b.right)}`); if (out.sticking.length > 5) break; }
      }
      for (const el of document.querySelectorAll('.screen:not([hidden]) .card, .screen:not([hidden]) .tile, .screen:not([hidden]) .stat, .screen:not([hidden]) .kpi')) {
        if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== 'auto') { out.clipped.push(`${el.className.split(' ')[0]} +${el.scrollHeight - el.clientHeight}px`); if (out.clipped.length > 5) break; }
      }
      for (const c of document.querySelectorAll('.screen:not([hidden]) .chart')) { out.charts++; if (c.querySelector('svg path, svg rect')) out.chartsDrawn++; }
      return out;
    });
    checks++;
    const tag = `${id} @${w} ${theme}`;
    if (r.overflowPage) note(`${tag}: strona przewija się w poziomie`);
    if (r.sticking.length) note(`${tag}: elementy poza oknem: ${r.sticking.join('; ')}`);
    if (r.clipped.length) note(`${tag}: treść ucięta w: ${r.clipped.join('; ')}`);
    if (!r.topbar) note(`${tag}: brak paska górnego`);
    const isDevice = await page.evaluate(() => !!document.querySelector('.screen:not([hidden])[data-device]'));
    if (w < 900 && isDevice && !r.bottomNav) note(`${tag}: brak dolnej nawigacji na telefonie`);
    if (w >= 900 && r.bottomNav) note(`${tag}: dolna nawigacja widoczna na komputerze`);
    if (r.charts !== r.chartsDrawn) note(`${tag}: wykresy nienarysowane ${r.chartsDrawn}/${r.charts}`);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${id}-${w}-${theme}.png`), fullPage: true });
  }
  // okna: każde otwiera się przyciskiem data-modal i zamyka Esc
  for (const m of modals) {
    // „Więcej” i menu konta są w pasku rysowanym skryptem: „Więcej” tylko na telefonie
    if (m === 'wiecej' && w >= 900) continue;
    const opener = m === 'wiecej' ? 'hp-podglad' : m === 'user-menu' ? 'lista' : await page.evaluate((m) => { const b = document.querySelector(`[data-modal="${m}"]`); if (!b) return null; const s = b.closest('.screen'); return s ? s.id.replace(/^s-/, '') : 'lista'; }, m);
    if (!opener) { note(`okno ${m}: brak przycisku, który je otwiera`); continue; }
    await page.goto(`${FILE}#${opener}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(150);
    await page.evaluate((m) => document.querySelector(`#topbar [data-modal="${m}"], #bottom-nav [data-modal="${m}"], .screen:not([hidden]) [data-modal="${m}"]`).click(), m);
    await page.waitForTimeout(150);
    const open = await page.evaluate((m) => { const el = document.getElementById(`modal-${m}`); const b = el.getBoundingClientRect(); return { visible: !el.hidden && b.width > 0, inside: b.left >= -1 && b.right <= document.documentElement.clientWidth + 1 && b.top >= -1 && b.bottom <= window.innerHeight + 1 }; }, m);
    checks++;
    if (!open.visible) note(`okno ${m} @${w} ${theme}: nie otwiera się`);
    else if (!open.inside) note(`okno ${m} @${w} ${theme}: wystaje poza okno przeglądarki`);
    if (SHOTS && open.visible) await page.screenshot({ path: join(SHOTS, `okno-${m}-${w}-${theme}.png`) });
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => document.getElementById('modal-layer').hidden);
    if (!closed) note(`okno ${m} @${w} ${theme}: Esc nie zamyka`);
  }
  // nawigacja: kafelek -> podgląd -> zakładka -> wstecz
  await page.goto(`${FILE}#lista`, { waitUntil: 'networkidle' });
  await page.click('.tile[data-go="hp-podglad"]');
  await page.waitForTimeout(100);
  let at = await page.evaluate(() => document.querySelector('.app').getAttribute('data-screen'));
  if (at !== 'hp-podglad') note(`nawigacja @${w} ${theme}: kafelek pompy otworzył ${at}`);
  await page.click(w < 900 ? '#bottom-nav [data-go="hp-harmonogram"]' : '#topbar [data-go="hp-harmonogram"]');
  await page.waitForTimeout(100);
  at = await page.evaluate(() => document.querySelector('.app').getAttribute('data-screen'));
  if (at !== 'hp-harmonogram') note(`nawigacja @${w} ${theme}: zakładka Harmonogram otworzyła ${at}`);
  await page.click('#topbar .back');
  await page.waitForTimeout(100);
  at = await page.evaluate(() => document.querySelector('.app').getAttribute('data-screen'));
  if (at !== 'lista') note(`nawigacja @${w} ${theme}: wstecz otworzył ${at}`);
  checks += 3;
  if (errors.length) note(`konsola @${w} ${theme}: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(`\nSprawdzeń: ${checks}, problemów: ${problems.length}${SHOTS ? `, zrzuty w ${SHOTS}` : ''}`);
process.exit(problems.length ? 1 : 0);
