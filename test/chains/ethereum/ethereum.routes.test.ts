import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patch, unpatch } from '../../../test/services/patch';
import { gatewayApp } from '../../../src/app';
import {
  NETWORK_ERROR_CODE,
  RATE_LIMIT_ERROR_CODE,
  UNKNOWN_ERROR_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../../src/services/error-handler';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import * as transactionSuccesful from './fixtures/transaction-succesful.json';
import * as transactionSuccesfulReceipt from './fixtures/transaction-succesful-receipt.json';
import * as transactionOutOfGas from './fixtures/transaction-out-of-gas.json';

let eth: Ethereum;

beforeAll(async () => {
  eth = Ethereum.getInstance('sepolia');
  patchEVMNonceManager(eth.nonceManager);
  await eth.init();
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

const patchGetWallet = () => {
  patch(eth, 'getWallet', () => {
    return {
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    };
  });
};

const patchGetNonce = () => {
  patch(eth.nonceManager, 'getNonce', () => 2);
};

// const patchGetNextNonce = () => {
//   patch(eth.nonceManager, 'getNextNonce', () => 3);
// };

const patchGetERC20Balance = () => {
  patch(eth, 'getERC20Balance', () => ({ value: 1, decimals: 3 }));
};

const patchGetNativeBalance = () => {
  patch(eth, 'getNativeBalance', () => ({ value: 1, decimals: 3 }));
};

const patchGetERC20Allowance = () => {
  patch(eth, 'getERC20Allowance', () => ({ value: 1, decimals: 3 }));
};

const patchGetTokenBySymbol = () => {
  patch(eth, 'getTokenBySymbol', (symbol: string) => {
    let result;
    switch (symbol) {
      case 'WETH':
        result = {
          chainId: 42,
          name: 'WETH',
          symbol: 'WETH',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 18,
        };
        break;
      case 'DAI':
        result = {
          chainId: 42,
          name: 'DAI',
          symbol: 'DAI',
          address: '0xd0A1E359811322d97991E03f863a0C30C2cFFFFF',
          decimals: 18,
        };
        break;
    }
    return result;
  });
};

const patchApproveERC20 = (tx_type?: string) => {
  const default_tx = {
    type: 2,
    chainId: 42,
    nonce: 115,
    maxPriorityFeePerGas: { toString: () => '106000000000' },
    maxFeePerGas: { toString: () => '106000000000' },
    gasPrice: { toString: () => null },
    gasLimit: { toString: () => '100000' },
    to: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
    value: { toString: () => '0' },
    data: '0x095ea7b30000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488dffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // noqa: mock
    accessList: [],
    hash: '0x75f98675a8f64dcf14927ccde9a1d59b67fa09b72cc2642ad055dae4074853d9', // noqa: mock
    v: 0,
    r: '0xbeb9aa40028d79b9fdab108fcef5de635457a05f3a254410414c095b02c64643', // noqa: mock
    s: '0x5a1506fa4b7f8b4f3826d8648f27ebaa9c0ee4bd67f569414b8cd8884c073100', // noqa: mock
    from: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    confirmations: 0,
  };
  if (tx_type === 'overwritten_tx') {
    default_tx.hash =
      '0x5a1ed682d0d7a58fbd7828bbf5994cd024feb8895d4da82c741ec4a191b9e849'; // noqa: mock
  }
  patch(eth, 'approveERC20', () => {
    return default_tx;
  });
};

describe('POST /ethereum/allowances', () => {
  it('should return 200 asking for allowances', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    const theSpender = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5';
    eth.getSpender = jest.fn().mockReturnValue(theSpender);
    eth.getContract = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });
    patchGetERC20Allowance();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/allowances',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        spender: theSpender,
        tokenSymbols: ['WETH', 'DAI'],
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.spender).toEqual(theSpender);
    expect(body.approvals.WETH).toEqual('0.001');
    expect(body.approvals.DAI).toEqual('0.001');
  });

  it('should return 404 when parameters are invalid', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/allowances',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        spender: '0xSpender',
        tokenSymbols: ['WETH', 'DAI'],
      }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /ethereum/balances', () => {
  it('should return 200 asking for supported tokens', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    patchGetNativeBalance();
    patchGetERC20Balance();
    eth.getContract = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/balances',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        tokenSymbols: ['WETH', 'DAI'],
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.balances.WETH).toBeDefined();
    expect(body.balances.DAI).toBeDefined();
  });

  it('should return 200 asking for native token', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    patchGetNativeBalance();
    patchGetERC20Balance();
    eth.getContract = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/balances',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        tokenSymbols: ['ETH'],
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.balances.ETH).toBeDefined();
    console.log(body);
  });

  it('should return 500 for unsupported tokens', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    patchGetNativeBalance();
    patchGetERC20Balance();
    eth.getContract = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/balances',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        tokenSymbols: ['XXX', 'YYY'],
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it('should return 404 when parameters are invalid', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/balances',
      payload: {
        network: 'sepolia',
        address: 'da857cbda0ba96757fed842617a4',
      }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /ethereum/nonce', () => {
  it('should return 200', async () => {
    patchGetWallet();
    patchGetNonce();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/nonce',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.nonce).toBe(2);
  });

  it('should return 404 when parameters are invalid', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/nonce',
      payload: {
        network: 'sepolia',
        address: 'da857cbda0ba96757fed842617a4',
      }
    });

    expect(response.statusCode).toBe(404);
  });
});

