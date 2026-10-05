// Kontrakt operacji dla co według wersji firmware (controller-contract.service.ts): co od 1.2.0 dostaje
// work_mode MANUAL / AUTO / OFF, temp_min / temp_max i konfigurację pompy (tylko w pełnej operacji),
// starsze co operację bez zmian; telemetria 1.2.0 (temp_min / temp_max) zapisuje się w rekordzie hp;
// pompa CO kotła (PUT /hp/cwu-loading co_pump) = cop_pause przy podłączeniu CO.
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/core/app';
import { DeviceModel } from '../src/core/models/device.model';
import { HpEntryModel } from '../src/modules/heat-pump/models/hp.model';
import { runSchedulerOnce } from '../src/modules/heat-pump/services/scheduler.service';
import { supportsNewContract, toControllerOperation } from '../src/modules/heat-pump/services/controller-contract.service';

describe('Kontrakt operacji co', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('rozpoznaje wersję z nowym kontraktem', () => {
    expect(supportsNewContract('1.2.0')).toBe(true);
    expect(supportsNewContract('1.10.0')).toBe(true);
    expect(supportsNewContract('2.0.0')).toBe(true);
    expect(supportsNewContract('1.1.1')).toBe(false);
    expect(supportsNewContract(undefined)).toBe(false);
    expect(supportsNewContract('dev')).toBe(false);
  });

  it('tłumaczy operację: tryb, jedna temperatura, konfiguracja tylko z work_mode', () => {
    const operation = { work_mode: 'M', force: '0', co_min: '35', co_max: '45', cwu_min: '35', cwu_max: '45', co_pomp: '1' };
    const config = { connection: 'co' as const, tankLiters: 200, pvDtu: true, pvForce: true };
    expect(toControllerOperation(operation, { firmwareVersion: '1.1.1', pumpMode: 'AUTO', pumpConfig: config })).toBe(operation);
    expect(toControllerOperation(operation, { firmwareVersion: '1.2.0', pumpMode: 'AUTO', pumpConfig: config, boilerCoPump: true }))
      .toEqual({ work_mode: 'AUTO', force: '0', temp_min: '35', temp_max: '45', pv_force: '1', pv_dtu: '1', tank_liters: '200', cop_pause: '1' });
    // OFF z harmonogramu przy trybie automatycznym, podłączenie CWU: bez przerwy w COP
    expect(toControllerOperation({ work_mode: 'OFF', force: '0' }, { firmwareVersion: '1.2.0', pumpMode: 'AUTO', pumpConfig: { ...config, connection: 'cwu' }, boilerCoPump: true }))
      .toMatchObject({ work_mode: 'OFF', cop_pause: '0' });
    // sama ręczna zmiana (bez work_mode): bez konfiguracji
    expect(toControllerOperation({ hot_pomp: '1', cwu_max: '47' }, { firmwareVersion: '1.2.0', pumpMode: 'MANUAL' }))
      .toEqual({ hot_pomp: '1', temp_max: '47' });
  });

  it('co 1.2.0 dostaje w /hp/add nowy kontrakt, a jego telemetria zapisuje temp_min / temp_max', async () => {
    const sn = 'A4CF0000C120';
    const { rootId } = (await request(app).post('/api/devices/register').send({ deviceId: sn, version: '1.2.0' })).body;
    await DeviceModel.findByIdAndUpdate(rootId, {
      properties: { work_mode: 'MANUAL', temp_min: '33', temp_max: '44' },
      pumpConfig: { connection: 'co', tankLiters: 200, pvDtu: false, pvForce: false },
    });
    await runSchedulerOnce(new Date(), rootId);
    await request(app).put(`/api/hp/cwu-loading?rootId=${rootId}`).send({ active: false, co_pump: true }).expect(200);

    const response = await request(app).post(`/api/hp/add?deviceId=${sn}`)
      .send({ HP: { Ttarget: 40, HPS: 0 }, work_mode: 'MANUAL', temp_min: 33, temp_max: 44, controller_mode: 'CLOUD' })
      .expect(201);
    expect(response.body.operation).toEqual({
      work_mode: 'MANUAL', force: '0', temp_min: '33', temp_max: '44',
      pv_force: '0', pv_dtu: '0', tank_liters: '200', cop_pause: '1',
    });
    const record = await HpEntryModel.findOne({ rootId }).lean();
    expect(record).toMatchObject({ work_mode: 'MANUAL', temp_min: 33, temp_max: 44 });

    // stary co (bez wersji): dawny kontrakt
    await DeviceModel.findByIdAndUpdate(rootId, { firmwareVersion: '1.1.1' });
    await runSchedulerOnce(new Date(), rootId);
    const old = await request(app).post(`/api/hp/add?deviceId=${sn}`).send({ HP: { Ttarget: 40 } }).expect(201);
    expect(old.body.operation).toMatchObject({ work_mode: 'M', co_min: '33', cwu_max: '44' });
    expect(old.body.operation).not.toHaveProperty('temp_min');
  });
});
