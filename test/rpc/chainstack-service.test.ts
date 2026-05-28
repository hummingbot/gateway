import { ChainstackService } from '../../src/rpc/chainstack-service';
import { httpGet } from '../../src/services/http-client';

// Mock only httpGet; keep other exports (like HttpClientError) intact.
jest.mock('../../src/services/http-client', () => {
  const actual = jest.requireActual('../../src/services/http-client');
  return {
    ...actual,
    httpGet: jest.fn(),
  };
});

const mockedHttpGet = httpGet as jest.MockedFunction<typeof httpGet>;

const mockOk = <T>(data: T) => ({ data, status: 200, statusText: 'OK' });

const testApiKey = 'test-chainstack-key-123';

// ---------- API-shaped fixtures (match real Chainstack Platform API) ----------

const mkApiNode = (
  id: string,
  networkId: string,
  status: string,
  authKey: string,
  httpsBase: string,
  wssBase: string,
) => ({
  id,
  name: `test-${id}`,
  network: networkId,
  status,
  details: {
    https_endpoint: httpsBase,
    wss_endpoint: wssBase,
    auth_key: authKey,
  },
});

const mkNetworkResponse = (id: string, protocol: string, network: string) => ({
  id,
  protocol,
  configuration: { network },
});

// Solana mainnet
const solanaNodeApi = mkApiNode(
  'ND-111-111-111',
  'NW-SOL-MAIN',
  'running',
  'abc123',
  'https://solana-mainnet.core.chainstack.com',
  'wss://solana-mainnet.core.chainstack.com',
);
const solanaNetResp = mkNetworkResponse('NW-SOL-MAIN', 'solana', 'solana-mainnet');

// Ethereum mainnet
const ethNodeApi = mkApiNode(
  'ND-333-333-333',
  'NW-ETH-MAIN',
  'running',
  'ghi789',
  'https://ethereum-mainnet.core.chainstack.com',
  'wss://ethereum-mainnet.core.chainstack.com',
);
const ethNetResp = mkNetworkResponse('NW-ETH-MAIN', 'ethereum', 'ethereum-mainnet');

// Arbitrum mainnet
const arbNodeApi = mkApiNode(
  'ND-444-444-444',
  'NW-ARB-MAIN',
  'running',
  'jkl012',
  'https://arbitrum-mainnet.core.chainstack.com',
  'wss://arbitrum-mainnet.core.chainstack.com',
);
const arbNetResp = mkNetworkResponse('NW-ARB-MAIN', 'arbitrum', 'arbitrum-mainnet');

