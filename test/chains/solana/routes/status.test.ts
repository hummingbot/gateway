import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { getSolanaStatus } from '../../../../src/chains/solana/routes/status';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana');

// Mock getSolanaChainConfig
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaChainConfig: jest.fn(),
}));

const mockSolana = Solana as jest.Mocked<typeof Solana>;
const { getSolanaChainConfig } = require('../../../../src/chains/solana/solana.config');

describe('Solana Status Route', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSolanaStatus function', () => {
    const mockSolanaInstance = {
      config: {
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
        swapProvider: 'jupiter/router',
      },
      getCurrentBlockNumber: jest.fn(),
      getRpcProviderService: jest.fn(),
    };

    const mockRpcProviderService = {
      getHttpUrl: jest.fn(),
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
      mockSolanaInstance.getCurrentBlockNumber.mockResolvedValue(365795000);
    });

    it('should return status with nodeURL when rpcProvider is "url"', async () => {
      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        rpcProvider: 'url',
      });

      const result = await getSolanaStatus(fastify, 'mainnet-beta');

      expect(result).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        rpcProvider: 'url',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });
    });

    it('should return status with provider URL when rpcProvider service is available', async () => {
      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        rpcProvider: 'helius',
      });

      mockSolanaInstance.getRpcProviderService.mockReturnValue(mockRpcProviderService);
      mockRpcProviderService.getHttpUrl.mockReturnValue('https://mainnet.helius-rpc.com/?api-key=test-key');

      const result = await getSolanaStatus(fastify, 'mainnet-beta');

      expect(result).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=test-key',
        rpcProvider: 'helius',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });

      expect(mockRpcProviderService.getHttpUrl).toHaveBeenCalled();
    });

    it('should fallback to nodeURL when rpcProvider service is not available', async () => {
      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        rpcProvider: 'helius',
      });

      mockSolanaInstance.getRpcProviderService.mockReturnValue(null);

      const result = await getSolanaStatus(fastify, 'mainnet-beta');

      expect(result).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        rpcProvider: 'helius',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });
    });

    it('should fallback to nodeURL when RPC provider service throws error', async () => {
      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        rpcProvider: 'helius',
      });

      mockSolanaInstance.getRpcProviderService.mockReturnValue(mockRpcProviderService);
      mockRpcProviderService.getHttpUrl.mockImplementation(() => {
        throw new Error('RPC provider service error');
      });

      // Mock logger.warn to avoid console output during tests
      const mockWarn = jest.spyOn(require('../../../../src/services/logger').logger, 'warn').mockImplementation();

      const result = await getSolanaStatus(fastify, 'mainnet-beta');

      expect(result).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        rpcProvider: 'helius',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });

      expect(mockWarn).toHaveBeenCalledWith(
        'Failed to get RPC provider URL, using nodeURL: RPC provider service error',
      );

      mockWarn.mockRestore();
    });

    it('should default to "url" when rpcProvider is not specified', async () => {
      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        // rpcProvider is undefined
      });

      const result = await getSolanaStatus(fastify, 'mainnet-beta');

      expect(result).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        rpcProvider: 'url',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });
    });
  });

  describe('GET /chains/solana/status', () => {
    const mockSolanaInstance = {
      config: {
        nodeURL: 'https://api.mainnet-beta.solana.com',
        nativeCurrencySymbol: 'SOL',
        swapProvider: 'jupiter/router',
      },
      getCurrentBlockNumber: jest.fn(),
      getRpcProviderService: jest.fn(),
    };

    beforeEach(() => {
      mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
      mockSolanaInstance.getCurrentBlockNumber.mockResolvedValue(365795000);
      mockSolanaInstance.getRpcProviderService.mockReturnValue(null);

      getSolanaChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet-beta',
        defaultWallet: 'test-wallet',
        rpcProvider: 'url',
      });
    });

    it('should return status response successfully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/solana/status?network=mainnet-beta',
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        chain: 'solana',
        network: 'mainnet-beta',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        rpcProvider: 'url',
        currentBlockNumber: 365795000,
        nativeCurrency: 'SOL',
        swapProvider: 'jupiter/router',
      });
    });
  });
});
