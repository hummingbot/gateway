import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import {
  mockPriceResponse,
  mockTokenNotFoundError,
  mockInsufficientLiquidityError,
} from '../../../mocks/0x/quote-swap.mock';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  // Register sensible plugin for httpErrors
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import(
    '../../../../src/connectors/0x/swap-routes/quoteSwap'
  );
  await server.register(quoteSwapRoute);
  return server;
};

const mockRequestQuery = {
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

describe('0x quoteSwap route', () => {
  let server: any;
  let mockEthereumInstance: any;
  let mockZeroXInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Ethereum instance
    mockEthereumInstance = {
      getTokenBySymbol: jest.fn(),
      chainId: 1,
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
      getPrice: jest.fn(),
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

  describe('GET /quote-swap', () => {
    it('should return a valid quote for a SELL order', async () => {
      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount.mockReturnValue('180.529411764');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getPrice.mockResolvedValue(mockPriceResponse);

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: mockRequestQuery,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toMatchObject({
        price: expect.any(Number),
        baseTokenBalanceChange: -0.1,
        quoteTokenBalanceChange: 180.529411764,
        computeUnits: 150000,
      });

      expect(mockZeroXInstance.getPrice).toHaveBeenCalledWith({
        sellToken: mockWETH.address,
        buyToken: mockUSDC.address,
        sellAmount: '100000000000000000',
        takerAddress: mockRequestQuery.walletAddress,
        slippagePercentage: 0.005,
      });
    });

    it('should return a valid quote for a BUY order', async () => {
      const buyRequest = { ...mockRequestQuery, side: 'BUY' };

      // Setup mocks
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount.mockReturnValue('55.34');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getPrice.mockResolvedValue({
        ...mockPriceResponse,
        sellAmount: '55340000',
        buyAmount: '100000000000000000',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: buyRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toMatchObject({
        price: expect.any(Number),
        baseTokenBalanceChange: 0.1,
        quoteTokenBalanceChange: -55.34,
        computeUnits: 150000,
      });

      expect(mockZeroXInstance.getPrice).toHaveBeenCalledWith({
        sellToken: mockUSDC.address,
        buyToken: mockWETH.address,
        buyAmount: '100000000000000000',
        takerAddress: mockRequestQuery.walletAddress,
        slippagePercentage: 0.005,
      });
    });

    it('should return 404 when token is not found', async () => {
      mockEthereumInstance.getTokenBySymbol.mockReturnValueOnce(null);

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: mockRequestQuery,
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toContain('Token not found');
    });

    it('should return 400 when 0x API returns token not found error', async () => {
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getPrice.mockRejectedValue(
        new Error('0x API Error: Invalid token'),
      );

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: mockRequestQuery,
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toContain('0x API Error');
    });

    it('should return 400 when there is insufficient liquidity', async () => {
      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.005);
      mockZeroXInstance.getPrice.mockRejectedValue(
        new Error('0x API Error: Insufficient liquidity'),
      );

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: mockRequestQuery,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain(
        'Insufficient liquidity',
      );
    });

    it('should use default slippage when not provided', async () => {
      const requestWithoutSlippage = { ...mockRequestQuery };
      delete requestWithoutSlippage.slippagePct;

      mockEthereumInstance.getTokenBySymbol
        .mockReturnValueOnce(mockWETH)
        .mockReturnValueOnce(mockUSDC);

      mockZeroXInstance.parseTokenAmount.mockReturnValue('100000000000000000');
      mockZeroXInstance.formatTokenAmount.mockReturnValue('180.529411764');
      mockZeroXInstance.convertSlippageToPercentage.mockReturnValue(0.01);
      mockZeroXInstance.getPrice.mockResolvedValue(mockPriceResponse);

      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: requestWithoutSlippage,
      });

      expect(response.statusCode).toBe(200);
      expect(
        mockZeroXInstance.convertSlippageToPercentage,
      ).toHaveBeenCalledWith(
        1, // 0.01 * 100 = 1%
      );
    });

    it('should return 400 for missing required parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/quote-swap',
        query: { network: 'mainnet' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toMatch(
        /required property|Missing required parameters/,
      );
    });
  });
});
