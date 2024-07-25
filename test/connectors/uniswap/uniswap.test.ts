jest.useFakeTimers();
const { MockProvider } = require('mock-ethers-provider');
import { Uniswap } from '../../../src/connectors/uniswap/uniswap';
import { patch, unpatch } from '../../../test/services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import { Pair, Route } from '@uniswap/v2-sdk';
import { Trade } from '@uniswap/router-sdk';
import { BigNumber, constants, utils } from 'ethers';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { UniswapConfig } from '../../../src/connectors/uniswap/uniswap.config';
import {
  FACTORY_ADDRESS,
  TickMath,
  encodeSqrtRatioX96,
  Pool as UniswapV3Pool,
  FeeAmount,
} from '@uniswap/v3-sdk';

let ethereum: Ethereum;
let uniswap: Uniswap;
let mockProvider: typeof MockProvider;

const WETH = new Token(
  11155111,
  '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  18,
  'WETH'
);

const DAI = new Token(
  11155111,
  '0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357',
  18,
  'DAI'
);

const DAI_WETH_POOL_ADDRESS = '0x1c9d93e574be622821398e3fe677e3a279f256f7';
const POOL_SQRT_RATIO_START = encodeSqrtRatioX96(100e6, 100e18);
const POOL_TICK_CURRENT = TickMath.getTickAtSqrtRatio(POOL_SQRT_RATIO_START);
const POOL_LIQUIDITY = 0;
const DAI_WETH_POOL = new UniswapV3Pool(
  WETH,
  DAI,
  FeeAmount.MEDIUM,
  POOL_SQRT_RATIO_START,
  POOL_LIQUIDITY,
  POOL_TICK_CURRENT
);

