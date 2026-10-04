// Testy API wspólnego i telemetrii pompy (supertest na core/app, baza w
// mongodb-memory-server, meteo zamockowane): ostatnia telemetria, zapis EEVmin,
// zdarzenia błędów CHPC (okno 24 h, blokada ERRc >= 5), akcje jednorazowe,
// zgłoszenie i zmiana nazwy sterownika, t_out w odpowiedzi /hp/add, starsze settings.
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// temperatura zewnętrzna bez kotła; null = brak świeżego pomiaru z czujnika kotła
const meteo = vi.hoisted(() => ({ temperature: null as number | null }));
vi.mock('../src/core/services/meteo.service', () => ({
  getTemperature: () => meteo.temperature,
  setOutdoorTemperature: () => undefined,
}));

import app from '../src/core/app'
import { DeviceModel } from '../src/core/models/device.model'
import { HpEntryModel } from '../src/modules/heat-pump/models/hp.model'
import { SettingsEntryModel } from '../src/modules/heat-pump/models/settings.model'
import { DeviceType } from '../src/core/types'

describe('API with MongoDB', () => {
  let mongoServer: MongoMemoryServer;
  let rootId: string;
  const deviceId = 'test-hp';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const device = await DeviceModel.create({
      deviceType: DeviceType.HP,
      deviceId,
      name: 'Testowa pompa',
      schedules: [],
    });
    rootId = String(device._id);

    await HpEntryModel.create({
      rootId,
      deviceType: DeviceType.HP,
      deviceId,
      work_mode: 'CWU',
      co_min: '30',
      co_max: '40',
      cwu_min: '45',
      cwu_max: '50',
      HP: { Ttarget: 45 },
    });

    await SettingsEntryModel.create({
      rootId,
      settings: [],
      cwu_settings: [],
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('returns the latest HP data for the selected device', async () => {
    const response = await request(app)
      .get(`/api/hp?rootId=${rootId}&deviceId=${deviceId}`);

    expect(response.status).toBe(200);
    expect(response.body.rootId).toBe(rootId);
    expect(response.body.work_mode).toBe('CWU');
  });

  it('stores EEVmin from telemetry and offers it as eev_min_pulse_open', async () => {
    const posted = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ work_mode: 'A', HP: { Ttarget: 40, EEVmax: 61, EEVmin: 45 } });

    expect(posted.status).toBe(201);
    expect(posted.body).toHaveProperty('operation');

    const stored = await HpEntryModel.findOne({ rootId }).sort({ createdAt: -1 }).lean();
    expect(stored?.HP?.EEVmin).toBe(45);

    const operation = await request(app)
      .get(`/api/operation?rootId=${rootId}&deviceId=${deviceId}`);

    expect(operation.status).toBe(200);
    expect(operation.body.eev_max_pulse_open).toBe('61');
    expect(operation.body.eev_min_pulse_open).toBe('45');
  });

  it('does not return an error older than 24 hours as the last error', async () => {
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await HpEntryModel.collection.insertOne({
      rootId, deviceType: DeviceType.HP, deviceId,
      time: 'wczoraj', error_code: 3, HP: { Ttarget: 40, ERR: 3, ERRn: 9, ERRc: 1 },
      createdAt: yesterday, updatedAt: yesterday,
    });

    const lastError = await request(app)
      .get(`/api/hp/last-error?rootId=${rootId}&deviceId=${deviceId}`);
    expect(lastError.status).toBe(200);
    expect(lastError.body.error_code).toBeUndefined();
  });

  it('records a CHPC error once per event and returns the latest one', async () => {
    const post = (HP: Record<string, number>) => request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ time: '2026.09.24 10:00:00', HP: { Ttarget: 40, ...HP } });
    const latest = () => HpEntryModel.findOne({ rootId }).sort({ createdAt: -1 }).lean();

    await post({ ERR: 0, ERRn: 0, ERRc: 0 });
    expect((await latest())?.error_code).toBeUndefined();

    await post({ ERR: 2, ERRn: 1, ERRc: 1 });
    expect((await latest())?.error_code).toBe(2);

    // the same event reported again by the next poll is not a new error
    await post({ ERR: 2, ERRn: 1, ERRc: 1 });
    expect((await latest())?.error_code).toBeUndefined();

    // a repeated code with a new sequence number is a new event
    await post({ ERR: 2, ERRn: 2, ERRc: 2 });
    expect((await latest())?.error_code).toBe(2);

    await post({ ERR: 11, ERRn: 4, ERRc: 5 });
    const lastError = await request(app)
      .get(`/api/hp/last-error?rootId=${rootId}&deviceId=${deviceId}`);
    expect(lastError.status).toBe(200);
    expect(lastError.body.error_code).toBe(11);
    expect(lastError.body.HP.ERRc).toBe(5);
    expect(lastError.body.time).toBe('2026.09.24 10:00:00');
  });

  it('keeps an error older than 24 hours while the controller is locked', async () => {
    // poprzedni test zostawił sterownik zablokowany (ERRc 5); błędy przesuwamy o 26 h wstecz
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const older = new Date(old.getTime() - 60 * 60 * 1000);
    await HpEntryModel.collection.updateMany({ rootId, error_code: { $gt: 0 } }, { $set: { createdAt: older } });
    await HpEntryModel.collection.updateMany({ rootId, error_code: 11 }, { $set: { createdAt: old } });

    const locked = await request(app)
      .get(`/api/hp/last-error?rootId=${rootId}&deviceId=${deviceId}`);
    expect(locked.body.error_code).toBe(11);

    // po odblokowaniu (ERRc 0, ten sam ERRn) stary błąd znika zgodnie z oknem 24 h
    await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ time: '2026.09.24 10:05:00', HP: { Ttarget: 40, ERR: 11, ERRn: 4, ERRc: 0 } });
    const unlocked = await request(app)
      .get(`/api/hp/last-error?rootId=${rootId}&deviceId=${deviceId}`);
    expect(unlocked.body.error_code).toBeUndefined();
  });

  it('sends a maintenance action to the controller exactly once', async () => {
    const invalid = await request(app)
      .post(`/api/operation/action?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ action: 'format_disk' });
    expect(invalid.status).toBe(400);

    const queued = await request(app)
      .post(`/api/operation/action?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ action: 'error_reset' });
    expect(queued.status).toBe(201);

    const first = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 } });
    expect(first.body.operation.error_reset).toBe('1');

    const second = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 } });
    expect(second.body.operation.error_reset).toBeUndefined();
  });

  it('registers a new controller and returns its rootId', async () => {
    const response = await request(app)
      .post('/api/devices/register')
      .send({ deviceId: 'A4CF12345678' });

    expect(response.status).toBe(201);
    expect(response.body.deviceId).toBe('A4CF12345678');
    const device = await DeviceModel.findById(response.body.rootId).lean();
    expect(device?.deviceType).toBe(DeviceType.HP);
  });

  it('returns the existing rootId when a known controller registers again', async () => {
    const response = await request(app)
      .post('/api/devices/register')
      .send({ deviceId });

    expect(response.status).toBe(200);
    expect(response.body.rootId).toBe(rootId);
    expect(await DeviceModel.countDocuments({ deviceId })).toBe(1);
  });

  it('stores the controller IP address from each registration', async () => {
    const register = (ip?: string) =>
      request(app).post('/api/devices/register').send({ deviceId: 'A4CF00000002', ip });
    const listed = async () =>
      (await request(app).get('/api/devices')).body.find((device: { deviceId: string }) => device.deviceId === 'A4CF00000002');

    expect((await register('192.168.1.20')).body.ipAddress).toBe('192.168.1.20');
    expect((await listed()).ipSeenAt).toBeTruthy();

    // nowy adres po zmianie z DHCP
    expect((await register('192.168.1.31')).status).toBe(200);
    expect((await listed()).ipAddress).toBe('192.168.1.31');

    // brak adresu, 0.0.0.0 albo zły format: zostaje ostatni znany
    await register();
    await register('0.0.0.0');
    await register('192.168.1.300');
    await register('abc');
    expect((await listed()).ipAddress).toBe('192.168.1.31');
  });

  it('leaves the name of a self-registered controller empty', async () => {
    const response = await request(app)
      .post('/api/devices/register')
      .send({ deviceId: 'A4CF00000001' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('');
  });

  it('renames a device without changing deviceId', async () => {
    const response = await request(app)
      .put(`/api/devices/${rootId}`)
      .send({ name: '  Pompa - dom  ', deviceId: 'zmieniony' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Pompa - dom');
    expect(response.body.deviceId).toBe(deviceId);
    const device = await DeviceModel.findById(rootId).lean();
    expect(device?.deviceId).toBe(deviceId);
  });

  it('allows clearing the device name', async () => {
    const response = await request(app)
      .put(`/api/devices/${rootId}`)
      .send({ name: '' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('');
  });

  it('rejects renaming an unknown device', async () => {
    const response = await request(app)
      .put('/api/devices/000000000000000000000000')
      .send({ name: 'x' });

    expect(response.status).toBe(404);
  });

  it('saves the heat pump definition (connection, tank, PV) without touching properties', async () => {
    const before = await DeviceModel.findById(rootId).lean();
    const response = await request(app)
      .put(`/api/devices/${rootId}`)
      .send({ name: 'Pompa', pumpConfig: { connection: 'co', tankLiters: 200, pvDtu: false, pvForce: true } });

    expect(response.status).toBe(200);
    // wymuszenie PV tylko z DTU
    expect(response.body.pumpConfig).toEqual({ connection: 'co', tankLiters: 200, pvDtu: false, pvForce: false });
    const listed = (await request(app).get('/api/devices')).body.find((item: { rootId: string }) => item.rootId === rootId);
    expect(listed.pumpConfig.connection).toBe('co');
    const after = await DeviceModel.findById(rootId).lean();
    expect(after?.properties).toEqual(before?.properties);

    // sama nazwa zostawia definicję
    await request(app).put(`/api/devices/${rootId}`).send({ name: 'Pompa 2' });
    expect((await DeviceModel.findById(rootId).lean())?.pumpConfig?.tankLiters).toBe(200);
  });

  it('rejects an invalid heat pump definition and a definition for other device types', async () => {
    const bad = [
      { connection: 'pv', tankLiters: 200, pvDtu: false, pvForce: false },
      { connection: 'cwu', tankLiters: 10, pvDtu: false, pvForce: false },
      { connection: 'cwu', tankLiters: 200.5, pvDtu: false, pvForce: false },
      { connection: 'cwu', tankLiters: 200, pvDtu: 'tak', pvForce: false },
    ];
    for (const pumpConfig of bad) {
      expect((await request(app).put(`/api/devices/${rootId}`).send({ pumpConfig })).status).toBe(400);
    }
    expect((await request(app).put(`/api/devices/${rootId}`).send({})).status).toBe(400);

    const tank = await request(app)
      .post('/api/devices/register')
      .send({ deviceId: 'A4CF000000F1', deviceType: DeviceType.WATER_PRESSURE_TANK });
    const response = await request(app)
      .put(`/api/devices/${tank.body.rootId}`)
      .send({ pumpConfig: { connection: 'cwu', tankLiters: 300, pvDtu: false, pvForce: false } });
    expect(response.status).toBe(400);
  });

  it('rejects a registration without deviceId', async () => {
    const response = await request(app)
      .post('/api/devices/register')
      .send({ deviceId: '  ' });

    expect(response.status).toBe(400);
  });

  it('sends the outdoor temperature to the controller next to the operation', async () => {
    meteo.temperature = null;
    const unknown = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 } });
    expect(unknown.status).toBe(201);
    expect(unknown.body).not.toHaveProperty('t_out');

    meteo.temperature = 12.3;
    const known = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 } });
    expect(known.body.t_out).toBe(12.3);
    expect(known.body.operation).not.toHaveProperty('t_out');
    meteo.temperature = null;
  });

  it('returns settings for the selected device', async () => {
    const response = await request(app)
      .get(`/api/settings?rootId=${rootId}&deviceId=${deviceId}`);

    expect(response.status).toBe(200);
    expect(response.body.rootId).toBe(rootId);
  });
});


