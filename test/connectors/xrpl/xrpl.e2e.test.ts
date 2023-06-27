import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Wallet } from 'xrpl';
import { XRPL } from '../../../src/chains/xrpl/xrpl';
import { XRPLCLOB } from '../../../src/connectors/xrpl/xrpl';
import { getsSequenceNumberFromTxn } from '../../../src/connectors/xrpl/xrpl.utils';
import { patch, unpatch } from '../../services/patch';
import { Order } from '../../../src/connectors/xrpl/xrpl.types';

let xrpl: XRPL;
let xrplCLOB: XRPLCLOB;
const wallet1 = Wallet.fromSecret('sEd74fJ432TFE4f5Sy48gLyzknkdc1t');
// const wallet2 = Wallet.fromSecret('sEd7oiMn5napJBthB2z4CtN5nVi56Bd');
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

const patchWallet1 = () => {
  patch(xrpl, 'getWallet', () => wallet1);
};

// const patchWallet2 = () => {
//   patch(xrpl, 'getWallet', () => wallet2);
// };

beforeAll(async () => {
  xrpl = XRPL.getInstance('testnet');
  await xrpl.init();
  xrplCLOB = XRPLCLOB.getInstance('xrpl', 'testnet');
  await xrplCLOB.init();
  patchWallet1();
});

afterAll(async () => {
  unpatch();
  await xrpl.close();
});

// 1st Scenario:
// 1. Get estimated gas price
// 2. Get markets list
// 3. Get ticker info
// 4. Get orderbook
// 5. Post an order
// 6. Get posted order details
// 7. Cancel the posted order

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

  it('should return PENDING_OPEN with proper request', async () => {
    // wait for 1 second to make sure the order is getting tracked
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const postedOrderSequence = await getsSequenceNumberFromTxn(
      'testnet',
      postedOrderTxn[0]
    );

    if (postedOrderSequence === undefined) {
      throw new Error('postedOrderSequence is undefined');
    }

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
      .expect((res) => expect(res.body.orders.length).toBeGreaterThan(0))
      .expect((res) => {
        const orders: Order[] = res.body.orders;
        const postedOrder = orders.find(
          (order) => order.hash === postedOrderSequence
        );

        if (postedOrder === undefined) {
          throw new Error('postedOrder is undefined');
        }
        expect(postedOrder.state).toBe('PENDING_OPEN');
      });
  });

  it('should return OPEN with proper request', async () => {
    // wait for 6 second to make sure the order is posted on blockchain
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const postedOrderSequence = await getsSequenceNumberFromTxn(
      'testnet',
      postedOrderTxn[0]
    );

    if (postedOrderSequence === undefined) {
      throw new Error('postedOrderSequence is undefined');
    }

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
      .expect((res) => expect(res.body.orders.length).toBeGreaterThan(0))
      .expect((res) => {
        const orders: Order[] = res.body.orders;
        const postedOrder = orders.find(
          (order) => order.hash === postedOrderSequence
        );

        if (postedOrder === undefined) {
          throw new Error('postedOrder is undefined');
        }
        expect(postedOrder.state).toBe('OPEN');
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
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

describe('Delete order', () => {
  it('should return 200 with proper request', async () => {
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

  it('should return PENDING_CANCEL with proper request', async () => {
    // wait for 1 second to make sure the order is getting tracked
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const postedOrderSequence = await getsSequenceNumberFromTxn(
      'testnet',
      postedOrderTxn[0]
    );

    if (postedOrderSequence === undefined) {
      throw new Error('postedOrderSequence is undefined');
    }

    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        market: MARKET,
        orderId: postedOrderSequence.toString(),
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toBeGreaterThan(0))
      .expect((res) => {
        const orders: Order[] = res.body.orders;
        const postedOrder = orders[0];

        if (postedOrder === undefined) {
          throw new Error('postedOrder is undefined');
        }
        expect(postedOrder.state).toBe('PENDING_CANCEL');
      });
  });

  it('should return CANCELED with proper request', async () => {
    // wait for 6 second to make sure the order is posted on blockchain
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const postedOrderSequence = await getsSequenceNumberFromTxn(
      'testnet',
      postedOrderTxn[0]
    );

    if (postedOrderSequence === undefined) {
      throw new Error('postedOrderSequence is undefined');
    }

    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        market: MARKET,
        orderId: postedOrderSequence.toString(),
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toBeGreaterThan(0))
      .expect((res) => {
        const orders: Order[] = res.body.orders;
        const postedOrder = orders[0];

        if (postedOrder === undefined) {
          throw new Error('postedOrder is undefined');
        }
        expect(postedOrder.state).toBe('CANCELED');
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

// 2nd Senario:
// 1. Post an order
// 2. Get posted order details
// 3. Verify the posted order status is PENDING_OPEN
// 4. Wait for 5 seconds and then verify the posted order status is OPEN
// 5. Use 2nd wallet to create a counter order to consume the posted order partially
// 6. Verify the posted order status is PARTIALLY_FILLED
// 7. Use 2nd wallet to create a counter order to consume the posted order completely
// 8. Verify the posted order status is FILLED
