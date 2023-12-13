jest.useFakeTimers();
import { Token } from '@pancakeswap/swap-sdk-core';
import * as v3 from '@pancakeswap/v3-sdk';
import { BigNumber, Transaction, Wallet } from 'ethers';
import { BinanceSmartChain } from '../../../src/chains/binance-smart-chain/binance-smart-chain';
import { PancakeswapLP } from '../../../src/connectors/pancakeswap/pancakeswap.lp';
import { patch, unpatch } from '../../services/patch';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
let bsc: BinanceSmartChain;
let pancakeswapLP: PancakeswapLP;
let wallet: Wallet;

const WETH = new Token(
  97,
  '0x8babbb98678facc7342735486c851abd7a0d17ca',
  18,
  'WETH'
);

const DAI = new Token(
  97,
  '0x8a9424745056Eb399FD19a0EC26A14316684e274',
  18,
  'DAI'
);

const USDC = new Token(
  97,
  '0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684',
  6,
  'USDC'
);

const TX = {
  type: 2,
  chainId: 97,
  nonce: 115,
  maxPriorityFeePerGas: { toString: () => '106000000000' },
  maxFeePerGas: { toString: () => '106000000000' },
  gasPrice: { toString: () => null },
  gasLimit: { toString: () => '100000' },
  to: '0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60',
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

const POOL_SQRT_RATIO_START = v3.encodeSqrtRatioX96(100e6, 100e18);

const POOL_TICK_CURRENT = v3.TickMath.getTickAtSqrtRatio(
  POOL_SQRT_RATIO_START
);

const DAI_USDC_POOL = new v3.Pool(
  DAI,
  USDC,
  500,
  POOL_SQRT_RATIO_START,
  0,
  POOL_TICK_CURRENT,
  []
);

beforeAll(async () => {
  bsc = BinanceSmartChain.getInstance('testnet');
  
  patchEVMNonceManager(bsc.nonceManager);
  await bsc.init();

  wallet = new Wallet(
    '0000000000000000000000000000000000000000000000000000000000000002', // noqa: mock
    bsc.provider
  );
  pancakeswapLP = PancakeswapLP.getInstance('binance-smart-chain', 'testnet');
  await pancakeswapLP.init();
});

beforeEach(() => {
  patchEVMNonceManager(bsc.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await bsc.close();
});

const patchPoolState = () => {
  patch(pancakeswapLP, 'getPoolContract', () => {
    return {
      liquidity() {
        return DAI_USDC_POOL.liquidity;
      },
      slot0() {
        return [
          DAI_USDC_POOL.sqrtRatioX96,
          DAI_USDC_POOL.tickCurrent,
          0,
          1,
          1,
          0,
          true,
        ];
      },
      ticks() {
        return ['-118445039955967015140', '118445039955967015140'];
      },
    };
  });
};

const patchContract = () => {
  patch(pancakeswapLP, 'getContract', () => {
    return {
      estimateGas: {
        multicall() {
          return BigNumber.from(5);
        },
      },
      positions() {
        return {
          token0: WETH.address,
          token1: USDC.address,
          fee: 500,
          tickLower: 0,
          tickUpper: 23030,
          liquidity: '6025055903594410671025',
        };
      },
      multicall() {
        return TX;
      },
      collect() {
        return TX;
      },
    };
  });
};

const patchWallet = () => {
  patch(wallet, 'sendTransaction', () => {
    return TX;
  });
};

describe('verify PancakeswapLP Nft functions', () => {
  it('Should return correct contract addresses', async () => {
    expect(pancakeswapLP.router).toEqual(
      '0x1b81D678ffb9C0263b24A97847620C99d213eB14'
    );
    expect(pancakeswapLP.nftManager).toEqual(
      '0x427bF5b37357632377eCbEC9de3626C71A5396c1'
    );
  });

  it('Should return correct contract abi', async () => {
    expect(Array.isArray(pancakeswapLP.routerAbi)).toEqual(true);
    expect(Array.isArray(pancakeswapLP.nftAbi)).toEqual(true);
    expect(Array.isArray(pancakeswapLP.poolAbi)).toEqual(true);
  });

  it('addPositionHelper returns calldata and value', async () => {
    patchPoolState();

    const callData = await pancakeswapLP.addPositionHelper(
      wallet,
      DAI,
      WETH,
      '10',
      '10',
      500,
      1,
      10
    );
    expect(callData).toHaveProperty('calldata');
    expect(callData).toHaveProperty('value');
  });

  it('reducePositionHelper returns calldata and value', async () => {
    patchPoolState();
    patchContract();

    const callData = await pancakeswapLP.reducePositionHelper(wallet, 1, 100);
    expect(callData).toHaveProperty('calldata');
    expect(callData).toHaveProperty('value');
  });

  it('basic functions should work', async () => {
    patchContract();
    patchPoolState();

    expect(pancakeswapLP.ready()).toEqual(true);
    expect(pancakeswapLP.gasLimitEstimate).toBeGreaterThan(0);
    expect(typeof pancakeswapLP.getContract('nft', bsc.provider)).toEqual(
      'object'
    );
    expect(
      typeof pancakeswapLP.getPoolContract(
        '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
        wallet
      )
    ).toEqual('object');
  });

  it('generateOverrides returns overrides correctly', async () => {
    const overrides = pancakeswapLP.generateOverrides(
      1,
      2,
      3,
      BigNumber.from(4),
      BigNumber.from(5),
      '6'
    );
    expect(overrides.gasLimit).toEqual(BigNumber.from('1'));
    expect(overrides.gasPrice).toBeUndefined();
    expect(overrides.nonce).toEqual(BigNumber.from(3));
    expect(overrides.maxFeePerGas as BigNumber).toEqual(BigNumber.from(4));
    expect(overrides.maxPriorityFeePerGas as BigNumber).toEqual(
      BigNumber.from(5)
    );
    expect(overrides.value).toEqual(BigNumber.from('6'));
  });

  it('reducePosition should work', async () => {
    patchPoolState();
    patchContract();

    const reduceTx = (await pancakeswapLP.reducePosition(
      wallet,
      1,
      100,
      50000,
      10
    )) as Transaction;
    expect(reduceTx.hash).toEqual(
      '0x75f98675a8f64dcf14927ccde9a1d59b67fa09b72cc2642ad055dae4074853d9' // noqa: mock
    );
  });

  it('addPosition should work', async () => {
    patchPoolState();
    patchWallet();

    const addTx = await pancakeswapLP.addPosition(
      wallet,
      DAI,
      WETH,
      '10',
      '10',
      'LOWEST',
      1,
      10,
      0,
      1,
      1
    );
    expect(addTx.hash).toEqual(
      '0x75f98675a8f64dcf14927ccde9a1d59b67fa09b72cc2642ad055dae4074853d9' // noqa: mock
    );
  });

  it('collectFees should work', async () => {
    patchContract();

    const collectTx = (await pancakeswapLP.collectFees(wallet, 1)) as Transaction;
    expect(collectTx.hash).toEqual(
      '0x75f98675a8f64dcf14927ccde9a1d59b67fa09b72cc2642ad055dae4074853d9' // noqa: mock
    );
  });
});
