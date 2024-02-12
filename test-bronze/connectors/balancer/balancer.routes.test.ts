import request from 'supertest';
import { patch, unpatch } from '../../../test/services/patch';
import { gatewayApp } from '../../../src/app';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Balancer } from '../../../src/connectors/balancer/balancer';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';
import { BigNumber } from 'ethers';


const SWAP_DATA = {
  swapAmount: BigNumber.from(1),
  swapAmountForSwaps: BigNumber.from(1),
  returnAmount: BigNumber.from(1),
  returnAmountFromSwaps: BigNumber.from(1),
  returnAmountConsideringFees: BigNumber.from(1),
  swaps: [
    {
      poolId: "0x0b09dea16768f0799065c475be02919503cb2a3500020000000000000000001a",
      assetInIndex: 0,
      assetOutIndex: 1,
      amount: "1000000000000000000",
      userData: "0x",
      returnAmount: "1000000000000000000",
    },
  ],
  tokenAddresses: [
    "0xd0A1E359811322d97991E03f863a0C30C2cF029C",
    "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  ],
  tokenIn: "0xd0A1E359811322d97991E03f863a0C30C2cF029C",
  tokenOut: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  marketSp: "1.0",
  tokenInForSwaps: "0xd0A1E359811322d97991E03f863a0C30C2cF029C",
  tokenOutFromSwaps: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};

let ethereum: Ethereum;
let balancer: Balancer;

beforeAll(async () => {
  ethereum = Ethereum.getInstance('goerli');
  patchEVMNonceManager(ethereum.nonceManager);
  await ethereum.init();

  balancer = Balancer.getInstance('ethereum', 'goerli');
  await balancer.init();
});

beforeEach(() => {
  patchEVMNonceManager(ethereum.nonceManager);
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

const patchStoredTokenList = () => {
  patch(ethereum, 'tokenList', () => {
    return [
      {
        chainId: 5,
        name: 'WETH',
        symbol: 'WETH',
        address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
        decimals: 18,
      },
      {
        chainId: 5,
        name: 'Wrapped AVAX',
        symbol: 'WAVAX',
        address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
        decimals: 18,
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
    if (symbol === 'WETH') {
      return {
        chainId: 5,
        name: 'WETH',
        symbol: 'WETH',
        address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
        decimals: 18,
      };
    } else {
      return {
        chainId: 42,
        name: 'WAVAX',
        symbol: 'WAVAX',
        address: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
        decimals: 18,
      };
    }
  });
};

const patchGetTokenByAddress = () => {
  patch(balancer, 'getTokenByAddress', () => {
    return {
      chainId: 5,
      name: 'WETH',
      symbol: 'WETH',
      address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      decimals: 18,
    };
  });
};

const patchGasPrice = () => {
  patch(ethereum, 'gasPrice', () => 100);
};

const patchEstimateBuyTrade = () => {
  patchEstimateSellTrade();
};

const patchEstimateSellTrade = () => {
  patch(balancer.balancer.swaps, 'fetchPools', () => {
    return true;
  });
  patch(balancer.balancer.swaps, 'findRouteGivenIn', async () => {
    return SWAP_DATA;
  });
  patch(balancer.balancer.swaps, 'findRouteGivenOut', async () => {
    return SWAP_DATA;
  });
};

const patchGetNonce = () => {
  patch(ethereum.nonceManager, 'getNonce', () => 21);
};

const patchExecuteTrade = () => {
  patch(balancer, 'executeTrade', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

describe('POST /amm/price', () => {
  it('should return 200 for BUY', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateSellTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    patchStoredTokenList();
    patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WETH') {
        return {
          chainId: 5,
          name: 'WETH',
          symbol: 'WETH',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 18,
        };
      } else {
        return null;
      }
    });
    patchGetTokenByAddress();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'DOGE',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WETH') {
        return {
          chainId: 5,
          name: 'WETH',
          symbol: 'WETH',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 18,
        };
      } else {
        return null;
      }
    });
    patchGetTokenByAddress();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
        base: 'SHIBA',
        amount: '10000',
        side: 'SELL',
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
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();
  };
  it('should return 200 for BUY', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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

  it('should return 404 when parameters are incorrect', async () => {
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
        base: 'WETH',
        amount: 10000,
        address: 'da8',
        side: 'comprar',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('should return 500 when base token is unknown', async () => {
    patchForSell();
    patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WETH') {
        return {
          chainId: 5,
          name: 'WETH',
          symbol: 'WETH',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 18,
        };
      } else {
        return null;
      }
    });

    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WETH',
        base: 'BITCOIN',
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

  it('should return 500 when quote token is unknown', async () => {
    patchForSell();
    patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WETH') {
        return {
          chainId: 5,
          name: 'WETH',
          symbol: 'WETH',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 18,
        };
      } else {
        return null;
      }
    });

    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'BITCOIN',
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

  it('should return 200 for SELL with limitPrice', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '0.5',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with limitPrice', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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

  it('should return 200 for SELL with price higher than limitPrice', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
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

  it('should return 200 for BUY with price less than limitPrice', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'ethereum',
        network: 'goerli',
        connector: 'balancer',
        quote: 'WAVAX',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '0.5',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});
