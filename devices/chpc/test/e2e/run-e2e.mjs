// Test pełnego łańcucha: symulowany firmware chpc + oryginalna logika co (bridge.exe)
// <-> lokalny serwer chpc-web (http://localhost:4001) <-> klient (http://localhost:5173, Playwright + Edge).
//
// Wymaga uruchomionego "npm run local" w chpc-web (baza .local-db, serwer, klient) i zbudowanego bridge.exe.
// Wyniki: docs/raport-testow/e2e-wyniki.json i zrzuty w docs/raport-testow/zrzuty/ (repo chpc).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'raport-testow');
const SHOTS = join(OUT, 'zrzuty');
mkdirSync(SHOTS, { recursive: true });

const API = 'http://localhost:4001/api';
const WEB = 'http://localhost:5173';
const DEVICE_ID = `hp-test-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
const DEVICE_NAME = 'Pompa testowa (E2E)';

// ------------------------------------------------------------------ wyniki
const results = [];
const log = (...a) => console.log('[e2e]', ...a);
function check(step, ok, detail = '') {
  results.push({ step, ok: !!ok, detail: String(detail) });
  log(ok ? 'OK  ' : 'BŁĄD', step, detail ? `- ${detail}` : '');
  return !!ok;
}

// ------------------------------------------------------------------ most (chpc + co)
class Bridge {
  constructor() {
    this.proc = spawn(join(HERE, 'bridge.exe'), [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = [];
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
      const resolve = this.pending.shift();
      if (resolve) resolve(JSON.parse(line));
    });
  }
  cmd(line) {
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.proc.stdin.write(line + '\n');
    });
  }
}

// ------------------------------------------------------------------ emulacja co (HTTP) i świata
const bridge = new Bridge();
const start = new Date();
start.setHours(6, 0, 0, 0);
let virtualMs = 0;
let rootId = '';
let lastHp = {};
let lastOperation = {};
const prefs = { work_mode: 'OFF', co_min: 35, co_max: 45, cwu_min: 40, cwu_max: 47 };
const world = { Ttarget: 24.0, Tho: 30.0, heating: true };
const stats = { polls: 0, posts: 0, framesSent: 0, emptyOperations: 0, frameLog: [] };

const pad = (n) => String(n).padStart(2, '0');
function virtualTime() {
  const d = new Date(start.getTime() + virtualMs);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function http(method, path, body) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${path}${rootId ? `${sep}rootId=${rootId}&deviceId=${DEVICE_ID}` : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

// Prosty model instalacji: sprężarka 1,2 kW przy COP ok. 3,5 daje ok. 4,2 kW ciepła na zasobnik 300 l,
// czyli ok. 0,2 °C/min; postój powoli schładza wodę (odbiór ciepła przez podłogówkę).
async function updateWorld(periodMs) {
  const running = Number(lastHp.HPS) === 1;
  if (world.heating) {
    const perMinute = running ? 0.2 : -0.05;
    world.Ttarget = Math.max(15, world.Ttarget + (perMinute * periodMs) / 60000);
    world.Tho = running ? world.Ttarget + 4 : Math.max(world.Ttarget, world.Tho - 0.3);
  }
  await bridge.cmd(`temp Ttarget ${world.Ttarget.toFixed(2)}`);
  await bridge.cmd(`temp Tho ${world.Tho.toFixed(2)}`);
}

// Jeden cykl co: czekanie (10 s przy pracy, 30 s postój), zapytanie 0x01, POST /hp/add, zastosowanie operacji.
async function coCycle() {
  const period = Number(lastHp.HPS) === 1 ? 10000 : 30000;
  await updateWorld(period);
  const run = await bridge.cmd(`run ${period}`);
  virtualMs += period;
  if (run.event === 'restart') stats.restarts = (stats.restarts ?? 0) + 1;
  const poll = await bridge.cmd('poll');
  stats.polls++;
  if (!poll.ok) {
    stats.pollErrors = (stats.pollErrors ?? 0) + 1;
    return null;
  }
  lastHp = poll.hp;
  const body = {
    time: virtualTime(),
    co_pomp: ['A', 'M', 'PV'].includes(prefs.work_mode),
    cwu_pomp: false,
    pv_power: false,
    controller_mode: 'CLOUD',
    work_mode: prefs.work_mode,
    co_min: prefs.co_min, co_max: prefs.co_max, cwu_min: prefs.cwu_min, cwu_max: prefs.cwu_max,
    HP: poll.hp,
    PV: { total_power: 0, total_prod: 0, total_prod_today: 0, temperature: 0 },
    ...poll.cop,
    serial_read_timeout: stats.pollErrors ?? 0,
    hp_json_error: 0,
  };
  const res = await http('POST', '/hp/add', body);
  stats.posts++;
  const operation = res.body?.operation ?? {};
  if (Object.keys(operation).length === 0) { stats.emptyOperations++; return poll.hp; }
  lastOperation = operation;
  for (const key of ['work_mode', 'co_min', 'co_max', 'cwu_min', 'cwu_max']) if (operation[key] !== undefined) prefs[key] = operation[key];
  const applied = await bridge.cmd(`operation ${JSON.stringify(operation)}`);
  stats.framesSent += applied.frames.length;
  if (applied.frames.length) stats.frameLog.push({ time: virtualTime(), operation, frames: applied.frames, events: applied.events });
  return poll.hp;
}

async function cyclesUntil(pred, maxCycles, label) {
  for (let k = 0; k < maxCycles; k++) {
    const hp = await coCycle();
    if (hp && pred(hp)) return k + 1;
  }
  log('nie osiągnięto warunku:', label);
  return -1;
}

// ------------------------------------------------------------------ interfejs (Playwright)
let browser;
let page;

async function shot(name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function openPage(path, selector) {
  await page.goto(`${WEB}${path}`);
  if (selector) await page.waitForSelector(selector, { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function layoutCheck() {
  const pages = [['/hp', 'hp'], ['/data', 'dane'], ['/chart', 'wykres'], ['/settings', 'ustawienia'], ['/schedules', 'harmonogram'], ['/devices', 'urzadzenia']];
  const widths = [360, 768, 1280];
  const issues = [];
  for (const [path, name] of pages) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}${path}`);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('body *')]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            const style = getComputedStyle(e);
            return b.width > 0 && b.height > 0 && style.visibility !== 'hidden' && (b.right > vw + 1 || b.left < -1)
              && !e.closest('[style*="overflow"]');
          })
          .slice(0, 6)
          .map((e) => `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''} (prawa krawędź ${Math.round(e.getBoundingClientRect().right)} px)`);
        return { scrollWidth: document.documentElement.scrollWidth, vw, over };
      });
      await page.screenshot({ path: join(SHOTS, `uklad-${name}-${width}.png`), fullPage: true });
      const ok = r.scrollWidth <= r.vw + 1 && r.over.length === 0;
      if (!ok) issues.push({ page: path, width, ...r });
      check(`Układ ${path} @ ${width}px`, ok, ok ? '' : `szerokość strony ${r.scrollWidth}px > ${r.vw}px; ${r.over.join('; ')}`);
    }
    // wybrane urządzenie zostaje zachowane między stronami; /devices czyści wybór, więc na koniec wracamy
    if (path === '/devices') {
      await page.evaluate(([id, did, name]) => localStorage.setItem('chpc.selectedDevice', JSON.stringify({ rootId: id, deviceId: did, name, deviceType: 'heat_pump' })), [rootId, DEVICE_ID, DEVICE_NAME]);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return issues;
}

