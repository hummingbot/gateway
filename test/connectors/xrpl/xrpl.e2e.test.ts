import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Wallet } from 'xrpl';
import { XRPL } from '../../../src/chains/xrpl/xrpl';
import { XRPLCLOB } from '../../../src/connectors/xrpl/xrpl';
import { getsSequenceNumberFromTxn } from '../../../src/connectors/xrpl/xrpl.utils';
import { patch, unpatch } from '../../services/patch';

let xrpl: XRPL;
let xrplCLOB: XRPLCLOB;
const wallet = Wallet.fromSecret('sEd74fJ432TFE4f5Sy48gLyzknkdc1t');
const MARKET = 'USD-VND';
const postedOrderTxn: string[] = [];

// interface Token {
//   currency: string;
//   issuer: string;
//   value?: string;
// }

// const base_token: Token = {
//   currency: 'USD',
//   issuer: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx',
//   value: '0',
// };

// const quote_token: Token = {
//   currency: 'VND',
//   issuer: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx',
//   value: '0',
// };

const INVALID_REQUEST = {
  chain: 'unknown',
  network: 'testnet',
};

const patchWallet = () => {
  patch(xrpl, 'getWallet', () => wallet);
};

beforeAll(async () => {
  xrpl = XRPL.getInstance('testnet');
  await xrpl.init();
  xrplCLOB = XRPLCLOB.getInstance('xrpl', 'testnet');
  await xrplCLOB.init();
  patchWallet();
});

afterAll(async () => {
  unpatch();
  await xrpl.close();
});

// Scenario:
// 1. Add wallet to the connector
// 2. Post orders
// 3. Cancel orders
// 4. Post orders again
// 5. Use an other accounts to consume some orders
// 6. Check the balances
// 7. Check the orders status

describe('Get estimated gas price', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.gasPrice).toBeDefined());
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('Get Markets List', () => {
  it('should return a list of markets', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.markets.length).toBeGreaterThan(0);
      });
  });
});

describe(`Get ticker info for ${MARKET}`, () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.markets.baseCurrency).toEqual('USD'))
      .expect((res) => expect(res.body.markets.quoteCurrency).toEqual('VND'));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('Post order', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16', // noqa: mock
        market: MARKET,
        price: '23600',
        amount: '1',
        side: 'BUY',
        orderType: 'LIMIT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.txHash).toBeDefined();
        postedOrderTxn.push(res.body.txHash);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('Get posted order', () => {
  it('should return 200 with proper request', async () => {
    // wait for 4 second to make sure the order is posted
    await new Promise((resolve) => setTimeout(resolve, 4000));

    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        market: MARKET,
        orderId: 'all',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toBeGreaterThan(0));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('Get orderbook details', () => {
  it('should return 200 with proper request with USD-VND', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.buys.length).toBeGreaterThan(0);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('DELETE /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    // wait for 4 second to make sure the order is posted
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const postedOrderSequence = await getsSequenceNumberFromTxn(
      'testnet',
      postedOrderTxn[0]
    );

    expect(postedOrderSequence).toBeDefined();

    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16', // noqa: mock
        market: MARKET,
        orderId: postedOrderSequence?.toString(),
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toBeDefined());
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});
