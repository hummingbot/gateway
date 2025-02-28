import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../src/connectors/uniswap/uniswap';
import { patch, unpatch } from '../../../test/services/patch';
import { gasCostInEthString } from '../../../src/services/base';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { gatewayApp } from '../../../src/app';

let eth: Ethereum;
let uniswap: Uniswap;

beforeAll(async () => {
  eth = Ethereum.getInstance('sepolia');
  patchEVMNonceManager(eth.nonceManager);
  await eth.init();

  uniswap = Uniswap.getInstance('ethereum', 'sepolia');
  await uniswap.init();
  
  await gatewayApp.ready();
});

beforeEach(() => {
  patchEVMNonceManager(eth.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await eth.close();
  await gatewayApp.close();
});

const address: string = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5';

const patchGetWallet = () => {
  patch(eth, 'getWallet', () => {
    return {
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    };
  });
};

const patchInit = () => {
  patch(uniswap, 'init', async () => {
    return;
  });
};

const patchStoredTokenList = () => {
  patch(eth, 'tokenList', () => {
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
        address: '0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60',
        decimals: 18,
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(eth, 'getTokenBySymbol', (symbol: string) => {
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
  patch(uniswap, 'getTokenByAddress', () => {
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
  patch(eth, 'estimateGasPrice', async () => 100);
};

const patchEstimateBuyTrade = () => {
  patch(uniswap, 'estimateBuyTrade', () => {
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
  patch(uniswap, 'estimateSellTrade', () => {
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
  patch(eth.nonceManager, 'getNonce', () => 21);
};

const patchExecuteTrade = () => {
  patch(uniswap, 'executeTrade', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

describe('POST /uniswap/price', () => {
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

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        side: 'BUY',
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.amount).toEqual('10000.000000000000000000');
    expect(body.rawAmount).toEqual('10000000000000000000000');
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

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.amount).toEqual('10000.000000000000000000');
    expect(body.rawAmount).toEqual('10000000000000000000000');
  });

  it('should return 500 for unrecognized quote symbol', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DOGE',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 for unrecognized base symbol', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'SHIBA',
        amount: '10000',
        side: 'SELL',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and SELL', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'SHIBA',
        amount: '10.000',
        side: 'SELL',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 for unrecognized base symbol with decimals in the amount and BUY', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'SHIBA',
        amount: '10.000',
        side: 'BUY',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 when the priceSwapIn operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(uniswap, 'priceSwapIn', () => {
      return 'error';
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DOGE',
        base: 'WETH',
        amount: '10000',
        side: 'SELL',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(uniswap, 'priceSwapOut', () => {
      return 'error';
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/price',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DOGE',
        base: 'WETH',
        amount: '10000',
        side: 'BUY',
      }
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('POST /uniswap/trade', () => {
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
  // it('should return 200 for BUY', async () => {
  //   patchForBuy();
  //   const response = await gatewayApp.inject({
  //     method: 'POST',
  //     url: '/uniswap/trade',
  //     payload: {
  //       chain: 'ethereum',
  //       network: 'sepolia',
  //       connector: 'uniswap',
  //       quote: 'DAI',
  //       base: 'WETH',
  //       amount: '10000',
  //       address,
  //       side: 'BUY',
  //       nonce: 21,
  //     }
  //   });

  //   expect(response.statusCode).toBe(200);
  //   const body = JSON.parse(response.payload);
  //   expect(body.nonce).toEqual(21);
  // });

  // it('should return 200 for BUY without nonce parameter', async () => {
  //   patchForBuy();
  //   const response = await gatewayApp.inject({
  //     method: 'POST',
  //     url: '/uniswap/trade',
  //     payload: {
  //       chain: 'ethereum',
  //       network: 'sepolia',
  //       connector: 'uniswap',
  //       quote: 'DAI',
  //       base: 'WETH',
  //       amount: '10000',
  //       address,
  //       side: 'BUY',
  //     }
  //   });

  //   expect(response.statusCode).toBe(200);
  // });

  // it('should return 200 for BUY with maxFeePerGas and maxPriorityFeePerGas', async () => {
  //   patchForBuy();
  //   const response = await gatewayApp.inject({
  //     method: 'POST',
  //     url: '/uniswap/trade',
  //     payload: {
  //       chain: 'ethereum',
  //       network: 'sepolia',
  //       connector: 'uniswap',
  //       quote: 'DAI',
  //       base: 'WETH',
  //       amount: '10000',
  //       address,
  //       side: 'BUY',
  //       nonce: 21,
  //       maxFeePerGas: '5000000000',
  //       maxPriorityFeePerGas: '5000000000',
  //     }
  //   });

  //   expect(response.statusCode).toBe(200);
  // });

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
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.nonce).toEqual(21);
  });

  it('should return 200 for SELL  with maxFeePerGas and maxPriorityFeePerGas', async () => {
    patchForSell();
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it('should return 200 for SELL with limitPrice', async () => {
    patchForSell();
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '9',
      }
    });

    expect(response.statusCode).toBe(200);
  });

  // it('should return 200 for BUY with limitPrice', async () => {
  //   patchForBuy();
  //   const response = await gatewayApp.inject({
  //     method: 'POST',
  //     url: '/uniswap/trade',
  //     payload: {
  //       chain: 'ethereum',
  //       network: 'sepolia',
  //       connector: 'uniswap',
  //       quote: 'DAI',
  //       base: 'WETH',
  //       amount: '10000',
  //       address,
  //       side: 'BUY',
  //       nonce: 21,
  //       limitPrice: '999999999999999999999',
  //     }
  //   });

  //   expect(response.statusCode).toBe(200);
  // });

  it('should return 500 for BUY with price smaller than limitPrice', async () => {
    patchForBuy();
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '9',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 for SELL with price higher than limitPrice', async () => {
    patchForSell();
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '99999999999',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 400 when parameters are incorrect', async () => {
    patchInit();
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: 10000,
        address: 'da8',
        side: 'comprar',
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 500 when the priceSwapIn operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(uniswap, 'priceSwapIn', () => {
      return 'error';
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 500 when the priceSwapOut operation fails', async () => {
    patchGetWallet();
    patchInit();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patch(uniswap, 'priceSwapOut', () => {
      return 'error';
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/trade',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
        quote: 'DAI',
        base: 'WETH',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      }
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('POST /uniswap/estimateGas', () => {
  it('should return 200 for valid connector', async () => {
    patchInit();
    patchGasPrice();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/uniswap/estimateGas',
      payload: {
        chain: 'ethereum',
        network: 'sepolia',
        connector: 'uniswap',
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.network).toEqual('sepolia');
    expect(body.gasPrice).toEqual(100);
    expect(body.gasCost).toEqual(
      gasCostInEthString(100, uniswap.gasLimitEstimate)
    );
  });

});
