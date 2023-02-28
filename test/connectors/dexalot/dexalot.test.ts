import { BigNumber } from 'ethers';
import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Avalanche } from '../../../src/chains/avalanche/avalanche';
import { EVMTxBroadcaster } from '../../../src/chains/ethereum/evm.broadcaster';
import { DexalotCLOB } from '../../../src/connectors/dexalot/dexalot';
import { fromUtf8 } from '../../../src/connectors/dexalot/dexalot.constants';
import { patch, unpatch } from '../../services/patch';

let avalanche: Avalanche;
let dexalot: DexalotCLOB;

const TX_HASH =
  '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2'; // noqa: mock
const MARKET = 'ALOT-USDC';

const MARKETS = {
  baseSymbol: fromUtf8('ALOT'),
  quoteSymbol: fromUtf8('USDC'),
  buyBookId: fromUtf8('ALOT-USDC-BUYBOOK'),
  sellBookId: fromUtf8('ALOT-USDC-SELLBOOK'),
  minTradeAmount: BigNumber.from('5'),
  maxTradeAmount: BigNumber.from('5000'),
  auctionPrice: BigNumber.from('5'),
  auctionMode: true,
  makerRate: '0.1',
  takerRate: '0.1',
  baseDecimals: 6,
  baseDisplayDecimals: 2,
  quoteDecimals: 18,
  quoteDisplayDecimals: 6,
  allowedSlippagePercent: '1',
  addOrderPaused: false,
  pairPaused: false,
  postOnly: true,
};

const ORDERS = {
  id: '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2', // noqa: mock
  clientOrderId:
    '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0', // noqa: mock
  tradePairId:
    '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0', // noqa: mock
  price: BigNumber.from('500'),
  totalAmount: BigNumber.from('10'),
  quantity: BigNumber.from('5'),
  quantityFilled: BigNumber.from('5'),
  totalFee: BigNumber.from('1'),
  traderaddress: '0x...',
  side: 0,
  type1: 1,
  type2: 0,
  status: 0,
};

const GAS_PRICES = {
  gasPrice: '500000000',
  gasPriceToken: 'Token',
  gasLimit: '1000',
  gasCost: '100',
};

const INVALID_REQUEST = {
  chain: 'unknown',
  network: 'dexalot',
};

beforeAll(async () => {
  avalanche = Avalanche.getInstance('dexalot');
  patchCurrentBlockNumber();
  avalanche.init();
  dexalot = DexalotCLOB.getInstance('dexalot');
  patchMarkets();
  await dexalot.init();
});

// eslint-disable-next-line @typescript-eslint/no-empty-function
beforeEach(() => {
  patchCurrentBlockNumber();
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await avalanche.close();
});

const patchCurrentBlockNumber = (withError: boolean = false) => {
  patch(avalanche, 'getCurrentBlockNumber', () => {
    return withError ? -1 : 100;
  });
};

const patchMarkets = () => {
  patch(dexalot, 'tradePairsContract', () => {
    return {
      async getTradePairs() {
        return [
          '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0',
        ];
      },
      async getTradePair() {
        return MARKETS;
      },
    };
  });
};

const patchOrderBook = () => {
  patch(dexalot, 'tradePairsContract', () => {
    return {
      async getNBook() {
        return [
          [BigNumber.from('5000000000000000000')],
          [BigNumber.from('100000')],
        ];
      },
    };
  });
};

const patchMsgBroadcaster = () => {
  patch(EVMTxBroadcaster, 'getInstance', () => {
    return {
      broadcast() {
        return {
          hash: TX_HASH,
        };
      },
    };
  });
};

const patchOrders = () => {
  patch(dexalot, 'tradePairsContract', () => {
    return {
      async getOrderByClientOrderId() {
        return ORDERS;
      },
    };
  });
};

const patchGasPrices = () => {
  patch(dexalot, 'estimateGas', () => {
    return GAS_PRICES;
  });
};

describe('GET /clob/markets', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.markets.length).toEqual(1);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orderBook', () => {
  it('should return 200 with proper request', async () => {
    patchOrderBook();
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.buys[0].price).toEqual('5.0'))
      .expect((res) => expect(res.body.sells[0].price).toEqual('5.0'));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/ticker', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.markets.baseSymbol).toEqual('ALOT'))
      .expect((res) => expect(res.body.markets.quoteSymbol).toEqual('USDC'));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchOrders();
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        address:
          '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
        market: MARKET,
        orderId: '0x...',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toEqual(1));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        address: '0x261362dBC1D83705AB03e99792355689A4589b8E', // noqa: mock
        market: MARKET,
        price: '10000.12',
        amount: '0.12',
        side: 'BUY',
        orderType: 'LIMIT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('DELETE /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchMsgBroadcaster();
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        address: '0x261362dBC1D83705AB03e99792355689A4589b8E', // noqa: mock
        market: MARKET,
        orderId:
          '0x8ce222ca5da95aaffd87b3d38a307f25d6e2c09e70a0cb8599bc6c8a0851fda3',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /clob/batchOrders', () => {
  it('should return 200 with proper request to create batch orders', async () => {
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        address: '0x261362dBC1D83705AB03e99792355689A4589b8E', // noqa: mock
        createOrderParams: [
          {
            price: '2',
            amount: '0.10',
            side: 'SELL',
            orderType: 'LIMIT',
            market: MARKET,
          },
          {
            price: '3',
            amount: '0.10',
            side: 'SELL',
            market: MARKET,
          },
        ],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 200 with proper request to delete batch orders', async () => {
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
        address: '0x261362dBC1D83705AB03e99792355689A4589b8E', // noqa: mock
        market: MARKET,
        cancelOrderIds: [
          '0x73af517124c3f564d1d70e38ad5200dfc7101d04986c14df410042e00932d4bf', // noqa: mock
          '0x8ce222ca5da95aaffd87b3d38a307f25d6e2c09e70a0cb8599bc6c8a0851fda3', // noqa: mock
        ],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/estimateGas', () => {
  it('should return 200 with proper request', async () => {
    patchGasPrices();
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query({
        chain: 'avalanche',
        network: 'dexalot',
        connector: 'dexalot',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.gasPrice).toEqual(GAS_PRICES.gasPrice));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});
