import { BigNumber } from 'ethers';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patch, unpatch } from '../../../test/services/patch';
import { TokenInfo } from '../../../src/chains/ethereum/ethereum-base';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
} from '../../../src/services/error-handler';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import {
  EVMController,
  willTxSucceed,
} from '../../../src/chains/ethereum/evm.controllers';
let eth: Ethereum;

beforeAll(async () => {
  eth = Ethereum.getInstance('goerli');

  patchEVMNonceManager(eth.nonceManager);
});

beforeEach(() => {
  patchEVMNonceManager(eth.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await eth.close();
});

// const zeroAddress =
//   '0000000000000000000000000000000000000000000000000000000000000000'; // noqa: mock

const mockAddress = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5'; // noqa: mock

describe('init', () => {
  it('should wait for the first init() call to finish in future immediate init() calls', async () => {
    let firstCallFullfilled = false;
    const initPromise = eth.init().then(() => {
      firstCallFullfilled = true;
    });
    await eth.init();
    await initPromise;
    expect(firstCallFullfilled).toEqual(true);
  });
});

describe('nonce', () => {
  it('return a nonce for a wallet', async () => {
    patch(eth, 'getWallet', () => {
      return {
        address: mockAddress,
      };
    });
    patch(eth.nonceManager, 'getNonce', () => 2);
    const n = await EVMController.nonce(eth, {
      chain: 'ethereum',
      network: 'goerli',
      address: mockAddress,
    });
    expect(n).toEqual({ nonce: 2 });
  });

  it('return next nonce for a wallet', async () => {
    patch(eth, 'getWallet', () => {
      return {
        address: mockAddress,
      };
    });
    patch(eth.nonceManager, 'getNextNonce', () => 3);
    const n = await EVMController.nextNonce(eth, {
      chain: 'ethereum',
      network: 'goerli',
      address: mockAddress,
    });
    expect(n).toEqual({ nonce: 3 });
  });
});

const weth: TokenInfo = {
  chainId: 42,
  name: 'WETH',
  symbol: 'WETH',
  address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  decimals: 18,
};
describe('getTokenSymbolsToTokens', () => {
  it('return tokens for strings', () => {
    patch(eth, 'getTokenBySymbol', () => {
      return weth;
    });
    expect(EVMController.getTokenSymbolsToTokens(eth, ['WETH'])).toEqual({
      WETH: weth,
    });
  });
});

const uniswap = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

describe('allowances', () => {
  it('return allowances for an owner, spender and tokens', async () => {
    patch(eth, 'getWallet', () => {
      return {
        address: mockAddress,
      };
    });

    patch(eth, 'getTokenBySymbol', () => {
      return weth;
    });

    patch(eth, 'getSpender', () => {
      return uniswap;
    });

    patch(eth, 'getERC20Allowance', () => {
      return {
        value: BigNumber.from('999999999999999999999999'),
        decimals: 2,
      };
    });

    const result = await EVMController.allowances(eth, {
      chain: 'ethereum',
      network: 'goerli',
      address: mockAddress,
      spender: uniswap,
      tokenSymbols: ['WETH'],
    });
    expect((result as any).approvals).toEqual({
      WETH: '9999999999999999999999.99',
    });
  });
});

describe('approve', () => {
  it('approve a spender for an owner, token and amount', async () => {
    patch(eth, 'getSpender', () => {
      return uniswap;
    });
    eth.getContract = jest.fn().mockReturnValue({
      address: mockAddress,
    });

    patch(eth, 'ready', () => true);

    patch(eth, 'getWallet', () => {
      return {
        address: mockAddress,
      };
    });

    patch(eth, 'getTokenBySymbol', () => {
      return weth;
    });

    patch(eth, 'approveERC20', () => {
      return {
        spender: uniswap,
        value: { toString: () => '9999999' },
      };
    });

    const result = await EVMController.approve(eth, {
      chain: 'ethereum',
      network: 'goerli',
      address: mockAddress,
      spender: uniswap,
      token: 'WETH',
    });
    expect((result as any).spender).toEqual(uniswap);
  });

  it('fail if wallet not found', async () => {
    patch(eth, 'getSpender', () => {
      return uniswap;
    });

    const err = 'wallet does not exist';
    patch(eth, 'getWallet', () => {
      throw new Error(err);
    });

    await expect(
      EVMController.approve(eth, {
        chain: 'ethereum',
        network: 'goerli',
        address: mockAddress,
        spender: uniswap,
        token: 'WETH',
      })
    ).rejects.toThrow(
      new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + 'Error: ' + err,
        LOAD_WALLET_ERROR_CODE
      )
    );
  });

  it('fail if token not found', async () => {
    patch(eth, 'getSpender', () => {
      return uniswap;
    });

    patch(eth, 'getWallet', () => {
      return {
        address: mockAddress,
      };
    });

    patch(eth, 'getTokenBySymbol', () => {
      return null;
    });

    await expect(
      EVMController.approve(eth, {
        chain: 'ethereum',
        network: 'goerli',
        address: mockAddress,
        spender: uniswap,
        token: 'WETH',
      })
    ).rejects.toThrow(
      new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + 'WETH',
        TOKEN_NOT_SUPPORTED_ERROR_CODE
      )
    );
  });
});

describe('balances', () => {
  it('fail if wallet not found', async () => {
    const err = 'wallet does not exist';
    patch(eth, 'getWallet', () => {
      throw new Error(err);
    });

    await expect(
      EVMController.balances(eth, {
        network: 'goerli',
        address: mockAddress,
        tokenSymbols: ['WETH', 'DAI'],
      })
    ).rejects.toThrow(
      new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + 'Error: ' + err,
        LOAD_WALLET_ERROR_CODE
      )
    );
  });
});

describe('cancel', () => {
  it('fail if wallet not found', async () => {
    const err = 'wallet does not exist';
    patch(eth, 'getWallet', () => {
      throw new Error(err);
    });

    await expect(
      EVMController.cancel(eth, {
        chain: 'ethereum',
        network: 'goerli',
        nonce: 123,
        address: mockAddress,
      })
    ).rejects.toThrow(
      new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + 'Error: ' + err,
        LOAD_WALLET_ERROR_CODE
      )
    );
  });
});

describe('willTxSucceed', () => {
  it('time limit met and gas price higher than that of the tx', () => {
    expect(willTxSucceed(100, 10, 10, 100)).toEqual(false);
  });

  it('time limit met but gas price has not exceeded that of the tx', () => {
    expect(willTxSucceed(100, 10, 100, 90)).toEqual(true);
  });

  it('time limit not met', () => {
    expect(willTxSucceed(10, 100, 100, 90)).toEqual(true);
  });
});
