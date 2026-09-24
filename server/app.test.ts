import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from './src/middleware/app'
import { DeviceModel, HpEntryModel, SettingsEntryModel } from './src/models/model'
import { DeviceType } from './src/middleware/type'

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

  it('rejects a registration without deviceId', async () => {
    const response = await request(app)
      .post('/api/devices/register')
      .send({ deviceId: '  ' });

    expect(response.status).toBe(400);
  });

  it('returns settings for the selected device', async () => {
    const response = await request(app)
      .get(`/api/settings?rootId=${rootId}&deviceId=${deviceId}`);

    expect(response.status).toBe(200);
    expect(response.body.rootId).toBe(rootId);
  });
});


