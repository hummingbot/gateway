
import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Fill, ORDER_STATUS, RubiconCLOB } from '../../../src/connectors/rubicon/rubicon';
import { patch, unpatch } from '../../../test/services/patch';
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
    endAmount: '30',
    startAmount: '30',
    token: '0x0000000000000000000000000000000000000003',
  },
  output:
    {
      endAmount: '50',
      startAmount: '60',
      token: '0x0000000000000000000000000000000000000005',
    },
  recipient: '0x0000000000000000000000000000000000000001'
}

beforeAll(async () => {
  ethereum = Ethereum.getInstance('rubicon');
  patchCurrentBlockNumber();
  ethereum.init();
  rubicon = RubiconCLOB.getInstance('rubicon', 'arbitrum');
  await rubicon.init();
});

const patchCurrentBlockNumber = (withError: boolean = false) => {
  patch(ethereum, 'getCurrentBlockNumber', () => {
    return withError ? -1 : 100;
  });
};

const patchOrderBook = () => {
  const builder = new GladiusOrderBuilder(chainId)

  const buy = builder
    .deadline(MOCK_DATA.deadline)
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

  const sell = builder
    .deadline(MOCK_DATA.deadline)
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

  patch(rubicon, 'getOrderBook', () => {
    return [[buy], [sell]]
  });
};

const patchMarkets = () => {
  patch(rubicon, 'parsedMarkets', () => {
    return {
      'WETH-USDC': {
        baseSymbol: 'WETH',
        baseDecimals: 18,
        baseAddress: '0x1',
        quoteSymbol: 'USDC',
        quoteDecimals: 6,
        quoteAddress: '0x2'
      }
    }
  })
}

const patchGetTrades = () => {
  patch(rubicon, 'getTrades', () => {
    return {
      data: {
        buys: [{ inputToken: '0x2', outputToken: '0x1', inputAmount: "500000", outputAmount: "1", timestamp: Math.floor(Date.now() / 1000).toString() }] as Fill[],
        sells:  [{ inputToken: '0x1', outputToken: '0x2', inputAmount: "2", outputAmount: "100000", timestamp: Math.floor(Date.now() / 1000).toString() }] as Fill[]
      }
    };
  });
};

const patchGasPrices = () => {
  patch(rubicon, 'estimateGas', () => {
    return GAS_PRICES;
  });
};

const patchPost = () => {
  patch(rubicon, 'post', () => {
    return { data: { hash: "0x3920392039203920392093209329300293"} } // mock
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

beforeAll(() => {
  patchGetTrades();
  patchMarkets();
  patchPost();
  patchDelete();
  patchSignOrder();
})

// eslint-disable-next-line @typescript-eslint/no-empty-function
beforeEach(() => {
  patchCurrentBlockNumber();
});

afterEach(() => {
  unpatch();
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
      .expect((res) => expect(res.body.markets.price).toEqual('WETH'))
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
      .expect((res) => expect(res.body.id).toEqual("0x3920392039203920392093209329300293"));
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
          '0x8ce222ca5da95aaffd87b3d38a307f25d6e2c09e70a0cb8599bc6c8a0851fda3',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH))
      .expect((res) => expect(res.body.id).toEqual('0x8ce222ca5da95aaffd87b3d38a307f25d6e2c09e70a0cb8599bc6c8a0851fda3'));
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
