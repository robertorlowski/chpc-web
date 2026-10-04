// Testy kotła pelletowego Pellux 200 (baza w mongodb-memory-server): zgłoszenie z
// ustawieniami, ten sam SN jako pompa i kocioł (routing po rodzaju), zapis i
// walidacja odczytu, 404/409, /last, /list (granice doby warszawskiej) oraz
// zapis i walidacja poll_interval_seconds przez PUT /device/properties, ustawienia
// regulatora (surowe odpowiedzi od sterownika, rozkodowanie do grup, walidacja).
import { readFileSync } from 'fs'
import { resolve } from 'path'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { applySchedule } from '../src/modules/pellet-boiler-pelux200/services/pellet-boiler-pelux200-schedule.service'
import { PelletBoilerPelux200Model } from '../src/modules/pellet-boiler-pelux200/models/pellet-boiler-pelux200.model'

const TYPE = 'pellet-boiler-pelux200';
const register = (deviceId: string, deviceType = TYPE) =>
  request(app).post('/api/devices/register').send({ deviceId, deviceType, name: 'Kocioł' });

describe('Kocioł pelletowy Pellux 200', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await PelletBoilerPelux200Model.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('zgłoszenie tworzy urządzenie z ustawieniem 300 s i odsyła je w settings', async () => {
    const res = await register('AABBCC000001');
    expect(res.status).toBe(201);
    expect(res.body.deviceType).toBe(TYPE);
    expect(res.body.settings).toEqual({ poll_interval_seconds: 300 });

    const again = await register('AABBCC000001');
    expect(again.status).toBe(200);
    expect(again.body.rootId).toBe(res.body.rootId);
  });

  it('ten sam deviceId jako pompa i kocioł daje dwa rootId i osobny routing', async () => {
    const sn = 'AABBCC000002';
    const boiler = (await register(sn)).body;
    const hp = (await register(sn, 'heat_pump')).body;
    expect(boiler.rootId).not.toBe(hp.rootId);

    // sam deviceId: każdy endpoint trafia w swój rodzaj
    const add = await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state: 3 });
    expect(add.status).toBe(201);
    const hpAdd = await request(app).post(`/api/hp/add?deviceId=${sn}`)
      .send({ HP: { Ttarget: 40 }, work_mode: 'CWU' });
    expect(hpAdd.status).toBe(201);

    const last = await request(app).get(`/api/pellet-boiler-pelux200/last?rootId=${boiler.rootId}`);
    expect(last.body.rootId).toBe(boiler.rootId);
    expect(last.body.state).toBe(3);

    // rootId pompy na endpoincie kotła i odwrotnie: 409
    expect((await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}&rootId=${hp.rootId}`)
      .send({ state: 1 })).status).toBe(409);
    expect((await request(app).post(`/api/hp/add?deviceId=${sn}&rootId=${boiler.rootId}`)
      .send({ HP: { Ttarget: 40 } })).status).toBe(409);
  });

  it('zapisuje odczyt, pomija nieznane pola i time, odpowiada odstępem odpytywania', async () => {
    const { rootId } = (await register('AABBCC000003')).body;
    const res = await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=AABBCC000003&rootId=${rootId}`)
      .send({
        time: '2026.10.01 12:00:00', state: 3, heating_temp: 63.5, fuel_level: 80,
        boiler_power: 12.4, fan: true, alarm: false, nieznane: 1,
        mixer1_temp: 31.5, mixer1_target: 35, mixer1_pump: true, mixer1_opening: false,
        mixer1_closing: true, mixer3_temp: 20,
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ poll_interval_seconds: 300 });

    const doc = await PelletBoilerPelux200Model.findOne({ rootId }).lean() as Record<string, unknown>;
    expect(doc.heating_temp).toBe(63.5);
    expect(doc.fan).toBe(true);
    expect(doc.alarm).toBe(false);
    expect(doc.deviceType).toBe(TYPE);
    expect(doc.deviceId).toBe('AABBCC000003');
    expect(doc).not.toHaveProperty('nieznane');
    expect(doc).not.toHaveProperty('time');
    // mieszacze 1 i 2 (firmware 1.2.0); mieszacza 3 kontrakt nie ma
    expect(doc.mixer1_temp).toBe(31.5);
    expect(doc.mixer1_target).toBe(35);
    expect(doc.mixer1_pump).toBe(true);
    expect(doc.mixer1_closing).toBe(true);
    expect(doc).not.toHaveProperty('mixer3_temp');
  });

  it('400 dla pustego body, samego time i pól złego typu', async () => {
    const { rootId } = (await register('AABBCC000004')).body;
    const url = `/api/pellet-boiler-pelux200/add?rootId=${rootId}`;
    expect((await request(app).post(url).send({})).status).toBe(400);
    expect((await request(app).post(url).send({ time: '2026.10.01 12:00:00' })).status).toBe(400);
    expect((await request(app).post(url).send({ state: '3' })).status).toBe(400);
    expect((await request(app).post(url).send({ fan: 1 })).status).toBe(400);
    expect((await request(app).post(url).send({ heating_temp: null })).status).toBe(400);
    expect((await request(app).post(url).send({ mixer1_pump: 1 })).status).toBe(400);
  });

  it('404 dla nieznanego deviceId, 409 dla rootId innego urządzenia', async () => {
    expect((await request(app).post('/api/pellet-boiler-pelux200/add?deviceId=NIEMA').send({ state: 1 })).status).toBe(404);
    const { rootId } = (await register('AABBCC000005')).body;
    expect((await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=INNY&rootId=${rootId}`)
      .send({ state: 1 })).status).toBe(409);
  });

  it('/last: {} bez odczytów, potem najnowszy', async () => {
    const { rootId } = (await register('AABBCC000006')).body;
    expect((await request(app).get(`/api/pellet-boiler-pelux200/last?rootId=${rootId}`)).body).toEqual({});
    await request(app).post(`/api/pellet-boiler-pelux200/add?rootId=${rootId}`).send({ heating_temp: 50 });
    await request(app).post(`/api/pellet-boiler-pelux200/add?rootId=${rootId}`).send({ heating_temp: 55 });
    const last = await request(app).get(`/api/pellet-boiler-pelux200/last?rootId=${rootId}`);
    expect(last.body.heating_temp).toBe(55);
    // wymaga rootId
    expect((await request(app).get('/api/pellet-boiler-pelux200/last')).status).toBe(400);
  });

  it('/list: odczyty jednej doby warszawskiej, malejąco; 400 dla złej daty', async () => {
    const { rootId } = (await register('AABBCC000007')).body;
    const make = (createdAt: string, heating_temp: number) => PelletBoilerPelux200Model.create({
      rootId, deviceType: TYPE, deviceId: 'AABBCC000007', heating_temp, createdAt: new Date(createdAt),
    });
    // zima, Warszawa = UTC+1: doba 2026-01-15 to 2026-01-14T23:00Z .. 2026-01-15T23:00Z
    await make('2026-01-14T22:59:59Z', 1);
    await make('2026-01-14T23:00:00Z', 2);
    await make('2026-01-15T12:00:00Z', 3);
    await make('2026-01-15T22:59:59Z', 4);
    await make('2026-01-15T23:00:00Z', 5);

    const res = await request(app).get(`/api/pellet-boiler-pelux200/list?rootId=${rootId}&date=2026-01-15`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { heating_temp: number }) => r.heating_temp)).toEqual([4, 3, 2]);

    expect((await request(app).get(`/api/pellet-boiler-pelux200/list?rootId=${rootId}&date=jutro`)).status).toBe(400);
    // bez date: dzisiaj, a wpisy ze stycznia 2026 nie wchodzą
    const today = await request(app).get(`/api/pellet-boiler-pelux200/list?rootId=${rootId}`);
    expect(today.status).toBe(200);
    expect(today.body).toEqual([]);
  });

  it('PUT /device/properties zapisuje i waliduje poll_interval_seconds', async () => {
    const { rootId } = (await register('AABBCC000008')).body;
    const put = (body: unknown) => request(app).put(`/api/device/properties?rootId=${rootId}`).send(body as object);

    const ok = await put({ poll_interval_seconds: 60 });
    expect(ok.status).toBe(200);
    expect(ok.body.poll_interval_seconds).toBe(60);
    expect((await request(app).get(`/api/device/properties?rootId=${rootId}`)).body.poll_interval_seconds).toBe(60);

    expect((await put({ poll_interval_seconds: 29 })).status).toBe(400);
    expect((await put({ poll_interval_seconds: 3601 })).status).toBe(400);
    expect((await put({ poll_interval_seconds: 45.5 })).status).toBe(400);
    // odrzucony zapis nie zmienia wartości
    expect((await request(app).get(`/api/device/properties?rootId=${rootId}`)).body.poll_interval_seconds).toBe(60);

    // nowe ustawienie dociera do sterownika w odpowiedzi na odczyt
    const add = await request(app).post(`/api/pellet-boiler-pelux200/add?rootId=${rootId}`).send({ state: 0 });
    expect(add.body).toEqual({ poll_interval_seconds: 60 });
  });

  // Prawdziwe odpowiedzi regulatora z kopii ustawień kotła (2026-10-03).
  const archive = JSON.parse(readFileSync(resolve(__dirname,
    '../../devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-03.json'), 'utf-8'));

  it('ustawienia: sterownik wysyła hex samym deviceId, aplikacja dostaje parametry w grupach', async () => {
    const sn = 'AABBCC000009';
    const { rootId } = (await register(sn)).body;
    const empty = await request(app).get(`/api/pellet-boiler-pelux200/settings?rootId=${rootId}`);
    expect(empty.body).toEqual({});

    const post = await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`)
      .send(archive.raw_hex);
    expect(post.status).toBe(201);

    const res = await request(app).get(`/api/pellet-boiler-pelux200/settings?rootId=${rootId}`);
    expect(res.status).toBe(200);
    expect(res.body.deviceId).toBe(sn);
    type Item = { index: number; name: string; value: number; min: number; max: number; unit?: string };
    const all: Item[] = res.body.groups.flatMap((group: { parameters: Item[] }) => group.parameters);
    expect(all).toHaveLength(60);  // tyle parametrów ma wartość w tym kotle
    const byName = (name: string) => all.find((p) => p.name === name);
    expect(byName('heating_target_temp')).toMatchObject({ index: 98, value: 67, min: 65, max: 80, unit: '°C' });
    expect(byName('water_heater_target_temp')).toMatchObject({ index: 119, value: 55 });
    expect(byName('heating_curve_shift')).toMatchObject({ value: 0, min: -20, max: 20 });  // przesunięcie 20
    expect(byName('max_fuel_flow')).toMatchObject({ value: 9.6 });  // krok 0,2
    expect(all.find((p) => p.index === 139)).toMatchObject({ name: null, raw: [50, 0, 100] });
    const boiler = res.body.groups.find((group: { key: string }) => group.key === 'boiler');
    expect(boiler.label).toBe('Kocioł: temperatury i histerezy');

    expect(res.body.mixers).toHaveLength(1);
    expect(res.body.mixers[0].mixer).toBe(1);
    expect(res.body.mixers[0].parameters[0]).toMatchObject({ name: 'mixer_target_temp', value: 40 });
  });

  it('ustawienia: 400 bez parametrów kotła, dla złego hex i nie-napisu', async () => {
    const sn = 'AABBCC00000A';
    await register(sn);
    const post = (body: unknown) =>
      request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(body as object);
    expect((await post({})).status).toBe(400);
    expect((await post({ mixer_parameters: archive.raw_hex.mixer_parameters })).status).toBe(400);
    expect((await post({ ecomax_parameters: 'zz00' })).status).toBe(400);
    expect((await post({ ecomax_parameters: '000' })).status).toBe(400);
    expect((await post({ ecomax_parameters: 12 })).status).toBe(400);
  });

  it('zmiana parametrów: aplikacja zleca, sterownik odbiera po kolei i potwierdza', async () => {
    const sn = 'AABBCC000011';
    const { rootId } = (await register(sn)).body;
    const commands = `/api/pellet-boiler-pelux200/commands?rootId=${rootId}`;
    const next = () => request(app).get(`/api/pellet-boiler-pelux200/commands/next?deviceId=${sn}`);
    const result = (body: object) => request(app).post(`/api/pellet-boiler-pelux200/commands/result?deviceId=${sn}`).send(body);

    // bez odczytu ustawień nie ma zakresów: 400
    expect((await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 50 }] })).status).toBe(400);
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archive.raw_hex).expect(201);

    // walidacja: zakres regulatora (CWU 20–70), parametr nieużywany, typy, mieszacz bez numeru
    const bad = async (change: object) =>
      expect((await request(app).post(commands).send({ changes: [change] })).status).toBe(400);
    await bad({ kind: 'ecomax', index: 119, value: 75 });
    await bad({ kind: 'ecomax', index: 3, value: 1 });
    await bad({ kind: 'ecomax', index: 119, value: '50' });
    await bad({ kind: 'mixer', index: 0, value: 45 });
    expect((await request(app).post(commands).send({ changes: [] })).status).toBe(400);

    // dwie zmiany w kolejności; trzecia zastępuje oczekującą zmianę CWU
    const created = await request(app).post(commands).send({ changes: [
      { kind: 'ecomax', index: 119, value: 45 },
      { kind: 'mixer', mixer: 1, index: 0, value: 45 },
    ] });
    expect(created.status).toBe(201);
    expect(created.body[0]).toMatchObject({ kind: 'ecomax', index: 119, value: 45, previous: 55, status: 'pending' });
    await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 48 }] }).expect(201);

    // sterownik: najpierw mieszacz (zmiana CWU 45 zastąpiona), potem CWU 48, potem nic
    const first = (await next()).body;
    expect(first).toMatchObject({ kind: 'mixer', mixer: 1, index: 0, value: 45 });
    expect((await result({ id: first.id, ok: true })).status).toBe(201);
    expect((await result({ id: first.id, ok: true })).status).toBe(404);
    const second = (await next()).body;
    expect(second).toMatchObject({ kind: 'ecomax', mixer: 0, index: 119, value: 48 });
    await result({ id: second.id, ok: false, error: 'brak potwierdzenia 0xB3' }).expect(201);
    expect((await next()).body).toEqual({});

    // zależny zakres: zadana kotła 30 przy minimum 65 tylko razem z obniżeniem minimum (wcześniej w zleceniu)
    expect((await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 98, value: 30 }] })).status).toBe(400);
    const pump = await request(app).post(commands).send({ changes: [
      { kind: 'ecomax', index: 99, value: 30 }, { kind: 'ecomax', index: 98, value: 30 },
    ] });
    expect(pump.status).toBe(201);
    await request(app).post(commands).send({ changes: [
      { kind: 'ecomax', index: 98, value: 30 }, { kind: 'ecomax', index: 99, value: 30 },
    ] }).expect(400);
    for (const command of pump.body) {
      const taken = (await next()).body;
      expect(taken.id).toBe(String(command._id));
      await result({ id: taken.id, ok: true }).expect(201);
    }

    const history = (await request(app).get(commands)).body.slice(2);
    expect(history.map((c: { status: string }) => c.status)).toEqual(['error', 'done', 'replaced']);
    expect(history[0].error).toBe('brak potwierdzenia 0xB3');
  });

  it('zmiana trybu przy wyłączonym kotle: wyłącz, nastawy czekają na stan 0, na końcu włącz', async () => {
    const sn = 'AABBCC000013';
    const { rootId } = (await register(sn)).body;
    const commands = `/api/pellet-boiler-pelux200/commands?rootId=${rootId}`;
    const next = () => request(app).get(`/api/pellet-boiler-pelux200/commands/next?deviceId=${sn}`);
    const result = (id: string) => request(app).post(`/api/pellet-boiler-pelux200/commands/result?deviceId=${sn}`).send({ id, ok: true });
    const reading = (state: number) =>
      request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state, heating_temp: 40 }).expect(201);
    const pause = () => new Promise((done) => setTimeout(done, 5));
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archive.raw_hex).expect(201);
    await reading(3);
    await pause();

    expect((await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 45, waitOff: 'tak' }] })).status).toBe(400);
    const created = await request(app).post(commands).send({ changes: [
      { kind: 'control', index: 0, value: 0 },
      { kind: 'ecomax', index: 119, value: 45, waitOff: true },
      { kind: 'control', index: 0, value: 1, waitOff: true },
    ] });
    expect(created.status).toBe(201);
    // „włącz” w tym samym zleceniu nie zastępuje „wyłącz”
    expect(created.body.map((c: { status: string }) => c.status)).toEqual(['pending', 'pending', 'pending']);

    const off = (await next()).body;
    expect(off).toMatchObject({ kind: 'control', value: 0 });
    await result(off.id).expect(201);
    // kocioł jeszcze pracuje (albo wygasza): nastawy czekają
    expect((await next()).body).toEqual({});
    await pause();
    await reading(7);
    expect((await next()).body).toEqual({});
    await pause();
    await reading(0);
    const cwu = (await next()).body;
    expect(cwu).toMatchObject({ kind: 'ecomax', index: 119, value: 45 });
    await result(cwu.id).expect(201);
    const on = (await next()).body;
    expect(on).toMatchObject({ kind: 'control', value: 1 });
    await result(on.id).expect(201);
    expect((await next()).body).toEqual({});
  });

  // Kopia ustawień z 2026-10-04: minimalna temperatura kotła 30 °C (tryb pompy ciepła), CWU 40 / histereza 5.
  const archiveHeatPump = JSON.parse(readFileSync(resolve(__dirname,
    '../../devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-04.json'), 'utf-8'));

  it('harmonogram: CWU od–do osobno dla trybu, tryb z odczytu ustawień, zlecenia tylko przy zmianie', async () => {
    const sn = 'AABBCC000012';
    const { rootId } = (await register(sn)).body;
    const api = (path: string) => `/api/pellet-boiler-pelux200/${path}?rootId=${rootId}`;
    const commands = async () => (await request(app).get(api('commands'))).body as { kind: string; index: number; value: number; status: string }[];
    // kocioł w postoju (stan 5) — włączony, więc „włącz” nie jest zlecane
    await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state: 5 }).expect(201);

    // wartości startowe: wyłączony, pompa ciepła 35–40, pellet 40–55, nastawy trybów
    const start = (await request(app).get(api('schedule-settings'))).body;
    expect(start).toMatchObject({ enabled: false, defaults: { 'heat-pump': { cwuFrom: 35, cwuTo: 40 }, pellet: { cwuFrom: 40, cwuTo: 55 } } });
    expect(start.profiles['heat-pump']['ecomax:99']).toBe(30);

    // walidacja
    expect((await request(app).post(api('schedules')).send({ mode: 'gas', dayOfWeek: -1, startTime: '05:00', endTime: '06:00', cwuFrom: 40, cwuTo: 43 })).status).toBe(400);
    expect((await request(app).post(api('schedules')).send({ mode: 'heat-pump', dayOfWeek: -1, startTime: '05:00', endTime: '06:00', cwuFrom: 43, cwuTo: 40 })).status).toBe(400);
    expect((await request(app).put(api('schedule-settings')).send({ ...start, profiles: { pellet: { 'ecomax:98': 300 } } })).status).toBe(400);

    // wpisy tylko dla pompy ciepła
    await request(app).post(api('schedules')).send({ mode: 'heat-pump', dayOfWeek: -1, startTime: '05:00', endTime: '06:00', cwuFrom: 40, cwuTo: 43 }).expect(201);
    await request(app).post(api('schedules')).send({ mode: 'heat-pump', dayOfWeek: -1, startTime: '13:00', endTime: '15:00', cwuFrom: 40, cwuTo: 43 }).expect(201);

    // bez odczytu ustawień nie wiadomo, który tryb działa: błąd, bez zleceń
    await request(app).put(api('schedule-settings')).send({ ...start, enabled: true }).expect(200);
    expect((await request(app).get(api('schedules/current'))).body.lastError).toMatch(/Brak odczytu/);

    // pellet (kopia z 3.10: minimum 65): domyślne 40–55 = CWU 55 / histereza 15, już takie — nic do zlecenia
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archive.raw_hex).expect(201);
    await applySchedule(rootId, new Date('2026-10-05T03:30:00Z'));  // 05:30 w Warszawie, ale wpisy są pompy ciepła
    expect((await commands()).map((c) => `${c.kind}:${c.index}=${c.value}`)).toEqual([]);

    // pompa ciepła (kopia z 4.10: minimum 30, CWU 40 / 5): w oknie 05:00–06:00 CWU 43 / 3
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archiveHeatPump.raw_hex).expect(201);
    await applySchedule(rootId, new Date('2026-10-05T03:30:00Z'));
    expect((await commands()).map((c) => [c.kind, c.index, c.value]).sort()).toEqual([['ecomax', 119, 43], ['ecomax', 123, 3]]);
    const current = (await request(app).get(api('schedules/current'))).body;
    expect(current).toMatchObject({ enabled: true, mode: 'heat-pump', lastError: null });

    // ten sam stan: nic nowego; po oknie domyślne 35–40 (CWU 40 / 5 jak w odczycie, więc zastępuje oczekujące)
    const count = (await commands()).length;
    await applySchedule(rootId, new Date('2026-10-05T03:50:00Z'));
    expect((await commands()).length).toBe(count);
    await applySchedule(rootId, new Date('2026-10-05T06:00:00Z'));

    // włączania i wyłączania kotła w harmonogramie już nie ma: wpis pracy kotła jest odrzucany
    await request(app).post(api('schedules')).send({ type: 'work', mode: 'heat-pump', on: false, dayOfWeek: -1, startTime: '22:00', endTime: '05:00' }).expect(400);

    // harmonogram nie działa („Wyłącz regulator”): kolejne przebiegi nic nie zlecają, także w oknie CWU;
    // harmonogram nigdy nie zleca włącz/wyłącz regulatora (robią to przyciski)
    const settings = (await request(app).get(api('schedule-settings'))).body;
    expect(settings.defaults['heat-pump']).toEqual({ cwuFrom: 35, cwuTo: 40 });
    await request(app).put(api('schedule-settings')).send({ ...settings, enabled: false }).expect(200);
    const stopped = (await commands()).length;
    await applySchedule(rootId, new Date('2026-10-06T03:30:00Z'));
    expect((await commands()).length).toBe(stopped);

    // znów działa: w oknie 05:00–06:00 od razu CWU 43 / 3
    await request(app).put(api('schedule-settings')).send({ ...settings, enabled: true }).expect(200);
    await applySchedule(rootId, new Date('2026-10-06T03:30:00Z'));
    expect((await commands()).length).toBeGreaterThan(stopped);
    expect((await commands()).some((c) => c.kind === 'control')).toBe(false);
  });
});
