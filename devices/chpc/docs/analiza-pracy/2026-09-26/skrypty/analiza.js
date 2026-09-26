// Analiza cyklu pracy sprężarki z telemetrii chpc-web (GET /api/hp/4day?date=RRRR-MM-DD).
// Użycie: node skrypty/analiza.js dane/serwer-2026-09-26.json "2026.09.26 15:50" "2026.09.26 17:20"
// Wynik: dane/cykl.csv i na stdout podsumowanie cyklu, tabela co 5 minut (Markdown) oraz dobieg pomp.
const fs = require('fs');
const path = require('path');

const [file, from, to] = process.argv.slice(2);
const on = v => v === true || Number(v) > 0;
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  .filter(r => r.HP && r.time >= from && r.time <= to)
  .sort((a, b) => a.time.localeCompare(b.time))
  .map(r => {
    const h = r.HP;
    const [d, t] = r.time.split(' ');
    return {
      time: r.time,
      t: Date.parse(d.replace(/\./g, '-') + 'T' + t + 'Z') / 1000,
      HPS: on(h.HPS) ? 1 : 0, F: on(h.F) ? 1 : 0, HCS: on(h.HCS) ? 1 : 0, CCS: on(h.CCS) ? 1 : 0,
      W: +h.Watts, EEV: +h.EEV_pos, Tae: +h.Tae, Tbe: +h.Tbe, SH: +h.Tae - +h.Tbe,
      Tsump: +h.Tsump, Tho: +h.Tho, Ttarget: +h.Ttarget, lt_pow: +h.lt_pow, lt_on: +h.lt_hp_on,
      ERR: +h.ERR, cop: r.cop,
    };
  });

const cols = ['time', 'HPS', 'F', 'HCS', 'CCS', 'W', 'EEV', 'Tae', 'Tbe', 'SH', 'Tsump', 'Tho', 'Ttarget', 'lt_pow', 'lt_on', 'ERR'];
fs.writeFileSync(path.join(path.dirname(file), 'cykl.csv'),
  cols.join(';') + '\n' + rows.map(r => cols.map(c => (typeof r[c] === 'number' ? +r[c].toFixed(2) : r[c])).join(';')).join('\n') + '\n');

const f = (x, n = 1) => (Number.isFinite(x) ? x.toFixed(n).replace('.', ',') : '–');
const run = rows.filter(r => r.HPS);
const a = run[0], b = run[run.length - 1];
const avg = k => run.reduce((s, r) => s + r[k], 0) / run.length;
console.log(`Praca: ${a.time} – ${b.time.slice(11)}, ${f((b.t - a.t) / 60, 0)} min, ${run.length} odczytów`);
console.log(`Energia elektryczna (lt_pow): ${f(b.lt_pow / 1000, 2)} kWh; moc średnia ${f(avg('W'), 0)} W (min ${Math.min(...run.map(r => r.W))}, maks ${Math.max(...run.map(r => r.W))})`);
console.log(`Ttarget ${f(a.Ttarget)} -> ${f(b.Ttarget)} °C; Tho maks ${f(Math.max(...run.map(r => r.Tho)))} °C; Tsump maks ${f(Math.max(...run.map(r => r.Tsump)))} °C`);
console.log(`Przegrzanie (Tae-Tbe) śr ${f(avg('SH'))} K; zawór ${Math.min(...run.map(r => r.EEV))}-${Math.max(...run.map(r => r.EEV))}; błędy: ${[...new Set(run.map(r => r.ERR))].join(',')}`);
console.log(`COP wg co po cyklu: ${rows.map(r => r.cop).filter(c => c !== undefined && c !== null).pop()}`);

console.log('\n| Czas | Min | Moc W | Zawór | Tae−Tbe K | Tae | Tbe | Tsump | Tho | Ttarget | Tsump−Tho | Tho−Ttarget | kWh |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
let next = a.t;
for (const r of run) {
  if (r.t < next && r !== b) continue;
  next = r.t + 300;
  console.log(`| ${r.time.slice(11, 16)} | ${f((r.t - a.t) / 60, 0)} | ${r.W} | ${r.EEV} | ${f(r.SH)} | ${f(r.Tae)} | ${f(r.Tbe)} | ${f(r.Tsump)} | ${f(r.Tho)} | ${f(r.Ttarget)} | ${f(r.Tsump - r.Tho)} | ${f(r.Tho - r.Ttarget)} | ${f(r.lt_pow / 1000, 2)} |`);
}

console.log('\nDobieg pomp po zatrzymaniu:');
for (const r of rows.filter(r => r.t >= b.t && r.t <= b.t + 180)) {
  console.log(`| ${r.time.slice(11)} | HPS=${r.HPS} HCS=${r.HCS} CCS=${r.CCS} | ${r.W} W |`);
}
