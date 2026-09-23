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

  it('returns settings for the selected device', async () => {
    const response = await request(app)
      .get(`/api/settings?rootId=${rootId}&deviceId=${deviceId}`);

    expect(response.status).toBe(200);
    expect(response.body.rootId).toBe(rootId);
  });
});


