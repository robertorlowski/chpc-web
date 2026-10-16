// Testy wzoru kafelka listy sterowników (projektant kafelka, baza w mongodb-memory-server): brak wzoru,
// zapis i odczyt, walidacja zakresów i pól, powrót do wzoru wbudowanego.
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '../src/core/app'
import { TileTemplateModel } from '../src/core/models/tile-template.model'
import { TILE_SLOTS } from '../src/core/types'

const field = { x: 10, y: 10, w: 20, h: 10, a: 'left', v: true }
const template = () => ({ w: 340, h: 204, gap: 10, f: Object.fromEntries(TILE_SLOTS.map((slot) => [slot, { ...field }])) })

describe('Wzór kafelka', () => {
  let mongoServer: MongoMemoryServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  })
  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })
  beforeEach(async () => { await TileTemplateModel.deleteMany({}) })

  it('bez zapisu zwraca null', async () => {
    const response = await request(app).get('/api/devices/tile-template')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ template: null })
  })

  it('zapisuje i odczytuje wzór bez obcych kluczy', async () => {
    const body = { ...template(), extra: 1 }
    const saved = await request(app).put('/api/devices/tile-template').send(body)
    expect(saved.status).toBe(200)
    const response = await request(app).get('/api/devices/tile-template')
    expect(response.body.template).toEqual(template())
  })

  it('odrzuca pole poza komórką, brak pola i zły rozmiar', async () => {
    const outside = template(); outside.f.main = { ...field, x: 90, w: 20 }
    expect((await request(app).put('/api/devices/tile-template').send(outside)).status).toBe(400)
    const missing = template(); delete (missing.f as Record<string, unknown>).footer
    expect((await request(app).put('/api/devices/tile-template').send(missing)).status).toBe(400)
    expect((await request(app).put('/api/devices/tile-template').send({ ...template(), w: 50 })).status).toBe(400)
    expect((await request(app).put('/api/devices/tile-template').send({ ...template(), gap: 99 })).status).toBe(400)
  })

  it('DELETE wraca do wzoru wbudowanego', async () => {
    await request(app).put('/api/devices/tile-template').send(template())
    expect((await request(app).delete('/api/devices/tile-template')).status).toBe(200)
    expect((await request(app).get('/api/devices/tile-template')).body).toEqual({ template: null })
  })
})
