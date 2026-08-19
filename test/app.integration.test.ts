import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import './mocks/app-mocks';

import { gatewayApp } from '../src/app';
import { AMM_SWAP_CONNECTORS, CLMM_SWAP_CONNECTORS, ROUTER_CONNECTORS } from '../src/trading/connector-registry';

// The route table is now unified: the trading type is a path segment and the
// connector is a parameter, so there is one set of routes rather than one set per
// connector. These tests guard that shape — that every connector Gateway advertises
// is reachable through the surface for its trading type, that each unified route is
// registered, and that the per-connector paths they replaced are gone.

describe('App Integration - Route Registration', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  const connectors = async () => {
    const response = await fastify.inject({ method: 'GET', url: '/config/connectors' });
    return JSON.parse(response.body).connectors as Array<{ name: string; trading_types: string[] }>;
  };

  describe('Connector coverage', () => {
    it('backs every advertised trading type with a unified surface', async () => {
      const registries: Record<string, string[]> = {
        router: ROUTER_CONNECTORS,
        clmm: CLMM_SWAP_CONNECTORS,
        amm: AMM_SWAP_CONNECTORS,
      };

      for (const { name, trading_types } of await connectors()) {
        for (const type of trading_types) {
          expect(registries[type]).toContain(name);
        }
      }
    });

    it('advertises only valid, non-duplicated trading types', async () => {
      for (const connector of await connectors()) {
        expect(Array.isArray(connector.trading_types)).toBe(true);
        expect(connector.trading_types.length).toBeGreaterThan(0);
        connector.trading_types.forEach((type) => expect(['router', 'amm', 'clmm']).toContain(type));
        expect(new Set(connector.trading_types).size).toBe(connector.trading_types.length);
      }
    });
  });

  describe('Unified route table', () => {
    // Ask the router directly. Injecting and checking for a non-404 would be wrong:
    // a registered route can legitimately answer 404 (an unresolvable pool, say).
    const registered = (method: 'GET' | 'POST', url: string) => (fastify as any).hasRoute({ method, url });

    it.each([
      ['GET', '/trading/router/quote-swap'],
      ['POST', '/trading/router/execute-swap'],
      ['POST', '/trading/router/execute-quote'],
      ['GET', '/trading/clmm/quote-swap'],
      ['POST', '/trading/clmm/execute-swap'],
      ['GET', '/trading/clmm/pool-info'],
      ['GET', '/trading/clmm/position-info'],
      ['GET', '/trading/clmm/positions-owned'],
      ['GET', '/trading/clmm/quote-position'],
      ['GET', '/trading/clmm/fetch-pools'],
      ['POST', '/trading/clmm/open'],
      ['POST', '/trading/clmm/add'],
      ['POST', '/trading/clmm/remove'],
      ['POST', '/trading/clmm/collect-fees'],
      ['POST', '/trading/clmm/close'],
      ['POST', '/trading/clmm/create-pool'],
      ['GET', '/trading/amm/quote-swap'],
      ['POST', '/trading/amm/execute-swap'],
      ['GET', '/trading/amm/pool-info'],
      ['GET', '/trading/amm/position-info'],
      ['GET', '/trading/amm/positions-owned'],
      ['GET', '/trading/amm/quote-liquidity'],
      ['POST', '/trading/amm/add-liquidity'],
      ['POST', '/trading/amm/remove-liquidity'],
      ['POST', '/trading/amm/create-pool'],
    ] as Array<['GET' | 'POST', string]>)('registers %s %s', async (method, url) => {
      expect(registered(method, url)).toBe(true);
    });

    it.each([
      ['GET', '/chains/solana/status'],
      ['GET', '/chains/ethereum/status'],
      ['GET', '/chains/solana/estimate-gas'],
      ['POST', '/chains/solana/balances'],
      ['POST', '/chains/ethereum/poll'],
      ['POST', '/chains/solana/wrap'],
      ['POST', '/chains/solana/unwrap'],
      // EVM-only operations keep chain-specific paths rather than 400ing on Solana.
      ['POST', '/chains/ethereum/allowances'],
      ['POST', '/chains/ethereum/approve'],
    ] as Array<['GET' | 'POST', string]>)('registers %s %s', async (method, url) => {
      expect(registered(method, url)).toBe(true);
    });

    it('serves chain routes for any chain through one parameterized path', async () => {
      // Not a per-chain registration: an unknown chain reaches the handler and is
      // rejected there, rather than 404ing at the router.
      const response = await fastify.inject({ method: 'GET', url: '/chains/dogecoin/status' });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/unsupported chain/i);
    });
  });

  describe('Replaced routes are gone', () => {
    it.each([
      '/connectors/jupiter/router/quote-swap',
      '/connectors/meteora/clmm/pool-info',
      '/connectors/raydium/amm/pool-info',
      '/connectors/orca/clmm/fetch-pools',
      '/trading/swap/quote',
    ])('404s on %s', async (url) => {
      const response = await fastify.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    });
  });
});
