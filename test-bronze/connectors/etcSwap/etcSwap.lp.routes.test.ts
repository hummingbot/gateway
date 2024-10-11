import express from 'express';
import { Express } from 'express-serve-static-core';
import request from 'supertest';
import { EthereumClassicChain } from '../../../src/chains/ethereum-classic/ethereum-classic';
import { AmmLiquidityRoutes } from '../../../src/amm/amm.routes';
import { patch, unpatch } from '../../../test/services/patch';
import { ETCSwapLP } from '../../../src/connectors/etcswap/etcswap.lp';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';

let app: Express;
let ethereumclassic: EthereumClassicChain;
let etcSwap: ETCSwapLP;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ethereumclassic = EthereumClassicChain.getInstance('mainnet');
  patchEVMNonceManager(ethereumclassic.nonceManager);
  await ethereumclassic.init();

  etcSwap = ETCSwapLP.getInstance('ethereum-classic', 'mainnet');
  await etcSwap.init();
  app.use('/amm/liquidity', AmmLiquidityRoutes.router);
});

beforeEach(() => {
  patchEVMNonceManager(ethereumclassic.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ethereumclassic.close();
});

const address: string = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5';

const patchGetWallet = () => {
  patch(ethereumclassic, 'getWallet', () => {
    return {
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    };
  });
};

const patchInit = () => {
  patch(etcSwap, 'init', async () => {
    return;
  });
};

const patchStoredTokenList = () => {
  patch(ethereumclassic, 'tokenList', () => {
    return [
      {
        chainId: 61,
        name: 'WETH',
        symbol: 'WETH',
        address: '0x1953cab0e5bfa6d4a9bad6e05fd46c1cc6527a5a',
        decimals: 18,
      },
      {
        chainId: 61,
        name: 'DAI',
        symbol: 'DAI',
        address: '0xde093684c796204224bc081f937aa059d903c52a',
        decimals: 18,
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(ethereumclassic, 'getTokenBySymbol', (symbol: string) => {
    if (symbol === 'WETH') {
      return {
        chainId: 61,
        name: 'WETH',
        symbol: 'WETH',
        address: '0x1953cab0e5bfa6d4a9bad6e05fd46c1cc6527a5a',
        decimals: 18,
      };
    } else {
      return {
        chainId: 61,
        name: 'DAI',
        symbol: 'DAI',
        address: '0xde093684c796204224bc081f937aa059d903c52a',
        decimals: 18,
      };
    }
  });
};

const patchGetTokenByAddress = () => {
  patch(etcSwap, 'getTokenByAddress', () => {
    return {
      chainId: 61,
      name: 'WETH',
      symbol: 'WETH',
      address: '0x1953cab0e5bfa6d4a9bad6e05fd46c1cc6527a5a',
      decimals: 18,
    };
  });
};

const patchGasPrice = () => {
  patch(ethereumclassic, 'gasPrice', () => 100);
};

const patchGetNonce = () => {
  patch(ethereumclassic.nonceManager, 'getNonce', () => 21);
};

const patchAddPosition = () => {
  patch(etcSwap, 'addPosition', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

const patchRemovePosition = () => {
  patch(etcSwap, 'reducePosition', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

const patchCollectFees = () => {
  patch(etcSwap, 'collectFees', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

const patchPosition = () => {
  patch(etcSwap, 'getPosition', () => {
    return {
      token0: 'DAI',
      token1: 'WETH',
      fee: 300,
      lowerPrice: '1',
      upperPrice: '5',
      amount0: '1',
      amount1: '1',
      unclaimedToken0: '1',
      unclaimedToken1: '1',
    };
  });
};

describe('POST /liquidity/add', () => {
  it('should return 200 when all parameter are OK', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchAddPosition();
    patchGetNonce();

    await request(app)
      .post(`/amm/liquidity/add`)
      .send({
        address: address,
        token0: 'DAI',
        token1: 'WETH',
        amount0: '1',
        amount1: '1',
        fee: 'LOW',
        lowerPrice: '1',
        upperPrice: '5',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 500 for unrecognized token0 symbol', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();

    await request(app)
      .post(`/amm/liquidity/add`)
      .send({
        address: address,
        token0: 'DOGE',
        token1: 'WETH',
        amount0: '1',
        amount1: '1',
        fee: 'LOW',
        lowerPrice: '1',
        upperPrice: '5',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 404 for invalid fee tier', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/liquidity/add`)
      .send({
        address: address,
        token0: 'DAI',
        token1: 'WETH',
        amount0: '1',
        amount1: '1',
        fee: 300,
        lowerPrice: '1',
        upperPrice: '5',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('should return 500 when the helper operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(etcSwap, 'addPositionHelper', () => {
      return 'error';
    });

    await request(app)
      .post(`/amm/liquidity/add`)
      .send({
        address: address,
        token0: 'DAI',
        token1: 'WETH',
        amount0: '1',
        amount1: '1',
        fee: 'LOW',
        lowerPrice: '1',
        upperPrice: '5',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /liquidity/remove', () => {
  const patchForBuy = () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchRemovePosition();
    patchGetNonce();
  };
  it('should return 200 when all parameter are OK', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/liquidity/remove`)
      .send({
        address: address,
        tokenId: 2732,
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 404 when the tokenId is invalid', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/liquidity/remove`)
      .send({
        address: address,
        tokenId: 'Invalid',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });
});

describe('POST /liquidity/collect_fees', () => {
  const patchForBuy = () => {
    patchGetWallet();
    patchInit();
    patchGasPrice();
    patchCollectFees();
    patchGetNonce();
  };
  it('should return 200 when all parameter are OK', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/liquidity/collect_fees`)
      .send({
        address: address,
        tokenId: 2732,
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 404 when the tokenId is invalid', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/liquidity/collect_fees`)
      .send({
        address: address,
        tokenId: 'Invalid',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });
});

describe('POST /liquidity/position', () => {
  it('should return 200 when all parameter are OK', async () => {
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchPosition();

    await request(app)
      .post(`/amm/liquidity/position`)
      .send({
        tokenId: 2732,
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 404 when the tokenId is invalid', async () => {
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/liquidity/position`)
      .send({
        tokenId: 'Invalid',
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });
});

describe('POST /liquidity/price', () => {
  const patchForBuy = () => {
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(etcSwap, 'poolPrice', () => {
      return ['100', '105'];
    });
  };
  it('should return 200 when all parameter are OK', async () => {
    patchForBuy();
    await request(app)
      .post(`/amm/liquidity/price`)
      .send({
        token0: 'DAI',
        token1: 'WETH',
        fee: 'LOW',
        period: 120,
        interval: 60,
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 404 when the fee is invalid', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    await request(app)
      .post(`/amm/liquidity/price`)
      .send({
        token0: 'DAI',
        token1: 'WETH',
        fee: 11,
        period: 120,
        interval: 60,
        chain: 'ethereum-classic',
        network: 'mainnet',
        connector: 'etcswapLP',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });
});
