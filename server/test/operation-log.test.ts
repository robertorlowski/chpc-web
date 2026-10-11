// Testy dziennika operacji (zakładka „Operacje”, baza w mongodb-memory-server): status operacji ze statusów
// zleceń, zlecenie z aplikacji na kotle (kto, co, dlaczego) z przejściem czeka → wysłana → wykonana / błąd /
// zastąpiona, podział dnia na zaplanowane i wykonane, przejścia harmonogramu kotła do końca doby i walidacja daty;
// pompa ciepła (tylko zmiany operacji, dostarczona w /hp/add), włącznik (tryb, harmonogram, potwierdzenie stanem),
// hydrofor (ustawienia do zgłoszenia, zmiana na stronie sterownika) i zlecenie aktualizacji firmware.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { aggregateStatus, getOperationsDay, logOperation, systemMeta } from '../src/core/services/operation-log.service'
import { plannedScheduleOperations } from '../src/modules/pellet-boiler-pelux200/services/pellet-boiler-pelux200-schedule.service'
import { OperationLogModel } from '../src/core/models/operation-log.model'
import { DeviceModel } from '../src/core/models/device.model'
import { DeviceType } from '../src/core/types'
import { ScheduleType } from '../src/modules/heat-pump/types'
import { plannedSchedulerOperations, runSchedulerOnce } from '../src/modules/heat-pump/services/scheduler.service'
import { SwitchRelayModel } from '../src/modules/switch/models/switch-relay.model'
import { reportState, setRelayMode } from '../src/modules/switch/services/switch.service'
import { noteModeChange, plannedSwitchOperations } from '../src/modules/switch/services/switch-operation-log.service'

const TYPE = 'pellet-boiler-pelux200';
const register = (deviceId: string) =>
  request(app).post('/api/devices/register').send({ deviceId, deviceType: TYPE, name: 'Kocioł' });
const archive = JSON.parse(readFileSync(resolve(__dirname,
  '../../devices/pellet-boiler-pelux200/docs/ustawienia-kotla-2026-10-03.json'), 'utf-8'));

