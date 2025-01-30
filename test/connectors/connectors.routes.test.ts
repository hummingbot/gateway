import { gatewayApp } from '../../src/app';

describe('GET /connectors', () => {
  it('should return 200 with a list of connectors', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/connectors',
      headers: {
        'Accept': 'application/json'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(JSON.parse(response.payload).connectors).toBeDefined();
  });
});
