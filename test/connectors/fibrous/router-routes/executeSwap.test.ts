import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/fibrous/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));
jest.mock('../../../../src/connectors/fibrous/router-routes/executeQuote', () => ({
  executeQuote: jest.fn(),
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const TX_HASH = '0xabc123';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import('../../../../src/connectors/fibrous/router-routes/executeSwap');
  await server.register(executeSwapRoute);
  return server;
};

describe('POST /execute-swap (fibrous)', () => {
  let server: any;
  let quoteSwap: jest.Mock;
  let executeQuote: jest.Mock;

  beforeAll(async () => {
    server = await buildApp();
    ({ quoteSwap } = require('../../../../src/connectors/fibrous/router-routes/quoteSwap'));
    ({ executeQuote } = require('../../../../src/connectors/fibrous/router-routes/executeQuote'));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests a firm quote and executes it in one step', async () => {
    quoteSwap.mockResolvedValue({ quoteId: 'quote-1' });
    executeQuote.mockResolvedValue({ signature: TX_HASH, status: 1 });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        walletAddress: WALLET,
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ signature: TX_HASH, status: 1 });

    // indicativePrice must be false, and the wallet is the swap destination
    expect(quoteSwap).toHaveBeenCalledWith('base', 'WETH', 'USDC', 1, 'SELL', 1, false, WALLET, true);
    expect(executeQuote).toHaveBeenCalledWith(WALLET, 'base', 'quote-1', undefined, undefined);
  });

  it('passes gas overrides through to execution', async () => {
    quoteSwap.mockResolvedValue({ quoteId: 'quote-2' });
    executeQuote.mockResolvedValue({ signature: TX_HASH, status: 1 });

    await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        walletAddress: WALLET,
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 1,
        side: 'BUY',
        gasPrice: '1000000000',
        maxGas: 900000,
      },
    });

    expect(executeQuote).toHaveBeenCalledWith(WALLET, 'base', 'quote-2', '1000000000', 900000);
  });

  it('propagates quote failures', async () => {
    quoteSwap.mockRejectedValue(new Error('Fibrous API Error: No result found'));

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        walletAddress: WALLET,
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain('No result found');
    expect(executeQuote).not.toHaveBeenCalled();
  });
});
