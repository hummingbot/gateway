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

  // These assert registration two ways, because the old form — send an empty body and
  // accept [400, 500] — asserted neither. hasRoute answers "is this route registered"
  // exactly and without a request; the follow-up injection shows the route's schema is
  // attached and running, since a validation rejection can only come from a matched
  // route. Accepting a 500 meant a route that crashed on every request still passed.
  describe('Route Registration', () => {
    const REQUIRE_A_FIELD = [
      { method: 'POST', url: '/trading/clmm/open', missing: 'lowerPrice' },
      { method: 'POST', url: '/trading/clmm/add', missing: 'positionAddress' },
      { method: 'POST', url: '/trading/clmm/remove', missing: 'positionAddress' },
      { method: 'POST', url: '/trading/clmm/collect-fees', missing: 'positionAddress' },
      { method: 'POST', url: '/trading/clmm/close', missing: 'positionAddress' },
      { method: 'GET', url: '/trading/clmm/pool-info', missing: 'poolAddress' },
      { method: 'GET', url: '/trading/clmm/position-info', missing: 'positionAddress' },
    ] as const;

    // The write routes name their connector: it lost its schema default, because AJV
    // injects defaults before the handler and "whichever connector is first in the
    // registry" is not an answer to "which venue?" on a request that signs. So the
    // request under test carries a connector and omits only the field being checked.
    it.each(REQUIRE_A_FIELD)('registers $method $url and validates its input', async ({ method, url, missing }) => {
      expect(app.hasRoute({ method, url })).toBe(true);

      const request = { connector: 'meteora' };
      const response = await app.inject(
        method === 'GET' ? { method, url, query: request } : { method, url, payload: request },
      );

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('FST_ERR_VALIDATION');
      expect(body.message).toContain(`must have required property '${missing}'`);
    });

    it('will not pick a venue for a write whose caller did not name one', async () => {
      const response = await app.inject({ method: 'POST', url: '/trading/clmm/close', payload: {} });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain("must have required property 'connector'");
    });

    // positions-owned is the one route here with no required field — connector,
    // chainNetwork and walletAddress all carry schema defaults — so there is no
    // validation rejection to observe and hasRoute is the whole assertion. Injecting a
    // request instead would reach a live connector, which is what made the old version
    // of this case hedge across [200, 400, 500].
    it('registers GET /trading/clmm/positions-owned', () => {
      expect(app.hasRoute({ method: 'GET', url: '/trading/clmm/positions-owned' })).toBe(true);
    });
  });

  it('rejects an unsupported connector', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trading/clmm/open',
      payload: {
        connector: 'invalid-connector',
        chainNetwork: 'ethereum-mainnet',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        lowerPrice: 1800,
        upperPrice: 2200,
        poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
        // An otherwise-valid body: amount validation runs before connector
        // routing, and this test is about the connector rejection.
        baseTokenAmount: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    // The connector field is enum-constrained, so rejection happens at schema validation.
    expect(body.message).toContain('must be equal to one of the allowed values');
  });
});
