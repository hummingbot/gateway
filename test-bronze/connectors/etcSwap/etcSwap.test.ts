jest.useFakeTimers();
const { MockProvider } = require('mock-ethers-provider');
import { patch, unpatch } from '../../../test/services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import {
  CurrencyAmount,
  TradeType,
  Token,
} from '@_etcswap/smart-order-router/node_modules/@uniswap/sdk-core';
import {
  Pair,
  Route,
} from '@_etcswap/smart-order-router/node_modules/@uniswap/router-sdk/node_modules/@uniswap/v2-sdk';
import { Trade } from '@_etcswap/smart-order-router/node_modules/@uniswap/router-sdk';
import { BigNumber, constants, utils } from 'ethers';
import {
  FACTORY_ADDRESS,
  TickMath,
  encodeSqrtRatioX96,
  Pool as EtcswapV3Pool,
  FeeAmount,
} from '@_etcswap/smart-order-router/node_modules/@uniswap/v3-sdk';
import { EthereumClassicChain } from '../../../src/chains/ethereum-classic/ethereum-classic';
import { ETCSwap } from '../../../src/connectors/etcswap/etcswap';
import { ETCSwapConfig } from '../../../src/connectors/etcswap/etcswap.config';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';

let ethereumclassic: EthereumClassicChain;
let etcSwap: ETCSwap;
let mockProvider: typeof MockProvider;

const WETC = new Token(
  3,
  '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  18,
  'WETC',
);

const DAI = new Token(
  3,
  '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
  18,
  'DAI',
);

const DAI_WETH_POOL_ADDRESS = '0xBEff876AC507446457C2A6bDA9F7021A97A8547f';
const POOL_SQRT_RATIO_START = encodeSqrtRatioX96(100e6, 100e18);
const POOL_TICK_CURRENT = TickMath.getTickAtSqrtRatio(POOL_SQRT_RATIO_START);
const POOL_LIQUIDITY = 0;
const DAI_WETH_POOL = new EtcswapV3Pool(
  WETC,
  DAI,
  FeeAmount.MEDIUM,
  POOL_SQRT_RATIO_START,
  POOL_LIQUIDITY,
  POOL_TICK_CURRENT,
);

