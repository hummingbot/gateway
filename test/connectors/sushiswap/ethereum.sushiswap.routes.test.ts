import express from 'express';
import { Express } from 'express-serve-static-core';
import request from 'supertest';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Sushiswap } from '../../../src/connectors/sushiswap/sushiswap';
import { AmmRoutes } from '../../../src/amm/amm.routes';
import { patch, unpatch } from '../../services/patch';
import { gasCostInEthString } from '../../../src/services/base';

let app: Express;
let ethereum: Ethereum;
let sushiswap: Sushiswap;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ethereum = Ethereum.getInstance('goerli');
  await ethereum.init();
  sushiswap = Sushiswap.getInstance('ethereum', 'goerli');
  await sushiswap.init();
  app.use('/amm', AmmRoutes.router);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ethereum.close();
});

const address: string = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5';

const patchGetWallet = () => {
  patch(ethereum, 'getWallet', () => {
    return {
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    };
  });
};

const patchInit = () => {
  patch(sushiswap, 'init', async () => {
    return;
  });
};

const patchStoredTokenList = () => {
  patch(ethereum, 'tokenList', () => {
    return [
      {
        chainId: 42,
        name: 'WETH',
        symbol: 'WETH',
        address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
        decimals: 18,
      },
      {
        chainId: 42,
        name: 'DAI',
        symbol: 'DAI',
        address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
        decimals: 18,
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
    if (symbol === 'WETH') {
      return {
        chainId: 42,
        name: 'WETH',
        symbol: 'WETH',
        address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
        decimals: 18,
      };
    } else {
      return {
        chainId: 42,
        name: 'DAI',
        symbol: 'DAI',
        address: '0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60',
        decimals: 18,
      };
    }
  });
};

const patchGetTokenByAddress = () => {
  patch(sushiswap, 'getTokenByAddress', () => {
    return {
      chainId: 42,
      name: 'WETH',
      symbol: 'WETH',
      address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
      decimals: 18,
    };
  });
};

const patchGasPrice = () => {
  patch(ethereum, 'gasPrice', () => 100);
};

const patchEstimateBuyTrade = () => {
  patch(sushiswap, 'estimateBuyTrade', () => {
    return {
      expectedAmount: {
        toSignificant: () => 100,
      },
      trade: {
        executionPrice: {
          invert: jest.fn().mockReturnValue({
            toSignificant: () => 100,
            toFixed: () => '100',
          }),
        },
      },
    };
  });
};

const patchEstimateSellTrade = () => {
  patch(sushiswap, 'estimateSellTrade', () => {
    return {
      expectedAmount: {
        toSignificant: () => 100,
      },
      trade: {
        executionPrice: {
          toSignificant: () => 100,
          toFixed: () => '100',
        },
      },
    };
  });
};

const patchGetNonce = () => {
  patch(ethereum.nonceManager, 'getNonce', () => 21);
};

const patchExecuteTrade = () => {
  patch(sushiswap, 'executeTrade', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

describe('POST /amm/price', () => {
  it('should return 200 for BUY', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('10000.000000000000000000');
        expect(res.body.rawAmount).toEqual('10000000000000000000000');
      });
  });

  it('should return 200 for SELL', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateSellTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('10000.000000000000000000');
        expect(res.body.rawAmount).toEqual('10000000000000000000000');
      });
  });

  it('should return 500 for unrecognized quote symbol', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'NOTASYMBOL',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'NOTASYMBOL',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and SELL', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'NOTASYMBOL',
        amount: '10.000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and BUY', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'NOTASYMBOL',
        amount: '10.000',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the priceSwapIn operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(sushiswap, 'priceSwapIn', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'NOTASYMBOL',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(sushiswap, 'priceSwapOut', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'NOTASYMBOL',
        base: 'WETH',
        amount: '10000',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /amm/trade', () => {
  const patchForBuy = () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();
  };
  it('should return 200 for BUY', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  it('should return 200 for BUY without nonce parameter', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with maxFeePerGas and maxPriorityFeePerGas', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  const patchForSell = () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateSellTrade();
    patchGetNonce();
    patchExecuteTrade();
  };
  it('should return 200 for SELL', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  it('should return 200 for SELL  with maxFeePerGas and maxPriorityFeePerGas', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for SELL with limitPrice', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '9',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with limitPrice', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '999999999999999999999',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 500 for BUY with price smaller than limitPrice', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '9',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for SELL with price higher than limitPrice', async () => {
    patchForSell();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '99999999999',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 404 when parameters are incorrect', async () => {
    patchInit();
    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: 10000,
        address: 'da8',
        side: 'comprar',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });
  it('should return 500 when the priceSwapIn operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(sushiswap, 'priceSwapIn', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(sushiswap, 'priceSwapOut', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /amm/estimateGas', () => {
  it('should return 200 for valid connector', async () => {
    patchInit();
    patchGasPrice();

    await request(app)
      .post('/amm/estimateGas')
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'sushiswap',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.network).toEqual('goerli');
        expect(res.body.gasPrice).toEqual(100);
        expect(res.body.gasCost).toEqual(
          gasCostInEthString(100, sushiswap.gasLimitEstimate)
        );
      });
  });

  it('should return 500 for invalid connector', async () => {
    patchInit();
    patchGasPrice();

    await request(app)
      .post('/amm/estimateGas')
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'pangolin',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});
