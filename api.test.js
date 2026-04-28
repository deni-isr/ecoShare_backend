const request = require('supertest');
const app = require('./server');

describe('EcoShare API Testit', () => {
  
  it('GET /api/products palauttaa status 200 ja listan ilmoituksista', async () => {
    const res = await request(app).get('/api/products');
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  it('GET /api/ei-olemassa-reitti palauttaa status 404', async () => {
    const res = await request(app).get('/api/ei-olemassa-reitti');
    
    expect(res.statusCode).toEqual(404);
  });

});