import request from 'supertest'

import app from './src/middleware/app'
import { prefixMocks } from './src/middleware/mockResponse'

describe('App Search', () => {
  
  it('Should return HP data', async () => {
    const data = prefixMocks("hp");
    const response = await request(app).get('/api/hp')
    expect(response.body).toEqual(data)
    expect(response.body.length).toBe(data.length)
  });

  it('Should return settings data', async () => {
    const data = prefixMocks("settings");
    const response = await request(app).get('/api/settings')
    expect(response.body).toEqual(data)
    expect(response.body.length).toBe(data.length)
  });
})