describe('Dziennik operacji', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('status operacji ze statusów zleceń', () => {
    expect(aggregateStatus(['done', 'error'])).toBe('error');
    expect(aggregateStatus(['replaced', 'replaced'])).toBe('replaced');
    expect(aggregateStatus(['done', 'replaced'])).toBe('done');
    expect(aggregateStatus(['done', 'pending'])).toBe('pending');
    expect(aggregateStatus(['done', 'sent'])).toBe('sent');
  });

  it('zlecenie z aplikacji: kto, co, dlaczego i status do wykonania, błąd i zastąpienie', async () => {
    const sn = 'AABBCC0000A1';
    const { rootId } = (await register(sn)).body;
    await request(app).post(`/api/pellet-boiler-pelux200/add?deviceId=${sn}`).send({ state: 0 }).expect(201);
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archive.raw_hex).expect(201);
    const commands = `/api/pellet-boiler-pelux200/commands?rootId=${rootId}`;
    const day = async () => (await request(app).get(`/api/operations?rootId=${rootId}`).expect(200)).body;
    const next = () => request(app).get(`/api/pellet-boiler-pelux200/commands/next?deviceId=${sn}`);
    const result = (body: object) => request(app).post(`/api/pellet-boiler-pelux200/commands/result?deviceId=${sn}`).send(body);

    await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 45 }], reason: 'Test: panel CWU.' }).expect(201);
    let log = await day();
    expect(log.today).toBe(true);
    expect(log.planned).toHaveLength(1);
    expect(log.planned[0]).toMatchObject({
      actor: { type: 'user', name: 'Użytkownik (aplikacja)' }, source: 'Ustawienia', status: 'pending', reason: 'Test: panel CWU.',
    });
    expect(log.planned[0].action).toMatch(/55 → 45/);

    // druga zmiana CWU zastępuje oczekującą: pierwsza operacja przechodzi do wykonanych jako zastąpiona
    await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 48 }] }).expect(201);
    log = await day();
    expect(log.planned).toHaveLength(1);
    expect(log.planned[0].reason).toBe('Zmiana w Ustawieniach.');
    expect(log.done.map((entry: { status: string }) => entry.status)).toEqual(['replaced']);

    const taken = (await next()).body;
    expect((await day()).planned[0].status).toBe('sent');
    await result({ id: taken.id, ok: true }).expect(201);
    log = await day();
    expect(log.planned).toHaveLength(0);
    expect(log.done[0]).toMatchObject({ status: 'done' });
    expect(log.done[0].statusAt).toBeTruthy();

    await request(app).post(commands).send({ changes: [{ kind: 'ecomax', index: 119, value: 50 }] }).expect(201);
    const failed = (await next()).body;
    await result({ id: failed.id, ok: false, error: 'brak potwierdzenia 0xB3' }).expect(201);
    expect((await day()).done[0]).toMatchObject({ status: 'error', error: 'brak potwierdzenia 0xB3' });
  });

  it('dzień: wpisy z dnia warszawskiego, inny dzień bez zaplanowanych, zła data 400', async () => {
    const { rootId } = (await register('AABBCC0000A2')).body;
    await logOperation(rootId, systemMeta('Cykl Zimy', 'kocioł nagrzany', 'kocioł 40 °C'), 'Sezon: Lato → Zima',
      { at: new Date('2026-10-10T22:30:00Z') });
    await logOperation(rootId, systemMeta('Harmonogram'), 'CWU od–do: 40–43 °C', { at: new Date('2026-10-10T21:30:00Z') });

    // 22:30 UTC = 00:30 11.10 w Warszawie, 21:30 UTC = 23:30 10.10
    const day = await getOperationsDay(rootId, '2026-10-11', new Date('2026-10-12T08:00:00Z'));
    expect(day.today).toBe(false);
    expect(day.planned).toEqual([]);
    expect(day.done).toHaveLength(1);
    expect(day.done[0]).toMatchObject({
      actor: { type: 'system' }, source: 'Cykl Zimy', status: 'done', reason: 'kocioł nagrzany', conditions: 'kocioł 40 °C',
    });
    expect((await getOperationsDay(rootId, '2026-10-10', new Date('2026-10-12T08:00:00Z'))).done[0].action).toBe('CWU od–do: 40–43 °C');

    await request(app).get(`/api/operations?rootId=${rootId}&date=11.10.2026`).expect(400);
  });

  it('zaplanowane: przejścia harmonogramu kotła do końca doby', async () => {
    const sn = 'AABBCC0000A3';
    const { rootId } = (await register(sn)).body;
    await request(app).post(`/api/pellet-boiler-pelux200/settings?deviceId=${sn}`).send(archive.raw_hex).expect(201);
    const settings = (await request(app).get(`/api/pellet-boiler-pelux200/schedule-settings?rootId=${rootId}`)).body;
    await request(app).put(`/api/pellet-boiler-pelux200/schedule-settings?rootId=${rootId}`).send({ ...settings, enabled: true }).expect(200);
    await request(app).post(`/api/pellet-boiler-pelux200/schedules?rootId=${rootId}`).send({
      type: 'cwu', mode: 'pellet', dayOfWeek: -1, startTime: '13:00', endTime: '15:00', cwuFrom: 45, cwuTo: 60,
    }).expect(201);

    // 08:00 w Warszawie (06:00 UTC), koniec doby 22:00 UTC
    const planned = await plannedScheduleOperations(rootId, new Date('2026-10-11T06:00:00Z'), new Date('2026-10-11T22:00:00Z'));
    expect(planned.map((operation) => operation.at.toISOString())).toEqual(['2026-10-11T11:00:00.000Z', '2026-10-11T13:00:00.000Z']);
    expect(planned[0]).toMatchObject({ actor: { type: 'system' }, source: 'Harmonogram', action: 'CWU od–do: 45–60 °C' });
    expect(planned[0].reason).toMatch(/początek wpisu CWU 13:00–15:00/);
    expect(planned[1].reason).toMatch(/koniec wpisu CWU 13:00–15:00/);
  });

  const entries = (rootId: string) => OperationLogModel.find({ rootId }).sort({ _id: 1 }).lean();

  it('pompa ciepła: tylko zmiany operacji, dostarczona w /hp/add, akcje, Ustawienia i zaplanowane', async () => {
    const deviceId = 'AABBCC0000B1';
    const device = await DeviceModel.create({
      deviceType: DeviceType.HP, deviceId, schedules: [], properties: { work_mode: 'AUTO', temp_min: '32', temp_max: '42' },
    });
    const rootId = String(device._id);
    // 10:00–11:00 w Warszawie = 08:00–09:00 UTC
    await request(app).post(`/api/schedules?rootId=${rootId}`).send({
      type: ScheduleType.HEAT, enabled: true, dayOfWeek: -1, startTime: '10:00', endTime: '11:00', forceStart: true,
      minTemperature: 35, maxTemperature: 45,
    }).expect(201);

    // pierwszy przebieg = punkt odniesienia, kolejny bez zmian: nic w dzienniku
    await runSchedulerOnce(new Date('2026-10-11T06:00:00Z'), rootId);
    await runSchedulerOnce(new Date('2026-10-11T06:01:00Z'), rootId);
    expect(await entries(rootId)).toHaveLength(0);

    await runSchedulerOnce(new Date('2026-10-11T08:00:30Z'), rootId);
    let log = await entries(rootId);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: { type: 'system' }, source: 'Harmonogram', status: 'pending', reason: 'Początek wpisu pracy 10:00–11:00.' });
    expect(log[0].action).toContain('Wymuszenie startu: nie → tak');
    expect(log[0].action).toContain('Temperatura od–do: 32–42 → 35–45 °C');

    await request(app).post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`).send({}).expect(201);
    expect((await entries(rootId))[0]).toMatchObject({ status: 'delivered' });

    await request(app).post(`/api/operation/action?rootId=${rootId}`).send({ action: 'error_reset' }).expect(201);
    await request(app).post(`/api/operation/set?rootId=${rootId}`).send({ cold_pomp: '1' }).expect(201);
    log = await entries(rootId);
    expect(log.slice(1).map((entry) => [entry.action, entry.status, entry.actor.name])).toEqual([
      ['Odblokowanie sterownika (po 5 błędach)', 'pending', 'Użytkownik (aplikacja)'],
      ['Pompa strony zimnej: wymuszona', 'pending', 'Użytkownik (aplikacja)'],
    ]);

    // tryb pracy z Ustawień: zmiana ustawienia (wykonana) i operacja dla co
    await request(app).post(`/api/operation/set?rootId=${rootId}`).send({ work_mode: 'OFF' }).expect(201);
    log = await entries(rootId);
    expect(log.map((entry) => entry.action)).toContain('Tryb pracy: Automatyczny → Wyłączony');

    // zaplanowane: granice wpisu w trybie automatycznym
    await DeviceModel.updateOne({ _id: rootId }, { $set: { 'properties.work_mode': 'AUTO' } });
    const planned = await plannedSchedulerOperations(rootId, new Date('2026-10-11T06:00:00Z'), new Date('2026-10-11T22:00:00Z'));
    expect(planned.map((entry) => entry.at.toISOString())).toEqual(['2026-10-11T08:00:00.000Z', '2026-10-11T09:00:00.000Z']);
    expect(planned[0].action).toContain('32–42 → 35–45 °C');
    expect(planned[1].reason).toMatch(/^Koniec wpisu pracy 10:00–11:00/);
  });

  it('włącznik: harmonogram i zmiana trybu czekają na stan przekaźnika, zaplanowane okna', async () => {
    const deviceId = 'AABBCC0000C1';
    const { rootId } = (await request(app).post('/api/devices/register').send({ deviceId, deviceType: 'switch', relays: 1 }).expect(201)).body;
    await SwitchRelayModel.updateOne({ rootId, relay: 1 }, { $set: { name: 'Bojler' } });
    await request(app).post(`/api/switch/schedules?rootId=${rootId}`)
      .send({ relay: 1, dayOfWeek: -1, startTime: '17:00', endTime: '18:00' }).expect(201);
    // 2026-10-05 to poniedziałek, Warszawa = UTC+2
    const at = (warsaw: string) => new Date(`${warsaw}+02:00`);
    const report = (on: boolean, time: string) => reportState(rootId, deviceId, { uptimeS: 1000, relays: [{ on, changedS: 1 }] }, at(time));

    const planned = await plannedSwitchOperations(rootId, at('2026-10-05T16:00:00'), at('2026-10-06T00:00:00'));
    expect(planned.map((entry) => [entry.action, entry.reason])).toEqual([
      ['Bojler: włącz do 18:00', 'Początek wpisu 17:00–18:00.'],
      ['Bojler: wyłącz', 'Koniec wpisu 17:00–18:00.'],
    ]);

    await report(false, '2026-10-05T16:59:00');
    expect(await entries(rootId)).toHaveLength(0);
    await report(false, '2026-10-05T17:00:05');
    let log = await entries(rootId);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'Bojler: włącz do 18:00', status: 'pending', reason: 'Początek wpisu 17:00–18:00.' });
    await report(true, '2026-10-05T17:00:10');
    expect((await entries(rootId))[0].status).toBe('done');

    const relay = await setRelayMode(rootId, { relay: 1, mode: 'off' }, 'app', at('2026-10-05T17:10:00'));
    if (typeof relay === 'string') throw new Error(relay);
    await noteModeChange(rootId, relay, 'app', at('2026-10-05T17:10:00'));
    await report(true, '2026-10-05T17:10:05');
    log = await entries(rootId);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ action: 'Bojler: wyłącz (harmonogram zablokowany)', status: 'pending', reason: 'Przycisk „Wyłącz”.' });
    await report(false, '2026-10-05T17:10:10');
    expect((await entries(rootId))[1].status).toBe('done');
  });

  it('hydrofor: czas kompresora z aplikacji czeka na zgłoszenie, ze strony sterownika wykonany', async () => {
    const deviceId = 'AABBCC0000D1';
    const register = () => request(app).post('/api/devices/register').send({ deviceId, deviceType: 'water-pressure-tank' });
    const { rootId } = (await register().expect(201)).body;
    await request(app).put(`/api/device/properties?rootId=${rootId}`).send({ compressor_seconds: 45 }).expect(200);
    let log = await entries(rootId);
    expect(log[0]).toMatchObject({ action: 'Czas kompresora: 30 s → 45 s', status: 'pending', actor: { type: 'user' } });
    await register().expect(200);
    expect((await entries(rootId))[0].status).toBe('delivered');

    await request(app).put(`/api/water-pressure-tank/settings?deviceId=${deviceId}`).send({ compressor_seconds: 50 }).expect(200);
    log = await entries(rootId);
    expect(log[1]).toMatchObject({
      action: 'Czas kompresora: 45 s → 50 s', status: 'done', actor: { type: 'controller' }, source: 'Strona sterownika',
    });
  });

  it('aktualizacja firmware: czeka, wysłana w ofercie, wykonana po zgłoszeniu nowej wersji', async () => {
    const data = Buffer.alloc(2048, 7);
    data[0] = 0xe9;
    await request(app).put('/api/firmware/water-pressure-tank/1.0.0').set('Content-Type', 'application/octet-stream').send(data).expect(200);
    const deviceId = 'AABBCC0000D2';
    const register = (version: string) => request(app).post('/api/devices/register').send({ deviceId, deviceType: 'water-pressure-tank', version });
    const { rootId } = (await register('0.9.0')).body;
    await request(app).post(`/api/devices/${rootId}/firmware-update`).expect(200);
    expect((await entries(rootId))[0]).toMatchObject({ action: 'Aktualizacja firmware: 0.9.0 → 1.0.0', status: 'pending' });
    expect((await register('0.9.0')).body.settings.firmware).toBeDefined();
    expect((await entries(rootId))[0].status).toBe('sent');
    await register('1.0.0');
    expect((await entries(rootId))[0].status).toBe('done');
  });
});
