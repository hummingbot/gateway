import request from 'supertest';
import Decimal from 'decimal.js-light';
import { Token } from '@uniswap/sdk';
import { EncodedStrategy, TokenPair } from '@bancor/carbon-sdk';
import {
  buildStrategyObject,
  encodeStrategy,
} from '@bancor/carbon-sdk/strategy-management';
import { BigNumber } from '@bancor/carbon-sdk/utils';
import { gatewayApp } from '../../../src/app';
import { patch, unpatch } from '../../../test/services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { EVMTxBroadcaster } from '../../../src/chains/ethereum/evm.broadcaster';
import { CarbonAMM } from '../../../src/connectors/carbon/carbonAMM';
import { logger } from '../../../src/services/logger';
import { encodeStrategyId } from '../../../src/connectors/carbon/carbon.utils';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';

let ethereum: Ethereum;
let carbon: CarbonAMM;

const TX_HASH =
  '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2'; // noqa: mock
const DEFAULT_FEE = 2000;

const ETH = new Token(
  1,
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  18,
  'ETH'
);

const USDC = new Token(
  1,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  6,
  'USDC'
);

const DAI = new Token(
  1,
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  18,
  'DAI'
);

const INVALID_REQUEST = {
  chain: 'unknown',
  connector: 'carbon',
};

