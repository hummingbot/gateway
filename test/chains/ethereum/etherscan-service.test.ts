import axios from 'axios';

import { EtherscanService } from '../../../src/chains/ethereum/etherscan-service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EtherscanService', () => {
  let etherscanService: EtherscanService;
  const testApiKey = 'test-etherscan-key-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and isSupported', () => {
    it('should create service for Ethereum mainnet (chainId 1)', () => {
      expect(() => {
        new EtherscanService(1, 'mainnet', testApiKey);
      }).not.toThrow();
    });

    it('should create service for Polygon (chainId 137)', () => {
      expect(() => {
        new EtherscanService(137, 'polygon', testApiKey);
      }).not.toThrow();
    });

    it('should create service for BSC (chainId 56)', () => {
      expect(() => {
        new EtherscanService(56, 'bsc', testApiKey);
      }).not.toThrow();
    });

    it('should throw error for Base (chainId 8453) - not supported', () => {
      expect(() => {
        new EtherscanService(8453, 'base', testApiKey);
      }).toThrow('Etherscan API not supported for chainId: 8453');
    });

    it('should throw error for Arbitrum (chainId 42161) - not supported', () => {
      expect(() => {
        new EtherscanService(42161, 'arbitrum', testApiKey);
      }).toThrow('Etherscan API not supported for chainId: 42161');
    });

    it('should throw error for Optimism (chainId 10) - not supported', () => {
      expect(() => {
        new EtherscanService(10, 'optimism', testApiKey);
      }).toThrow('Etherscan API not supported for chainId: 10');
    });

    it('should return true for supported chain IDs', () => {
      expect(EtherscanService.isSupported(1)).toBe(true); // Ethereum
      expect(EtherscanService.isSupported(137)).toBe(true); // Polygon
      expect(EtherscanService.isSupported(56)).toBe(true); // BSC
    });

    it('should return false for unsupported chain IDs', () => {
      expect(EtherscanService.isSupported(8453)).toBe(false); // Base
      expect(EtherscanService.isSupported(42161)).toBe(false); // Arbitrum
      expect(EtherscanService.isSupported(10)).toBe(false); // Optimism
    });
  });

  describe('getGasOracle', () => {
    beforeEach(() => {
      etherscanService = new EtherscanService(1, 'mainnet', testApiKey);
    });

    it('should fetch gas prices successfully from Etherscan API', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: {
            LastBlock: '23585305',
            SafeGasPrice: '0.241833537',
            ProposeGasPrice: '0.241833538',
            FastGasPrice: '0.32341308',
            suggestBaseFee: '0.241833537',
            gasUsedRatio: '0.435419730941365,0.0126618899438999',
          },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await etherscanService.getGasOracle();

      expect(result).toEqual({
        baseFee: 0.241833537,
        priorityFeeSafe: 0.241833537,
        priorityFeePropose: 0.241833538,
        priorityFeeFast: 0.32341308,
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.etherscan.io/v2/api',
        expect.objectContaining({
          params: {
            chainid: 1,
            module: 'gastracker',
            action: 'gasoracle',
            apikey: testApiKey,
          },
          timeout: 5000,
        }),
      );
    });

    it('should handle API error response', async () => {
      const mockResponse = {
        data: {
          status: '0',
          message: 'NOTOK',
          result: 'Error! Invalid API key',
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      await expect(etherscanService.getGasOracle()).rejects.toThrow(
        'Failed to fetch gas data from Etherscan: Etherscan API error: NOTOK',
      );
    });

    it('should handle 401 unauthorized error', async () => {
      const mockError = {
        response: { status: 401 },
        message: 'Unauthorized',
      };

      mockedAxios.get.mockRejectedValue(mockError);

      await expect(etherscanService.getGasOracle()).rejects.toThrow('Invalid Etherscan API key');
    });

    it('should handle timeout error', async () => {
      const mockError = {
        code: 'ETIMEDOUT',
        message: 'Timeout',
      };

      mockedAxios.get.mockRejectedValue(mockError);

      await expect(etherscanService.getGasOracle()).rejects.toThrow('Etherscan API request timeout');
    });

    it('should use correct chainId for Polygon', async () => {
      const polygonService = new EtherscanService(137, 'polygon', testApiKey);

      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: {
            LastBlock: '77726694',
            SafeGasPrice: '32.97',
            ProposeGasPrice: '45',
            FastGasPrice: '45.5',
            suggestBaseFee: '0.000000095',
            gasUsedRatio: '0.199596133333333,0.274860822222222',
            UsdPrice: '0.19475759691524',
          },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      await polygonService.getGasOracle();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.etherscan.io/v2/api',
        expect.objectContaining({
          params: expect.objectContaining({
            chainid: 137,
          }),
        }),
      );
    });
  });

  describe('getRecommendedGasPrices', () => {
    beforeEach(() => {
      etherscanService = new EtherscanService(1, 'mainnet', testApiKey);

      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: {
            LastBlock: '23585305',
            SafeGasPrice: '0.2',
            ProposeGasPrice: '0.3',
            FastGasPrice: '0.5',
            suggestBaseFee: '0.1',
            gasUsedRatio: '0.5',
          },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
    });

    it('should return propose (average) speed prices by default', async () => {
      const result = await etherscanService.getRecommendedGasPrices();

      expect(result.maxPriorityFeePerGas).toBe(0.3);
      // maxFeePerGas = baseFee * 2 + priorityFee = 0.1 * 2 + 0.3 = 0.5
      expect(result.maxFeePerGas).toBe(0.5);
    });

    it('should return safe (slow) speed prices', async () => {
      const result = await etherscanService.getRecommendedGasPrices('safe');

      expect(result.maxPriorityFeePerGas).toBe(0.2);
      // maxFeePerGas = baseFee * 2 + priorityFee = 0.1 * 2 + 0.2 = 0.4
      expect(result.maxFeePerGas).toBe(0.4);
    });

    it('should return fast speed prices', async () => {
      const result = await etherscanService.getRecommendedGasPrices('fast');

      expect(result.maxPriorityFeePerGas).toBe(0.5);
      // maxFeePerGas = baseFee * 2 + priorityFee = 0.1 * 2 + 0.5 = 0.7
      expect(result.maxFeePerGas).toBe(0.7);
    });

    it('should calculate maxFeePerGas correctly (baseFee * 2 + priorityFee)', async () => {
      const result = await etherscanService.getRecommendedGasPrices('propose');

      // baseFee = 0.1, priorityFee = 0.3
      // maxFeePerGas = 0.1 * 2 + 0.3 = 0.5
      expect(result.maxFeePerGas).toBe(0.5);
    });
  });
});
