import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { InfuraService } from '../../../../src/chains/ethereum/infura-service';
import { getEthereumStatus } from '../../../../src/chains/ethereum/routes/status';

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum');

// Mock getEthereumChainConfig
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  ...jest.requireActual('../../../../src/chains/ethereum/ethereum.config'),
  getEthereumChainConfig: jest.fn(),
}));

const mockEthereum = Ethereum as jest.Mocked<typeof Ethereum>;
const { getEthereumChainConfig } = require('../../../../src/chains/ethereum/ethereum.config');

describe('Ethereum Status Route', () => {
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

  describe('getEthereumStatus function', () => {
    const mockEthereumInstance = {
      rpcUrl: 'https://eth.llamarpc.com',
      nativeTokenSymbol: 'ETH',
      swapProvider: 'uniswap/router',
      provider: {
        getBlockNumber: jest.fn(),
      },
      getInfuraService: jest.fn(),
    };

    const mockInfuraService = {
      getHttpUrl: jest.fn(),
    };

    beforeEach(() => {
      mockEthereum.getInstance.mockResolvedValue(mockEthereumInstance as any);
      mockEthereumInstance.provider.getBlockNumber.mockResolvedValue(23329000);
      // Reset rpcUrl to default
      mockEthereumInstance.rpcUrl = 'https://eth.llamarpc.com';
    });

    it('should return status with standard rpcUrl when rpcProvider is "url"', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'url',
      });

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'url',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });
    });

    it('should return status with Infura URL when rpcProvider is "infura" and service is available', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'infura',
      });

      mockEthereumInstance.getInfuraService.mockReturnValue(mockInfuraService);
      mockInfuraService.getHttpUrl.mockReturnValue('https://mainnet.infura.io/v3/test-key');

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://mainnet.infura.io/v3/test-key',
        rpcProvider: 'infura',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });

      expect(mockInfuraService.getHttpUrl).toHaveBeenCalled();
    });

    it('should fallback to standard rpcUrl when rpcProvider is "infura" but service is not available', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'infura',
      });

      mockEthereumInstance.getInfuraService.mockReturnValue(null);

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'infura',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });
    });

    it('should fallback to standard rpcUrl when Infura service throws error', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'infura',
      });

      mockEthereumInstance.getInfuraService.mockReturnValue(mockInfuraService);
      mockInfuraService.getHttpUrl.mockImplementation(() => {
        throw new Error('Infura service error');
      });

      // Mock logger.warn to avoid console output during tests
      const mockWarn = jest.spyOn(require('../../../../src/services/logger').logger, 'warn').mockImplementation();

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'infura',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });

      expect(mockWarn).toHaveBeenCalledWith('Failed to get Infura URL, using standard rpcUrl: Infura service error');

      mockWarn.mockRestore();
    });

    it('should default to "url" when rpcProvider is not specified', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        // rpcProvider is undefined
      });

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'url',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });
    });

    it('should handle different networks with Infura provider', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'polygon',
        defaultWallet: 'test-wallet',
        rpcProvider: 'infura',
      });

      mockEthereumInstance.rpcUrl = 'https://polygon-rpc.com';
      mockEthereumInstance.getInfuraService.mockReturnValue(mockInfuraService);
      mockInfuraService.getHttpUrl.mockReturnValue('https://polygon-mainnet.infura.io/v3/test-key');

      const result = await getEthereumStatus('polygon');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'polygon',
        rpcUrl: 'https://polygon-mainnet.infura.io/v3/test-key',
        rpcProvider: 'infura',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });

      expect(mockInfuraService.getHttpUrl).toHaveBeenCalled();
    });

    it('should handle getBlockNumber timeout and continue with block number 0', async () => {
      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'url',
      });

      // Mock a timeout scenario
      mockEthereumInstance.provider.getBlockNumber.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 100)),
      );

      // Mock logger.warn to avoid console output during tests
      const mockWarn = jest.spyOn(require('../../../../src/services/logger').logger, 'warn').mockImplementation();

      const result = await getEthereumStatus('mainnet');

      expect(result).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'url',
        currentBlockNumber: 0,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });

      expect(mockWarn).toHaveBeenCalledWith('Failed to get block number: Request timed out');

      mockWarn.mockRestore();
    });
  });

  describe('GET /chains/ethereum/status', () => {
    const mockEthereumInstance = {
      rpcUrl: 'https://eth.llamarpc.com',
      nativeTokenSymbol: 'ETH',
      swapProvider: 'uniswap/router',
      provider: {
        getBlockNumber: jest.fn(),
      },
      getInfuraService: jest.fn(),
    };

    beforeEach(() => {
      mockEthereum.getInstance.mockResolvedValue(mockEthereumInstance as any);
      mockEthereumInstance.provider.getBlockNumber.mockResolvedValue(23329000);
      mockEthereumInstance.getInfuraService.mockReturnValue(null);

      getEthereumChainConfig.mockReturnValue({
        defaultNetwork: 'mainnet',
        defaultWallet: 'test-wallet',
        rpcProvider: 'url',
      });
    });

    it('should return status response successfully', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/status?network=mainnet',
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'https://eth.llamarpc.com',
        rpcProvider: 'url',
        currentBlockNumber: 23329000,
        nativeCurrency: 'ETH',
        swapProvider: 'uniswap/router',
      });
    });

    it('should handle missing network parameter (uses default)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/status',
      });

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('chain', 'ethereum');
      expect(responseBody).toHaveProperty('rpcProvider');
      expect(responseBody).toHaveProperty('rpcUrl');
    });

    it('should return error response on failure with fallback values', async () => {
      // Mock the getInstance to throw an error
      mockEthereum.getInstance.mockRejectedValue(new Error('Connection failed'));

      // Mock logger.error to avoid console output during tests
      const mockError = jest.spyOn(require('../../../../src/services/logger').logger, 'error').mockImplementation();

      const response = await fastify.inject({
        method: 'GET',
        url: '/chains/ethereum/status?network=mainnet',
      });

      expect(response.statusCode).toBe(500);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        chain: 'ethereum',
        network: 'mainnet',
        rpcUrl: 'unavailable',
        rpcProvider: 'unavailable',
        currentBlockNumber: 0,
        nativeCurrency: 'ETH',
        swapProvider: '',
      });

      mockError.mockRestore();
    });
  });
});
