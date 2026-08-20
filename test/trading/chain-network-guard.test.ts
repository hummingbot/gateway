import fs from 'fs';
import path from 'path';

jest.mock('../../src/connectors/meteora/clmm-routes/addLiquidity', () => ({
  addLiquidity: jest.fn().mockResolvedValue({ signature: 'sig', status: 0 }),
}));
jest.mock('../../src/connectors/meteora/amm-routes/addLiquidity', () => ({
  addLiquidity: jest.fn().mockResolvedValue({ signature: 'sig', status: 0 }),
}));

import { addLiquidity as meteoraAmmAddLiquidity } from '../../src/connectors/meteora/amm-routes/addLiquidity';
import { addLiquidity as meteoraClmmAddLiquidity } from '../../src/connectors/meteora/clmm-routes/addLiquidity';
import { SUPPORTED_CHAIN_NETWORKS } from '../../src/trading/common';
import { tradingAmmRoutes, tradingClmmRoutes } from '../../src/trading/trading.routes';
import { fastifyWithTypeProvider } from '../utils/testUtils';

/**
 * The chain half of `chainNetwork` used to be decorative on the liquidity routes.
 *
 * They read only the network half and dispatched on the connector, so `ethereum-mainnet`
 * ran a Solana connector against network `mainnet`, and a chain that exists nowhere ran
 * it — successfully — against whatever followed the first hyphen. On `/add` or `/open`
 * that submits a transaction for a request Gateway could have proved wrong.
 *
 * Two guards, because one does not imply the other: the enum rejects a selector that
 * names no configured network, and the connector/chain check rejects a selector that
 * names a real one belonging to the wrong chain.
 */
const buildApp = async (plugin: any, prefix: string) => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  await server.register(plugin, { prefix });
  return server;
};

const addPayload = (chainNetwork: string, connector = 'meteora') => ({
  connector,
  chainNetwork,
  walletAddress: 'W',
  positionAddress: 'P',
  baseTokenAmount: 1,
});

describe('the chain a liquidity route was given is the chain it acts on', () => {
  let clmm: any;
  let amm: any;

  beforeAll(async () => {
    clmm = await buildApp(tradingClmmRoutes, '/trading/clmm');
    amm = await buildApp(tradingAmmRoutes, '/trading/amm');
  });

  afterAll(async () => {
    await clmm.close();
    await amm.close();
  });

  beforeEach(() => {
    (meteoraClmmAddLiquidity as jest.Mock).mockClear();
    (meteoraAmmAddLiquidity as jest.Mock).mockClear();
  });

  // Not a hand-written list: the enum is read from the config namespaces, so this also
  // fails if that lookup ever starts returning nothing and the enum silently empties.
  it('publishes the configured chain-networks as the enum', () => {
    expect(SUPPORTED_CHAIN_NETWORKS).toContain('solana-mainnet-beta');
    expect(SUPPORTED_CHAIN_NETWORKS).toContain('ethereum-mainnet');
    expect(SUPPORTED_CHAIN_NETWORKS.every((cn) => cn.includes('-'))).toBe(true);
  });

  describe.each([
    ['banana-mainnet-beta', 'a chain that does not exist'],
    ['solana-', 'an empty network half'],
    ['solana-nosuchnet', 'a network the chain is not configured for'],
  ])('%s (%s)', (chainNetwork) => {
    it('is rejected by the schema, and no connector runs', async () => {
      const response = await clmm.inject({
        method: 'POST',
        url: '/trading/clmm/add',
        payload: addPayload(chainNetwork),
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('must be equal to one of the allowed values');
      expect(meteoraClmmAddLiquidity).not.toHaveBeenCalled();
    });
  });

  it('rejects a Solana connector named with an Ethereum chain, before the connector runs', async () => {
    const response = await clmm.inject({
      method: 'POST',
      url: '/trading/clmm/add',
      payload: addPayload('ethereum-mainnet'),
    });

    expect(response.statusCode).toBe(400);
    // Names the chain it runs on and what to use instead, the same message the swap
    // routes give for the same mistake — both come from the registry's lookup().
    expect(JSON.parse(response.body).message).toBe(
      "Connector 'meteora' runs on solana, not ethereum. Use a ethereum clmm connector: uniswap, pancakeswap",
    );
    expect(meteoraClmmAddLiquidity).not.toHaveBeenCalled();
  });

  it('rejects the same mistake on the AMM surface', async () => {
    const response = await amm.inject({
      method: 'POST',
      url: '/trading/amm/add',
      payload: {
        connector: 'meteora',
        chainNetwork: 'ethereum-mainnet',
        walletAddress: 'W',
        poolAddress: 'P',
        baseTokenAmount: 1,
        quoteTokenAmount: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('runs on solana, not ethereum');
    expect(meteoraAmmAddLiquidity).not.toHaveBeenCalled();
  });

  it('still dispatches a matching pair, passing the network half through', async () => {
    const response = await clmm.inject({
      method: 'POST',
      url: '/trading/clmm/add',
      payload: addPayload('solana-mainnet-beta'),
    });

    expect(response.statusCode).toBe(200);
    expect((meteoraClmmAddLiquidity as jest.Mock).mock.calls[0][0]).toBe('mainnet-beta');
  });

  /**
   * The guard above is on one route; the hole was on fifteen. This is what stops a
   * sixteenth from reopening it: a route that names one connector for one pool must
   * resolve its selector through resolveChainNetwork, which checks the pair. Calling
   * parseChainNetwork and keeping only `network` is exactly the shape of the bug.
   */
  it('leaves no liquidity route parsing its own chainNetwork', () => {
    const dirs = ['src/trading/trading-amm-routes', 'src/trading/trading-clmm-routes'];
    const offenders = dirs.flatMap((dir) => {
      const abs = path.resolve(__dirname, '../..', dir);
      return fs
        .readdirSync(abs)
        .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
        .filter((f) => fs.readFileSync(path.join(abs, f), 'utf8').includes('const { network } = parseChainNetwork('))
        .map((f) => `${dir}/${f}`);
    });

    expect(offenders).toEqual([]);
  });
});
