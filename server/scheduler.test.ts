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

  const setWorkMode = (workMode: string) =>
    DeviceModel.findByIdAndUpdate(rootId, { 'properties.work_mode': workMode });

  beforeEach(async () => {
    await DeviceModel.findByIdAndUpdate(rootId, { schedules: [], 'properties.work_mode': 'CWU' });
    clearManualOperation(rootId);
    clearOperation(rootId);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('applies a CO schedule without setting the CO pump', async () => {
    await setWorkMode('A');
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
    await setWorkMode('A');
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
    await setWorkMode('A');
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
      work_mode: 'A',
      force: '0',
      co_min: '32',
      co_max: '42',
      cwu_min: '44',
      cwu_max: '52',
    });
  });

  const coAndCwuSchedules = () => [
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
  ];

  const offSchedule = {
    type: ScheduleType.OFF,
    enabled: true,
    dayOfWeek: WeekDay.ANY_DAY,
    startTime: '10:00',
    endTime: '11:00',
    forceStart: false,
  };

  const addSchedules = async (schedules: object[]) => {
    for (const schedule of schedules) {
      await request(app)
        .post(`/api/schedules?rootId=${rootId}&deviceId=${deviceId}`)
        .send(schedule)
        .expect(201);
    }
  };

  it('runs only CWU schedules in CWU mode', async () => {
    await addSchedules(coAndCwuSchedules());
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'CWU',
      force: '0',
      cwu_min: '45',
      cwu_max: '50',
    });
  });

  it('runs only CO schedules in CO schedule mode', async () => {
    await setWorkMode('A');
    await addSchedules(coAndCwuSchedules());
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'A',
      force: '1',
      co_min: '35',
      co_max: '45',
    });
  });

  it.each(['A', 'CWU'])('uses an OFF schedule as a pause in %s mode', async (workMode) => {
    await setWorkMode(workMode);
    await addSchedules([...coAndCwuSchedules(), offSchedule]);
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'OFF',
      force: '0',
    });
  });

  it.each(['M', 'OFF'])('runs no schedule in %s mode', async (workMode) => {
    await setWorkMode(workMode);
    await addSchedules([...coAndCwuSchedules(), offSchedule]);
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: workMode,
      force: '0',
      co_min: '32',
      co_max: '42',
      cwu_min: '44',
      cwu_max: '52',
    });
  });

  it('switches manual mode M to A after midnight', async () => {
    await setWorkMode('M');
    // 23:59 i 00:01 czasu warszawskiego (UTC+2)
    await runSchedulerOnce(new Date('2026-09-19T21:59:00.000Z'));

    await request(app)
      .post(`/api/operation/set?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ work_mode: 'M', co_max: '47' })
      .expect(201);

    await runSchedulerOnce(new Date('2026-09-19T21:59:30.000Z'));
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'M', co_max: '47' });

    await runSchedulerOnce(new Date('2026-09-19T22:01:00.000Z'));

    const device = await DeviceModel.findById(rootId).lean();
    expect(device?.properties?.work_mode).toBe('A');
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'A', co_max: '47' });
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

  it('does not take the work mode from the controller telemetry', async () => {
    await DeviceModel.findByIdAndUpdate(rootId, { $unset: { 'properties.work_mode': 1 } });
    await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 }, work_mode: 'OFF' })
      .expect(201);

    await runSchedulerOnce(afterScheduleTime);

    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU' });
  });

  it('does not treat a Polish public holiday as a workday', async () => {
    await setWorkMode('A');
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
      work_mode: 'A',
      co_min: '32',
      co_max: '42',
    });
  });
});