// ------------------------------------------------------------------ scenariusz
async function main() {
  browser = await chromium.launch({ channel: 'msedge' });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('dialog', (d) => d.accept());

  // 1. Rejestracja nowego sterownika przez interfejs
  await openPage('/', 'form.device-add');
  await shot('01-rejestracja-pusta');
  await page.fill('input[name="deviceId"]', DEVICE_ID);
  await page.fill('input[name="name"]', DEVICE_NAME);
  await page.click('form.device-add button[type="submit"]');
  await page.waitForSelector('.device-created code', { timeout: 10000 }).catch(() => {});
  rootId = (await page.textContent('.device-created code').catch(() => '') ?? '').trim();
  check('Rejestracja: formularz dodaje sterownik i pokazuje rootId', /^[0-9a-f]{24}$/.test(rootId), rootId);
  await shot('02-rejestracja-dodany');
  await page.fill('input[name="deviceId"]', DEVICE_ID);
  await page.click('form.device-add button[type="submit"]');
  await page.waitForSelector('.device-selection-error', { timeout: 5000 }).catch(() => {});
  const dupError = await page.textContent('.device-selection-error').catch(() => '');
  check('Rejestracja: duplikat identyfikatora odrzucony z komunikatem', /już istnieje/.test(dupError ?? ''), dupError);
  await page.click('.device-created .device-open');
  await page.waitForURL('**/hp', { timeout: 10000 });
  check('Rejestracja: przejście do nowego sterownika', page.url().endsWith('/hp'));

  // 2. Wartości domyślne urządzenia (tryb CO automatyczny, 25..30 °C) i pierwsza operacja harmonogramu
  const props = await http('PUT', '/device/properties', { work_mode: 'A', co_min: '25', co_max: '30', cwu_min: '40', cwu_max: '47' });
  check('Ustawienia domyślne urządzenia zapisane', props.status === 200, JSON.stringify(props.body));

  // 3. Start sterownika: wykrywanie czujników, przerwa 90 s, pierwsze odczyty
  await bridge.cmd('boot');
  let firstHp = null;
  for (let k = 0; k < 4; k++) firstHp = (await coCycle()) ?? firstHp;
  check('Łańcuch: telemetria z chpc dociera do serwera', firstHp && firstHp.Tbe !== undefined);
  const stored = await http('GET', '/hp');
  check('Serwer: rekord zapisany dla nowego sterownika', stored.body?.rootId === rootId && stored.body?.HP?.EEVmin !== undefined, `EEVmin=${stored.body?.HP?.EEVmin}`);

  // operacja harmonogramu pojawia się po najbliższym przebiegu schedulera (co 60 s czasu rzeczywistego)
  let gotSchedule = false;
  for (let k = 0; k < 40 && !gotSchedule; k++) {
    await new Promise((r) => setTimeout(r, 2000));
    await coCycle();
    gotSchedule = prefs.work_mode === 'A' && Number(lastHp.Tmax) === 30;
  }
  check('Harmonogram -> co -> chpc: tryb A i T max 30 °C w sterowniku', gotSchedule, `Tmax=${lastHp.Tmax} Tmin=${lastHp.Tmin} work_mode=${prefs.work_mode}`);
  check('Harmonogram -> chpc: T min 25 °C (delta 5)', Number(lastHp.Tmin) === 25, `Tmin=${lastHp.Tmin}`);

  // 4. Cykl grzania: start poniżej T min, zatrzymanie powyżej T max, COP po zakończeniu cyklu
  world.Ttarget = 23.0;
  const started = await cyclesUntil((hp) => Number(hp.HPS) === 1, 20, 'start sprężarki');
  check('Cykl: sprężarka startuje poniżej T min', started > 0, `po ${started} odczytach`);
  const stopped = await cyclesUntil((hp) => Number(hp.HPS) === 0, 400, 'koniec cyklu');
  check('Cykl: sprężarka zatrzymuje się po osiągnięciu T max', stopped > 0, `po ${stopped} odczytach, Ttarget=${world.Ttarget.toFixed(1)}`);
  await coCycle();
  const hpAfter = await http('GET', '/hp');
  check('Cykl: energia i czas cyklu w telemetrii', Number(hpAfter.body?.HP?.lt_pow) > 0 && Number(hpAfter.body?.HP?.lt_hp_on) >= 180, `lt_pow=${hpAfter.body?.HP?.lt_pow} Wh, lt_hp_on=${hpAfter.body?.HP?.lt_hp_on} s`);
  // model zasobnika w teście jest uproszczony (stały odstęp Tho od Ttarget), więc sprawdzamy tylko rząd wielkości
  check('Cykl: COP policzony przez co w wiarygodnym zakresie (1..8)', typeof hpAfter.body?.cop === 'number' && hpAfter.body.cop > 1 && hpAfter.body.cop < 8, `cop=${hpAfter.body?.cop} t_min=${hpAfter.body?.t_min} t_max=${hpAfter.body?.t_max}`);

  await openPage('/hp', '.heat');
  await shot('03-widok-glowny-po-cyklu');

  // 5. Ustawienia z panelu: EEV min 45, limit mocy 3800 W -> co -> chpc
  await openPage('/settings', 'input[name="eev_min_pulse_open"]');
  await page.fill('input[name="eev_min_pulse_open"]', '45');
  await page.fill('input[name="working_watt"]', '3800');
  await page.click('button[data-action="send-operation"]');
  await page.waitForTimeout(800);
  await shot('04-ustawienia-zapis');
  await coCycle();
  await coCycle();
  check('Ustawienia -> chpc: EEV min 45', Number(lastHp.EEVmin) === 45, `EEVmin=${lastHp.EEVmin}`);
  check('Ustawienia -> chpc: limit mocy 3800 W', Number(lastHp.WWatt) === 3800, `WWatt=${lastHp.WWatt}`);
  await openPage('/hp', '.heat');
  const eevMinOnView = await page.textContent('text=EEV min:').then(() => page.evaluate(() => {
    const cells = [...document.querySelectorAll('td.label')];
    const label = cells.find((c) => c.textContent?.includes('EEV min'));
    return label?.nextElementSibling?.textContent ?? '';
  }));
  check('Widok główny: EEV min z telemetrii', eevMinOnView.trim() === '45', eevMinOnView);

  // 6. Błąd: przeciążenie -> ERR 2 -> dzwonek, wiersz na liście, blok w ustawieniach
  world.Ttarget = 23.0;
  await cyclesUntil((hp) => Number(hp.HPS) === 1, 60, 'start przed przeciążeniem');
  await bridge.cmd('power 5000 0');
  await cyclesUntil((hp) => Number(hp.ERR) === 2, 10, 'ERR 2');
  await bridge.cmd('power 1200 0');
  await coCycle();
  const lastError = await http('GET', '/hp/last-error');
  check('Błąd: serwer zapisał przeciążenie (error_code 2)', lastError.body?.error_code === 2, JSON.stringify(lastError.body));
  await openPage('/hp', '.heat');
  check('Błąd: dzwonek na widoku głównym', await page.isVisible('.hp-error-bell'));
  await shot('05-widok-glowny-dzwonek');
  await openPage('/settings', '.settings-errors');
  const errText = await page.textContent('.settings-errors');
  check('Błąd: opis w Ustawieniach', /Przeciążenie/.test(errText ?? ''), (errText ?? '').slice(0, 120));
  await shot('06-ustawienia-blad');
  await openPage('/data', 'table');
  await page.check('input[name="allData"]').catch(() => {});
  await page.waitForTimeout(1500);
  check('Błąd: wiersz z opisem na liście danych', await page.isVisible('tr.error-row'));
  await shot('07-lista-danych-blad');

  // 7. Blokada: 5 błędów -> ERRc 5 -> "Odblokuj" w panelu -> 0x10
  for (let k = 0; k < 5 && Number(lastHp.ERRc) < 5; k++) {
    world.Ttarget = 23.0;
    await cyclesUntil((hp) => Number(hp.HPS) === 1, 60, 'start przed kolejnym przeciążeniem');
    await bridge.cmd('power 5000 0');
    await cyclesUntil((hp) => Number(hp.HPS) === 0, 10, 'zatrzymanie przeciążeniem');
    await bridge.cmd('power 1200 0');
  }
  await coCycle();
  check('Blokada: sterownik zgłasza ERRc 5 i kod 11', Number(lastHp.ERRc) === 5 && Number(lastHp.ERR) === 11, `ERR=${lastHp.ERR} ERRc=${lastHp.ERRc}`);
  await openPage('/settings', '.settings-errors');
  const lockText = await page.textContent('.settings-errors');
  check('Blokada: Ustawienia pokazują zablokowane sterowanie', /zablokowane/.test(lockText ?? ''), (lockText ?? '').slice(0, 160));
  await shot('08-ustawienia-blokada');
  await page.click('text=Odblokuj');
  await page.waitForTimeout(800);
  await coCycle();
  await coCycle();
  check('Blokada: "Odblokuj" -> 0x10 -> licznik błędów 0', Number(lastHp.ERRc) === 0, `ERRc=${lastHp.ERRc}`);
  const unlockFrame = stats.frameLog.some((f) => f.frames.includes('41 10 01 00 ff'));
  check('Blokada: ramka 0x10 wysłana przez co', unlockFrame);

  // 8. Restart z panelu -> 0x11 -> ponowny start sterownika z przerwą 90 s
  await openPage('/settings', '.settings-errors');
  await page.click('text=Restart sterownika');
  await page.waitForTimeout(800);
  const restartsBefore = stats.restarts ?? 0;
  await coCycle();
  await coCycle();
  const restartFrame = stats.frameLog.some((f) => f.frames.includes('41 11 01 00 ff'));
  check('Restart: ramka 0x11 wysłana przez co', restartFrame);
  const restartEvent = stats.frameLog.some((f) => f.events.includes('restart')) || (stats.restarts ?? 0) > restartsBefore;
  check('Restart: sterownik uruchomił się ponownie', restartEvent);
  const afterRestart = await bridge.cmd('state');
  check('Restart: po restarcie sprężarka stoi (przerwa startowa)', afterRestart.compressor === 0, JSON.stringify(afterRestart));

  // 9. Zamarzanie: sprężarka stoi, Tbe -1 °C -> pompa obiegu gorącego (HCS)
  // postój: brak zapotrzebowania na ciepło i przerwa startowa po restarcie za nami
  world.Ttarget = 28.0;
  world.heating = false;
  for (let k = 0; k < 12; k++) await coCycle();
  await cyclesUntil((hp) => Number(hp.HPS) === 0, 400, 'postój');
  await bridge.cmd('temp Tbe -1');
  await cyclesUntil((hp) => Number(hp.HCS) === 1, 5, 'HCS');
  check('Zamarzanie: pompa obiegu gorącego włączona przy Tbe -1 °C', Number(lastHp.HCS) === 1 && Number(lastHp.HPS) === 0);
  await bridge.cmd('temp Tbe 3');
  await cyclesUntil((hp) => Number(hp.HCS) === 0, 5, 'HCS off');
  check('Zamarzanie: pompa wyłączona po Tbe 3 °C', Number(lastHp.HCS) === 0);
  world.heating = true;

  // 10. Utrata czujnika Tbe -> ERR 1 -> powrót czujnika
  await bridge.cmd('connect Tbe 0');
  await cyclesUntil((hp) => Number(hp.ERR) === 1, 5, 'ERR 1');
  check('Czujnik: brak Tbe zgłoszony (ERR 1, Tbe -127)', Number(lastHp.ERR) === 1 && Number(lastHp.Tbe) === -127, `Tbe=${lastHp.Tbe}`);
  await bridge.cmd('connect Tbe 1');
  await cyclesUntil((hp) => Number(hp.Tbe) > -100, 5, 'powrót Tbe');
  check('Czujnik: po powrocie odczyt wraca', Number(lastHp.Tbe) > -100, `Tbe=${lastHp.Tbe}`);

  // 11. Kilka godzin zwykłej pracy, żeby lista danych i wykresy miały treść
  world.Ttarget = 24.0;
  for (let k = 0; k < 240; k++) await coCycle();

  // 12. Układ widoków w trzech szerokościach
  const layoutIssues = await layoutCheck();

  await openPage('/hp', '.heat');
  await shot('09-widok-glowny-koniec');

  writeFileSync(join(OUT, 'e2e-wyniki.json'), JSON.stringify({ rootId, deviceId: DEVICE_ID, results, stats, layoutIssues }, null, 2));
  const failed = results.filter((r) => !r.ok);
  log(`WYNIK: ${results.length - failed.length}/${results.length} kroków OK, odczytów ${stats.polls}, ramek RS-485 ${stats.framesSent}`);
  await browser.close();
  await bridge.cmd('quit');
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  writeFileSync(join(OUT, 'e2e-wyniki.json'), JSON.stringify({ rootId, results, stats, crash: String(e?.stack ?? e) }, null, 2));
  await browser?.close();
  process.exit(2);
});