const MARKETS = [
  {
    ticker: 'DAI-USDC',
    baseToken: {
      chainId: 1,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logoURI:
        'https://assets.coingecko.com/coins/images/9956/thumb/4943.png?1636636734',
    },
    quoteToken: {
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoURI:
        'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389',
    },
    makerFee: 10,
  },
  {
    ticker: 'DAI-ETH',
    baseToken: {
      chainId: 1,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logoURI:
        'https://assets.coingecko.com/coins/images/9956/thumb/4943.png?1636636734',
    },
    quoteToken: {
      chainId: 1,
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    makerFee: 2000,
  },
];

const ORDERS = [
  {
    id: '729',
    pairId: '4',
    owner: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    baseToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 6,
    quoteDecimals: 18,
    buyPriceLow: '0.95',
    buyPriceMarginal: '0.98',
    buyPriceHigh: '0.98',
    buyBudget: '1000',
    sellPriceLow: '1.03',
    sellPriceMarginal: '1.035',
    sellPriceHigh: '1.04',
    sellBudget: '1000',
  },
  {
    id: '730',
    pairId: '4',
    owner: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    baseToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 6,
    quoteDecimals: 18,
    buyPriceLow: '0.90',
    buyPriceMarginal: '0.95',
    buyPriceHigh: '0.95',
    buyBudget: '2000',
    sellPriceLow: '1.03',
    sellPriceMarginal: '1.05',
    sellPriceHigh: '1.05',
    sellBudget: '2000',
  },
  {
    id: '731',
    pairId: '1',
    owner: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f',
    baseToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 18,
    quoteDecimals: 18,
    buyPriceLow: '1500',
    buyPriceMarginal: '1900',
    buyPriceHigh: '1900',
    buyBudget: '1000',
    sellPriceLow: '2200',
    sellPriceMarginal: '2400',
    sellPriceHigh: '2400',
    sellBudget: '1000',
  },
];

beforeAll(async () => {
  ethereum = Ethereum.getInstance('mainnet');
  patchEVMNonceManager(ethereum.nonceManager);
  ethereum.init();
  carbon = CarbonAMM.getInstance('ethereum', 'mainnet');
  patchReader();

  await carbon.init();
});

beforeEach(() => {
  patchReader();
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ethereum.close();
});

const buildEncodedStrategy = (order: {
  id: string;
  pairId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals: number;
  quoteDecimals: number;
  buyPriceLow: string;
  buyPriceHigh: string;
  buyBudget: string;
  sellPriceLow: string;
  sellPriceHigh: string;
  sellBudget: string;
}) => {
  const strategyObject = buildStrategyObject(
    order.baseToken,
    order.quoteToken,
    order.baseDecimals,
    order.quoteDecimals,
    order.buyPriceLow,
    order.buyPriceHigh,
    order.buyPriceHigh,
    order.buyBudget,
    order.sellPriceLow,
    order.sellPriceHigh,
    order.sellPriceHigh,
    order.sellBudget
  );

  return {
    id: BigNumber.from(encodeStrategyId(order.id, order.pairId)),
    ...encodeStrategy(strategyObject),
  };
};

const patchReader = () => {
  patch(carbon.api.reader, 'tokensByOwner', (owner: string): BigNumber[] => {
    const ownerOrders = ORDERS.filter((order) => owner === order.owner);
    if (!owner || ownerOrders.length === 0) return [];
    return ownerOrders.map((order) =>
      BigNumber.from(encodeStrategyId(order.id, order.pairId))
    );
  });

  patch(carbon.api.reader, 'pairs', (): TokenPair[] => {
    return MARKETS.map((market) => [
      market.baseToken.address,
      market.quoteToken.address,
    ]);
  });

  patch(
    carbon.api.reader,
    'strategiesByPair',
    (token0: string, token1: string): EncodedStrategy[] => {
      return ORDERS.filter((order) => {
        return (
          (order.baseToken === token0 && order.quoteToken === token1) ||
          (order.baseToken === token1 && order.quoteToken === token0)
        );
      }).map(buildEncodedStrategy);
    }
  );

  patch(
    carbon.api.reader,
    'strategies',
    (ids: BigNumber[]): EncodedStrategy[] => {
      return ORDERS.filter((order) => {
        return ids.includes(
          BigNumber.from(encodeStrategyId(order.id, order.pairId))
        );
      }).map(buildEncodedStrategy);
    }
  );

  patch(carbon.api.reader, 'strategy', (id: BigNumber): EncodedStrategy => {
    const order = ORDERS.find((order) => {
      return encodeStrategyId(order.id, order.pairId) === id.toString();
    });
    if (!order) throw Error('No strategy found');

    return buildEncodedStrategy(order);
  });

  patch(carbon.api.reader, 'tradingFeePPM', (): number => {
    return DEFAULT_FEE;
  });

  patch(
    carbon.api.reader,
    'pairsTradingFeePPM',
    (pairs: TokenPair[]): [string, string, number][] => {
      return pairs.map((pair) => {
        const market = MARKETS.filter((market) => 'makerFee' in market).find(
          (market) => {
            return (
              (market.baseToken.address.toLowerCase() ===
                pair[0].toLowerCase() &&
                market.quoteToken.address.toLowerCase() ===
                  pair[1].toLowerCase()) ||
              (market.baseToken.address.toLowerCase() ===
                pair[1].toLowerCase() &&
                market.quoteToken.address.toLowerCase() ===
                  pair[0].toLowerCase())
            );
          }
        );
        return [pair[0], pair[1], market?.makerFee || DEFAULT_FEE];
      });
    }
  );
  patch(
    carbon.api.reader,
    'getLatestStrategyCreatedStrategies',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestStrategyDeletedStrategies',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestTokensTradedTrades',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestTradingFeeUpdates',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );
  patch(
    carbon.api.reader,
    'getLatestPairTradingFeeUpdates',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );
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

describe('verify Carbon estimateSellTrade', () => {
  const inputAmount = 0.01;
  const inputAmountWei = new Decimal(inputAmount)
    .times(new Decimal(10).pow(ETH.decimals))
    .toString();

  it('Should return an ExpectedTrade when available', async () => {
    const expectedTrade = await carbon.estimateSellTrade(
      ETH,
      DAI,
      BigNumber.from(inputAmountWei)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no trade actions are possible', async () => {
    await expect(async () => {
      await carbon.estimateSellTrade(ETH, USDC, BigNumber.from(1));
    }).rejects.toThrow(Error);
  });
});

describe('verify Carbon estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    const inputAmount = 0.01;
    const inputAmountWei = new Decimal(inputAmount)
      .times(new Decimal(10).pow(ETH.decimals))
      .toString();

    const expectedTrade = await carbon.estimateBuyTrade(
      ETH,
      DAI,
      BigNumber.from(inputAmountWei)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no trade actions are possible', async () => {
    await expect(async () => {
      await carbon.estimateSellTrade(ETH, USDC, BigNumber.from(1));
    }).rejects.toThrow(Error);
  });
});

describe('getAllowedSlippage', () => {
  it('return number value when not null', () => {
    const allowedSlippage = carbon.getAllowedSlippage('2/100');
    expect(allowedSlippage).toEqual(0.02);
  });

  it('return value from config when slippage is null', () => {
    const allowedSlippage = carbon.getAllowedSlippage();
    expect(allowedSlippage).toEqual(0.01);
  });

  it('return value from config when input is malformed', () => {
    const allowedSlippage = carbon.getAllowedSlippage('yo');
    expect(allowedSlippage).toEqual(0.01);
  });
});

describe('POST /amm/price SELL', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbonAMM',
        base: 'DAI',
        quote: 'USDC',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.base).toEqual(DAI.address))
      .expect((res) => expect(res.body.quote).toEqual(USDC.address))
      .expect((res) => expect(Number(res.body.amount)).toEqual(1))
      .expect((res) => expect(Number(res.body.expectedAmount)).toBeLessThan(1))
      .expect((res) => expect(Number(res.body.price)).toBeLessThan(1));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /amm/price BUY', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbonAMM',
        base: 'DAI',
        quote: 'USDC',
        amount: '1',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.base).toEqual(DAI.address))
      .expect((res) => expect(res.body.quote).toEqual(USDC.address))
      .expect((res) => expect(Number(res.body.amount)).toEqual(1))
      .expect((res) =>
        expect(Number(res.body.expectedAmount)).toBeGreaterThan(1)
      )
      .expect((res) => expect(Number(res.body.price)).toBeGreaterThan(1));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /amm/trade SELL', () => {
  it('should return 200 with proper request', async () => {
    patchGetWallet();
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbonAMM',
        base: 'DAI',
        quote: 'USDC',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.base).toEqual(DAI.address))
      .expect((res) => expect(res.body.quote).toEqual(USDC.address))
      .expect((res) => expect(Number(res.body.amount)).toEqual(1))
      .expect((res) => expect(Number(res.body.expectedOut)).toBeLessThan(1))
      .expect((res) => expect(Number(res.body.price)).toBeLessThan(1))
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /amm/trade BUY', () => {
  it('should return 200 with proper request', async () => {
    patchGetWallet();
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbonAMM',
        base: 'DAI',
        quote: 'USDC',
        amount: '1',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.base).toEqual(DAI.address))
      .expect((res) => expect(res.body.quote).toEqual(USDC.address))
      .expect((res) => expect(Number(res.body.amount)).toEqual(1))
      .expect((res) => expect(Number(res.body.expectedIn)).toBeGreaterThan(1))
      .expect((res) => expect(Number(res.body.price)).toBeGreaterThan(1))
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});
