import request from 'supertest';
import { Oraichain } from '../../../src/chains/oraichain/oraichain';
import { gatewayApp } from '../../../src/app';

let oraichain: Oraichain;

beforeAll(async () => {
  oraichain = Oraichain.getInstance('mainnet');
  oraichain.initSigningCosmWasmClient = jest.fn();

  await oraichain.init();
});

afterAll(async () => {
  await oraichain.close();
});

describe('POST /chain/balances', () => {
  it('should return 200 asking for supported tokens', async () => {
    await request(gatewayApp)
      .post('/chain/balances')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        tokenSymbols: ['USDT', 'xOCH'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty('balances');
        expect(response.body.balances).toHaveProperty('USDT');
        expect(response.body.balances).toHaveProperty('xOCH');
      });
  });

  it('should return 200 asking for native token', async () => {
    await request(gatewayApp)
      .post('/chain/balances')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        tokenSymbols: ['ORAI'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty('balances');
        expect(response.body.balances).toHaveProperty('ORAI');
      });
  });

  it('should return 200 asking for IBC token', async () => {
    await request(gatewayApp)
      .post('/chain/balances')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        tokenSymbols: ['ATOM'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty('balances');
        expect(response.body.balances).toHaveProperty('ATOM');
      });
  });

  it('should return 500 asking for unsupported token', async () => {
    await request(gatewayApp)
      .post('/chain/balances')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        tokenSymbols: ['USDT', 'xOCH', 'ETH'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(500);
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post('/chain/balances')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        address: 'hello',
        tokenSymbols: ['USDT', 'xOCH'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(404);
  });
});

describe('POST /chain/poll', () => {
  it('should return 200 asking for transaction data with valid txHash', async () => {
    await request(gatewayApp)
      .post('/chain/poll')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        txHash:
          'E104B6C37821552EC553CFAE2B84473861E3621F57310B67E3BDA1EAB536F5D2',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .then((response) => {
        expect(response.body).toHaveProperty('txHash');
        expect(response.body).toHaveProperty('currentBlock');
      });
  });

  it('should return 503 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post('/chain/poll')
      .send({
        chain: 'oraichain',
        network: 'mainnet',
        txHash: 'hello',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(503);
  });
});

describe('GET /chain/tokens', () => {
  it('should return 200 asking for supported tokens', async () => {
    await request(gatewayApp)
      .get('/chain/tokens')
      .query({
        chain: 'oraichain',
        network: 'mainnet',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty('tokens');
      });
  });

  it('should return 200 with query tokens', async () => {
    await request(gatewayApp)
      .get('/chain/tokens')
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        tokenSymbols: ['USDT', 'xOCH'],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty('tokens');
      });
  });
});
