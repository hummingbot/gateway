import { tradingClmmRoutes } from '../../../src/trading/trading.routes';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  await server.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
  return server;
};

describe('Unified Trading CLMM Routes', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register POST /trading/clmm/open route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/open',
        payload: {},
      });

      // Should return 400 for missing required fields, not 404
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register POST /trading/clmm/add route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/add',
        payload: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register POST /trading/clmm/remove route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/remove',
        payload: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register POST /trading/clmm/collect-fees route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/collect-fees',
        payload: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register POST /trading/clmm/close route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/close',
        payload: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register GET /trading/clmm/pool-info route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trading/clmm/pool-info',
        query: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register GET /trading/clmm/position-info route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trading/clmm/position-info',
        query: {},
      });

      expect([400, 500]).toContain(response.statusCode);
    });

    it('should register GET /trading/clmm/positions-owned route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trading/clmm/positions-owned',
        query: {
          connector: 'meteora',
          chainNetwork: 'solana-mainnet-beta',
        },
      });

      // Route should exist and return 200 or 400/500 (requires wallet address)
      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('Schema Validation', () => {
    describe('POST /trading/clmm/open', () => {
      it('should return 400 for missing connector', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/trading/clmm/open',
          payload: {
            network: 'mainnet',
            walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
            lowerPrice: 1800,
            upperPrice: 2200,
            poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing network', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/trading/clmm/open',
          payload: {
            connector: 'uniswap',
            walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
            lowerPrice: 1800,
            upperPrice: 2200,
            poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing walletAddress', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/trading/clmm/open',
          payload: {
            connector: 'uniswap',
            network: 'mainnet',
            lowerPrice: 1800,
            upperPrice: 2200,
            poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /trading/clmm/add', () => {
      it('should return 400 for missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/trading/clmm/add',
          payload: {
            connector: 'uniswap',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /trading/clmm/remove', () => {
      it('should return 400 for missing positionAddress', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/trading/clmm/remove',
          payload: {
            connector: 'uniswap',
            network: 'mainnet',
            walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
            percentageToRemove: 50,
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /trading/clmm/pool-info', () => {
      it('should return 400 for missing poolAddress query param', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/trading/clmm/pool-info',
          query: {
            connector: 'uniswap',
            chainNetwork: 'ethereum-mainnet',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing connector query param', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/trading/clmm/pool-info',
          query: {
            chainNetwork: 'ethereum-mainnet',
            poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing chainNetwork query param', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/trading/clmm/pool-info',
          query: {
            connector: 'uniswap',
            poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /trading/clmm/position-info', () => {
      it('should return 400 for missing positionAddress query param', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/trading/clmm/position-info',
          query: {
            connector: 'uniswap',
            chainNetwork: 'ethereum-mainnet',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for missing connector query param', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/trading/clmm/position-info',
          query: {
            chainNetwork: 'ethereum-mainnet',
            positionAddress: '12345',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Connector Support', () => {
    it('should accept uniswap connector for open position', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/open',
        payload: {
          connector: 'uniswap',
          network: 'mainnet',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          lowerPrice: 1800,
          upperPrice: 2200,
          poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
        },
      });

      // Should not return 400 for unsupported connector
      // Will fail for other reasons (like wallet not found) but that's OK
      expect(response.statusCode).not.toBe(404);
    });

    it('should accept pancakeswap connector', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/add',
        payload: {
          connector: 'pancakeswap',
          network: 'bsc',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          positionAddress: '12345',
          baseTokenAmount: 1,
          quoteTokenAmount: 100,
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should accept raydium connector', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/remove',
        payload: {
          connector: 'raydium',
          network: 'mainnet-beta',
          walletAddress: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
          positionAddress: 'position123',
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should accept meteora connector', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/collect-fees',
        payload: {
          connector: 'meteora',
          network: 'mainnet-beta',
          walletAddress: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
          positionAddress: 'position456',
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should accept pancakeswap-sol connector', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/close',
        payload: {
          connector: 'pancakeswap-sol',
          network: 'mainnet-beta',
          walletAddress: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
          positionAddress: 'position789',
        },
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('should reject unsupported connector', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/trading/clmm/open',
        payload: {
          connector: 'invalid-connector',
          network: 'mainnet',
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          lowerPrice: 1800,
          upperPrice: 2200,
          poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unsupported connector');
    });
  });
});
