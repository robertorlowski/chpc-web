import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from './src/middleware/app'
import { DeviceModel, HpEntryModel, PvEntryModel } from './src/models/model'
import { DeviceType } from './src/middleware/type'
import { removeExpiredPanelDetails } from './src/services/pv.service'

const panel = {
  serial: '116491036767', port: 1, power: 325.2, prod_today: 740,
  prod_total: 1053484, temperature: 33.4, pv_voltage: 36, pv_current: 9.02,
  grid_voltage: 238, grid_frequency: 50.02, status: 3, alarm_code: 0,
  alarm_count: 0, link: 1,
};

const reading = (total_power: number) => ({
  time: '2026.09.26 12:41:00', total_power, total_prod: 3150000,
  total_prod_today: 8400, temperature: 22.9, pv_power: total_power >= 2000,
  panels: [panel],
});

describe('PV telemetry', () => {
  let mongoServer: MongoMemoryServer;

  const createDevice = async (deviceId: string) =>
    String((await DeviceModel.create({ deviceType: DeviceType.HP, deviceId, schedules: [] }))._id);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('stores a reading sent with deviceId only and returns it as the latest one', async () => {
    const rootId = await createDevice('A4CF00000101');

    const posted = await request(app)
      .post('/api/pv/add?deviceId=A4CF00000101')
      .send(reading(3080));
    expect(posted.status).toBe(201);

    const stored = await PvEntryModel.findOne({ rootId }).lean();
    expect(stored?.deviceId).toBe('A4CF00000101');
    expect(stored?.panels?.[0]?.pv_current).toBe(9.02);
    expect(stored?.panels?.[0]?.grid_frequency).toBe(50.02);

    const last = await request(app).get(`/api/pv?rootId=${rootId}`);
    expect(last.status).toBe(200);
    expect(last.body.total_power).toBe(3080);
    expect(last.body.panels).toHaveLength(1);
  });

  it('rejects a reading without total_power', async () => {
    await createDevice('A4CF00000102');
    const posted = await request(app)
      .post('/api/pv/add?deviceId=A4CF00000102')
      .send({ panels: [] });
    expect(posted.status).toBe(400);
  });

  it('identifies the controller by rootId or deviceId', async () => {
    const rootId = await createDevice('A4CF00000103');

    const byDeviceId = await request(app)
      .post('/api/hp/add?deviceId=A4CF00000103')
      .send({ HP: { Ttarget: 40 } });
    expect(byDeviceId.status).toBe(201);
    expect(await HpEntryModel.countDocuments({ rootId })).toBe(1);

    const unknown = await request(app)
      .post('/api/pv/add?deviceId=A4CF0000FFFF')
      .send(reading(100));
    expect(unknown.status).toBe(404);

    const mismatch = await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=A4CF00000999`)
      .send({ HP: { Ttarget: 40 } });
    expect(mismatch.status).toBe(409);

    // pozostałe endpointy nadal wymagają rootId
    const clientRead = await request(app).get('/api/hp?deviceId=A4CF00000103');
    expect(clientRead.status).toBe(400);
  });

  it('stores only the PV power needed for the energy balance in the HP record', async () => {
    const rootId = await createDevice('A4CF00000104');
    await request(app).post(`/api/pv/add?rootId=${rootId}`).send(reading(2500));
    await request(app).post(`/api/hp/add?rootId=${rootId}`).send({ HP: { Ttarget: 40, Watts: 900 } });

    const stored = await HpEntryModel.findOne({ rootId }).lean();
    expect(stored?.PV).toEqual({ total_power: 2500 });
    expect(stored?.pv_power).toBeUndefined();

    // bieżąca telemetria pokazuje pełne podsumowanie ostatniego odczytu
    const response = await request(app).get(`/api/hp?rootId=${rootId}`);
    expect(response.body.PV.total_power).toBe(2500);
    expect(response.body.PV.temperature).toBe(22.9);
    expect(response.body.PV.total_prod_today).toBe(8400);
    expect(response.body.pv_power).toBe(true);
    expect(response.body.PV.panels).toBeUndefined();
  });

  it('does not use a PV reading older than three minutes', async () => {
    const rootId = await createDevice('A4CF00000105');
    const old = new Date(Date.now() - 4 * 60 * 1000);
    await PvEntryModel.collection.insertOne({
      rootId, deviceType: DeviceType.HP, deviceId: 'A4CF00000105',
      total_power: 1800, createdAt: old, updatedAt: old,
    });
    await request(app).post(`/api/hp/add?rootId=${rootId}`).send({ HP: { Ttarget: 40 } });

    const stored = await HpEntryModel.findOne({ rootId }).lean();
    expect(stored?.PV).toBeUndefined();
    const response = await request(app).get(`/api/hp?rootId=${rootId}`);
    expect(response.body.HP.Ttarget).toBe(40);
    expect(response.body.PV).toBeUndefined();
  });

  it('keeps PV sent with the HP telemetry by an older controller', async () => {
    const rootId = await createDevice('A4CF00000106');
    await request(app).post(`/api/pv/add?rootId=${rootId}`).send(reading(2500));
    await request(app).post(`/api/hp/add?rootId=${rootId}`)
      .send({ HP: { Ttarget: 40 }, PV: { total_power: 777, temperature: 50 } });

    const stored = await HpEntryModel.findOne({ rootId }).lean();
    expect(stored?.PV?.total_power).toBe(777);
    expect(stored?.PV?.temperature).toBe(50);
  });

  it('computes the energy balance from the PV power stored in HP records', async () => {
    const rootId = await createDevice('A4CF00000108');
    await request(app).post(`/api/pv/add?rootId=${rootId}`).send(reading(400));
    await request(app).post(`/api/hp/add?rootId=${rootId}`).send({ HP: { Ttarget: 40, Watts: 1000 } });
    await request(app).post(`/api/pv/add?rootId=${rootId}`).send(reading(600));
    await request(app).post(`/api/hp/add?rootId=${rootId}`).send({ HP: { Ttarget: 40, Watts: 1000 } });

    // drugi pomiar minutę po pierwszym
    const [first, second] = await HpEntryModel.find({ rootId }).sort({ createdAt: 1 }).lean();
    const base = new Date('2026-06-10T10:00:00Z');
    await HpEntryModel.collection.updateOne({ _id: first._id }, { $set: { createdAt: base } });
    await HpEntryModel.collection.updateOne({ _id: second._id }, { $set: { createdAt: new Date(base.getTime() + 60 * 1000) } });

    const summary = await request(app)
      .get(`/api/hp/monthly-summary?rootId=${rootId}&startDate=2026.06.10&endDate=2026.06.10&group=day`);
    expect(summary.status).toBe(200);
    const [day] = summary.body;
    // 1000 W pompy i średnio 500 W PV przez minutę
    expect(day.consumptionKWh).toBeCloseTo(1000 / 60 / 1000, 9);
    expect(day.pvGenerationKWh).toBeCloseTo(500 / 60 / 1000, 9);
    expect(day.gridEnergyKWh).toBeCloseTo(500 / 60 / 1000, 9);
  });

  it('removes panel details after 90 days and keeps the summary', async () => {
    const rootId = await createDevice('A4CF00000107');
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
    await PvEntryModel.collection.insertMany([
      { rootId, deviceType: DeviceType.HP, deviceId: 'A4CF00000107', total_power: 1, panels: [panel], createdAt: old, updatedAt: old },
      { rootId, deviceType: DeviceType.HP, deviceId: 'A4CF00000107', total_power: 2, panels: [panel], createdAt: recent, updatedAt: recent },
    ]);

    await removeExpiredPanelDetails();

    const oldDoc = await PvEntryModel.findOne({ rootId, total_power: 1 }).lean();
    const recentDoc = await PvEntryModel.findOne({ rootId, total_power: 2 }).lean();
    expect(oldDoc?.panels).toBeUndefined();
    expect(oldDoc?.total_power).toBe(1);
    expect(recentDoc?.panels).toHaveLength(1);
  });
});
