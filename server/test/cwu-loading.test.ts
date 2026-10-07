// Ładowanie CWU w kotle w trybie pompy ciepła (baza w mongodb-memory-server): pompa ciepła dostaje
// CO i CWU 47–49 °C na czas ładowania (PUT /hp/cwu-loading), wraca do harmonogramu po ładowaniu
// i po wygaśnięciu bez odświeżenia; kocioł wykrywa ładowanie z pompy CWU i trybu, zgłasza je przez API
// (tu: serwer nasłuchuje na losowym porcie, INTERNAL_API_URL); CWU w trybie pompy ciepła najwyżej 45 °C,
// zmiana z panelu wraca do harmonogramu.
import { readFileSync } from 'fs'
import { AddressInfo } from 'net'
import { Server } from 'http'
import { resolve } from 'path'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { CWU_LOADING_TTL_MS, syncCwuLoading } from '../src/modules/heat-pump/services/cwu-loading.service'
import { getOperationData, replaceOperationData } from '../src/modules/heat-pump/services/operation.service'
import { evaluateCwuLoading } from '../src/modules/pellet-boiler-pelux200/services/pellet-boiler-pelux200-cwu-loading.service'
import { applySchedule } from '../src/modules/pellet-boiler-pelux200/services/pellet-boiler-pelux200-schedule.service'
import { checkAutoPellet } from '../src/modules/pellet-boiler-pelux200/services/pellet-boiler-pelux200-auto-pellet.service'

const archiveHeatPump = JSON.parse(readFileSync(resolve(__dirname,
  '../../devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-04.json'), 'utf-8'));
const archivePellet = JSON.parse(readFileSync(resolve(__dirname,
  '../../devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-03.json'), 'utf-8'));

const register = (deviceId: string, deviceType: string) =>
  request(app).post('/api/devices/register').send({ deviceId, deviceType });

