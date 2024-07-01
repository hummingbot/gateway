jest.useFakeTimers();
import { Balancer } from '../../../src/connectors/balancer/balancer';
import { patch, unpatch } from '../../../test/services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import { BigNumber } from 'ethers';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';
// import { Percent } from '@uniswap/sdk-core';
import { Token } from '@uniswap/sdk';
let ethereum: Ethereum;
let balancer: Balancer;


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

const WETH = new Token(
  5,
  '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  18,
  'WETH'
);
const WAVAX = new Token(
  5,
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  18,
  'WAVAX'
);

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

const patchTrade = (_key: string, error?: Error) => {
  patch(balancer.balancer.swaps, 'fetchPools', () => {
    return true;
  });
  patch(balancer.balancer.swaps, 'findRouteGivenIn', async () => {
    if (error) return {swaps: []};
    return SWAP_DATA;
  });
  patch(balancer.balancer.swaps, 'findRouteGivenOut', async () => {
    if (error) return {swaps: []};
    return SWAP_DATA;
  });
};

describe('verify Balancer estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchTrade('bestTradeExactIn');

    const expectedTrade = await balancer.estimateSellTrade(
      WETH,
      WAVAX,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchTrade('bestTradeExactIn', new Error('error getting trade'));

    await expect(async () => {
      await balancer.estimateSellTrade(WETH, WAVAX, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify Balancer estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchTrade('bestTradeExactOut');

    const expectedTrade = await balancer.estimateBuyTrade(
      WETH,
      WAVAX,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await balancer.estimateBuyTrade(WETH, WAVAX, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('getAllowedSlippage', () => {
  it('return value of string when not null', () => {
    const allowedSlippage = balancer.getAllowedSlippage('3/100');
    expect(allowedSlippage).toEqual(3);
  });

  it('return value from config when string is null', () => {
    const allowedSlippage = balancer.getAllowedSlippage();
    expect(allowedSlippage).toEqual(2);
  });

  it('return value from config when string is malformed', () => {
    const allowedSlippage = balancer.getAllowedSlippage('yo');
    expect(allowedSlippage).toEqual(2);
  });
});
