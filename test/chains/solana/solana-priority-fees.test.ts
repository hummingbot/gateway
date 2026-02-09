import { getHeliusApiKey, PriorityFeeLevel, SolanaPriorityFees } from '../../../src/chains/solana/solana-priority-fees';
import { SolanaNetworkConfig } from '../../../src/chains/solana/solana.config';

// Mock the config manager
jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn(() => ({
      get: jest.fn(),
    })),
  },
}));

// Mock fetch for Helius API calls
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Solana Priority Fees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHeliusApiKey', () => {
    it('returns API key from apiKeys.helius config when available', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('config-api-key-123');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await getHeliusApiKey();

      expect(result).toBe('config-api-key-123');
      expect(mockGet).toHaveBeenCalledWith('apiKeys.helius');
    });

    it('extracts API key from Helius nodeURL when config key not available', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const nodeURL = 'https://mainnet.helius-rpc.com/?api-key=url-api-key-456';
      const result = await getHeliusApiKey(nodeURL);

      expect(result).toBe('url-api-key-456');
    });

    it('returns null when no API key found in config or URL', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await getHeliusApiKey('https://api.mainnet-beta.solana.com');

      expect(result).toBeNull();
    });

    it('returns null for non-Helius URL without config key', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await getHeliusApiKey('https://some-other-rpc.com/?api-key=some-key');

      expect(result).toBeNull();
    });

    it('ignores placeholder API keys (YOUR_*)', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('YOUR_HELIUS_API_KEY');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await getHeliusApiKey();

      expect(result).toBeNull();
    });

    it('prefers config API key over URL when both available', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('config-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const nodeURL = 'https://mainnet.helius-rpc.com/?api-key=url-key';
      const result = await getHeliusApiKey(nodeURL);

      expect(result).toBe('config-key');
    });

    it('handles invalid URL gracefully', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await getHeliusApiKey('not-a-valid-url');

      expect(result).toBeNull();
    });

    it('extracts API key from helius-rpc.com URL', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const nodeURL = 'https://devnet.helius-rpc.com/?api-key=devnet-key-789';
      const result = await getHeliusApiKey(nodeURL);

      expect(result).toBe('devnet-key-789');
    });
  });

  describe('SolanaPriorityFees.estimatePriorityFeeDetailed', () => {
    const mockConfig: SolanaNetworkConfig = {
      chainID: 101,
      nodeURL: 'https://mainnet.helius-rpc.com/?api-key=test-key',
      nativeCurrencySymbol: 'SOL',
      geckoId: 'solana',
      defaultComputeUnits: 200000,
      confirmRetryInterval: 1,
      confirmRetryCount: 10,
      minPriorityFeePerCU: 0.1,
      maxPriorityFeePerCU: 1.0,
    };

    it('returns minimum fee when no Helius API key available', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const configWithoutHelius = {
        ...mockConfig,
        nodeURL: 'https://api.mainnet-beta.solana.com',
      };

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(configWithoutHelius, 'mainnet-beta');

      expect(result.feePerComputeUnit).toBe(0.1);
      expect(result.priorityFeeLevel).toBe('High');
      expect(result.priorityFeePerCUEstimate).toBeNull();
    });

    it('uses High as default priority level', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(
        { ...mockConfig, nodeURL: 'https://api.solana.com' },
        'mainnet-beta',
      );

      expect(result.priorityFeeLevel).toBe('High');
    });

    it('respects provided priority level', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(
        { ...mockConfig, nodeURL: 'https://api.solana.com' },
        'mainnet-beta',
        'VeryHigh',
      );

      expect(result.priorityFeeLevel).toBe('VeryHigh');
    });

    it('clamps fee to minimum when Helius returns lower value', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      // Mock Helius returning 0 (Min level often returns 0)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { priorityFeeEstimate: 0 }, // 0 micro-lamports
        }),
      });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta', 'Min');

      expect(result.feePerComputeUnit).toBe(0.1); // Clamped to minimum
      expect(result.priorityFeePerCUEstimate).toBe(0); // Raw estimate was 0
    });

    it('clamps fee to maximum when Helius returns higher value', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      // Mock Helius returning very high fee (5 lamports/CU = 5,000,000 micro-lamports)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { priorityFeeEstimate: 5000000 },
        }),
      });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta', 'VeryHigh');

      expect(result.feePerComputeUnit).toBe(1.0); // Clamped to maximum
      expect(result.priorityFeePerCUEstimate).toBe(5); // Raw estimate was 5 lamports/CU
    });

    it('returns unclamped fee when within min/max bounds', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      // Mock Helius returning 0.5 lamports/CU = 500,000 micro-lamports
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { priorityFeeEstimate: 500000 },
        }),
      });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta', 'High');

      expect(result.feePerComputeUnit).toBe(0.5);
      expect(result.priorityFeePerCUEstimate).toBe(0.5);
    });

    it('handles Helius API error gracefully', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta');

      expect(result.feePerComputeUnit).toBe(0.1); // Falls back to minimum
      expect(result.priorityFeePerCUEstimate).toBeNull();
    });

    it('handles Helius RPC error response', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: -32600, message: 'Invalid request' },
        }),
      });

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta');

      expect(result.feePerComputeUnit).toBe(0.1);
      expect(result.priorityFeePerCUEstimate).toBeNull();
    });

    it('handles network fetch error', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('test-api-key');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta');

      expect(result.feePerComputeUnit).toBe(0.1);
      expect(result.priorityFeePerCUEstimate).toBeNull();
    });

    it('uses default min/max when not specified in config', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const configWithoutMinMax: SolanaNetworkConfig = {
        chainID: 101,
        nodeURL: 'https://api.solana.com',
        nativeCurrencySymbol: 'SOL',
        geckoId: 'solana',
        defaultComputeUnits: 200000,
        confirmRetryInterval: 1,
        confirmRetryCount: 10,
        minPriorityFeePerCU: 0, // Will default to 0.1
        maxPriorityFeePerCU: undefined, // Will default to 1.0
      };

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(configWithoutMinMax, 'mainnet-beta');

      // Should use default minimum of 0.1
      expect(result.feePerComputeUnit).toBe(0.1);
    });
  });

  describe('SolanaPriorityFees.estimatePriorityFee', () => {
    it('returns only the fee value (not full result object)', async () => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const mockConfig: SolanaNetworkConfig = {
        chainID: 101,
        nodeURL: 'https://api.solana.com',
        nativeCurrencySymbol: 'SOL',
        geckoId: 'solana',
        defaultComputeUnits: 200000,
        confirmRetryInterval: 1,
        confirmRetryCount: 10,
        minPriorityFeePerCU: 0.1,
        maxPriorityFeePerCU: 1.0,
      };

      const result = await SolanaPriorityFees.estimatePriorityFee(mockConfig, 'mainnet-beta');

      expect(typeof result).toBe('number');
      expect(result).toBe(0.1);
    });
  });

  describe('Priority fee levels', () => {
    const levels: PriorityFeeLevel[] = ['Min', 'Low', 'Medium', 'High', 'VeryHigh', 'UnsafeMax'];

    it.each(levels)('accepts %s as valid priority level', async (level) => {
      const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
      const mockGet = jest.fn().mockReturnValue('');
      (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: mockGet });

      const mockConfig: SolanaNetworkConfig = {
        chainID: 101,
        nodeURL: 'https://api.solana.com',
        nativeCurrencySymbol: 'SOL',
        geckoId: 'solana',
        defaultComputeUnits: 200000,
        confirmRetryInterval: 1,
        confirmRetryCount: 10,
        minPriorityFeePerCU: 0.1,
        maxPriorityFeePerCU: 1.0,
      };

      const result = await SolanaPriorityFees.estimatePriorityFeeDetailed(mockConfig, 'mainnet-beta', level);

      expect(result.priorityFeeLevel).toBe(level);
    });
  });
});
