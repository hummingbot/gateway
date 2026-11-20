import Fastify, { FastifyInstance } from 'fastify';

import { ajvOptions, enforceConnectorFields, schemaErrorFormatter } from '../../src/services/schema-keywords';
import { tradingClmmRoutes, tradingAmmRoutes } from '../../src/trading/trading.routes';

// Three ways a request used to be accepted and then acted on differently, all of them
// silent. None returned a wrong answer; each did something other than what was asked.

jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/chains/ethereum/ethereum');

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ ajv: ajvOptions as any, schemaErrorFormatter });
  await app.register(require('@fastify/sensible'));
  // The hook app.ts installs, without booting the whole server, so the test exercises
  // the rule and not the RPC layer.
  app.addHook('preValidation', enforceConnectorFields);
  await app.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
  await app.register(tradingAmmRoutes, { prefix: '/trading/amm' });
  await app.ready();
  return app;
};

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});

describe('a key the route does not declare is rejected, not dropped', () => {
  it('rejects a typo in a field that would change the trade', async () => {
    // `slippagePc: 5` was accepted and dropped, and the trade went out at the
    // connector's configured slippage — the caller's stated tolerance, silently ignored.
    const response = await app.inject({
      method: 'POST',
      url: '/trading/clmm/close',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
        positionAddress: 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
        slippagePc: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/slippagePc/);
  });

  it('still accepts the field spelled correctly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trading/clmm/close',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
        positionAddress: 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
        slippagePct: 5,
      },
    });

    // Past validation and into the handler; the unmocked-chain failure there is the
    // connector's business, not the schema's.
    expect(JSON.parse(response.body).message).toMatch(/^Failed to close position/);
  });
});

describe('x-connectors is enforced, not decorative', () => {
  it('rejects a meteora-only field sent to raydium', async () => {
    // `configAddress` is meteora's; passing it to raydium used to create a pool with
    // raydium's defaults instead of erroring.
    const response = await app.inject({
      method: 'POST',
      url: '/trading/amm/create-pool',
      payload: {
        connector: 'raydium',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        baseTokenAmount: 1,
        quoteTokenAmount: 100,
        configAddress: 'Ai7fXNPLhUXm3Q8m9pKJDLWNPvKvNKcNPPWQ9pQqcXJm',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/configAddress is not a raydium parameter/);
  });

  it('accepts the same field on the connector it belongs to', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trading/amm/create-pool',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        baseTokenAmount: 1,
        quoteTokenAmount: 100,
        configAddress: 'Ai7fXNPLhUXm3Q8m9pKJDLWNPvKvNKcNPPWQ9pQqcXJm',
      },
    });

    expect(JSON.parse(response.body).message).toMatch(/^Failed to create pool/);
  });
});

describe('a write does not pick a venue for you', () => {
  it('requires the connector rather than defaulting to the first in the registry', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trading/clmm/open',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
        poolAddress: 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
        lowerPrice: 100,
        upperPrice: 200,
        baseTokenAmount: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must have required property 'connector'/);
  });

  it('leaves the reads their default, which is what fills the Swagger form', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/trading/clmm/positions-owned',
      query: { chainNetwork: 'solana-mainnet-beta', walletAddress: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD' },
    });

    // No connector named, and still into the handler: the default connector took it.
    expect(JSON.parse(response.body).message).toMatch(/^Failed to list CLMM positions owned/);
  });
});
