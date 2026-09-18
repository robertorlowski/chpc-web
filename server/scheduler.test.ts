import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from './src/middleware/app';
import { DeviceModel } from './src/models/model';
import { DeviceType, ScheduleType, WeekDay } from './src/middleware/type';
import { runSchedulerOnce } from './src/services/scheduler.service';
import {
  clearManualOperation,
  clearOperation,
  getOperationData,
} from './src/services/operation.service';

describe('Schedules and manual operation control', () => {
  let mongoServer: MongoMemoryServer;
  let rootId: string;
  const deviceId = 'scheduler-test-hp';
  const activeTime = new Date('2026-09-19T08:30:00.000Z');
  const afterScheduleTime = new Date('2026-09-19T12:00:00.000Z');

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const device = await DeviceModel.create({
      deviceType: DeviceType.HP,
      deviceId,
      name: 'Pompa testowa schedulera',
      schedules: [],
      properties: {
        work_mode: 'CWU',
        co_min: '32',
        co_max: '42',
        cwu_min: '44',
        cwu_max: '52',
      },
    });
    rootId = String(device._id);
  });

  beforeEach(async () => {
    await DeviceModel.findByIdAndUpdate(rootId, { schedules: [] });
    clearManualOperation(rootId);
    clearOperation(rootId);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('applies a CO schedule without setting the CO pump', async () => {
    const response = await request(app)
      .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        type: ScheduleType.CO,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: true,
        minTemperature: 35,
        maxTemperature: 45,
      });

    expect(response.status).toBe(201);

    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'A',
      force: '1',
      co_min: '35',
      co_max: '45',
      cwu_min: '44',
      cwu_max: '52',
    });
    expect(getOperationData(rootId)).not.toHaveProperty('co_pomp');
  });

  it('uses default temperatures when a schedule does not define them', async () => {
    await request(app)
      .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        type: ScheduleType.CO,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: false,
      })
      .expect(201);

    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'A',
      co_min: '32',
      co_max: '42',
    });
  });

  it('keeps manual settings during an active schedule and clears them when it ends', async () => {
    await request(app)
      .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        type: ScheduleType.CO,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: false,
        minTemperature: 35,
        maxTemperature: 45,
      })
      .expect(201);

    await runSchedulerOnce(activeTime);

    await request(app)
      .post(`/api/operation/set?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        work_mode: 'M',
        co_pomp: '0',
        co_min: '37',
        co_max: '47',
      })
      .expect(201);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'M',
      co_min: '37',
      co_max: '47',
    });

    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'M',
      co_min: '37',
      co_max: '47',
    });

    await runSchedulerOnce(afterScheduleTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'CWU',
      force: '0',
      co_min: '32',
      co_max: '42',
      cwu_min: '44',
      cwu_max: '52',
    });
  });

  it('uses OFF before CO and CWU when schedules overlap', async () => {
    const schedules = [
      {
        type: ScheduleType.CWU,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: false,
        minTemperature: 45,
        maxTemperature: 50,
      },
      {
        type: ScheduleType.CO,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: true,
        minTemperature: 35,
        maxTemperature: 45,
      },
      {
        type: ScheduleType.OFF,
        enabled: true,
        dayOfWeek: WeekDay.ANY_DAY,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: false,
        minTemperature: 0,
        maxTemperature: 0,
      },
    ];

    for (const schedule of schedules) {
      await request(app)
        .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
        .send(schedule)
        .expect(201);
    }

    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'OFF',
      force: '0',
    });
  });

  it('runs a days-off schedule on weekends', async () => {
    await request(app)
      .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        type: ScheduleType.CWU,
        enabled: true,
        dayOfWeek: WeekDay.DAYS_OFF,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: true,
        minTemperature: 25,
        maxTemperature: 48,
      })
      .expect(201);

    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'CWU',
      force: '1',
      cwu_min: '25',
      cwu_max: '48',
    });
  });

  it('does not treat a Polish public holiday as a workday', async () => {
    await request(app)
      .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
      .send({
        type: ScheduleType.CO,
        enabled: true,
        dayOfWeek: WeekDay.WORKDAYS,
        startTime: '10:00',
        endTime: '11:00',
        forceStart: false,
        minTemperature: 35,
        maxTemperature: 45,
      })
      .expect(201);

    await runSchedulerOnce(new Date('2026-12-25T09:30:00.000Z'));

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'CWU',
    });
  });
});