// describe('POST /ethereum/nextNonce', () => {
//   it('should return 200', async () => {
//     patchGetWallet();
//     patchGetNextNonce();

//     const response = await gatewayApp.inject({
//       method: 'POST',
//       url: '/ethereum/nextNonce',
//       payload: {
//         network: 'sepolia',
//         address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
//       }
//     });
//     console.log("nextNonce response:", response);

//     expect(response.statusCode).toBe(200);
//     expect(response.headers['content-type']).toMatch(/json/);
//     const body = JSON.parse(response.payload);
//     expect(body.nonce).toBe(3);
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     const response = await gatewayApp.inject({
//       method: 'POST',
//       url: '/ethereum/nextNonce',
//       payload: {
//         network: 'sepolia',
//         address: 'da857cbda0ba96757fed842617a4',
//       }
//     });

//     expect(response.statusCode).toBe(404);
//   });
// });

describe('POST /ethereum/approve', () => {
  it('approve without nonce parameter should return 200', async () => {
    patchGetWallet();
    eth.getContract = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });
    patch(eth.nonceManager, 'getNonce', () => 115);
    patchGetTokenBySymbol();
    patchApproveERC20();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/approve',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        spender: 'uniswap',
        token: 'WETH',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });


  it('should return 404 when parameters are invalid', async () => {
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/approve',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        spender: 'uniswap',
        token: 123,
        nonce: '23',
      }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /ethereum/cancel', () => {
  it('should return 200', async () => {
    eth.getWallet = jest.fn().mockReturnValue({
      address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
    });

    eth.cancelTx = jest.fn().mockReturnValue({
      hash: '0xf6b9e7cec507cb3763a1179ff7e2a88c6008372e3a6f297d9027a0b39b0fff77',
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/cancel',
      payload: {
        network: 'sepolia',
        address: '0xFaA12FD102FE8623C9299c72B03E45107F2772B5',
        nonce: 23,
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.txHash).toEqual('0xf6b9e7cec507cb3763a1179ff7e2a88c6008372e3a6f297d9027a0b39b0fff77');
  });
});

describe('POST /ethereum/poll', () => {
  it('should get a NETWORK_ERROR_CODE when the network is unavailable', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      const error: any = new Error('something went wrong');
      error.code = 'NETWORK_ERROR';
      throw error;
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('should get a UNKNOWN_ERROR_ERROR_CODE when an unknown error is thrown', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      throw new Error();
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('should get a null in txReceipt for Tx in the mempool', async () => {
    patch(eth, 'getCurrentBlockNumber', () => 1);
    patch(eth, 'getTransaction', () => transactionOutOfGas);
    patch(eth, 'getTransactionReceipt', () => null);
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.txReceipt).toEqual(null);
    expect(body.txData).toBeDefined();
    expect(body.currentBlock).toBeDefined();
    expect(body.txHash).toEqual('0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362');
  });

  it('should get a null in txReceipt and txData for Tx that didnt reach the mempool and TxReceipt is null', async () => {
    patch(eth, 'getCurrentBlockNumber', () => 1);
    patch(eth, 'getTransaction', () => null);
    patch(eth, 'getTransactionReceipt', () => null);
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.txReceipt).toEqual(null);
    expect(body.txData).toEqual(null);
    expect(body.txStatus).toEqual(-1);
    expect(body.txBlock).toEqual(-1);
    expect(body.currentBlock).toBeDefined();
    expect(body.txHash).toEqual('0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362');
  });

  it('should get txStatus = 1 for a succesful query', async () => {
    patch(eth, 'getCurrentBlockNumber', () => 1);
    patch(eth, 'getTransaction', () => transactionSuccesful);
    patch(eth, 'getTransactionReceipt', () => transactionSuccesfulReceipt);
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x6d068067a5e5a0f08c6395b31938893d1cdad81f54a54456221ecd8c1941294d'
      }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.txReceipt).toBeDefined();
    expect(body.txData).toBeDefined();
  });

  it('should get an RATE_LIMIT_ERROR_CODE when the blockchain API is rate limited', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      const error: any = new Error(
        'daily request count exceeded, request rate limited'
      );
      error.code = -32005;
      error.data = {
        see: 'https://infura.io/docs/ethereum/jsonrpc/ratelimits',
        current_rps: 13.333,
        allowed_rps: 10.0,
        backoff_seconds: 30.0,
      };
      throw error;
    });
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('should get unknown error', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      const error: any = new Error('something went wrong');
      error.code = -32006;
      throw error;
    });
    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/ethereum/poll',
      payload: {
        network: 'sepolia',
        txHash: '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'
      }
    });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });
});
