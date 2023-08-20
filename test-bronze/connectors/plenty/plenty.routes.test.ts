import { BigNumber } from 'bignumber.js';
import express from 'express';
import { Express } from 'express-serve-static-core';
import request from 'supertest';
import { AmmRoutes } from '../../../src/amm/amm.routes';
import { patch, unpatch } from '../../../test/services/patch';
import { Tezos } from '../../../src/chains/tezos/tezos';
import { Plenty } from '../../../src/connectors/plenty/plenty';
import * as plentyUtils from '../../../src/connectors/plenty/utils/router';
let app: Express;
let tezos: Tezos;
let plenty: Plenty;


beforeAll(async () => {
  app = express();
  app.use(express.json());

  tezos = Tezos.getInstance('mainnet');
  await tezos.init();
  plenty = Plenty.getInstance('mainnet');


  app.use('/amm', AmmRoutes.router);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await tezos.close();
});

const address: string = 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV';

const patchGetWallet = () => {
  patch(tezos, 'getWallet', () => {
    return {
      signer: {
        publicKeyHash: () => 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV'
      },
      estimate: {
        batch: () => [
          {
            totalCost: 100,
            gasLimit: 100,
          },
          {
            totalCost: 200,
            gasLimit: 200,
          }
        ]
      }
    };
  });
};

const patchRouterSwap = () => {
  patch(plentyUtils, 'routerSwap', () => { });
};

const patchStoredTokenList = () => {
  patch(tezos, 'tokenList', () => {
    return [
      {
        name: "Tezos",
        symbol: "XTZ",
        address: null,
        decimals: 6,
        standard: "TEZ",
        tokenId: null
      },
      {
        name: "Tether USD",
        symbol: "USDT",
        address: "KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o",
        decimals: 6,
        standard: "FA2",
        tokenId: 0
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(tezos, 'getTokenBySymbol', (symbol: string) => {
    if (symbol === 'XTZ') {
      return {
        name: "Tezos",
        symbol: "XTZ",
        address: null,
        decimals: 6,
        standard: "TEZ",
        tokenId: null
      };
    } else {
      return {
        name: "Tether USD",
        symbol: "USDT",
        address: "KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o",
        decimals: 6,
        standard: "FA2",
        tokenId: 0
      };
    }
  });
};

const patchGasPrice = () => {
  patch(tezos, 'gasPrice', () => 123456);
};

const patchEstimateBuyTrade = () => {
  patch(plenty, 'estimateBuyTrade', () => {
    return {
      expectedAmount: {
        toString: () => '1',
      },
      trade: {
        executionPrice: new BigNumber(1),
        routeParams: [],
        amountIn: new BigNumber(1000000),
      }
    };
  });
};

const patchEstimateSellTrade = () => {
  patch(plenty, 'estimateSellTrade', () => {
    return {
      expectedAmount: {
        toString: () => '1',
      },
      trade: {
        executionPrice: new BigNumber(1),
        routeParams: [],
        amountIn: new BigNumber(1000000),
      }
    };
  });
};

const patchExecuteTrade = () => {
  patch(plenty, 'executeTrade', () => {
    return { nonce: 21, hash: '000000000000000', operations: [{ counter: 21 }] };
  });
};

describe('POST /amm/price', () => {
  it('should return 200 for BUY', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchExecuteTrade();
    patchRouterSwap();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('1.000000');
        expect(res.body.rawAmount).toEqual('1000000');
      });
  });

  it('should return 200 for SELL', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGasPrice();
    patchEstimateSellTrade();
    patchExecuteTrade();
    patchRouterSwap();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('1.000000');
        expect(res.body.rawAmount).toEqual('1000000');
      });
  });

  it('should return 500 for unrecognized quote symbol', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateSellTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'CTEZ',
        base: 'XTZ',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateSellTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'CTEZ',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and SELL', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateSellTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1.000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and BUY', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateBuyTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'CTEZ',
        amount: '1.000',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the routerSwap operation fails', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateSellTrade();

    patch(plenty, 'routerSwap', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchEstimateBuyTrade();

    patch(plenty, 'priceSwapOut', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /amm/trade', () => {
  const patchForBuy = () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchExecuteTrade();
    patchRouterSwap();
  };

  it('should return 200 for BUY', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  const patchForSell = () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGasPrice();
    patchEstimateSellTrade();
    patchExecuteTrade();
    patchRouterSwap();
  };

  it('should return 200 for SELL', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  it('should return 200 for SELL with limitPrice', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'SELL',
        limitPrice: '1',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with limitPrice', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'BUY',
        limitPrice: '999999999999999999999',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 500 for BUY with price greater than limitPrice', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'BUY',
        limitPrice: '0.9',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for SELL with price lower than limitPrice', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'SELL',
        limitPrice: '99999999999',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 404 when parameters are incorrect', async () => {
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: 1,
        address: 'da8',
        side: 'comprar',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('should return 500 when the routerSwap operation fails', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patch(plenty, 'routerSwap', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'SELL',
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patch(plenty, 'priceSwapOut', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
        quote: 'USDT',
        base: 'XTZ',
        amount: '1',
        address,
        side: 'BUY',
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /amm/estimateGas', () => {
  it('should return 200 for valid connector', async () => {
    patchGasPrice();

    await request(app)
      .post('/amm/estimateGas')
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'plenty',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.network).toEqual('mainnet');
        expect(res.body.gasPrice).toEqual(0.123456);
        expect(res.body.gasCost).toEqual('0.001852');
      });
  });

  it('should return 500 for invalid connector', async () => {
    patchGasPrice();

    await request(app)
      .post('/amm/estimateGas')
      .send({
        chain: 'tezos',
        network: 'mainnet',
        connector: 'pangolin',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});
