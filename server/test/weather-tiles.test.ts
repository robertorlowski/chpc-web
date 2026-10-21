// Testy kafelków pogody (baza w mongodb-memory-server): kafelek „Dom” powstaje sam, dodawanie i walidacja,
// limit, ukrywanie, kolejność wspólna ze sterownikami, miejsca dla włącznika i pogoda dla wielu miejsc,
// kafelek bieżącej lokalizacji (bez współrzędnych, jeden, bez pobierania przez włącznik), zapasowa pogoda z co.
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { DeviceModel } from '../src/core/models/device.model'
import { WeatherTileModel } from '../src/core/models/weather-tile.model'
import { backupWeatherQueries, MAX_WEATHER_TILES } from '../src/core/services/weather-tile.service'
import { setWeatherFromController, WEATHER_BACKUP_AFTER_MS } from '../src/core/services/meteo.service'

const reading = (temp: number) => ({ temp, code: 3, cloud: 100, precip: 0, rain: 0, snow: 0, wind: 6, day: 1, age_s: 10 })

describe('Kafelki pogody', () => {
  let mongoServer: MongoMemoryServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  })
  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })
  beforeEach(async () => {
    await WeatherTileModel.deleteMany({})
    await DeviceModel.deleteMany({})
  })

  it('tworzy kafelek „Dom” z położeniem domu przed sterownikami', async () => {
    const tiles = (await request(app).get('/api/weather-tiles').expect(200)).body
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ name: 'Dom', lat: 49.374298, lon: 20.007237, home: true, nearHome: true, hidden: false, sortOrder: -1, weather: null })
  })

  // 2026-10-21: konto ma własny kafelek w miejscu domu („Dom” widzi tylko systemowy) — temperatura z czujnika kotła
  // także na nim (nearHome do 3 km), a nie na kafelkach dalej i nie na kafelku bieżącej lokalizacji
  it('nearHome: „Dom” i kafelek do 3 km od domu, nie dalsze miejsca ani bieżąca lokalizacja', async () => {
    const near = (await request(app).post('/api/weather-tiles').send({ name: 'Biały Dunajec', lat: 49.38, lon: 20.0 }).expect(201)).body
    const far = (await request(app).post('/api/weather-tiles').send({ name: 'Zakopane', lat: 49.299, lon: 19.949 }).expect(201)).body
    const current = (await request(app).post('/api/weather-tiles').send({ current: true }).expect(201)).body
    expect(near).toMatchObject({ home: false, nearHome: true })
    expect(far).toMatchObject({ home: false, nearHome: false })
    expect(current).toMatchObject({ nearHome: false })
    for (const tile of [near, far, current]) await request(app).delete(`/api/weather-tiles/${tile.id}`).expect(204)
  })

  it('dodaje kafelek, sprawdza pola i limit, pozwala ukryć i usunąć', async () => {
    const created = await request(app).post('/api/weather-tiles').send({ name: 'Kraków', lat: 50.06, lon: 19.94 }).expect(201)
    expect(created.body).toMatchObject({ name: 'Kraków', lat: 50.06, lon: 19.94, home: false, hidden: false })
    expect((await request(app).post('/api/weather-tiles').send({ name: '', lat: 50, lon: 19 })).status).toBe(400)
    expect((await request(app).post('/api/weather-tiles').send({ name: 'X', lat: 95, lon: 19 })).status).toBe(400)
    expect((await request(app).post('/api/weather-tiles').send({ name: 'X', lat: '50', lon: 19 })).status).toBe(400)

    const hidden = await request(app).put(`/api/weather-tiles/${created.body.id}`).send({ hidden: true }).expect(200)
    expect(hidden.body.hidden).toBe(true)
    expect((await request(app).put(`/api/weather-tiles/${created.body.id}`).send({ hidden: 'tak' })).status).toBe(400)
    expect((await request(app).put('/api/weather-tiles/000000000000000000000000').send({ name: 'Y' })).status).toBe(404)

    for (let i = 2; i < MAX_WEATHER_TILES; i += 1) {
      await request(app).post('/api/weather-tiles').send({ name: `M${i}`, lat: 50, lon: 19 }).expect(201)
    }
    expect((await request(app).post('/api/weather-tiles').send({ name: 'za dużo', lat: 50, lon: 19 })).status).toBe(400)

    await request(app).delete(`/api/weather-tiles/${created.body.id}`).expect(204)
    expect((await request(app).get('/api/weather-tiles')).body.find((t: { id: string }) => t.id === created.body.id)).toBeUndefined()
  })

  it('ma kolejność wspólną ze sterownikami i ukrywa sterownik', async () => {
    const device = (await request(app).post('/api/devices/register').send({ deviceId: 'AABBCCDDEEF0', deviceType: 'switch' })).body
    const home = (await request(app).get('/api/weather-tiles')).body[0]
    const krakow = (await request(app).post('/api/weather-tiles').send({ name: 'Kraków', lat: 50.06, lon: 19.94 })).body
    // szachownica: puste pole (null) zostaje wolne
    const sorted = await request(app).put('/api/devices/order').send({ rootIds: [krakow.id, null, device.rootId, home.id] }).expect(200)
    expect(sorted.body[0]).toMatchObject({ rootId: device.rootId, sortOrder: 2, hidden: false })
    const tiles = (await request(app).get('/api/weather-tiles')).body
    expect(tiles.map((t: { name: string; sortOrder: number }) => [t.name, t.sortOrder])).toEqual([['Kraków', 0], ['Dom', 3]])
    expect((await request(app).put('/api/devices/order').send({ rootIds: [device.rootId, device.rootId] })).status).toBe(400)
    expect((await request(app).put('/api/devices/order').send({ rootIds: [device.rootId, '000000000000000000000000'] })).status).toBe(404)

    const hidden = await request(app).put(`/api/devices/${device.rootId}`).send({ hidden: true }).expect(200)
    expect(hidden.body.hidden).toBe(true)
    expect((await request(app).get('/api/devices')).body[0].hidden).toBe(true)
  })

  it('podaje włącznikowi miejsca (bez ukrytych, dom zawsze) i przyjmuje pogodę dla każdego', async () => {
    const device = (await request(app).post('/api/devices/register').send({ deviceId: 'AABBCCDDEEF1', deviceType: 'switch' })).body
    const home = (await request(app).get('/api/weather-tiles')).body[0]
    const krakow = (await request(app).post('/api/weather-tiles').send({ name: 'Kraków', lat: 50.06, lon: 19.94 })).body
    const gdansk = (await request(app).post('/api/weather-tiles').send({ name: 'Gdańsk', lat: 54.35, lon: 18.65 })).body
    await request(app).put(`/api/weather-tiles/${gdansk.id}`).send({ hidden: true }).expect(200)
    const state = (extra: object) => request(app).post(`/api/switch/state?rootId=${device.rootId}`)
      .send({ uptimeS: 60, relays: [{ on: false, changedS: 60 }], ...extra }).expect(200)

    const answer = await state({})
    expect(answer.body.weather_query).toEqual({ lat: 49.374298, lon: 20.007237 })
    expect(answer.body.weather_queries).toEqual([
      { id: home.id, lat: 49.374298, lon: 20.007237 }, { id: krakow.id, lat: 50.06, lon: 19.94 },
    ])

    // włącznik od 1.2.0: tablica z id kafelka
    await state({ weather: [{ id: home.id, ...reading(6.1) }, { id: krakow.id, ...reading(9.5) }, { ...reading(1) }] })
    const tiles = (await request(app).get('/api/weather-tiles')).body
    expect(tiles.find((t: { id: string }) => t.id === home.id).weather.temperature).toBe(6.1)
    expect(tiles.find((t: { id: string }) => t.id === krakow.id).weather.temperature).toBe(9.5)
    expect((await request(app).get('/api/temperature')).body).toMatchObject({ temperature: 6.1, temperatureSource: 'forecast' })

    // włącznik 1.1.3: jeden obiekt = dom
    await state({ weather: reading(7.2) })
    expect((await request(app).get('/api/temperature')).body.temperature).toBe(7.2)
    expect((await request(app).get('/api/weather-tiles')).body[0].weather.temperature).toBe(7.2)
  })

  it('kafelek bieżącej lokalizacji: bez współrzędnych, najwyżej jeden, włącznik go nie pobiera', async () => {
    const device = (await request(app).post('/api/devices/register').send({ deviceId: 'AABBCCDDEEF2', deviceType: 'switch' })).body
    const created = await request(app).post('/api/weather-tiles').send({ current: true }).expect(201)
    expect(created.body).toMatchObject({ name: 'Moja lokalizacja', lat: null, lon: null, current: true, home: false, weather: null })
    expect((await request(app).post('/api/weather-tiles').send({ current: true })).status).toBe(400)
    expect((await request(app).post('/api/weather-tiles').send({ current: true, name: 'X', lat: 50, lon: 19 })).status).toBe(400)

    const renamed = await request(app).put(`/api/weather-tiles/${created.body.id}`).send({ name: 'Telefon' }).expect(200)
    expect(renamed.body).toMatchObject({ name: 'Telefon', current: true, lat: null })
    expect((await request(app).put(`/api/weather-tiles/${created.body.id}`).send({ lat: 50 })).status).toBe(400)
    expect((await request(app).put(`/api/weather-tiles/${created.body.id}`).send({ current: false })).status).toBe(400)

    const answer = await request(app).post(`/api/switch/state?rootId=${device.rootId}`)
      .send({ uptimeS: 60, relays: [{ on: false, changedS: 60 }] }).expect(200)
    expect(answer.body.weather_queries.map((q: { id: string }) => q.id)).not.toContain(created.body.id)

    await request(app).delete(`/api/weather-tiles/${created.body.id}`).expect(204)
    await request(app).post('/api/weather-tiles').send({ current: true }).expect(201)
  })

  it('zapasowa pogoda: co dostaje miejsca bez świeżej pogody od włącznika i odsyła odczyty w hp/add', async () => {
    const hp = (await request(app).post('/api/devices/register').send({ deviceId: 'AABBCCDDEEF3', deviceType: 'heat_pump' })).body
    const home = (await request(app).get('/api/weather-tiles')).body[0]
    const krakow = (await request(app).post('/api/weather-tiles').send({ name: 'Kraków', lat: 50.06, lon: 19.94 })).body

    // tuż po starcie serwera co czeka na włącznik
    const answer = await request(app).post(`/api/hp/add?rootId=${hp.rootId}`).send({ HP: {}, weather: [{ id: krakow.id, ...reading(9.9) }] }).expect(201)
    expect(answer.body.weather_queries).toEqual([])
    expect((await request(app).get('/api/weather-tiles')).body.find((t: { id: string }) => t.id === krakow.id).weather.temperature).toBe(9.9)
    expect((await request(app).get(`/api/hp?rootId=${hp.rootId}`)).body.weather).toBeUndefined()

    // włącznik milczy dłużej niż WEATHER_BACKUP_AFTER_MS: co dostaje wszystkie miejsca
    const later = new Date(Date.now() + WEATHER_BACKUP_AFTER_MS + 60_000)
    expect((await backupWeatherQueries(later)).map((q) => q.id)).toEqual([home.id, krakow.id])
    // odczyt od co nie wyłącza zapasu, odczyt od włącznika tak
    setWeatherFromController([{ id: krakow.id, ...reading(8) }], later, 'co')
    setWeatherFromController([{ id: home.id, ...reading(7) }], later, 'switch')
    expect((await backupWeatherQueries(later)).map((q) => q.id)).toEqual([krakow.id])
  })
})
