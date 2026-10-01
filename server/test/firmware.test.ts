// Testy firmware sterowników przez sieć (OTA, baza w mongodb-memory-server): wgranie
// pliku, sumy, walidacja, wersja bieżąca i jedna poprzednia, przywracanie, pobranie
// pliku i oferta w odpowiedzi na zgłoszenie hydroforu.
import { createHash } from 'crypto'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { FirmwareImageModel, FirmwareOfferModel } from '../src/core/models/firmware.model'
import { MAX_FIRMWARE_BYTES } from '../src/core/services/firmware.service'

// obraz ESP32 zaczyna się bajtem 0xE9; reszta losowa (różna dla każdej wersji)
const image = (seed: number, size = 2048) => {
  const data = Buffer.alloc(size, seed);
  data[0] = 0xe9;
  return data;
};

const upload = (version: string, data: Buffer, type = 'water-pressure-tank') =>
  request(app).put(`/api/firmware/${type}/${version}`).set('Content-Type', 'application/octet-stream').send(data);

const register = (deviceId: string, deviceType = 'water-pressure-tank') =>
  request(app).post('/api/devices/register').send({ deviceId, deviceType, name: 'Hydrofor' });

describe('Firmware sterowników (OTA)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await FirmwareImageModel.syncIndexes();
    await FirmwareOfferModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await FirmwareImageModel.deleteMany({});
    await FirmwareOfferModel.deleteMany({});
  });

  it('wgrywa plik, liczy SHA-256 i ustawia go jako oferowany', async () => {
    const data = image(1);
    const response = await upload('1.0.0', data);

    expect(response.status).toBe(200);
    expect(response.body.version).toBe('1.0.0');
    expect(response.body.enabled).toBe(true);
    expect(response.body.images).toHaveLength(1);
    expect(response.body.images[0]).toMatchObject({
      version: '1.0.0',
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      active: true,
    });
  });

  it('odrzuca plik, który nie jest obrazem ESP32, za duży, złą wersję i zły typ treści', async () => {
    const notImage = Buffer.alloc(100, 7);
    expect((await upload('1.0.0', notImage)).status).toBe(400);
    expect((await upload('1.0.0', image(1, MAX_FIRMWARE_BYTES + 1))).status).toBe(400);
    expect((await upload('../etc', image(1))).status).toBe(404);
    expect((await upload('1 0', image(1))).status).toBe(400);

    const json = await request(app).put('/api/firmware/water-pressure-tank/1.0.0').send({ a: 1 });
    expect(json.status).toBe(400);
    expect((await request(app).get('/api/firmware/water-pressure-tank')).body.images).toHaveLength(0);
  });

  it('rodzaj bez aktualizacji przez sieć (pompa ciepła) daje 404', async () => {
    expect((await request(app).get('/api/firmware/heat_pump')).status).toBe(404);
    expect((await upload('1.0.0', image(1), 'heat_pump')).status).toBe(404);
    expect((await request(app).get('/api/firmware/nieznany')).status).toBe(404);
  });

  it('trzyma wersję bieżącą i jedną poprzednią, starsze usuwa', async () => {
    await upload('1.0.0', image(1));
    await upload('1.0.1', image(2));
    let summary = (await request(app).get('/api/firmware/water-pressure-tank')).body;
    expect(summary.images.map((item: { version: string }) => item.version).sort()).toEqual(['1.0.0', '1.0.1']);
    expect(summary.previousVersion).toBe('1.0.0');

    await upload('1.0.2', image(3));
    summary = (await request(app).get('/api/firmware/water-pressure-tank')).body;
    expect(summary.images.map((item: { version: string }) => item.version).sort()).toEqual(['1.0.1', '1.0.2']);
    expect(summary.version).toBe('1.0.2');
    expect(summary.previousVersion).toBe('1.0.1');
    expect((await request(app).get('/api/firmware/water-pressure-tank/1.0.0.bin')).status).toBe(404);
  });

  it('przywraca poprzednią wersję bez ponownego wgrywania, a bieżąca zostaje poprzednią', async () => {
    await upload('1.0.0', image(1));
    await upload('1.0.1', image(2));

    const restored = await request(app).put('/api/firmware/water-pressure-tank').send({ version: '1.0.0' });
    expect(restored.status).toBe(200);
    expect(restored.body.version).toBe('1.0.0');
    expect(restored.body.previousVersion).toBe('1.0.1');
    expect(restored.body.images).toHaveLength(2);

    expect((await request(app).put('/api/firmware/water-pressure-tank').send({ version: '9.9.9' })).status).toBe(404);
  });

  it('wgranie tej samej wersji nadpisuje plik i sumę', async () => {
    await upload('1.0.0', image(1));
    const second = image(5);
    const response = await upload('1.0.0', second);
    expect(response.body.images).toHaveLength(1);
    expect(response.body.images[0].sha256).toBe(createHash('sha256').update(second).digest('hex'));
  });

  it('wydaje plik bajt w bajt, z długością, bez rootId', async () => {
    const data = image(9, 4096);
    await upload('1.0.0', data);

    const response = await request(app).get('/api/firmware/water-pressure-tank/1.0.0.bin');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/octet-stream');
    expect(response.headers['content-length']).toBe(String(data.length));
    expect(Buffer.compare(response.body, data)).toBe(0);

    // bez przyrostka .bin i dla nieznanej wersji nie ma pliku
    expect((await request(app).get('/api/firmware/water-pressure-tank/1.0.0')).status).toBe(404);
    expect((await request(app).get('/api/firmware/water-pressure-tank/2.0.0.bin')).status).toBe(404);
  });

  it('zgłoszenie hydroforu niesie ofertę {version, url, sha256}', async () => {
    const data = image(3);
    await upload('1.0.1', data);

    const response = await register('AABBCCDDEE01');
    expect(response.body.settings.firmware).toEqual({
      version: '1.0.1',
      url: expect.stringMatching(/^https?:\/\/.+\/api\/firmware\/water-pressure-tank\/1\.0\.1\.bin$/),
      sha256: createHash('sha256').update(data).digest('hex'),
    });
    // pozostałe ustawienia zostają
    expect(response.body.settings.compressor_seconds).toBe(30);
  });

  it('bez pliku albo po wyłączeniu zgłoszenie nie niesie oferty', async () => {
    expect((await register('AABBCCDDEE02')).body.settings.firmware).toBeUndefined();

    await upload('1.0.1', image(3));
    const off = await request(app).put('/api/firmware/water-pressure-tank').send({ enabled: false });
    expect(off.body.enabled).toBe(false);
    expect((await register('AABBCCDDEE02')).body.settings.firmware).toBeUndefined();

    await request(app).put('/api/firmware/water-pressure-tank').send({ enabled: true });
    expect((await register('AABBCCDDEE02')).body.settings.firmware.version).toBe('1.0.1');
  });

  it('oferta nie trafia do rodzajów bez aktualizacji (pompa ciepła)', async () => {
    await upload('1.0.1', image(3));
    const response = await register('AABBCCDDEE03', 'heat_pump');
    expect(response.body.settings?.firmware).toBeUndefined();
  });
  it('zapisuje opis wersji i odrzuca za długi', async () => {
    const put = (version: string, description: string) =>
      request(app).put(`/api/firmware/water-pressure-tank/${version}`).query({ description })
        .set('Content-Type', 'application/octet-stream').send(image(1));

    const ok = await put('1.0.0', '  Poprawka czasu kompresora  ');
    expect(ok.status).toBe(200);
    expect(ok.body.images[0].description).toBe('Poprawka czasu kompresora');

    expect((await put('1.0.1', 'x'.repeat(501))).status).toBe(400);
    expect((await upload('1.0.2', image(2))).body.images.find((item: { version: string }) => item.version === '1.0.2').description).toBe('');
  });

  it('usuwa poprzednią wersję, ale nie oferowaną', async () => {
    await upload('1.0.0', image(1));
    await upload('1.0.1', image(2));

    const active = await request(app).delete('/api/firmware/water-pressure-tank/1.0.1');
    expect(active.status).toBe(409);

    const removed = await request(app).delete('/api/firmware/water-pressure-tank/1.0.0');
    expect(removed.status).toBe(200);
    expect(removed.body.images.map((item: { version: string }) => item.version)).toEqual(['1.0.1']);
    expect(removed.body.previousVersion).toBeNull();

    expect((await request(app).delete('/api/firmware/water-pressure-tank/1.0.0')).status).toBe(404);
    expect((await request(app).get('/api/firmware/water-pressure-tank/1.0.0.bin')).status).toBe(404);
    expect((await request(app).delete('/api/firmware/heat_pump/1.0.0')).status).toBe(404);
  });

  it('zapisuje wersję firmware ze zgłoszenia i odświeża ją przy kolejnym', async () => {
    const withVersion = (version?: string) =>
      request(app).post('/api/devices/register').send({ deviceId: 'AABBCCDDEE10', deviceType: 'water-pressure-tank', version });
    const listed = async () =>
      (await request(app).get('/api/devices')).body.find((device: { deviceId: string }) => device.deviceId === 'AABBCCDDEE10');

    expect((await withVersion('1.0.0')).body.firmwareVersion).toBe('1.0.0');
    expect((await listed()).firmwareVersion).toBe('1.0.0');

    await withVersion('1.0.1');
    expect((await listed()).firmwareVersion).toBe('1.0.1');

    // starszy firmware nie wysyła wersji: zostaje ostatnia znana
    await withVersion();
    expect((await listed()).firmwareVersion).toBe('1.0.1');
    expect((await listed()).firmwareSeenAt).toBeTruthy();
  });
});
