import request from 'supertest'

import app from './src/middleware/app'
import { TSettings } from './src/middleware/type';

describe('App Search', () => {
  
  it('Should return HP data', async () => {
      const response = await request(app).get('/api/hp')
      expect(response.status).toBe(200);
      const tmp: TCO[] = JSON.stringify(response.body);
      console.log(tmp);
      
  });

  it('Should return settings data', async () => {
      const response = await request(app).get('/api/settings')
      expect(response.status).toBe(200);
      const tmp: TSettings[] = JSON.stringify(response.body);
      console.log(tmp);
  });
})


