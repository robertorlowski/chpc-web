// Symulator sterownika włącznika (switch) dla środowiska lokalnego (npm run local):
// zgłoszenie z liczbą przekaźników, potem co 5 s zgłoszenie stanu (POST /switch/state)
// i wykonanie poleceń tak jak firmware: włącz (na offAfterS albo bez limitu) / wyłącz,
// z lokalnym odliczaniem. Komunikat WebSocket "operation" budzi go od razu.
//
//   node scripts/simulate-switch.mjs                 1 przekaźnik, działa do Ctrl+C
//   node scripts/simulate-switch.mjs --relays 2      2 przekaźniki
//   node scripts/simulate-switch.mjs --history       dodatkowo włączenia z 7 dni wprost do bazy lokalnej
//
// API: http://localhost:4001/api (zmienna API), SN: SIMULATED_SN albo 4C0000000E2E.
import mongoose from 'mongoose';
import WebSocket from 'ws';
import { LOCAL_DB_URI } from './local-dev.mjs';

const API = process.env.API ?? 'http://localhost:4001/api';
const SERIAL = process.env.SIMULATED_SN ?? '4C0000000E2E';
const argv = process.argv.slice(2);
const relayCount = Number(argv[argv.indexOf('--relays') + 1]) || 1;
const startedAt = Date.now();

async function request(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const registration = await request('POST', '/devices/register', {
  deviceId: SERIAL, deviceType: 'switch', name: 'Włącznik', version: '0.0.0-sim', ip: '127.0.0.1', relays: relayCount,
});
const rootId = registration.rootId;
console.log(`Zgłoszenie: rootId ${rootId}, przekaźników ${relayCount}, domyślnie ${registration.settings?.default_on_minutes} min`);

if (argv.includes('--history')) {
  // 1–3 włączenia dziennie na przekaźnik przez 7 dni
  await mongoose.connect(LOCAL_DB_URI);
  const documents = [];
  for (let day = 7; day >= 1; day--) {
    for (let relay = 1; relay <= relayCount; relay++) {
      for (let index = 0; index < 1 + ((day + relay) % 3); index++) {
        const onAt = new Date(Date.now() - day * 86400000);
        onAt.setHours(6 + index * 6 + relay, (day * 11 + index * 7) % 60, 0, 0);
        const offAt = new Date(onAt.getTime() + (15 + ((day + index) % 4) * 15) * 60000);
        documents.push({
          rootId, deviceId: SERIAL, relay, onAt, offAt,
          source: index === 1 ? 'app' : 'schedule', approximate: false, createdAt: onAt, updatedAt: offAt,
        });
      }
    }
  }
  await mongoose.connection.collection('switch_activations').insertMany(documents);
  console.log(`Historia: ${documents.length} włączeń z 7 dni`);
  await mongoose.disconnect();
}

// stan przekaźników jak w firmware: włączony, od kiedy, kiedy wyłączyć (null = bez limitu)
const relays = Array.from({ length: relayCount }, () => ({ on: false, changedAt: Date.now(), offAt: null }));
const setRelay = (relay, on) => {
  if (relay.on !== on) {
    relay.on = on;
    relay.changedAt = Date.now();
  }
};

async function exchange() {
  // lokalne odliczanie: bez łączności przekaźnik i tak się wyłączy
  for (const relay of relays) if (relay.on && relay.offAt && Date.now() >= relay.offAt) setRelay(relay, false);
  try {
    const response = await request('POST', `/switch/state?deviceId=${SERIAL}&rootId=${rootId}`, {
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      relays: relays.map((relay) => ({ on: relay.on, changedS: Math.round((Date.now() - relay.changedAt) / 1000) })),
    });
    response.relays.forEach((command, index) => {
      const relay = relays[index];
      setRelay(relay, command.on);
      relay.offAt = command.on && command.offAfterS ? Date.now() + command.offAfterS * 1000 : null;
    });
    const states = relays.map((relay, index) =>
      `P${index + 1}: ${relay.on ? `ON${relay.offAt ? ` (${Math.round((relay.offAt - Date.now()) / 1000)} s)` : ''}` : 'off'}`);
    console.log(new Date().toLocaleTimeString('pl-PL'), states.join('  '));
  } catch (error) {
    console.error(String(error));
  }
}

const ws = new WebSocket(`${API.replace(/^http/, 'ws').replace(/\/api$/, '')}/ws?rootId=${rootId}`);
ws.on('message', (data) => {
  if (JSON.parse(String(data)).type === 'operation') void exchange();
});
ws.on('error', () => console.warn('WebSocket niedostępny: tylko odpytywanie co 5 s'));

await exchange();
setInterval(() => void exchange(), 5000);
