import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from './src/core/app'
import { DeviceModel } from './src/core/models/device.model'
import { WaterPressureTankRunModel } from './src/modules/water-pressure-tank/models/water-pressure-tank-run.model'
import { addWaterPressureTankReport, estimateWater } from './src/modules/water-pressure-tank/services/water-pressure-tank.service'

const register = (deviceId: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/api/devices/register').send({
    deviceId, deviceType: 'water-pressure-tank', name: 'Hydrofor', ...extra,
  });

describe('Hydrofor (water-pressure-tank)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await WaterPressureTankRunModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('estimateWater', () => {
    const base = { pressure_low: 2, pressure_high: 4 };

    it('liczy zbiornik przeponowy z ciśnienia wstępnego i poduszkę z k', () => {
      const result = estimateWater({
        ...base,
        tanks: [
          { kind: 'membrane', volumeLiters: 300, enabled: true, precharge: 1.8 },
          { kind: 'air', volumeLiters: 300, enabled: true, k: 1 },
        ],
      });
      expect(result.waterMembraneLiters).toBeCloseTo(111.7, 0);
      expect(result.waterAirBaseLiters).toBeCloseTo(40.2, 0);
      expect(result.waterLiters).toBeCloseTo(151.9, 0);
    });

    it('pomija wyłączony zbiornik i skaluje poduszkę przez k', () => {
      const result = estimateWater({
        ...base,
        tanks: [
          { kind: 'membrane', volumeLiters: 300, enabled: false, precharge: 1.8 },
          { kind: 'air', volumeLiters: 300, enabled: true, k: 0.5 },
        ],
      });
      expect(result.waterMembraneLiters).toBe(0);
      expect(result.waterLiters).toBeCloseTo(20.1, 0);
      expect(result.waterAirBaseLiters).toBeCloseTo(40.2, 0);
    });

    it('przy p0 powyżej progu dolnego worek oddaje wodę dopiero od p0', () => {
      const result = estimateWater({
        ...base,
        tanks: [{ kind: 'membrane', volumeLiters: 100, enabled: true, precharge: 3 }],
      });
      // V · (1 − p0_abs / p_g_abs) = 100 · (1 − 4,013 / 5,013)
      expect(result.waterLiters).toBeCloseTo(19.9, 0);
    });

    it('klient liczy podgląd tym samym wzorem co serwer', async () => {
      // ścieżka w zmiennej: tsc serwera nie włącza pliku klienta do kompilacji
      const clientModule = '../client/src/devices/water-pressure-tank/utils/water.ts';
      const client = await import(clientModule);
      const cases = [
        { pressure_low: 2, pressure_high: 4, tanks: [
          { kind: 'membrane', volumeLiters: 300, enabled: true, precharge: 1.8 },
          { kind: 'air', volumeLiters: 300, enabled: true, k: 0.8 },
        ] },
        { pressure_low: 1.5, pressure_high: 3.5, tanks: [
          { kind: 'membrane', volumeLiters: 80, enabled: true, precharge: 2.5 },
          { kind: 'air', volumeLiters: 200, enabled: false, k: 1 },
        ] },
        { pressure_low: 3, pressure_high: 2, tanks: [{ kind: 'air', volumeLiters: 300, enabled: true }] },
      ] as const;
      for (const properties of cases) {
        const tanks = properties.tanks.map((tank) => ({ ...tank }));
        expect(client.estimatedWaterPerRun({ ...properties, tanks }))
          .toBeCloseTo(estimateWater({ ...properties, tanks }).waterLiters, 0);
      }
      // kalkulator pojemności: obwód 160 cm, wysokość 150 cm ≈ 306 l
      expect(client.cylinderLiters(160, 150)).toBeCloseTo(305.6, 0);
    });

    it('zwraca zero bez poprawnych progów presostatu', () => {
      expect(estimateWater({ pressure_low: 4, pressure_high: 2, tanks: [
        { kind: 'air', volumeLiters: 300, enabled: true },
      ] }).waterLiters).toBe(0);
    });
  });

  describe('zgłoszenie sterownika', () => {
    it('tworzy hydrofor z domyślnymi ustawieniami, zwraca ustawienia', async () => {
      const response = await register('C3A1B2C3D401');
      expect(response.status).toBe(201);
      expect(response.body.deviceType).toBe('water-pressure-tank');
      expect(response.body.name).toBe('Hydrofor');
      expect(response.body.settings.compressor_seconds).toBe(30);
      expect(response.body.settings.tanks).toHaveLength(2);
    });

    it('przy kolejnym zgłoszeniu zwraca ten sam rootId bez zmiany nazwy', async () => {
      const first = await register('C3A1B2C3D402');
      const second = await register('C3A1B2C3D402', { name: 'Inna nazwa' });
      expect(second.status).toBe(200);
      expect(second.body.rootId).toBe(first.body.rootId);
      expect(second.body.name).toBe('Hydrofor');
    });

    it('pompa ciepła nie dostaje ustawień hydroforu', async () => {
      const response = await request(app).post('/api/devices/register').send({
        deviceId: 'A4CF0000AA01', deviceType: 'heat_pump',
      });
      expect(response.status).toBe(201);
      expect(response.body.settings).toBeUndefined();
    });

    it('odrzuca nieznany typ urządzenia', async () => {
      const response = await register('C3A1B2C3D403', { deviceType: 'toaster' });
      expect(response.status).toBe(400);
    });
  });

  describe('uruchomienia', () => {
    it('wylicza daty z czasów względnych i przesuwa pumpEnd z każdą wiadomością', async () => {
      const { body } = await register('C3A1B2C3D410');
      const rootId = body.rootId;
      const t0 = new Date('2026-09-28T08:00:00.000Z');

      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 2, compressorStartS: 1 }, t0);
      await addWaterPressureTankReport(rootId,
        { runId: 1, pumpRunS: 40, compressorStartS: 1, compressorEndS: 31 },
        new Date(t0.getTime() + 38_000));

      const run = await WaterPressureTankRunModel.findOne({ rootId, runId: 1 }).lean();
      expect(run?.pumpStart.toISOString()).toBe('2026-09-28T07:59:58.000Z');
      expect(run?.compressorStart?.toISOString()).toBe('2026-09-28T07:59:59.000Z');
      expect(run?.compressorEnd?.toISOString()).toBe('2026-09-28T08:00:29.000Z');
      expect(run?.pumpEnd.toISOString()).toBe('2026-09-28T08:00:38.000Z');
      expect(run?.timeApproximate).toBe(false);
      expect(run?.waterLiters).toBeCloseTo(151.9, 0);
    });

    it('przyjmuje dane z samym deviceId, a uruchomienie z kolejki oznacza jako przybliżone', async () => {
      const { body } = await register('C3A1B2C3D411');
      const posted = await request(app)
        .post('/api/water-pressure-tank/add?deviceId=C3A1B2C3D411')
        .send({ runId: 7, pumpRunS: 90, compressorStartS: 1, compressorEndS: 31, queued: true });
      expect(posted.status).toBe(201);

      const run = await WaterPressureTankRunModel.findOne({ rootId: body.rootId, runId: 7 }).lean();
      expect(run?.timeApproximate).toBe(true);
      expect((run!.pumpEnd.getTime() - run!.pumpStart.getTime()) / 1000).toBe(90);
    });

    it('odpowiada 404 dla nieznanego sterownika i 409 dla cudzego rootId', async () => {
      const unknown = await request(app)
        .post('/api/water-pressure-tank/add?deviceId=FFFFFFFFFFFF')
        .send({ runId: 1, pumpRunS: 1 });
      expect(unknown.status).toBe(404);

      const other = await register('C3A1B2C3D412');
      const conflict = await request(app)
        .post(`/api/water-pressure-tank/add?deviceId=C3A1B2C3D413&rootId=${other.body.rootId}`)
        .send({ runId: 1, pumpRunS: 1 });
      expect(conflict.status).toBe(409);
    });

    it('uruchomienie znane z wiadomości na żywo, dosłane z kolejki, dostaje koniec z czasu pracy', async () => {
      const { body } = await register('C3A1B2C3D417');
      const rootId = body.rootId;
      const t0 = new Date('2026-09-28T11:00:00.000Z');
      // na żywo doszły tylko 3 s, potem zanik sieci; pełny czas przychodzi z kolejki następnego startu
      await addWaterPressureTankReport(rootId, { runId: 5, pumpRunS: 3, compressorStartS: 1 }, t0);
      await addWaterPressureTankReport(rootId,
        { runId: 5, pumpRunS: 120, compressorStartS: 1, compressorEndS: 31, restarts: 1, queued: true },
        new Date('2026-09-28T15:00:00.000Z'));

      const run = await WaterPressureTankRunModel.findOne({ rootId, runId: 5 }).lean();
      expect(run?.pumpStart.toISOString()).toBe('2026-09-28T10:59:57.000Z');
      expect(run?.pumpEnd.toISOString()).toBe('2026-09-28T11:01:57.000Z');
      expect(run?.compressorEnd?.toISOString()).toBe('2026-09-28T11:00:28.000Z');
      expect(run?.restarts).toBe(1);
      expect(run?.timeApproximate).toBe(false);
    });

    it('zachowuje początek kompresora, gdy kolejna wiadomość go nie ma', async () => {
      const { body } = await register('C3A1B2C3D418');
      const rootId = body.rootId;
      const t0 = new Date('2026-09-28T12:00:00.000Z');
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 2, compressorStartS: 1 }, t0);
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 3 }, new Date(t0.getTime() + 1000));
      const run = await WaterPressureTankRunModel.findOne({ rootId, runId: 1 }).lean();
      expect(run?.compressorStart?.toISOString()).toBe('2026-09-28T11:59:59.000Z');
    });

    it('oznacza uruchomienie w toku, gdy ostatnia wiadomość jest świeża', async () => {
      const { body } = await register('C3A1B2C3D419');
      await request(app).post('/api/water-pressure-tank/add?deviceId=C3A1B2C3D419')
        .send({ runId: 1, pumpRunS: 5, compressorStartS: 1 }).expect(201);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
      const runs = await request(app).get(`/api/water-pressure-tank/runs?rootId=${body.rootId}&from=${today}&to=${today}`);
      expect(runs.body).toHaveLength(1);
      expect(runs.body[0].inProgress).toBe(true);
    });

    it('zwraca uruchomienia z okresu podanego czasami ISO i odrzuca złe zakresy', async () => {
      const { body } = await register('C3A1B2C3D41A');
      const rootId = body.rootId;
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 10 }, new Date('2026-08-10T10:00:00Z'));
      await addWaterPressureTankReport(rootId, { runId: 2, pumpRunS: 10 }, new Date('2026-08-20T10:00:00Z'));

      const period = await request(app)
        .get(`/api/water-pressure-tank/runs?rootId=${rootId}&fromTime=2026-08-09T00:00:00Z&toTime=2026-08-15T00:00:00Z`);
      expect(period.status).toBe(200);
      expect(period.body.map((run: { runId: number }) => run.runId)).toEqual([1]);

      expect((await request(app).get(`/api/water-pressure-tank/runs?rootId=${rootId}`)).status).toBe(400);
      expect((await request(app).get(`/api/water-pressure-tank/runs?rootId=${rootId}&fromTime=zle&toTime=zle`)).status).toBe(400);
      expect((await request(app).get(`/api/water-pressure-tank/summary?rootId=${rootId}&period=week&date=2026-08-10`)).status).toBe(400);
      expect((await request(app).get(`/api/water-pressure-tank/summary?rootId=${rootId}&period=day&date=10.08.2026`)).status).toBe(400);
    });

    it('odrzuca ujemne czasy i zbyt długą pracę pompy', async () => {
      await register('C3A1B2C3D41B');
      const post = (payload: Record<string, unknown>) =>
        request(app).post('/api/water-pressure-tank/add?deviceId=C3A1B2C3D41B').send(payload);
      expect((await post({ runId: 1, pumpRunS: -1 })).status).toBe(400);
      expect((await post({ runId: 1, pumpRunS: 90000 })).status).toBe(400);
      expect((await post({ runId: 1.5, pumpRunS: 5 })).status).toBe(400);
      expect((await post({ runId: 1, pumpRunS: 5, compressorEndS: -3 })).status).toBe(400);
    });

    it('odrzuca wiadomość bez runId albo pumpRunS', async () => {
      await register('C3A1B2C3D414');
      const response = await request(app)
        .post('/api/water-pressure-tank/add?deviceId=C3A1B2C3D414')
        .send({ pumpRunS: 5 });
      expect(response.status).toBe(400);
    });

    it('liczy wodę z ustawień w chwili utworzenia, bez zmiany historii', async () => {
      const { body } = await register('C3A1B2C3D415');
      const rootId = body.rootId;
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 1 }, new Date('2026-09-28T09:00:00Z'));

      await DeviceModel.updateOne({ _id: rootId }, { $set: { 'properties.tanks.1.enabled': false } });
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 5 }, new Date('2026-09-28T09:00:04Z'));
      await addWaterPressureTankReport(rootId, { runId: 2, pumpRunS: 1 }, new Date('2026-09-28T10:00:00Z'));

      const runs = await WaterPressureTankRunModel.find({ rootId }).sort({ runId: 1 }).lean();
      expect(runs[0].waterLiters).toBeCloseTo(151.9, 0);
      expect(runs[1].waterLiters).toBeCloseTo(40.2, 0);
    });

    it('zwraca uruchomienia z zakresu i podsumowania dnia, miesiąca i roku', async () => {
      const { body } = await register('C3A1B2C3D416');
      const rootId = body.rootId;
      // 06:30 czasu warszawskiego (UTC+2) = 04:30Z
      await addWaterPressureTankReport(rootId, { runId: 1, pumpRunS: 60 }, new Date('2026-09-28T04:31:00Z'));
      await addWaterPressureTankReport(rootId, { runId: 2, pumpRunS: 60 }, new Date('2026-09-28T04:45:00Z'));
      await addWaterPressureTankReport(rootId, { runId: 3, pumpRunS: 60 }, new Date('2026-09-02T18:00:00Z'));

      const runs = await request(app).get(`/api/water-pressure-tank/runs?rootId=${rootId}&from=2026-09-28&to=2026-09-28`);
      expect(runs.status).toBe(200);
      expect(runs.body).toHaveLength(2);
      expect(runs.body[0].inProgress).toBe(false);

      const day = await request(app).get(`/api/water-pressure-tank/summary?rootId=${rootId}&period=day&date=2026-09-28`);
      expect(day.body.buckets).toHaveLength(24);
      expect(day.body.buckets[6].runs).toBe(2);
      expect(day.body.buckets[6].waterLiters).toBeCloseTo(303.8, 0);

      const month = await request(app).get(`/api/water-pressure-tank/summary?rootId=${rootId}&period=month&date=2026-09-01`);
      expect(month.body.buckets).toHaveLength(30);
      expect(month.body.buckets[27].runs).toBe(2);
      expect(month.body.buckets[1].runs).toBe(1);

      const year = await request(app).get(`/api/water-pressure-tank/summary?rootId=${rootId}&period=year&date=2026-01-01`);
      expect(year.body.buckets).toHaveLength(12);
      expect(year.body.buckets[8].runs).toBe(3);
    });
  });

  describe('wodomierz', () => {
    it('zapisuje odczyty, liczy zużycie okresów i podpowiada k', async () => {
      const { body } = await register('C3A1B2C3D420');
      const rootId = body.rootId;
      // 10 uruchomień: przepona 111,7 l, poduszka (k = 1) 40,2 l
      for (let runId = 1; runId <= 10; runId++) {
        await addWaterPressureTankReport(rootId, { runId, pumpRunS: 60 }, new Date(`2026-09-${10 + runId}T10:00:00Z`));
      }
      await request(app).post(`/api/water-pressure-tank/meter?rootId=${rootId}`)
        .send({ readAt: '2026-09-10T12:00:00Z', valueM3: 100 }).expect(201);
      // wodomierz: 1,317 m³ = 1317 l = 10 · (111,7 + 0,5 · 40,2)
      const second = await request(app).post(`/api/water-pressure-tank/meter?rootId=${rootId}`)
        .send({ readAt: '2026-09-21T12:00:00Z', valueM3: 101.318 });
      expect(second.status).toBe(201);

      const list = await request(app).get(`/api/water-pressure-tank/meter?rootId=${rootId}`);
      expect(list.body).toHaveLength(2);

      const summary = await request(app).get(`/api/water-pressure-tank/meter/summary?rootId=${rootId}&year=2026`);
      expect(summary.body.periods).toHaveLength(1);
      expect(summary.body.periods[0].meterLiters).toBeCloseTo(1318, 0);
      expect(summary.body.periods[0].estimatedLiters).toBeCloseTo(1519, -1);
      expect(summary.body.suggestedK).toBeCloseTo(0.5, 1);
      expect(summary.body.months[8].meterLiters).toBeCloseTo(1318, 0);
      expect(summary.body.months[0].meterLiters).toBeNull();

      const removed = await request(app).delete(`/api/water-pressure-tank/meter/${list.body[0]._id}?rootId=${rootId}`);
      expect(removed.status).toBe(200);
    });

    it('bez dwóch odczytów nie liczy zużycia ani k; zły rok i nieznany odczyt', async () => {
      const { body } = await register('C3A1B2C3D422');
      const rootId = body.rootId;
      await request(app).post(`/api/water-pressure-tank/meter?rootId=${rootId}`)
        .send({ readAt: '2026-09-01T08:00:00Z', valueM3: 10 }).expect(201);
      const summary = await request(app).get(`/api/water-pressure-tank/meter/summary?rootId=${rootId}&year=2026`);
      expect(summary.body.periods).toEqual([]);
      expect(summary.body.suggestedK).toBeNull();

      expect((await request(app).get(`/api/water-pressure-tank/meter/summary?rootId=${rootId}&year=26`)).status).toBe(400);
      const missing = await request(app).delete(`/api/water-pressure-tank/meter/${new mongoose.Types.ObjectId()}?rootId=${rootId}`);
      expect(missing.status).toBe(404);
      expect((await request(app).delete(`/api/water-pressure-tank/meter/zle-id?rootId=${rootId}`)).status).toBe(400);
    });

    it('nie usuwa odczytu innego urządzenia', async () => {
      const owner = await register('C3A1B2C3D423');
      const other = await register('C3A1B2C3D424');
      const created = await request(app).post(`/api/water-pressure-tank/meter?rootId=${owner.body.rootId}`)
        .send({ readAt: '2026-09-01T08:00:00Z', valueM3: 1 });
      const response = await request(app).delete(`/api/water-pressure-tank/meter/${created.body._id}?rootId=${other.body.rootId}`);
      expect(response.status).toBe(404);
    });

    it('odrzuca odczyt bez daty albo stanu', async () => {
      const { body } = await register('C3A1B2C3D421');
      const response = await request(app).post(`/api/water-pressure-tank/meter?rootId=${body.rootId}`).send({ valueM3: 5 });
      expect(response.status).toBe(400);
    });
  });

  describe('ustawienia hydroforu', () => {
    it('zapisuje ustawienia i zwraca je sterownikowi przy zgłoszeniu', async () => {
      const { body } = await register('C3A1B2C3D440');
      const saved = await request(app).put(`/api/device/properties?rootId=${body.rootId}`).send({
        compressor_seconds: 45, pressure_low: 1.8, pressure_high: 3.6,
        tanks: [{ name: 'Ocynkowany', kind: 'air', volumeLiters: 300, enabled: true, k: 0.9 }],
      });
      expect(saved.status).toBe(200);
      const again = await register('C3A1B2C3D440');
      expect(again.body.settings).toMatchObject({ compressor_seconds: 45, pressure_low: 1.8, pressure_high: 3.6 });
      expect(again.body.settings.tanks).toHaveLength(1);
      expect(again.body.settings.tanks[0].k).toBe(0.9);
    });

    it('odrzuca czas kompresora poza 1–3600 s i nieznany rodzaj zbiornika', async () => {
      const { body } = await register('C3A1B2C3D441');
      const put = (properties: Record<string, unknown>) =>
        request(app).put(`/api/device/properties?rootId=${body.rootId}`).send(properties);
      expect((await put({ compressor_seconds: 5000 })).status).toBe(400);
      expect((await put({ compressor_seconds: 30, tanks: [{ kind: 'balon', volumeLiters: 10, enabled: true }] })).status).toBe(400);
    });

    it('sterownik zmienia sam czas kompresora, bez naruszania progów i zbiorników', async () => {
      const { body } = await register('C3A1B2C3D442');
      const response = await request(app)
        .put('/api/water-pressure-tank/settings?deviceId=C3A1B2C3D442').send({ compressor_seconds: 55 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ compressor_seconds: 55 });

      const again = await register('C3A1B2C3D442');
      expect(again.body.rootId).toBe(body.rootId);
      expect(again.body.settings).toMatchObject({ compressor_seconds: 55, pressure_low: 2, pressure_high: 4 });
      expect(again.body.settings.tanks).toHaveLength(2);
    });

    it('czas kompresora ze sterownika: walidacja, 404, 409 i odmowa dla pompy ciepła', async () => {
      const { body } = await register('C3A1B2C3D443');
      const put = (query: string, seconds: unknown) =>
        request(app).put(`/api/water-pressure-tank/settings?${query}`).send({ compressor_seconds: seconds });
      const own = `deviceId=C3A1B2C3D443&rootId=${body.rootId}`;
      expect((await put(own, 0)).status).toBe(400);
      expect((await put(own, 3601)).status).toBe(400);
      expect((await put(own, 12.5)).status).toBe(400);
      expect((await put(own, '30')).status).toBe(400);
      expect((await put('deviceId=C3FFFFFFFFFF', 30)).status).toBe(404);
      expect((await put(`deviceId=C3A1B2C3D444&rootId=${body.rootId}`, 30)).status).toBe(409);

      await request(app).post('/api/devices/register').send({ deviceId: 'A4CF0000AA02', deviceType: 'heat_pump' });
      expect((await put('deviceId=A4CF0000AA02', 30)).status).toBe(404);
    });
  });

  describe('sterownik domyślny', () => {
    it('ustawia najwyżej jeden sterownik domyślny', async () => {
      const first = await register('C3A1B2C3D430');
      const second = await register('C3A1B2C3D431');
      await request(app).put(`/api/devices/${first.body.rootId}/default`).send({}).expect(200);
      await request(app).put(`/api/devices/${second.body.rootId}/default`).send({ isDefault: true }).expect(200);

      const defaults = await DeviceModel.find({ isDefault: true }).lean();
      expect(defaults).toHaveLength(1);
      expect(String(defaults[0]._id)).toBe(second.body.rootId);

      const list = await request(app).get('/api/devices');
      expect(list.body.find((device: { rootId: string }) => device.rootId === second.body.rootId).isDefault).toBe(true);

      await request(app).put(`/api/devices/${second.body.rootId}/default`).send({ isDefault: false }).expect(200);
      expect(await DeviceModel.countDocuments({ isDefault: true })).toBe(0);
    });

    it('odpowiada 404 dla nieznanego urządzenia', async () => {
      const response = await request(app).put(`/api/devices/${new mongoose.Types.ObjectId()}/default`).send({});
      expect(response.status).toBe(404);
    });
  });
});
