// Testy schedulera i operacji ręcznych (runSchedulerOnce z podanym czasem, baza w
// mongodb-memory-server): tryb pracy ręczny / automatyczny / OFF, jedna para temperatur od–do,
// tłumaczenie na kontrakt co według podłączenia (CWU → work_mode CWU, CO → M, obie pary co_*/cwu_*),
// dawne ustawienia i wpisy (M/A/CWU, co_*/cwu_*, wpisy co/cwu), ręczne nadpisania z Ustawień i ich
// czyszczenie, jawne "0" dla pomp, dni wolne i święta, jednorazowe force.
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../src/core/app';
import { DeviceModel } from '../src/core/models/device.model';
import { DeviceType } from '../src/core/types';
import { ScheduleType, WeekDay } from '../src/modules/heat-pump/types';
import { getCurrentSchedule, runSchedulerOnce } from '../src/modules/heat-pump/services/scheduler.service';
import {
  clearManualOperation,
  clearOperation,
  getManualOperationData,
  getOperationData,
} from '../src/modules/heat-pump/services/operation.service';

describe('Schedules and manual operation control', () => {
  let mongoServer: MongoMemoryServer;
  let rootId: string;
  const deviceId = 'scheduler-test-hp';
  const activeTime = new Date('2026-09-19T08:30:00.000Z');
  const afterScheduleTime = new Date('2026-09-19T12:00:00.000Z');
  const defaultProperties = { work_mode: 'AUTO', temp_min: '32', temp_max: '42' };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const device = await DeviceModel.create({
      deviceType: DeviceType.HP,
      deviceId,
      name: 'Pompa testowa schedulera',
      schedules: [],
      properties: defaultProperties,
    });
    rootId = String(device._id);
  });

  const setWorkMode = (workMode: string) =>
    DeviceModel.findByIdAndUpdate(rootId, { 'properties.work_mode': workMode });
  const setConnection = (connection: 'cwu' | 'co') =>
    DeviceModel.findByIdAndUpdate(rootId, { pumpConfig: { connection, tankLiters: 200, pvDtu: false, pvForce: false } });
  const setManual = (body: Record<string, string>, status = 201) => request(app)
    .post(`/api/operation/set?rootId=${rootId}&deviceId=${deviceId}`)
    .send(body)
    .expect(status);

  beforeEach(async () => {
    await DeviceModel.findByIdAndUpdate(rootId, {
      schedules: [],
      properties: defaultProperties,
      $unset: { pumpConfig: 1 },
    });
    clearManualOperation(rootId);
    clearOperation(rootId);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const heatSchedule = (overrides: object = {}) => ({
    type: ScheduleType.HEAT,
    enabled: true,
    dayOfWeek: WeekDay.ANY_DAY,
    startTime: '10:00',
    endTime: '11:00',
    forceStart: true,
    minTemperature: 35,
    maxTemperature: 45,
    ...overrides,
  });

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

  it('applies a work schedule in automatic mode, both temperature pairs, without the CO pump', async () => {
    await addSchedules([heatSchedule()]);
    await runSchedulerOnce(activeTime);

    // bez definicji pompy podłączenie CWU: tryb co CWU
    expect(getOperationData(rootId)).toMatchObject({
      work_mode: 'CWU',
      force: '1',
      co_min: '35',
      co_max: '45',
      cwu_min: '35',
      cwu_max: '45',
    });
    expect(getOperationData(rootId)).not.toHaveProperty('co_pomp');
  });

  it('sends the CO work mode for a pump connected to CO', async () => {
    await setConnection('co');
    await addSchedules([heatSchedule()]);
    await runSchedulerOnce(activeTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'M', force: '1', co_min: '35', co_max: '45' });

    // poza harmonogramem ustawienia domyślne, też tryb CO (bez dawnej zamiany na CWU)
    await runSchedulerOnce(afterScheduleTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'M', force: '0', co_min: '32', co_max: '42' });
  });

  it('uses default temperatures when a schedule does not define them', async () => {
    await addSchedules([heatSchedule({ minTemperature: undefined, maxTemperature: undefined, forceStart: false })]);
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', cwu_min: '32', cwu_max: '42' });
  });

  it('treats old CO and CWU schedule entries as work entries', async () => {
    await addSchedules([heatSchedule({ type: ScheduleType.CO, startTime: '10:00' })]);
    await runSchedulerOnce(activeTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', force: '1', cwu_min: '35', cwu_max: '45' });
  });

  it('uses an OFF schedule as a pause in automatic mode', async () => {
    await addSchedules([heatSchedule(), offSchedule]);
    await runSchedulerOnce(activeTime);

    // temperatury idą dalej (co 1.1.1 ustawia je w OFF od razu)
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'OFF', force: '0', cwu_min: '32', cwu_max: '42' });
  });

  it.each([['MANUAL', 'CWU'], ['OFF', 'OFF']])('runs no schedule in %s mode', async (workMode, controllerMode) => {
    await setWorkMode(workMode);
    await addSchedules([heatSchedule(), offSchedule]);
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({
      work_mode: controllerMode,
      force: '0',
      co_min: '32',
      co_max: '42',
      cwu_min: '32',
      cwu_max: '42',
    });
  });

  it('reads old settings: M, A and CWU modes and the temperature pair of the connection', async () => {
    const old = { co_min: '30', co_max: '40', cwu_min: '44', cwu_max: '52' };
    await DeviceModel.findByIdAndUpdate(rootId, { properties: { work_mode: 'CWU', ...old } });
    await addSchedules([heatSchedule({ minTemperature: undefined, maxTemperature: undefined, forceStart: false })]);

    // dawny CWU (harmonogram CWU) = automatyczny; podłączenie CWU bierze parę cwu_*
    await runSchedulerOnce(activeTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', cwu_min: '44', cwu_max: '52', co_min: '44' });

    // dawny M (ręczne CO) = ręczny; podłączenie CO bierze parę co_*
    await setConnection('co');
    await DeviceModel.findByIdAndUpdate(rootId, { properties: { work_mode: 'M', ...old } });
    await runSchedulerOnce(activeTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'M', force: '0', co_min: '30', co_max: '40' });
    expect((await getCurrentSchedule(rootId, activeTime)).work_mode).toBe('MANUAL');
  });

  it('keeps manual settings during an active schedule and clears them when it ends', async () => {
    await addSchedules([heatSchedule({ forceStart: false })]);
    await runSchedulerOnce(activeTime);

    await setManual({ temp_min: '37', temp_max: '47' });
    expect(getOperationData(rootId)).toMatchObject({ co_min: '37', co_max: '47', cwu_min: '37', cwu_max: '47' });
    expect(getOperationData(rootId)).not.toHaveProperty('temp_min');

    await runSchedulerOnce(activeTime);
    expect(getOperationData(rootId)).toMatchObject({ cwu_min: '37', cwu_max: '47' });

    await runSchedulerOnce(afterScheduleTime);
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', force: '0', cwu_min: '32', cwu_max: '42' });
  });

  it('saves the work mode from Settings in the device settings and validates the request', async () => {
    await addSchedules([heatSchedule()]);
    await runSchedulerOnce(activeTime);
    await setManual({ temp_max: '44' });

    // tryb z Ustawień = tryb urządzenia (jak w Harmonogramie): ręczne nadpisania znikają, harmonogram stoi
    await setManual({ work_mode: 'MANUAL', temp_min: '33' });
    const device = await DeviceModel.findById(rootId).lean();
    expect(device?.properties?.work_mode).toBe('MANUAL');
    expect(getManualOperationData(rootId)).toEqual({ co_min: '33', cwu_min: '33' });
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', force: '0', cwu_min: '33', cwu_max: '42' });

    await setManual({ work_mode: 'M' }, 400);
    await setManual({ temp_min: '45', temp_max: '40' }, 400);
    await setManual({ temp_max: '0' }, 400);
    await setManual({ temp_min: 'abc' }, 400);
  });

  it('saving default settings overrides manual settings at once', async () => {
    // bez harmonogramu ręczne pole trwa (produkcja 2026-10-04: ręczne CWU max 38, domyślne 48)
    await runSchedulerOnce(afterScheduleTime);
    await setManual({ temp_max: '38', co_pomp: '0' });
    await runSchedulerOnce(afterScheduleTime);
    expect(getOperationData(rootId)).toMatchObject({ cwu_max: '38', co_pomp: '0' });

    await request(app).put(`/api/device/properties?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ work_mode: 'MANUAL', temp_min: '40', temp_max: '48' }).expect(200);

    expect(getManualOperationData(rootId)).toEqual({});
    // nowa operacja od razu, bez czekania na przebieg schedulera; ręczne co_pomp "0" jawnie na "1"
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', cwu_min: '40', cwu_max: '48', co_pomp: '1' });
  });

  it('sends an explicit "0" for manually forced pumps when manual settings are cleared', async () => {
    // co trzyma ostatnią przysłaną wartość: bez jawnego "0" pompa zostawała wymuszona bez końca
    await runSchedulerOnce(afterScheduleTime);
    await setManual({ work_mode: 'OFF', hot_pomp: '1', cold_pomp: '0' });
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'OFF', hot_pomp: '1', cold_pomp: '0' });

    await request(app).put(`/api/device/properties?rootId=${rootId}&deviceId=${deviceId}`)
      .send(defaultProperties).expect(200);
    expect(getOperationData(rootId)).toMatchObject({ hot_pomp: '0' });
    expect(getOperationData(rootId)).not.toHaveProperty('cold_pomp');

    // "0" trzyma się przebiegów schedulera do pierwszej odpowiedzi /hp/add, potem znika
    await runSchedulerOnce(afterScheduleTime);
    expect(getOperationData(rootId)).toMatchObject({ hot_pomp: '0' });
    clearOperation(rootId);
    await runSchedulerOnce(afterScheduleTime);
    expect(getOperationData(rootId)).not.toHaveProperty('hot_pomp');
  });

  it('restores the CO pump when the work mode changes', async () => {
    await setManual({ co_pomp: '0' });
    expect(getOperationData(rootId)).toMatchObject({ co_pomp: '0' });

    await setManual({ work_mode: 'MANUAL' });
    expect(getOperationData(rootId)).toMatchObject({ co_pomp: '1' });
  });

  it('keeps the manual mode after midnight', async () => {
    await setWorkMode('MANUAL');
    // 23:59 i 00:01 czasu warszawskiego (UTC+2)
    await runSchedulerOnce(new Date('2026-09-19T21:59:00.000Z'));
    await setManual({ temp_max: '47' });
    await runSchedulerOnce(new Date('2026-09-19T22:01:00.000Z'));

    const device = await DeviceModel.findById(rootId).lean();
    expect(device?.properties?.work_mode).toBe('MANUAL');
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', cwu_max: '47' });
  });

  it('runs a days-off schedule on weekends', async () => {
    await addSchedules([heatSchedule({ dayOfWeek: WeekDay.DAYS_OFF, minTemperature: 25, maxTemperature: 48 })]);
    await runSchedulerOnce(activeTime);

    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', force: '1', cwu_min: '25', cwu_max: '48' });
  });

  it('reports the schedule that runs now', async () => {
    await addSchedules([heatSchedule()]);
    const device = await DeviceModel.findById(rootId).lean();
    const schedule = device?.schedules?.[0];

    expect(await getCurrentSchedule(rootId, activeTime)).toEqual({
      scheduleId: String(schedule?._id),
      work_mode: 'AUTO',
    });
    expect(await getCurrentSchedule(rootId, afterScheduleTime)).toEqual({
      scheduleId: null,
      work_mode: 'AUTO',
    });
  });

  it('does not take the work mode from the controller telemetry', async () => {
    await DeviceModel.findByIdAndUpdate(rootId, { $unset: { 'properties.work_mode': 1 } });
    await request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40 }, work_mode: 'OFF' })
      .expect(201);

    await runSchedulerOnce(afterScheduleTime);

    // bez trybu w ustawieniach: ręczny
    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU' });
  });

  it('does not treat a Polish public holiday as a workday', async () => {
    await addSchedules([heatSchedule({ dayOfWeek: WeekDay.WORKDAYS, forceStart: false })]);
    await runSchedulerOnce(new Date('2026-12-25T09:30:00.000Z'));

    expect(getOperationData(rootId)).toMatchObject({ work_mode: 'CWU', cwu_min: '32', cwu_max: '42' });
  });

  const telemetry = (hps: number) =>
    request(app)
      .post(`/api/hp/add?rootId=${rootId}&deviceId=${deviceId}`)
      .send({ HP: { Ttarget: 40, HPS: hps } })
      .expect(201);

  it('drops a manual force after the compressor starts', async () => {
    await runSchedulerOnce(afterScheduleTime);
    await setManual({ force: '1', temp_max: '47' });

    expect((await telemetry(0)).body.operation.force).toBe('1');
    expect((await telemetry(1)).body.operation.force).toBe('1');
    // sprężarka ruszyła: następna odpowiedź już bez wymuszenia, inne ręczne pola zostają
    const after = await telemetry(1);
    expect(after.body.operation).toMatchObject({ force: '0', cwu_max: '47' });
    expect(getManualOperationData(rootId)).toEqual({ co_max: '47', cwu_max: '47' });

    // po zatrzymaniu sprężarki serwer nie wymusza kolejnego startu
    expect((await telemetry(0)).body.operation.force).toBe('0');
  });

  it('keeps a manual force set during a run until the next start', async () => {
    await runSchedulerOnce(afterScheduleTime);
    await telemetry(1);
    await setManual({ force: '1' });

    // bieżący cykl nie był skutkiem wymuszenia: force czeka na postój i kolejny start
    await telemetry(1);
    expect((await telemetry(1)).body.operation.force).toBe('1');
    await telemetry(0);
    await telemetry(1);
    expect((await telemetry(1)).body.operation.force).toBe('0');
  });

  it('keeps a scheduled force for the whole schedule', async () => {
    await addSchedules([heatSchedule()]);
    await runSchedulerOnce(activeTime);

    for (const hps of [0, 1, 1, 0, 1]) {
      expect((await telemetry(hps)).body.operation.force).toBe('1');
      await runSchedulerOnce(activeTime);
    }
  });

  it('lets a scheduled force win again after a manual force is used up', async () => {
    await addSchedules([heatSchedule()]);
    await runSchedulerOnce(activeTime);
    await setManual({ force: '1' });

    await telemetry(0);
    await telemetry(1);
    expect((await telemetry(1)).body.operation.force).toBe('1');  // z harmonogramu
    expect(getManualOperationData(rootId)).toEqual({});
  });
});
