import { quoteCache } from '../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

// The connectors themselves are never reached: every rejection here happens before dispatch.
jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/chains/ethereum/ethereum');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../src/trading/trading-router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

// A quote id is a bearer token for a transaction somebody else's wallet pays for. On the
// EVM routers the taker named at quote time is compiled into the calldata and cached with
// it, while the wallet that signs is whoever the execute call names — so quoting with an
// address you do not own and executing with one you do sent the output to the first and
// billed the second, and Gateway reported it as a successful swap. gateway#700.

const PAYING_WALLET = '0x628010E5B0c4dC04CAF498312486841630f8b567';
const FOREIGN_WALLET = '0x08940dc9B5a19FAb9319b77C61DDA7B8067E6843';
const SOLANA_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

const execute = (server: any, body: Record<string, unknown>) =>
  server.inject({ method: 'POST', url: '/execute-quote', body });

describe('POST /execute-quote binding checks', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => quoteCache.clear());

  it('refuses a quote that pays out to a wallet other than the one executing it', async () => {
    quoteCache.set(
      'foreign-payout',
      { connector: 'pancakeswap', network: 'bsc', wallet: FOREIGN_WALLET },
      { calldata: '0xdead' },
    );

    const response = await execute(server, {
      chainNetwork: 'ethereum-bsc',
      connector: 'pancakeswap',
      walletAddress: PAYING_WALLET,
      quoteId: 'foreign-payout',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain(FOREIGN_WALLET);
    // The refused attempt must not consume the quote.
    expect(quoteCache.get('foreign-payout')).not.toBeNull();
  });

  it('accepts the same EVM wallet written with different checksum casing', async () => {
    quoteCache.set(
      'checksum-case',
      { connector: 'pancakeswap', network: 'bsc', wallet: PAYING_WALLET.toLowerCase() },
      { calldata: '0xdead' },
    );

    const response = await execute(server, {
      chainNetwork: 'ethereum-bsc',
      connector: 'pancakeswap',
      walletAddress: PAYING_WALLET,
      quoteId: 'checksum-case',
    });

    // Past the binding checks: whatever happens next is the connector's business, not a
    // 400 telling the caller to re-quote.
    expect(JSON.parse(response.body).message ?? '').not.toMatch(/re-quote/i);
  });

  it('lets a wallet-agnostic quote be executed by any wallet', async () => {
    quoteCache.set('agnostic', { connector: 'jupiter', network: 'mainnet-beta', wallet: null }, { route: 'cached' });

    const response = await execute(server, {
      chainNetwork: 'solana-mainnet-beta',
      connector: 'jupiter',
      walletAddress: SOLANA_WALLET,
      quoteId: 'agnostic',
    });

    expect(JSON.parse(response.body).message ?? '').not.toMatch(/re-quote/i);
  });

  it('refuses a quote built by a different connector', async () => {
    quoteCache.set('wrong-connector', { connector: 'uniswap', network: 'mainnet', wallet: null }, { calldata: '0x' });

    const response = await execute(server, {
      chainNetwork: 'ethereum-mainnet',
      connector: '0x',
      walletAddress: PAYING_WALLET,
      quoteId: 'wrong-connector',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('created by uniswap');
  });

  it('refuses calldata quoted on one network and replayed on another', async () => {
    quoteCache.set('wrong-network', { connector: 'uniswap', network: 'mainnet', wallet: null }, { calldata: '0x' });

    const response = await execute(server, {
      chainNetwork: 'ethereum-bsc',
      connector: 'uniswap',
      walletAddress: PAYING_WALLET,
      quoteId: 'wrong-network',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('created on mainnet');
  });

  it('refuses an unknown or expired quote id', async () => {
    const response = await execute(server, {
      chainNetwork: 'ethereum-mainnet',
      connector: 'uniswap',
      walletAddress: PAYING_WALLET,
      quoteId: 'never-existed',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('not found or expired');
  });
});