beforeAll(async () => {
  ethereum = Ethereum.getInstance('sepolia');
  patchEVMNonceManager(ethereum.nonceManager);
  await ethereum.init();
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
  patch(uniswap.alphaRouter, 'route', () => {
    if (error) return false;
    const WETH_DAI = new Pair(
      CurrencyAmount.fromRawAmount(WETH, '2000000000000000000'),
      CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
    );
    const DAI_TO_WETH = new Route([WETH_DAI], DAI, WETH);
    return {
      quote: CurrencyAmount.fromRawAmount(DAI, '1000000000000000000'),
      quoteGasAdjusted: CurrencyAmount.fromRawAmount(
        DAI,
        '1000000000000000000'
      ),
      estimatedGasUsed: utils.parseEther('100'),
      estimatedGasUsedQuoteToken: CurrencyAmount.fromRawAmount(
        DAI,
        '1000000000000000000'
      ),
      estimatedGasUsedUSD: CurrencyAmount.fromRawAmount(
        DAI,
        '1000000000000000000'
      ),
      gasPriceWei: utils.parseEther('100'),
      trade: new Trade({
        v2Routes: [
          {
            routev2: DAI_TO_WETH,
            inputAmount: CurrencyAmount.fromRawAmount(
              DAI,
              '1000000000000000000'
            ),
            outputAmount: CurrencyAmount.fromRawAmount(
              WETH,
              '2000000000000000000'
            ),
          },
        ],
        v3Routes: [],
        tradeType: TradeType.EXACT_INPUT,
      }),
      route: [],
      blockNumber: BigNumber.from(5000),
    };
  });
};

const patchMockProvider = () => {
  mockProvider.setMockContract(
    FACTORY_ADDRESS,
    require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json')
      .abi
  );
  mockProvider.stub(FACTORY_ADDRESS, 'getPool', DAI_WETH_POOL_ADDRESS);

  mockProvider.setMockContract(
    UniswapConfig.config.quoterContractAddress('goerli'),
    require('@uniswap/swap-router-contracts/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json')
      .abi
  );
  mockProvider.stub(
    UniswapConfig.config.quoterContractAddress('goerli'),
    'quoteExactInputSingle',
    /* amountOut */ 1,
    /* sqrtPriceX96After */ 0,
    /* initializedTicksCrossed */ 0,
    /* gasEstimate */ 0
  );
  mockProvider.stub(
    UniswapConfig.config.quoterContractAddress('goerli'),
    'quoteExactOutputSingle',
    /* amountIn */ 1,
    /* sqrtPriceX96After */ 0,
    /* initializedTicksCrossed */ 0,
    /* gasEstimate */ 0
  );

  mockProvider.setMockContract(
    DAI_WETH_POOL_ADDRESS,
    require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json')
      .abi
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
    /* unlocked */ true
  );
  mockProvider.stub(DAI_WETH_POOL_ADDRESS, 'liquidity', 0);
  patch(ethereum, 'provider', () => {
    return mockProvider;
  });
};

const patchGetPool = (address: string | null) => {
  mockProvider.setMockContract(
    FACTORY_ADDRESS,
    require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json')
      .abi
  );
  mockProvider.stub(FACTORY_ADDRESS, 'getPool', address);
};

const useRouter = async () => {
  const config = UniswapConfig.config;
  config.useRouter = true;

  patch(Uniswap, '_instances', () => ({}));
  uniswap = Uniswap.getInstance('ethereum', 'goerli');
  await uniswap.init();
};

const useQouter = async () => {
  const config = UniswapConfig.config;
  config.useRouter = false;
  config.feeTier = 'MEDIUM';

  patch(Uniswap, '_instances', () => ({}));
  uniswap = Uniswap.getInstance('ethereum', 'goerli');
  await uniswap.init();

  mockProvider = new MockProvider();
  patchMockProvider();
};

describe('verify Uniswap estimateSellTrade', () => {
  describe('when using router', () => {
    beforeAll(async () => {
      await useRouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchTrade('bestTradeExactIn');

      const expectedTrade = await uniswap.estimateSellTrade(
        WETH,
        DAI,
        BigNumber.from(1)
      );
      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should throw an error if no pair is available', async () => {
      patchTrade('bestTradeExactIn', new Error('error getting trade'));

      await expect(async () => {
        await uniswap.estimateSellTrade(WETH, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });

  describe('when using qouter', () => {
    beforeEach(async () => {
      await useQouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchGetPool(DAI_WETH_POOL_ADDRESS);

      const expectedTrade = await uniswap.estimateSellTrade(
        WETH,
        DAI,
        BigNumber.from(1)
      );

      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should throw an error if no pair is available', async () => {
      patchGetPool(constants.AddressZero);

      await expect(async () => {
        await uniswap.estimateSellTrade(WETH, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });
});

describe('verify Uniswap estimateBuyTrade', () => {
  describe('when using router', () => {
    beforeAll(async () => {
      await useRouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchTrade('bestTradeExactOut');

      const expectedTrade = await uniswap.estimateBuyTrade(
        WETH,
        DAI,
        BigNumber.from(1)
      );
      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should return an error if no pair is available', async () => {
      patchTrade('bestTradeExactOut', new Error('error getting trade'));

      await expect(async () => {
        await uniswap.estimateBuyTrade(WETH, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });

  describe('when using qouter', () => {
    beforeEach(async () => {
      await useQouter();
    });

    it('Should return an ExpectedTrade when available', async () => {
      patchGetPool(DAI_WETH_POOL_ADDRESS);

      const expectedTrade = await uniswap.estimateBuyTrade(
        WETH,
        DAI,
        BigNumber.from(1)
      );

      expect(expectedTrade).toHaveProperty('trade');
      expect(expectedTrade).toHaveProperty('expectedAmount');
    });

    it('Should throw an error if no pair is available', async () => {
      patchGetPool(constants.AddressZero);

      await expect(async () => {
        await uniswap.estimateBuyTrade(WETH, DAI, BigNumber.from(1));
      }).rejects.toThrow(UniswapishPriceError);
    });
  });
});

describe('getAllowedSlippage', () => {
  it('return value of string when not null', () => {
    const allowedSlippage = uniswap.getAllowedSlippage('1/100');
    expect(allowedSlippage).toEqual(new Percent('1', '100'));
  });

  it('return value from config when string is null', () => {
    const allowedSlippage = uniswap.getAllowedSlippage();
    expect(allowedSlippage).toEqual(new Percent('2', '100'));
  });

  it('return value from config when string is malformed', () => {
    const allowedSlippage = uniswap.getAllowedSlippage('yo');
    expect(allowedSlippage).toEqual(new Percent('2', '100'));
  });
});