/** Mock httpGet to return paginated nodes, then resolve networks on demand. */
function mockNodesAndNetworks(
  apiNodes: ReturnType<typeof mkApiNode>[],
  networks: Record<string, ReturnType<typeof mkNetworkResponse>>,
) {
  mockedHttpGet.mockImplementation(async (url: string) => {
    if (url.includes('/v1/nodes')) {
      return mockOk({ count: apiNodes.length, next: null, previous: null, results: apiNodes });
    }
    // /v1/networks/{id}
    const netId = url.split('/networks/')[1];
    if (netId && networks[netId]) {
      return mockOk(networks[netId]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('ChainstackService', () => {
  beforeEach(() => {
    mockedHttpGet.mockReset();
  });

  describe('initialize', () => {
    it('discovers a Solana mainnet node and caches authenticated endpoints', async () => {
      mockNodesAndNetworks([solanaNodeApi, ethNodeApi], {
        'NW-SOL-MAIN': solanaNetResp,
      });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );
      await service.initialize();

      expect(service.getHttpUrl()).toBe('https://solana-mainnet.core.chainstack.com/abc123');
      expect(service.getWebSocketUrl()).toBe('wss://solana-mainnet.core.chainstack.com/abc123');
    });

    it('discovers an Ethereum mainnet node', async () => {
      mockNodesAndNetworks([ethNodeApi], { 'NW-ETH-MAIN': ethNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );
      await service.initialize();

      expect(service.getHttpUrl()).toBe('https://ethereum-mainnet.core.chainstack.com/ghi789');
    });

    it('maps arbitrum via resolved protocol, not "ethereum"', async () => {
      mockNodesAndNetworks([ethNodeApi, arbNodeApi], {
        'NW-ETH-MAIN': ethNetResp,
        'NW-ARB-MAIN': arbNetResp,
      });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'arbitrum', chainId: 42161 },
      );
      await service.initialize();

      expect(service.getHttpUrl()).toBe('https://arbitrum-mainnet.core.chainstack.com/jkl012');
    });

    it('ignores stopped nodes', async () => {
      const stopped = mkApiNode('ND-999', 'NW-SOL-MAIN', 'stopped', 'xxx', 'https://x', 'wss://x');
      mockNodesAndNetworks([stopped], { 'NW-SOL-MAIN': solanaNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      await expect(service.initialize()).rejects.toThrow(/No running Chainstack node/);
    });

    it('throws when no matching node exists for the requested network', async () => {
      mockNodesAndNetworks([ethNodeApi], { 'NW-ETH-MAIN': ethNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'devnet', chainId: 103 },
      );

      await expect(service.initialize()).rejects.toThrow(/No running Chainstack node/);
    });

    it('throws when the gateway network is not mapped', async () => {
      mockNodesAndNetworks([], {});

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'unknown-network', chainId: 99999 },
      );

      await expect(service.initialize()).rejects.toThrow(/Chainstack network not supported/);
    });

    it('throws on empty API key', async () => {
      const service = new ChainstackService({ apiKey: '' }, { chain: 'solana', network: 'mainnet-beta', chainId: 101 });

      await expect(service.initialize()).rejects.toThrow(/API key/);
    });
  });

  describe('getHttpUrl / getWebSocketUrl', () => {
    it('getHttpUrl returns null before initialize()', () => {
      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      expect(service.getHttpUrl()).toBeNull();
    });

    it('getWebSocketUrl returns null before initialize()', () => {
      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      expect(service.getWebSocketUrl()).toBeNull();
    });
  });

  describe('supportsTransactionMonitoring', () => {
    it('returns true for Solana after initialize (WSS endpoint present)', async () => {
      mockNodesAndNetworks([solanaNodeApi], { 'NW-SOL-MAIN': solanaNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );
      await service.initialize();

      expect(service.supportsTransactionMonitoring()).toBe(true);
    });

    it('returns false for Ethereum even after initialize', async () => {
      mockNodesAndNetworks([ethNodeApi], { 'NW-ETH-MAIN': ethNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );
      await service.initialize();

      expect(service.supportsTransactionMonitoring()).toBe(false);
    });

    it('returns false before initialize', () => {
      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      expect(service.supportsTransactionMonitoring()).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('returns an ethers provider after Ethereum initialize', async () => {
      mockNodesAndNetworks([ethNodeApi], { 'NW-ETH-MAIN': ethNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );
      await service.initialize();

      const provider = service.getProvider();
      expect(provider).toBeDefined();
      expect(provider.connection.url).toBe('https://ethereum-mainnet.core.chainstack.com/ghi789');
    });

    it('throws on Solana chain (Ethereum-only)', async () => {
      mockNodesAndNetworks([solanaNodeApi], { 'NW-SOL-MAIN': solanaNetResp });

      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );
      await service.initialize();

      expect(() => service.getProvider()).toThrow(/Ethereum-only/);
    });

    it('throws before initialize', () => {
      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'ethereum', network: 'mainnet', chainId: 1 },
      );

      expect(() => service.getProvider()).toThrow(/not initialized/);
    });
  });

  describe('isWebSocketConnected', () => {
    it('returns false when WebSocket is not initialized', () => {
      const service = new ChainstackService(
        { apiKey: testApiKey },
        { chain: 'solana', network: 'mainnet-beta', chainId: 101 },
      );

      expect(service.isWebSocketConnected()).toBe(false);
    });
  });
});
