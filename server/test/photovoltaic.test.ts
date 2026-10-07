// Testy modułu fotowoltaiki (baza w mongodb-memory-server): urządzenie „photovoltaic” zakładane przy
// odczycie PV od sterownika co, bieżący stan z panelami, przebieg dnia w przedziałach 5 min,
// produkcja w dniach i miesiącach (pv i starsza historia w hp), odczyty panelu, mikrofalowniki.
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { inverterModel, panelState } from '../src/modules/photovoltaic/services/photovoltaic.service'

const SN = 'AABBCCDD0001';
const panel = (serial: string, port: number, power: number, extra: Record<string, number> = {}) => ({
  serial, port, power, prod_today: 100 * port, prod_total: 1000 * port, temperature: 30,
  pv_voltage: 33, pv_current: 0.5, grid_voltage: 230, grid_frequency: 50, status: 3,
  alarm_code: 0, alarm_count: 0, link: 1, ...extra,
});

describe('Fotowoltaika', () => {
  let mongoServer: MongoMemoryServer;
  let pvRootId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await request(app).post('/api/devices/register').send({ deviceId: SN, deviceType: 'heat_pump' });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('pierwszy odczyt PV zakłada urządzenie „Fotowoltaika” z tym samym SN', async () => {
    const res = await request(app).post(`/api/pv/add?deviceId=${SN}`).send({
      time: '2026.09.26 12:00:00', total_power: 1500, total_prod: 1_000_000, total_prod_today: 4000, temperature: 35,
      panels: [panel('114400000001', 1, 300), panel('114400000001', 2, 0, { link: 0 }), panel('116400000002', 1, 0)],
    });
    expect(res.status).toBe(201);
    const devices = (await request(app).get('/api/devices')).body as { rootId: string; deviceType: string; deviceId: string; name: string }[];
    const pv = devices.find((d) => d.deviceType === 'photovoltaic');
    expect(pv).toMatchObject({ deviceId: SN, name: 'Fotowoltaika' });
    pvRootId = pv!.rootId;
  });

  it('/current: moc, produkcja, rok od pierwszego odczytu, stany paneli', async () => {
    const res = await request(app).get(`/api/photovoltaic/current?rootId=${pvRootId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ power: 1500, todayWh: 4000, totalWh: 1_000_000, temperature: 35, panelsAvailable: true });
    // licznik na początku dnia pierwszego odczytu: 1 000 000 − 4000
    expect(res.body.yearWh).toBe(4000);
    expect(res.body.panels.map((p: { key: string; state: string }) => `${p.key}:${p.state}`))
      .toEqual(['114400000001-1:produces', '114400000001-2:offline', '116400000002-1:idle']);
  });

  it('/day: przedziały 5 min, energia i szczyt dnia, moc paneli', async () => {
    await request(app).post(`/api/pv/add?deviceId=${SN}`).send({
      total_power: 2100, total_prod: 1_000_500, total_prod_today: 4500, temperature: 36,
      panels: [panel('114400000001', 1, 400)],
    });
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
    const res = await request(app).get(`/api/photovoltaic/day?rootId=${pvRootId}&date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body.energyWh).toBe(4500);
    expect(res.body.peakW).toBe(2100);
    expect(res.body.points.length).toBeGreaterThanOrEqual(1);
    const first = res.body.panels.find((p: { key: string }) => p.key === '114400000001-1');
    expect(first.points.length).toBeGreaterThanOrEqual(1);
    expect(first.energyWh).toBe(100);  // prod_today portu 1
    expect((await request(app).get(`/api/photovoltaic/day?rootId=${pvRootId}&date=jutro`)).status).toBe(400);
  });

  it('/summary: miesiąc z dni pv i starszej historii w hp', async () => {
    // starszy firmware: PV w telemetrii HP (do 2026-09-26)
    const hp = await request(app).post(`/api/hp/add?deviceId=${SN}`).send({
      HP: { Ttarget: 40 }, PV: { total_power: 900, total_prod: 990_000, total_prod_today: 3000, temperature: 20 },
    });
    expect(hp.status).toBe(201);
    const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' }).slice(0, 7);
    const res = await request(app).get(`/api/photovoltaic/summary?rootId=${pvRootId}&period=month&date=${month}`);
    expect(res.status).toBe(200);
    // ten sam dzień w pv i hp: wygrywa pv (4500)
    expect(res.body.buckets).toHaveLength(1);
    expect(res.body.buckets[0]).toMatchObject({ energyWh: 4500, peakW: 2100, days: 1 });
    expect((await request(app).get(`/api/photovoltaic/summary?rootId=${pvRootId}&period=year&date=26`)).status).toBe(400);
    const total = await request(app).get(`/api/photovoltaic/summary?rootId=${pvRootId}&period=total`);
    expect(total.body.energyWh).toBe(4500);
  });

  it('/readings: całość i jeden panel, od najnowszego', async () => {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
    const all = await request(app).get(`/api/photovoltaic/readings?rootId=${pvRootId}&date=${date}`);
    expect(all.status).toBe(200);
    expect(all.body[0]).toMatchObject({ todayWh: 4500 });
    const one = await request(app).get(`/api/photovoltaic/readings?rootId=${pvRootId}&date=${date}&panel=114400000001-1`);
    expect(one.body[0]).toMatchObject({ serial: '114400000001', port: 1, state: 'produces' });
    expect((await request(app).get(`/api/photovoltaic/readings?rootId=${pvRootId}&panel=x`)).status).toBe(400);
  });

  it('/inverters: mikrofalowniki z ostatniego odczytu z panelami', async () => {
    const res = await request(app).get(`/api/photovoltaic/inverters?rootId=${pvRootId}`);
    expect(res.body.inverters).toHaveLength(1);
    expect(res.body.inverters[0]).toMatchObject({ serial: '114400000001', model: 'HMS-600…1000-2T (2 porty)' });
  });

  it('stan panelu i model mikrofalownika', () => {
    expect(panelState({ serial: '1', port: 1, power: 5, link: 1 })).toBe('produces');
    expect(panelState({ serial: '1', port: 1, power: 0, link: 1 })).toBe('idle');
    expect(panelState({ serial: '1', port: 1, power: 0, link: 0 })).toBe('offline');
    expect(panelState({ serial: '1', port: 1, power: 5, link: 1, alarm_code: 12 })).toBe('alarm');
    expect(inverterModel('116400000003')).toBe('HMS-1600/1800/2000-4T (4 porty)');
    expect(inverterModel('114100000004')).toBe('HM-600/700/800 (2 porty)');
    expect(inverterModel('999')).toBeUndefined();
  });
});
