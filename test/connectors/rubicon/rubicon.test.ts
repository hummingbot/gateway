
import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Fill, ORDER_STATUS, OrderEntity, RubiconCLOB } from '../../../src/connectors/rubicon/rubicon';
import { patch } from '../../../test/services/patch';
import { arbitrum } from 'viem/chains';
import { GladiusOrderBuilder } from '@rubicondefi/gladius-sdk';
import { BigNumber } from 'ethers';

let ethereum: Ethereum;
let rubicon: RubiconCLOB;

const chainId = arbitrum.id

const TX_HASH = ''; // noqa: mock
const MARKET = 'WETH-USDC';

const GAS_PRICES = {
  gasPrice: 0,
  gasPriceToken: "eth",
  gasLimit: 0,
  gasCost: 0,
};

const INVALID_REQUEST = {
  chain: 'ethereum',
  network: 'arbitrum',
};

const MOCK_DATA = {
  chainId,
  filler: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  nonce: '40',
  orderHash: '0x0000000000000000000000000000000000000000000000000000000000000006',
  orderStatus: ORDER_STATUS.OPEN,
  offerer: '0x0000000000000000000000000000000000000001',
  reactor: '0x0000000000000000000000000000000000000001',
  deadline: Math.floor(Date.now() / 1000) + 100,
  input: {
    endAmount: '30000000000',
    startAmount: '30000000000',
    token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  output:
    {
      endAmount: '6000000000000000000',
      startAmount: '6000000000000000000',
      token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
  recipient: '0x0000000000000000000000000000000000000001'
}

const patchCurrentBlockNumber = (withError: boolean = false) => {
  patch(ethereum, 'getCurrentBlockNumber', () => {
    return withError ? -1 : 100;
  });
};

const patchGetWallet = () => {
  patch(ethereum, 'getWallet', () => {
    return {
      privateKey:
        '83d8fae2444141a142079e9aa6dc1a49962af114d9ace8db9a34ecb8fa3e6cf8', // noqa: mock
      address: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f',
    };
  });
};

const patchOrderBook = () => {
  const buyBuilder = new GladiusOrderBuilder(chainId)

  const buy = buyBuilder
    .deadline(MOCK_DATA.deadline)
    .decayStartTime(MOCK_DATA.deadline)
    .decayEndTime(MOCK_DATA.deadline)
    .nonce(BigNumber.from(MOCK_DATA.nonce))
    .swapper(MOCK_DATA.offerer)
    .input({
      token: MOCK_DATA.input.token,
      startAmount: BigNumber.from(MOCK_DATA.input.startAmount),
      endAmount: BigNumber.from(MOCK_DATA.input.endAmount),
    })
    .output({
      token: MOCK_DATA.output.token,
      startAmount: BigNumber.from(MOCK_DATA.output.startAmount),
      endAmount: BigNumber.from(MOCK_DATA.output.endAmount),
      recipient: MOCK_DATA.offerer,
    })
    .fillThreshold(BigNumber.from(MOCK_DATA.input.startAmount))
    .build();

  const sellBuilder = new GladiusOrderBuilder(chainId)

  const sell = sellBuilder
    .deadline(MOCK_DATA.deadline)
    .decayStartTime(MOCK_DATA.deadline)
    .decayEndTime(MOCK_DATA.deadline)
    .nonce(BigNumber.from(MOCK_DATA.nonce))
    .swapper(MOCK_DATA.offerer)
    .input({
      token: MOCK_DATA.output.token,
      startAmount: BigNumber.from("1000000000000000000"),
      endAmount: BigNumber.from("1000000000000000000"),
    })
    .output({
      token: MOCK_DATA.input.token,
      startAmount: BigNumber.from("7000000000"),
      endAmount: BigNumber.from("7000000000"),
      recipient: MOCK_DATA.offerer,
    })
    .fillThreshold(BigNumber.from("1000000000000000000"))
    .build();

  patch(rubicon, 'getOrderBook', () => {
    return [
      [
        { 
          encodedOrder: buy.serialize(),
          createdAt: Date.now(),
          input: {

            token: "USDC"
          }
        } as OrderEntity
      ], 
      [
        {
        encodedOrder: sell.serialize(),
        createdAt: Date.now(),
        input: {
          token: "WETH"
        }
        } as OrderEntity
      ]
    ]
  });
};

const patchMarkets = () => {
  patch(rubicon, 'parsedMarkets', {
    'WETH-USDC': {
      baseSymbol: 'WETH',
      baseDecimals: 18,
      baseAddress: MOCK_DATA.input.token,
      quoteSymbol: 'USDC',
      quoteDecimals: 6,
      quoteAddress: MOCK_DATA.output.token
    }
  })
}

const patchGetTrades = () => {
  patch(rubicon, 'getTrades', () => {
    return {
      data: {
        buys: [{
          inputToken: MOCK_DATA.input.token,
          outputToken: MOCK_DATA.output.token,
          inputAmount: "30000000000",
          outputAmount: "3000000000000000000",
          timestamp: "1725574055" 
        }] as Fill[],
        sells:  [{
          inputToken: MOCK_DATA.output.token,
          outputToken: MOCK_DATA.input.token,
          inputAmount: "1000000000000000000",
          outputAmount: "5000000000",
          timestamp: "1725574056"
        }] as Fill[]
      }
    };
  });
};

const patchGetOrders = () => {
  patch(rubicon, 'getOrders', () => {
    return {
      orders: [{ orderStatus: ORDER_STATUS.OPEN, orderHash: MOCK_DATA.orderHash } as OrderEntity]
    }
  })
}

const patchGasPrices = () => {
  patch(rubicon, 'estimateGas', () => {
    return GAS_PRICES;
  });
};

const patchPost = () => {
  patch(rubicon, 'post', () => {
    return { data: { hash: MOCK_DATA.orderHash } } // mock
  })
}

const patchDelete = () => {
  patch(rubicon, 'delete', () => {
    return;
  })
}

const patchSignOrder = () => {
  patch(rubicon, 'signOrder', () => {
    return "0x2042940294029420492049204920492094"
  })
}

beforeAll(async () => {
  ethereum = Ethereum.getInstance('arbitrum');
  patchCurrentBlockNumber();
  ethereum.init();
  rubicon = RubiconCLOB.getInstance('ethereum', 'arbitrum');
  await rubicon.init();
  patchGetTrades();
  patchMarkets();
  patchPost();
  patchDelete();
  patchSignOrder();
  patchGetWallet();
  patchGetOrders();
})

// eslint-disable-next-line @typescript-eslint/no-empty-function
beforeEach(() => {
  patchCurrentBlockNumber();
});

afterAll(async () => {
  await ethereum.close();
});

describe('GET /clob/markets', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query({
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
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
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.buys[0].price).toEqual('5000'))
      .expect((res) => expect(res.body.sells[0].price).toEqual('7000'));
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
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.markets.price).toEqual(10000))
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
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
        address:
          '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
        market: MARKET,
        orderId: MOCK_DATA.orderHash,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toEqual(1))
      .expect((res) => expect(res.body.orders[0].id).toEqual(MOCK_DATA.orderHash))
      .expect((res) => expect(res.body.orders[0].status).toEqual(ORDER_STATUS.OPEN))
      .expect((res) => expect(res.body.orders[0].orderHash).toEqual(MOCK_DATA.orderHash))
      .expect((res) => expect(res.body.orders[0].clientId).toEqual(MOCK_DATA.orderHash));
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
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
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
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH))
      .expect((res) => expect(res.body.id).toEqual(MOCK_DATA.orderHash));
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
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
        address: '0x261362dBC1D83705AB03e99792355689A4589b8E', // noqa: mock
        market: MARKET,
        orderId:
          MOCK_DATA.orderHash,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH))
      .expect((res) => expect(res.body.id).toEqual(MOCK_DATA.orderHash));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
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
        chain: 'ethereum',
        network: 'arbitrum',
        connector: 'rubicon',
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
