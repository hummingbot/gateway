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
const wallet1 = Wallet.fromSecret('sEd74fJ432TFE4f5Sy48gLyzknkdc1t'); // r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16
const wallet2 = Wallet.fromSecret('sEd7oiMn5napJBthB2z4CtN5nVi56Bd'); // r3z4R6KQWfwRf9G15AhUZe2GN67Sj6PYNV
const MARKET = 'USD-VND';
let postedOrderTxn: string;

const INVALID_REQUEST = {
  chain: 'unknown',
  network: 'testnet',
};

const patchWallet1 = () => {
  patch(xrpl, 'getWallet', (walletAddress: string) => {
    if (walletAddress === 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16') return wallet1;

    return wallet2;
  });
};

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
        price: '20000',
        amount: '0.1',
        side: 'BUY',
        orderType: 'LIMIT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.txHash).toBeDefined();
        postedOrderTxn = res.body.txHash;
      });
  });

  it('should return PENDING_OPEN with proper request', async () => {
    await checkOrderStatus(
      postedOrderTxn,
      10,
      'PENDING_OPEN',
      500,
      wallet1.address,
      true
    );
  });

  it('should return OPEN with proper request', async () => {
    await checkOrderStatus(
      postedOrderTxn,
      9,
      'OPEN',
      1000,
      wallet1.address,
      true
    );
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
      postedOrderTxn
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
    await checkOrderStatus(
      postedOrderTxn,
      10,
      'PENDING_CANCEL',
      500,
      wallet1.address,
      true
    );
  });

  it('should return CANCELED with proper request', async () => {
    await checkOrderStatus(
      postedOrderTxn,
      9,
      'CANCELED',
      1000,
      wallet1.address,
      true
    );
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

describe('Post order to be consumed', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: wallet2.address, // noqa: mock
        market: MARKET,
        price: '20000',
        amount: '0.1',
        side: 'BUY',
        orderType: 'LIMIT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.txHash).toBeDefined();
        postedOrderTxn = res.body.txHash;
      });
  });

  it('should return PENDING_OPEN with proper request', async () => {
    await checkOrderStatus(
      postedOrderTxn,
      9,
      'PENDING_OPEN',
      1000,
      wallet2.address,
      true
    );
  });

  it('should return OPEN with proper request', async () => {
    await checkOrderStatus(
      postedOrderTxn,
      9,
      'OPEN',
      1000,
      wallet2.address,
      true
    );
  });

  describe('Consume posted order', () => {
    it('should return 200 with proper request', async () => {
      await request(gatewayApp)
        .post(`/clob/orders`)
        .send({
          chain: 'xrpl',
          network: 'testnet',
          connector: 'xrpl',
          address: wallet1.classicAddress, // noqa: mock
          market: MARKET,
          price: '19999',
          amount: '0.05',
          side: 'SELL',
          orderType: 'LIMIT',
        })
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect((res) => {
          expect(res.body.txHash).toBeDefined();
        });
    });

    it('should return PARTIALLY_FILLED with proper request', async () => {
      await checkOrderStatus(
        postedOrderTxn,
        9,
        'PARTIALLY_FILLED',
        1000,
        wallet2.classicAddress,
        true
      );
    });

    it('should return 200 with proper request', async () => {
      await request(gatewayApp)
        .post(`/clob/orders`)
        .send({
          chain: 'xrpl',
          network: 'testnet',
          connector: 'xrpl',
          address: wallet1.address, // noqa: mock
          market: MARKET,
          price: '19999',
          amount: '0.051',
          side: 'SELL',
          orderType: 'LIMIT',
        })
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect((res) => {
          expect(res.body.txHash).toBeDefined();
        });
    });

    it('should return FILLED with proper request', async () => {
      await checkOrderStatus(
        postedOrderTxn,
        9,
        'FILLED',
        1000,
        wallet2.classicAddress,
        true
      );
    });
  });
});

async function checkOrderStatus(
  postedOrderTxn: string,
  maxCheckCount: number,
  state: string,
  requestFrequency: number = 1000,
  walletAddress: string,
  getAllOrdres: boolean = false
) {
  const postedOrderSequence = await getsSequenceNumberFromTxn(
    'testnet',
    postedOrderTxn
  );

  if (postedOrderSequence === undefined) {
    throw new Error('postedOrderSequence is undefined');
  }

  let hasPassed = false;
  let checkCount = 0;
  let orderState = '';
  let orders: Order[] = [];

  while (!hasPassed && checkCount < maxCheckCount) {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: walletAddress,
        market: MARKET,
        orderId: getAllOrdres ? 'all' : postedOrderSequence,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then((res) => {
        orders = res.body.orders;
      });

    if (orders.length > 0) {
      const postedOrder = orders.find(
        (order) => order.hash === postedOrderSequence
      );

      if (postedOrder !== undefined) {
        orderState = postedOrder.state;
        if (orderState === state) {
          hasPassed = true;
        }
      }
    }

    checkCount++;
    await new Promise((resolve) => setTimeout(resolve, requestFrequency));
  }

  expect(orderState).toBe(state);
  expect(hasPassed).toBe(true);
}