describe('Ładowanie CWU (kocioł w trybie pompy ciepła)', () => {
  let mongoServer: MongoMemoryServer;
  let server: Server;
  let pumpRoot: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    server = app.listen(0);
    process.env.INTERNAL_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    pumpRoot = (await register('AABBCC0000A1', 'heat_pump')).body.rootId;
    // operacja z harmonogramu pompy: CO 30–35, CWU 40–45
    replaceOperationData(pumpRoot, { work_mode: 'A', co_min: '30', co_max: '35', cwu_min: '40', cwu_max: '45' });
  });

  afterAll(async () => {
    delete process.env.INTERNAL_API_URL;
    server.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const hp = (path: string) => `/api/hp/${path}?rootId=${pumpRoot}`;
  const operation = () => getOperationData(pumpRoot);

  it('pompa: na czas ładowania CO i CWU 47–49 °C, po ładowaniu wraca harmonogram', async () => {
    expect((await request(app).put(hp('cwu-loading')).send({ active: 'tak' })).status).toBe(400);

    const on = await request(app).put(hp('cwu-loading')).send({ active: true, since: '2026-10-04T12:00:00Z' });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ active: true, since: '2026-10-04T12:00:00.000Z', pumpOff: false });
    expect(operation()).toMatchObject({ work_mode: 'A', co_min: '47', co_max: '49', cwu_min: '47', cwu_max: '49' });
    // ponowne zgłoszenie nie przesuwa początku
    await request(app).put(hp('cwu-loading')).send({ active: true, since: '2026-10-04T12:05:00Z' }).expect(200);
    expect((await request(app).get(hp('cwu-loading'))).body.since).toBe('2026-10-04T12:00:00.000Z');

    const off = await request(app).put(hp('cwu-loading')).send({ active: false });
    expect(off.body).toMatchObject({ active: false, since: null });
    expect(operation()).toMatchObject({ co_min: '30', co_max: '35', cwu_min: '40', cwu_max: '45' });
  });

  it('pompa: ładowanie bez odświeżenia wygasa, pompa w trybie OFF jest zgłaszana', async () => {
    await request(app).put(hp('cwu-loading')).send({ active: true }).expect(200);
    expect(await syncCwuLoading(pumpRoot, new Date(Date.now() + CWU_LOADING_TTL_MS + 1000))).toBe(false);
    expect(operation().co_max).toBe('35');

    replaceOperationData(pumpRoot, { work_mode: 'OFF', co_min: '30', co_max: '35', cwu_min: '40', cwu_max: '45' });
    expect((await request(app).put(hp('cwu-loading')).send({ active: true })).body.pumpOff).toBe(true);
    await request(app).put(hp('cwu-loading')).send({ active: false }).expect(200);
    replaceOperationData(pumpRoot, { work_mode: 'A', co_min: '30', co_max: '35', cwu_min: '40', cwu_max: '45' });
  });

  it('kocioł: ładowanie = tryb pompy ciepła i pompa CWU, zgłaszane pompie przez API', async () => {
    const sn = 'AABBCC0000B1';
    const boilerRoot = (await register(sn, 'pellet-boiler-pelux200')).body.rootId;
    await request(app).put(`/api/devices/${boilerRoot}`).send({ boilerConfig: { heatPumpRootId: pumpRoot } }).expect(200);
    const reading = (body: object) => request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send(body).expect(201);
    const boiler = () => request(app).get(`/api/pellet-boiler-pelux200/cwu-loading?rootId=${boilerRoot}`);

    // tryb pompy ciepła (minimum kotła 30): pompa CWU pracuje → ładowanie
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archiveHeatPump.raw_hex).expect(201);
    await reading({ state: 5, water_heater_pump: true, water_heater_temp: 38 });
    const loading = await evaluateCwuLoading(boilerRoot);
    expect(loading).toMatchObject({ active: true, heatPumpOff: false });
    expect(operation().cwu_max).toBe('49');
    expect((await boiler()).body.active).toBe(true);

    // pompa CWU staje → koniec ładowania, pompa ciepła wraca do harmonogramu
    await reading({ state: 5, water_heater_pump: false, water_heater_temp: 44 });
    expect((await evaluateCwuLoading(boilerRoot)).active).toBe(false);
    expect(operation().cwu_max).toBe('45');

    // tryb Pellet (minimum 65): pompa CWU to zwykłe ładowanie z kotła, pompa ciepła bez zmian
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archivePellet.raw_hex).expect(201);
    await reading({ state: 3, water_heater_pump: true });
    expect((await evaluateCwuLoading(boilerRoot)).active).toBe(false);
    expect(operation().cwu_max).toBe('45');
  });

  it('rozpalanie w trybie pompy ciepła: nastawy Pellet bez wyłączania, komunikat do „OK”', async () => {
    const sn = 'AABBCC0000B3';
    const boilerRoot = (await register(sn, 'pellet-boiler-pelux200')).body.rootId;
    await request(app).put(`/api/devices/${boilerRoot}`).send({ boilerConfig: { heatPumpRootId: pumpRoot } }).expect(200);
    const api = (path: string) => `/api/pellet-boiler-pelux200/${path}?rootId=${boilerRoot}`;
    const reading = (state: number) => request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state }).expect(201);
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archiveHeatPump.raw_hex).expect(201);

    const commands = async () => ((await request(app).get(api('commands'))).body as
      { kind: string; mixer?: number; index: number; value: number }[]).reverse();
    const settle = () => new Promise((done) => setTimeout(done, 300));

    // postój w trybie pompy ciepła: nic (sprawdzenie idzie samo po każdym odczycie)
    await reading(5);
    await settle();
    expect(await commands()).toEqual([]);

    // rozpalanie: zadana przed minimum (kotła i mieszacza), bez „wyłącz”
    await reading(2);
    await settle();
    const changes = await commands();
    const keys = changes.map((c) => `${c.kind}${c.mixer ?? ''}:${c.index}=${c.value}`);
    expect(keys.indexOf('ecomax:98=67')).toBeLessThan(keys.indexOf('ecomax:99=65'));
    expect(keys.indexOf('mixer1:0=40')).toBeLessThan(keys.indexOf('mixer1:1=40'));
    expect(keys).toContain('ecomax:17=12');
    expect(changes.some((c) => c.kind === 'control')).toBe(false);
    const pellet = (await request(app).get(api('auto-pellet'))).body;
    expect(pellet).toMatchObject({ acknowledged: false, changes: changes.length });

    // do „OK” nie powtarza; po „OK” komunikat znika
    expect(await checkAutoPellet(boilerRoot)).toBeNull();
    await request(app).post(api('auto-pellet/ack')).expect(200);
    expect((await request(app).get(api('auto-pellet'))).body).toBeNull();
  });

  it('tryb pompy ciepła: CWU najwyżej 45 °C, zmiana z panelu wraca do harmonogramu', async () => {
    const sn = 'AABBCC0000B2';
    const boilerRoot = (await register(sn, 'pellet-boiler-pelux200')).body.rootId;
    await request(app).put(`/api/devices/${boilerRoot}`).send({ boilerConfig: { heatPumpRootId: pumpRoot } }).expect(200);
    const api = (path: string) => `/api/pellet-boiler-pelux200/${path}?rootId=${boilerRoot}`;
    const base = { dayOfWeek: -1, startTime: '05:00', endTime: '06:00' };
    expect((await request(app).post(api('schedules')).send({ ...base, mode: 'heat-pump', cwuFrom: 40, cwuTo: 46 })).status).toBe(400);
    await request(app).post(api('schedules')).send({ ...base, mode: 'heat-pump', cwuFrom: 40, cwuTo: 45 }).expect(201);
    await request(app).post(api('schedules')).send({ ...base, mode: 'pellet', cwuFrom: 40, cwuTo: 60 }).expect(201);
    const settings = (await request(app).get(api('schedule-settings'))).body;
    const defaults = { ...settings.defaults, 'heat-pump': { cwuFrom: 40, cwuTo: 50 } };
    expect((await request(app).put(api('schedule-settings')).send({ ...settings, defaults })).status).toBe(400);

    // harmonogram działa, tryb pompy ciepła; poza oknem CWU 35–40 = 40 / 5, jak w kopii ustawień — nic
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archiveHeatPump.raw_hex).expect(201);
    await request(app).put(api('schedule-settings')).send({ ...settings, enabled: true }).expect(200);
    await applySchedule(boilerRoot, new Date('2026-10-05T10:00:00Z'));
    const commands = async () => (await request(app).get(api('commands'))).body as { index: number; value: number }[];
    expect(await commands()).toEqual([]);

    // ktoś ustawił na panelu CWU 50 (odczyt kotła): harmonogram przywraca 40
    await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state: 5, water_heater_target: 50 }).expect(201);
    await applySchedule(boilerRoot, new Date('2026-10-05T10:01:00Z'));
    expect((await commands()).map((c) => [c.index, c.value])).toEqual([[119, 40]]);
  });
});
