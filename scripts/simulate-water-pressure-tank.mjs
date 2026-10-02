// Symulator sterownika hydroforu (water-pressure-tank) dla środowiska lokalnego
// (npm run local): zgłoszenie w chmurze, jedno uruchomienie pompy na żywo
// (wiadomość co 1 s, jak sterownik) i uruchomienie z kolejki.
//
//   node scripts/simulate-water-pressure-tank.mjs              zgłoszenie + uruchomienie na żywo (ok. 45 s)
//   node scripts/simulate-water-pressure-tank.mjs --history    dodatkowo historia z 60 dni wprost do bazy lokalnej
//   node scripts/simulate-water-pressure-tank.mjs --fast       uruchomienie na żywo skrócone do kilku wiadomości
//
// API: http://localhost:4001/api (zmienna API), SN: SIMULATED_SN albo C3000000E2E1.
import mongoose from 'mongoose';
import { LOCAL_DB_URI } from './local-dev.mjs';

const API = process.env.API ?? 'http://localhost:4001/api';
const SERIAL = process.env.SIMULATED_SN ?? 'C3000000E2E1';
const args = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const registration = await post('/devices/register', {
  deviceId: SERIAL, deviceType: 'water-pressure-tank', name: 'Hydrofor',
});
console.log(`Zgłoszenie: rootId ${registration.rootId}, kompresor ${registration.settings?.compressor_seconds} s`);
const query = `?deviceId=${SERIAL}&rootId=${registration.rootId}`;

if (args.has('--history')) {
  // 2–5 uruchomień dziennie przez 60 dni; wodę policzy serwer z czasu pompy i wodomierza
  await mongoose.connect(LOCAL_DB_URI);
  const runs = mongoose.connection.collection('water_pressure_tank');
  const last = await runs.find({ rootId: registration.rootId }).sort({ runId: -1 }).limit(1).toArray();
  let runId = (last[0]?.runId ?? 1000) + 1;
  const documents = [];
  for (let day = 60; day >= 1; day--) {
    const count = 2 + (day % 4);
    for (let index = 0; index < count; index++) {
      const pumpStart = new Date(Date.now() - day * 86400000);
      pumpStart.setHours(6 + index * 4, (day * 7 + index * 13) % 60, 0, 0);
      const pumpSeconds = 70 + ((day + index) % 5) * 15;
      documents.push({
        rootId: registration.rootId, deviceType: 'water-pressure-tank', deviceId: SERIAL, runId: runId++,
        pumpStart, pumpEnd: new Date(pumpStart.getTime() + pumpSeconds * 1000),
        compressorStart: new Date(pumpStart.getTime() + 1000), compressorEnd: new Date(pumpStart.getTime() + 31000),
        restarts: 0, manualSeconds: 0,
        timeApproximate: day % 17 === 0, lastSeenAt: new Date(pumpStart.getTime() + pumpSeconds * 1000),
        createdAt: pumpStart, updatedAt: pumpStart,
      });
    }
  }
  await runs.insertMany(documents);
  console.log(`Historia: ${documents.length} uruchomień z 60 dni`);
  await mongoose.disconnect();
}

// uruchomienie z kolejki (bez sieci przy poprzednim starcie)
const queuedRunId = Math.floor(Date.now() / 1000);
await post(`/water-pressure-tank/add${query}`, {
  runId: queuedRunId, pumpRunS: 95, compressorStartS: 1, compressorEndS: 31, restarts: 0, queued: true,
});
console.log('Wysłano uruchomienie z kolejki (czas przybliżony)');

// uruchomienie na żywo: kompresor 1–31 s, pompa do końca, wiadomość co 1 s
const liveRunId = queuedRunId + 1;
const totalSeconds = args.has('--fast') ? 4 : 45;
const compressorSeconds = args.has('--fast') ? 2 : 30;
for (let second = 1; second <= totalSeconds; second++) {
  const compressorEnd = second >= 1 + compressorSeconds ? 1 + compressorSeconds : undefined;
  await post(`/water-pressure-tank/add${query}`, {
    runId: liveRunId, pumpRunS: second, compressorStartS: 1, compressorEndS: compressorEnd, restarts: 0,
  });
  process.stdout.write(`\rNa żywo: pompa ${second} s, kompresor ${compressorEnd ? 'wyłączony' : 'pracuje'}   `);
  await sleep(1000);
}
console.log('\nKoniec: sterownik „traci zasilanie”, serwer zamyka uruchomienie po ostatniej wiadomości.');
