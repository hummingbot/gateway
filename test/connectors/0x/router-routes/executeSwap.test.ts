import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');

// Mock the quoteSwap and executeQuote functions
jest.mock('../../../../src/connectors/0x/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/0x/router-routes/executeQuote', () => ({
  executeQuote: jest.fn(),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import('../../../../src/connectors/0x/router-routes/executeSwap');
  await server.register(executeSwapRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
};

const mockReceipt = {
  transactionHash: '0xabcdef1234567890',
  status: 1,
};

describe('POST /execute-swap', () => {
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

  it('should quote and execute a swap in one step for SELL side', async () => {
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    // Import the mocked functions
    const { quoteSwap } = require('../../../../src/connectors/0x/router-routes/quoteSwap');
    const { executeQuote } = require('../../../../src/connectors/0x/router-routes/executeQuote');

    // Mock quoteSwap to return a quote response
    quoteSwap.mockResolvedValue({
      quoteId: 'test-quote-id',
      tokenIn: mockWETH.address,
      tokenOut: mockUSDC.address,
      amountIn: 0.1,
      amountOut: 150,
      price: 1500,
      slippagePct: 0.5,
      priceWithSlippage: 1492.5,
      minAmountOut: 149.25,
      maxAmountIn: 0.1,
      priceImpactPct: 0.1,
      gasEstimate: '200000',
      expirationTime: Date.now() + 30000,
    });

    // Mock executeQuote to return execution result
    executeQuote.mockResolvedValue({
      signature: mockReceipt.transactionHash,
      status: 1,
      data: {
        tokenIn: mockWETH.address,
        tokenOut: mockUSDC.address,
        amountIn: 0.1,
        amountOut: 150,
        fee: 0.006,
        baseTokenBalanceChange: -0.1,
        quoteTokenBalanceChange: 150,
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockReceipt.transactionHash);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 0.1);
    expect(body.data).toHaveProperty('amountOut', 150);
    expect(body.data).toHaveProperty('fee', 0.006);
    expect(body.data).toHaveProperty('baseTokenBalanceChange', -0.1);
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', 150);
    expect(body.data).toHaveProperty('tokenIn', mockWETH.address);
    expect(body.data).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should quote and execute a swap for BUY side', async () => {
    // Import the mocked functions
    const { quoteSwap } = require('../../../../src/connectors/0x/router-routes/quoteSwap');
    const { executeQuote } = require('../../../../src/connectors/0x/router-routes/executeQuote');

    // Mock quoteSwap to return a quote response for BUY side
    quoteSwap.mockResolvedValue({
      quoteId: 'test-quote-id-buy',
      tokenIn: mockUSDC.address,
      tokenOut: mockWETH.address,
      amountIn: 150,
      amountOut: 0.1,
      price: 0.000667,
      slippagePct: 0.5,
      priceWithSlippage: 0.00067,
      minAmountOut: 0.1,
      maxAmountIn: 150.75,
      priceImpactPct: 0.1,
      gasEstimate: '200000',
      expirationTime: Date.now() + 30000,
    });

    // Mock executeQuote to return execution result
    executeQuote.mockResolvedValue({
      signature: mockReceipt.transactionHash,
      status: 1,
      data: {
        tokenIn: mockUSDC.address,
        tokenOut: mockWETH.address,
        amountIn: 150,
        amountOut: 0.1,
        fee: 0.006,
        baseTokenBalanceChange: 0.1,
        quoteTokenBalanceChange: -150,
      },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'BUY',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockReceipt.transactionHash);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 150);
    expect(body.data).toHaveProperty('amountOut', 0.1);
    expect(body.data).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body.data).toHaveProperty('tokenOut', mockWETH.address);
  });

  it('should return 400 if token not found', async () => {
    // Import the mocked functions
    const { quoteSwap } = require('../../../../src/connectors/0x/router-routes/quoteSwap');

    // Mock quoteSwap to throw a 400 error
    quoteSwap.mockRejectedValue({
      statusCode: 400,
      message: 'Token not found: INVALID',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('message', 'Token not found: INVALID');
  });
});
