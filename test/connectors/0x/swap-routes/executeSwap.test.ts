import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { mockQuoteResponse } from '../../../mocks/0x/quote-swap.mock';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  // Register sensible plugin for httpErrors
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import(
    '../../../../src/connectors/0x/swap-routes/executeSwap'
  );
  await server.register(executeSwapRoute);
  return server;
};

const mockRequestBody = {
  network: 'mainnet',
  walletAddress: '0x1234567890123456789012345678901234567890',
  baseToken: 'WETH',
  quoteToken: 'USDC',
  amount: 0.1,
  side: 'SELL',
  slippagePct: 0.5,
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

const mockWallet = {
  address: '0x1234567890123456789012345678901234567890',
  sendTransaction: jest.fn(),
};

const mockTransaction = {
  hash: '0xabcdef1234567890',
  wait: jest.fn(),
};

const mockReceipt = {
  transactionHash: '0xabcdef1234567890',
  gasUsed: BigNumber.from('150000'),
  effectiveGasPrice: BigNumber.from('25000000000'),
};

describe('0x executeSwap route', () => {
  let server: any;
  let mockEthereumInstance: any;
  let mockZeroXInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Ethereum instance
    mockEthereumInstance = {
      getTokenBySymbol: jest.fn(),
      getWallet: jest.fn(),
      getContract: jest.fn(),
      getNativeBalance: jest.fn(),
      getERC20Balance: jest.fn(),
      getERC20Allowance: jest.fn(),
      chainId: 1,
      provider: {},
    };

    (Ethereum.getInstance as jest.Mock).mockReturnValue(mockEthereumInstance);
    (Ethereum.getFirstWalletAddress as jest.Mock).mockResolvedValue(
      '0x1234567890123456789012345678901234567890',
    );
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(
      '0x1234567890123456789012345678901234567890',
    );

    // Mock ZeroX instance
    mockZeroXInstance = {
      getQuote: jest.fn(),
      parseTokenAmount: jest.fn(),
      formatTokenAmount: jest.fn(),
      convertSlippageToPercentage: jest.fn(),
      allowedSlippage: 0.01,
    };

    (ZeroX.getInstance as jest.Mock).mockReturnValue(mockZeroXInstance);

    server = await buildApp();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /execute-swap', () => {
    it('should successfully execute a SELL swap', async () => {
      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getERC20Balance.mockResolvedValue({
        value: BigNumber.from('200000000000000000'), // 0.2 WETH
      });
      mockEthereumInstance.getERC20Allowance.mockResolvedValue({
        value: BigNumber.from('1000000000000000000'), // 1 WETH
      });

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount
        .mockReturnValueOnce('0.2') // balance
        .mockReturnValueOnce('0.1') // required amount
        .mockReturnValueOnce('1') // allowance
        .mockReturnValueOnce('25') // gas price
        .mockReturnValueOnce('180.529411764') // output amount
        .mockReturnValueOnce('0.00375'); // gas fee
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue(mockQuoteResponse);

      mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
      mockTransaction.wait.mockResolvedValue(mockReceipt);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toMatchObject({
        signature: '0xabcdef1234567890',
        status: 1, // CONFIRMED
        data: {
          totalInputSwapped: 0.1,
          totalOutputSwapped: 180.529411764,
          fee: 0.00375,
          baseTokenBalanceChange: -0.1,
          quoteTokenBalanceChange: 180.529411764,
        },
      });

      expect(mockWallet.sendTransaction).toHaveBeenCalledWith({
        to: mockQuoteResponse.to,
        data: mockQuoteResponse.data,
        value: mockQuoteResponse.value,
        gasLimit: BigNumber.from(mockQuoteResponse.gas),
        gasPrice: expect.any(BigNumber),
        chainId: mockQuoteResponse.chainId,
      });
    });

    it('should successfully execute a BUY swap', async () => {
      const buyRequest = { ...mockRequestBody, side: 'BUY' };

      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getERC20Balance.mockResolvedValue({
        value: BigNumber.from('200000000'), // 200 USDC
      });
      mockEthereumInstance.getERC20Allowance.mockResolvedValue({
        value: BigNumber.from('1000000000'), // 1000 USDC
      });

      const buyQuoteResponse = {
        ...mockQuoteResponse,
        sellAmount: '55340000',
        buyAmount: '100000000000000000',
        sellTokenAddress: mockUSDC.address,
        buyTokenAddress: mockWETH.address,
      };

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount.mockImplementation(
        (value, decimals) => {
          // For USDC balance (decimals = 6)
          if (value === '200000000' && decimals === 6) return '200';
          // For required USDC amount (decimals = 6)
          if (value === '55340000' && decimals === 6) return '55.34';
          // For USDC allowance (decimals = 6)
          if (value === '1000000000' && decimals === 6) return '1000';
          // For gas price (decimals = 9)
          if (decimals === 9) return '25';
          // For gas fee (decimals = 18)
          if (decimals === 18) return '0.00375';
          // Default
          return '0.1';
        },
      );
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue(buyQuoteResponse);

      mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
      mockTransaction.wait.mockResolvedValue(mockReceipt);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: buyRequest,
      });

      if (response.statusCode !== 200) {
        console.error('BUY swap failed:', response.body);
      }
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toMatchObject({
        signature: '0xabcdef1234567890',
        status: 1, // CONFIRMED
        data: {
          totalInputSwapped: 55.34,
          totalOutputSwapped: 0.1,
          fee: 0.00375,
          baseTokenBalanceChange: 0.1,
          quoteTokenBalanceChange: -55.34,
        },
      });
    });

    it('should handle ETH swaps without checking allowance', async () => {
      const ethRequest = {
        ...mockRequestBody,
        baseToken: 'ETH',
        quoteToken: 'USDC',
      };

      const mockETH = {
        symbol: 'ETH',
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        decimals: 18,
      };

      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getNativeBalance.mockResolvedValue({
        value: BigNumber.from('200000000000000000'), // 0.2 ETH
      });

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount
        .mockReturnValueOnce('0.2') // balance
        .mockReturnValueOnce('0.1') // required amount
        .mockReturnValueOnce('25') // gas price
        .mockReturnValueOnce('180.529411764') // output amount
        .mockReturnValueOnce('0.00375'); // gas fee
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue({
        ...mockQuoteResponse,
        sellTokenAddress: mockETH.address,
        value: '100000000000000000', // 0.1 ETH
      });

      mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
      mockTransaction.wait.mockResolvedValue(mockReceipt);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: ethRequest,
      });

      expect(response.statusCode).toBe(200);
      // Should not check allowance for ETH
      expect(mockEthereumInstance.getERC20Allowance).not.toHaveBeenCalled();
    });

    it('should return 400 for insufficient token balance', async () => {
      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getERC20Balance.mockResolvedValue({
        value: BigNumber.from('50000000000000000'), // 0.05 WETH
      });

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount
        .mockReturnValueOnce('0.05') // balance
        .mockReturnValueOnce('0.1'); // required amount
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue(mockQuoteResponse);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      if (response.statusCode !== 400) {
        console.error('Insufficient balance response:', response.body);
      }
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe(
        'Insufficient token balance to complete this swap',
      );
    });

    it('should return 400 for insufficient token allowance', async () => {
      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getERC20Balance.mockResolvedValue({
        value: BigNumber.from('200000000000000000'), // 0.2 WETH
      });
      mockEthereumInstance.getERC20Allowance.mockResolvedValue({
        value: BigNumber.from('50000000000000000'), // 0.05 WETH
      });

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount
        .mockReturnValueOnce('0.2') // balance
        .mockReturnValueOnce('0.1') // required amount
        .mockReturnValueOnce('0.05') // current allowance
        .mockReturnValueOnce('0.1'); // required allowance
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue(mockQuoteResponse);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe(
        'Insufficient token allowance. Please approve the token for the 0x Exchange Proxy using the /ethereum/approve endpoint',
      );
    });

    it('should return error when token is not found', async () => {
      mockEthereumInstance.getTokenBySymbol.mockReturnValueOnce(null); // Base token not found

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      // The actual response is 400 because the schema validation fails first
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should return 400 when wallet is not found', async () => {
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('Wallet not found');
    });

    it('should handle gas estimation errors', async () => {
      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);
      mockEthereumInstance.getWallet.mockResolvedValue(mockWallet);
      mockEthereumInstance.getERC20Balance.mockResolvedValue({
        value: BigNumber.from('200000000000000000'),
      });
      mockEthereumInstance.getERC20Allowance.mockResolvedValue({
        value: BigNumber.from('1000000000000000000'),
      });

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount.mockReturnValue('0.1');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getQuote.mockResolvedValue(mockQuoteResponse);

      const error = new Error('Gas estimation failed');
      (error as any).code = 'UNPREDICTABLE_GAS_LIMIT';
      mockWallet.sendTransaction.mockRejectedValue(error);

      const response = await server.inject({
        method: 'POST',
        url: '/execute-swap',
        body: mockRequestBody,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain(
        'Insufficient funds or gas estimation error',
      );
    });
  });
});
