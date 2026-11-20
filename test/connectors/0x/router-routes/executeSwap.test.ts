import { executeQuote } from '../../../../src/connectors/0x/router-routes/executeQuote';
import { quoteSwap } from '../../../../src/connectors/0x/router-routes/quoteSwap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');

jest.mock('../../../../src/connectors/0x/router-routes/quoteSwap', () => ({
  quoteSwap: jest.fn(),
}));

jest.mock('../../../../src/connectors/0x/router-routes/executeQuote', () => ({
  executeQuote: jest.fn(),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import('../../../../src/trading/trading-router-routes/executeSwap');
  await server.register(executeSwapRoute);
  return server;
};

const WALLET = '0x1234567890123456789012345678901234567890';

describe('POST /execute-swap (0x)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  it('takes a firm quote for the wallet, then executes that quote', async () => {
    (quoteSwap as jest.Mock).mockResolvedValue({ quoteId: 'firm-quote-id' });
    (executeQuote as jest.Mock).mockResolvedValue({ signature: '0xabcdef', status: 1 });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        chainNetwork: 'ethereum-mainnet',
        connector: '0x',
        walletAddress: WALLET,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'BUY',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(200);
    // A firm quote (indicativePrice=false) with the wallet as taker — an indicative one
    // carries no transaction to execute.
    expect(quoteSwap).toHaveBeenCalledWith('mainnet', 'WETH', 'USDC', 0.1, 'BUY', 0.5, false, WALLET);
    expect(executeQuote).toHaveBeenCalledWith(WALLET, 'mainnet', 'firm-quote-id');
    expect(parseWire(response.body)).toMatchObject({ signature: '0xabcdef', status: 1 });
  });
});
