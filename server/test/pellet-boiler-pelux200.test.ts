// Testy kotła pelletowego Pellux 200 (baza w mongodb-memory-server): zgłoszenie z
// ustawieniami, ten sam SN jako pompa i kocioł (routing po rodzaju), zapis i
// walidacja odczytu, 404/409, /last, /list (granice doby warszawskiej) oraz
// zapis i walidacja poll_interval_seconds przez PUT /device/properties.
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/core/app'
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
  });

  it('400 dla pustego body, samego time i pól złego typu', async () => {
    const { rootId } = (await register('AABBCC000004')).body;
    const url = `/api/pellet-boiler-pelux200/add?rootId=${rootId}`;
    expect((await request(app).post(url).send({})).status).toBe(400);
    expect((await request(app).post(url).send({ time: '2026.10.01 12:00:00' })).status).toBe(400);
    expect((await request(app).post(url).send({ state: '3' })).status).toBe(400);
    expect((await request(app).post(url).send({ fan: 1 })).status).toBe(400);
    expect((await request(app).post(url).send({ heating_temp: null })).status).toBe(400);
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
});
