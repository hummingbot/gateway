import { Token, TokenAmount, Pair } from '@uniswap/sdk';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { UniswapConfig } from '../../../../src/connectors/uniswap/uniswap.config';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap.config');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('../../../../src/connectors/uniswap/uniswap.utils');

// Mock ethers Contract globally
jest.mock('ethers', () => {
  const actualEthers = jest.requireActual('ethers');
  return {
    ...actualEthers,
    Contract: jest.fn(),
  };
});

jest.mock('ethers/lib/utils', () => {
  const actualUtils = jest.requireActual('ethers/lib/utils');
  return {
    ...actualUtils,
    getAddress: jest.fn((address) => address),
  };
});

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));

  const { quoteSwapRoute } = await import('../../../../src/connectors/uniswap/amm-routes/quoteSwap');
  await server.register(quoteSwapRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  decimals: 18,
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
};

const mockPoolAddress = '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc';

describe('GET /quote-swap', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a quote for AMM swap SELL side', async () => {
    const { Token, Pair, TokenAmount } = require('@uniswap/sdk');
    const { Uniswap } = await import('../../../../src/connectors/uniswap/uniswap');
    const { getUniswapPoolInfo, formatTokenAmount } = await import('../../../../src/connectors/uniswap/uniswap.utils');
    const ethers = require('ethers');

    // Create a proper mock provider that ethers.Contract will accept
    const mockProvider = {
      _isProvider: true, // This tells ethers this is a provider
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
      call: jest.fn(),
      getBlockNumber: jest.fn().mockResolvedValue(1000000),
      getGasPrice: jest.fn().mockResolvedValue({
        mul: jest.fn((value) => ({
          toString: () => (BigInt(20000000000) * BigInt(value.toString())).toString(),
        })),
        toString: () => '20000000000',
        toBigInt: () => BigInt(20000000000),
      }),
      getBalance: jest.fn().mockResolvedValue({ toBigInt: () => BigInt(1000000000000000000) }),
      // Add other required provider methods
      resolveName: jest.fn(),
      lookupAddress: jest.fn(),
      emit: jest.fn(),
      listenerCount: jest.fn().mockReturnValue(0),
      listeners: jest.fn().mockReturnValue([]),
      removeAllListeners: jest.fn(),
      addListener: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
    };

    const mockEthereumInstance = {
      chainId: 1,
      getToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
      provider: mockProvider,
      ready: jest.fn().mockReturnValue(true),
      init: jest.fn().mockResolvedValue(undefined),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    // Mock getUniswapPoolInfo
    (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
      baseTokenAddress: mockWETH.address,
      quoteTokenAddress: mockUSDC.address,
      poolType: 'amm',
    });

    // Mock formatTokenAmount - returns number from string
    (formatTokenAmount as jest.Mock).mockImplementation((amount, decimals) => {
      return parseFloat(amount) / Math.pow(10, decimals);
    });

    const mockConfigInstance = {
      routerAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      tradingFee: 0.003,
      getSlippagePercentage: jest.fn().mockReturnValue(0.01),
    };
    (UniswapConfig as any).config = mockConfigInstance;

    // Create tokens using SDK-Core instead of V2 SDK
    const { Token: CoreToken } = await import('@uniswap/sdk-core');
    const wethToken = new CoreToken(1, mockWETH.address, 18, 'WETH');
    const usdcToken = new CoreToken(1, mockUSDC.address, 6, 'USDC');
    // Create a proper mock pair with all necessary methods
    const mockPair = {
      token0: wethToken,
      token1: usdcToken,
      reserve0: new TokenAmount(wethToken, '1000000000000000000000'),
      reserve1: new TokenAmount(usdcToken, '1500000000000'),
      getOutputAmount: jest.fn().mockImplementation((_inputAmount) => {
        // Mock calculation for SELL side (WETH -> USDC)
        const outputAmount = new TokenAmount(usdcToken, '149250000'); // ~149.25 USDC for 0.1 WETH
        const nextPair = mockPair; // Return same pair for simplicity
        return [outputAmount, nextPair];
      }),
      getInputAmount: jest.fn().mockImplementation((_outputAmount) => {
        // Mock calculation for BUY side (USDC -> WETH)
        const inputAmount = new TokenAmount(usdcToken, '15150000'); // ~15.15 USDC for 0.1 WETH
        const nextPair = mockPair; // Return same pair for simplicity
        return [inputAmount, nextPair];
      }),
      priceOf: jest.fn().mockReturnValue({ toSignificant: () => '1500' }),
      // Add V2 Pair specific methods that might be called
      liquidityToken: { address: '0x1234567890123456789012345678901234567890' },
      involvesToken: jest.fn().mockImplementation((token) => {
        return token.address === wethToken.address || token.address === usdcToken.address;
      }),
    };

    // Mock the contract calls
    const mockPairContract = {
      token0: jest.fn().mockResolvedValue(mockWETH.address),
      token1: jest.fn().mockResolvedValue(mockUSDC.address),
      getReserves: jest.fn().mockResolvedValue([
        { toString: () => '1000000000000000000000' }, // reserve0
        { toString: () => '1500000000000' }, // reserve1
        0, // blockTimestampLast
      ]),
    };

    ethers.Contract.mockImplementation(() => mockPairContract);

    // Mock Uniswap instance
    const mockUniswapInstance = {
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      getToken: jest.fn().mockImplementation((symbol) => {
        if (symbol === 'WETH' || symbol === mockWETH.address) return wethToken;
        if (symbol === 'USDC' || symbol === mockUSDC.address) return usdcToken;
        return null;
      }),
      getV2Pool: jest.fn().mockResolvedValue(mockPair),
    };
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(mockUniswapInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        poolAddress: mockPoolAddress,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('amountIn', 0.1);
    expect(body).toHaveProperty('amountOut');
    expect(body).toHaveProperty('minAmountOut');
    expect(body).toHaveProperty('maxAmountIn', 0.1);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
    expect(body).toHaveProperty('slippagePct', 1);
    expect(body).toHaveProperty('tokenIn', mockWETH.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return a quote for AMM swap BUY side', async () => {
    const { Token, Pair, TokenAmount } = require('@uniswap/sdk');
    const { Uniswap } = await import('../../../../src/connectors/uniswap/uniswap');
    const { getUniswapPoolInfo, formatTokenAmount } = await import('../../../../src/connectors/uniswap/uniswap.utils');
    const ethers = require('ethers');

    // Create a proper mock provider that ethers.Contract will accept
    const mockProvider = {
      _isProvider: true, // This tells ethers this is a provider
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
      call: jest.fn(),
      getBlockNumber: jest.fn().mockResolvedValue(1000000),
      getGasPrice: jest.fn().mockResolvedValue({
        mul: jest.fn((value) => ({
          toString: () => (BigInt(20000000000) * BigInt(value.toString())).toString(),
        })),
        toString: () => '20000000000',
        toBigInt: () => BigInt(20000000000),
      }),
      getBalance: jest.fn().mockResolvedValue({ toBigInt: () => BigInt(1000000000000000000) }),
      // Add other required provider methods
      resolveName: jest.fn(),
      lookupAddress: jest.fn(),
      emit: jest.fn(),
      listenerCount: jest.fn().mockReturnValue(0),
      listeners: jest.fn().mockReturnValue([]),
      removeAllListeners: jest.fn(),
      addListener: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
    };

    const mockEthereumInstance = {
      chainId: 1,
      getToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
      getOrFetchToken: jest.fn().mockResolvedValueOnce(mockWETH).mockResolvedValueOnce(mockUSDC),
      provider: mockProvider,
      ready: jest.fn().mockReturnValue(true),
      init: jest.fn().mockResolvedValue(undefined),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    // Mock getUniswapPoolInfo
    (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
      baseTokenAddress: mockWETH.address,
      quoteTokenAddress: mockUSDC.address,
      poolType: 'amm',
    });

    // Mock formatTokenAmount - returns number from string
    (formatTokenAmount as jest.Mock).mockImplementation((amount, decimals) => {
      return parseFloat(amount) / Math.pow(10, decimals);
    });

    const mockConfigInstance = {
      routerAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      tradingFee: 0.003,
      getSlippagePercentage: jest.fn().mockReturnValue(0.01),
    };
    (UniswapConfig as any).config = mockConfigInstance;

    // Create tokens using SDK-Core instead of V2 SDK
    const { Token: CoreToken } = await import('@uniswap/sdk-core');
    const wethToken = new CoreToken(1, mockWETH.address, 18, 'WETH');
    const usdcToken = new CoreToken(1, mockUSDC.address, 6, 'USDC');
    // Create a proper mock pair with all necessary methods
    const mockPair = {
      token0: wethToken,
      token1: usdcToken,
      reserve0: new TokenAmount(wethToken, '1000000000000000000000'),
      reserve1: new TokenAmount(usdcToken, '1500000000000'),
      getOutputAmount: jest.fn().mockImplementation((_inputAmount) => {
        // Mock calculation for outputAmount
        const outputAmount = new TokenAmount(wethToken, '100000000000000000'); // 0.1 WETH
        const nextPair = mockPair; // Return same pair for simplicity
        return [outputAmount, nextPair];
      }),
      getInputAmount: jest.fn().mockImplementation((_outputAmount) => {
        // Mock calculation for BUY side (USDC -> WETH)
        const inputAmount = new TokenAmount(usdcToken, '15000000'); // 15 USDC for 0.1 WETH
        const nextPair = mockPair; // Return same pair for simplicity
        return [inputAmount, nextPair];
      }),
      priceOf: jest.fn().mockReturnValue({ toSignificant: () => '1500' }),
      // Add V2 Pair specific methods that might be called
      liquidityToken: { address: '0x1234567890123456789012345678901234567890' },
      involvesToken: jest.fn().mockImplementation((token) => {
        return token.address === wethToken.address || token.address === usdcToken.address;
      }),
    };

    // Mock the contract calls
    const mockPairContract = {
      token0: jest.fn().mockResolvedValue(mockWETH.address),
      token1: jest.fn().mockResolvedValue(mockUSDC.address),
      getReserves: jest.fn().mockResolvedValue([
        { toString: () => '1000000000000000000000' }, // reserve0
        { toString: () => '1500000000000' }, // reserve1
        0, // blockTimestampLast
      ]),
    };

    ethers.Contract.mockImplementation(() => mockPairContract);

    // Mock Uniswap instance
    const mockUniswapInstance = {
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      getToken: jest.fn().mockImplementation((symbol) => {
        if (symbol === 'WETH' || symbol === mockWETH.address) return wethToken;
        if (symbol === 'USDC' || symbol === mockUSDC.address) return usdcToken;
        return null;
      }),
      getV2Pool: jest.fn().mockResolvedValue(mockPair),
    };
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(mockUniswapInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        poolAddress: mockPoolAddress,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '150',
        side: 'BUY',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('amountIn');
    expect(body).toHaveProperty('amountOut', 150);
    expect(body).toHaveProperty('maxAmountIn');
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockWETH.address);
    expect(body).toHaveProperty('minAmountOut', 150);
    expect(body).toHaveProperty('slippagePct', 1);
    expect(body).toHaveProperty('price');
    expect(body).toHaveProperty('priceImpactPct');
  });

  it('should return 400 if token not found', async () => {
    // Create a proper mock provider that ethers.Contract will accept
    const mockProvider = {
      _isProvider: true, // This tells ethers this is a provider
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
      call: jest.fn(),
      getBlockNumber: jest.fn().mockResolvedValue(1000000),
      getGasPrice: jest.fn().mockResolvedValue({
        mul: jest.fn((value) => ({
          toString: () => (BigInt(20000000000) * BigInt(value.toString())).toString(),
        })),
        toString: () => '20000000000',
        toBigInt: () => BigInt(20000000000),
      }),
      getBalance: jest.fn().mockResolvedValue({ toBigInt: () => BigInt(1000000000000000000) }),
      // Add other required provider methods
      resolveName: jest.fn(),
      lookupAddress: jest.fn(),
      emit: jest.fn(),
      listenerCount: jest.fn().mockReturnValue(0),
      listeners: jest.fn().mockReturnValue([]),
      removeAllListeners: jest.fn(),
      addListener: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
    };

    const mockEthereumInstance = {
      chainId: 1,
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
      provider: mockProvider,
      ready: jest.fn().mockReturnValue(true),
      init: jest.fn().mockResolvedValue(undefined),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet',
        poolAddress: mockPoolAddress,
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(400); // Returns 400 for invalid token
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});
