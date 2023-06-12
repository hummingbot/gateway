jest.useFakeTimers();
import { UniswapishPriceError as SushiswapishPriceError } from '../../../src/services/error-handler';

import { BigNumber } from 'ethers';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { Balancer } from '../../../src/connectors/balancer/balancer';
import { Token } from '@sushiswap/sdk';
import { Trade } from '../../../src/connectors/balancer/types';
import { SwapType } from '@balancer-labs/sdk';

let ethereum: Ethereum;
let balancer: Balancer;

const WETH = new Token(
  3,
  '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  18,
  'WETH'
);
const DAI = new Token(
  3,
  '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
  18,
  'DAI'
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
  jest.spyOn(balancer.balancerRouter.swaps, 'findRouteGivenIn').mockRestore();
  jest.spyOn(balancer.balancerRouter.swaps, 'findRouteGivenOut').mockRestore();
  jest.spyOn(balancer.balancerRouter.swaps, 'fetchPools').mockRestore();
});

afterAll(async () => {
  await ethereum.close();
});

const patchFetchData = (fetchReulst: boolean) => {
  jest
    .spyOn(balancer.balancerRouter.swaps, 'fetchPools')
    .mockImplementation(jest.fn().mockImplementation(() => fetchReulst));
};

const patchTrade = (error?: Error) => {
  const mockSwap = jest.fn().mockImplementation(() => {
    if (error)
      return {
        tokenAddresses: [],
        swaps: [],
        swapAmount: BigNumber.from('0'),
        swapAmountForSwaps: BigNumber.from('0'),
        tokenIn: '',
        tokenInForSwaps: '',
        tokenOut: '',
        tokenOutFromSwaps: '',
        returnAmount: BigNumber.from('0'),
        returnAmountConsideringFees: BigNumber.from('0'),
        returnAmountFromSwaps: BigNumber.from('0'),
        marketSp: '0',
      };
    return {
      tokenAddresses: [DAI.address, WETH.address],
      swaps: [
        {
          poolId:
            '0xa6f548df93de924d73be7d25dc02554c6bd66db500020000000000000000000e',
          assetInIndex: 0,
          assetOutIndex: 1,
          amount: '1000000000000000000',
          userData: '0x',
          returnAmount: '2000000000000000000',
        },
      ],
      swapAmount: BigNumber.from('1000000000000000000'),
      swapAmountForSwaps: BigNumber.from('1000000000000000000'),
      returnAmount: BigNumber.from('2000000000000000000'),
      returnAmountFromSwaps: BigNumber.from('2000000000000000000'),
      returnAmountConsideringFees: BigNumber.from('2000000000000000000'),
      tokenIn: DAI.address,
      tokenInForSwaps: DAI.address,
      tokenOut: WETH.address,
      tokenOutFromSwaps: WETH.address,
      marketSp: '13.022594322651878',
    };
  });

  jest
    .spyOn(balancer.balancerRouter.swaps, 'findRouteGivenIn')
    .mockImplementation(mockSwap);
  jest
    .spyOn(balancer.balancerRouter.swaps, 'findRouteGivenOut')
    .mockImplementation(mockSwap);
};

describe('verify Sushiswap estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData(true);
    patchTrade();

    const expectedTrade = await balancer.estimateSellTrade(
      WETH,
      DAI,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect((expectedTrade.trade as Trade).swapType).toBe(SwapType.SwapExactIn);
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetchData(true);
    patchTrade(new Error('error getting trade'));

    await expect(async () => {
      await balancer.estimateSellTrade(WETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(SushiswapishPriceError);
  });
  it('Should return an error if fail to fetch data', async () => {
    patchFetchData(false);
    patchTrade();

    await expect(async () => {
      await balancer.estimateSellTrade(WETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(SushiswapishPriceError);
  });
});

describe('verify sushiswap estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData(true);
    patchTrade();

    const expectedTrade = await balancer.estimateBuyTrade(
      WETH,
      DAI,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect((expectedTrade.trade as Trade).swapType).toBe(SwapType.SwapExactOut);
  });

  it('Should return an error if no pair is available', async () => {
    patchFetchData(true);
    patchTrade(new Error('error getting trade'));

    await expect(async () => {
      await balancer.estimateBuyTrade(WETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(SushiswapishPriceError);
  });
  it('Should return an error if fail to fetch data', async () => {
    patchFetchData(false);
    patchTrade();

    await expect(async () => {
      await balancer.estimateBuyTrade(WETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(SushiswapishPriceError);
  });
});