beforeAll(async () => {
  ethereumclassic = EthereumClassicChain.getInstance('mainnet');
  patchEVMNonceManager(ethereumclassic.nonceManager);
  await ethereumclassic.init();
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

const patchTrade = (_key: string, error?: Error) => {
  patch(etcSwap, '_alphaRouter', {
    route() {
      if (error) return false;
      const WETH_DAI = new Pair(
        CurrencyAmount.fromRawAmount(WETC, '2000000000000000000'),
        CurrencyAmount.fromRawAmount(DAI, '1000000000000000000'),
      );
      const DAI_TO_WETH = new Route([WETH_DAI], DAI, WETC);
      return {
        quote: CurrencyAmount.fromRawAmount(DAI, '1000000000000000000'),
        quoteGasAdjusted: CurrencyAmount.fromRawAmount(
          DAI,
          '1000000000000000000',
        ),
        estimatedGasUsed: utils.parseEther('100'),
        estimatedGasUsedQuoteToken: CurrencyAmount.fromRawAmount(
          DAI,
          '1000000000000000000',
        ),
        estimatedGasUsedUSD: CurrencyAmount.fromRawAmount(
          DAI,
          '1000000000000000000',
        ),
        gasPriceWei: utils.parseEther('100'),
        trade: new Trade({
          v2Routes: [
            {
              routev2: DAI_TO_WETH,
              inputAmount: CurrencyAmount.fromRawAmount(
                DAI,
                '1000000000000000000',
              ),
              outputAmount: CurrencyAmount.fromRawAmount(
                WETC,
                '2000000000000000000',
              ),
            },
          ],
          v3Routes: [],
          tradeType: TradeType.EXACT_INPUT,
        }),
        route: [],
        blockNumber: BigNumber.from(5000),
      };
    },
  });
};

const patchMockProvider = () => {
  mockProvider.setMockContract(
    FACTORY_ADDRESS,
    require('@_etcswap/smart-order-router/node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json')
      .abi,
  );
  mockProvider.stub(FACTORY_ADDRESS, 'getPool', DAI_WETH_POOL_ADDRESS);

  mockProvider.setMockContract(
    ETCSwapConfig.config.quoterContractAddress('mainnet'),
    // require('@uniswap/swap-router-contracts/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json')
    require('@_etcswap/smart-order-router/node_modules/@uniswap/swap-router-contracts/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json')
      .abi,
  );
  mockProvider.stub(
    ETCSwapConfig.config.quoterContractAddress('mainnet'),
    'quoteExactInputSingle',
    /* amountOut */ 1,
    /* sqrtPriceX96After */ 0,
    /* initializedTicksCrossed */ 0,
    /* gasEstimate */ 0,
  );
  mockProvider.stub(
    ETCSwapConfig.config.quoterContractAddress('mainnet'),
    'quoteExactOutputSingle',
    /* amountIn */ 1,
    /* sqrtPriceX96After */ 0,
    /* initializedTicksCrossed */ 0,
    /* gasEstimate */ 0,
  );

  mockProvider.setMockContract(
    DAI_WETH_POOL_ADDRESS,
    require('@_etcswap/smart-order-router/node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json')
      .abi,
  );
  mockProvider.stub(
    DAI_WETH_POOL_ADDRESS,
    'slot0',
    DAI_WETH_POOL.sqrtRatioX96.toString(),
    DAI_WETH_POOL.tickCurrent,
    /* observationIndex */ 0,
    /* observationCardinality */ 1,
    /* observationCardinalityNext */ 1,
    /* feeProtocol */ 0,
    /* unlocked */ true,
  );
  mockProvider.stub(DAI_WETH_POOL_ADDRESS, 'liquidity', 0);
  mockProvider.stub(DAI_WETH_POOL_ADDRESS, 'fee', FeeAmount.LOW);
  patch(ethereumclassic, 'provider', () => {
    return mockProvider;
  });
};

const patchGetPool = (address: string | null) => {
  mockProvider.setMockContract(
    FACTORY_ADDRESS,
    require('@_etcswap/smart-order-router/node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json')
      .abi,
  );
  mockProvider.stub(FACTORY_ADDRESS, 'getPool', address);
};

const useRouter = async () => {
  const config = ETCSwapConfig.config;
  config.useRouter = true;

  patch(ETCSwap, '_instances', () => ({}));
  etcSwap = ETCSwap.getInstance('ethereum-classic', 'mainnet');
  await etcSwap.init();
};

const useQouter = async () => {
  const config = ETCSwapConfig.config;
  config.useRouter = false;
  config.feeTier = 'MEDIUM';

  patch(ETCSwap, '_instances', () => ({}));
  etcSwap = ETCSwap.getInstance('ethereum-classic', 'mainnet');
  await etcSwap.init();

  mockProvider = new MockProvider();
  patchMockProvider();
};

describe('verify ETCSwap estimateSellTrade', () => {
  describe('when using router', () => {
    beforeAll(async () => {
      await useRouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchTrade('bestTradeExactIn');

      const expectedTrade = await etcSwap.estimateSellTrade(
        WETC,
        DAI,
        BigNumber.from(1),
      );
      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should throw an error if no pair is available', async () => {
      patchTrade('bestTradeExactIn', new Error('error getting trade'));

      await expect(async () => {
        await etcSwap.estimateSellTrade(WETC, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });

  describe('when using qouter', () => {
    beforeEach(async () => {
      await useQouter();
    });

    // it('Should return an ExpectedTrade when available', async () => {
    //   patchGetPool(DAI_WETH_POOL_ADDRESS);

    //   const expectedTrade = await etcSwap.estimateSellTrade(
    //     WETC,
    //     DAI,
    //     BigNumber.from(1)
    //   );

    //   expect(expectedTrade).toHaveProperty('trade');
    //   expect(expectedTrade).toHaveProperty('expectedAmount');
    // });

    it('Should throw an error if no pair is available', async () => {
      patchGetPool(constants.AddressZero);

      await expect(async () => {
        await etcSwap.estimateSellTrade(WETC, DAI, BigNumber.from(1));
      }).rejects.toThrow(Error);
    });
  });
});

describe('verify ETCSwap estimateBuyTrade', () => {
  describe('when using router', () => {
    beforeAll(async () => {
      await useRouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchTrade('bestTradeExactOut');

      const expectedTrade = await etcSwap.estimateBuyTrade(
        WETC,
        DAI,
        BigNumber.from(1),
      );
      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should return an error if no pair is available', async () => {
      patchTrade('bestTradeExactOut', new Error('error getting trade'));

      await expect(async () => {
        await etcSwap.estimateBuyTrade(WETC, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });

  describe('when using qouter', () => {
    beforeEach(async () => {
      await useQouter();
    });

    it('Should throw an error if no pair is available', async () => {
      patchGetPool(constants.AddressZero);

      await expect(async () => {
        await etcSwap.estimateBuyTrade(WETC, DAI, BigNumber.from(1));
      }).rejects.toThrow(Error);
    });
  });
});
