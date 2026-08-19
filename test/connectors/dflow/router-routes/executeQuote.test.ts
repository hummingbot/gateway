import { Solana } from '../../../../src/chains/solana/solana';
import { DFlow } from '../../../../src/connectors/dflow/dflow';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/dflow/dflow');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/dflow/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

const confirmedResult = {
  signature: 'exec-sig',
  status: 1,
  data: {
    tokenIn: mockSOL.address,
    tokenOut: mockUSDC.address,
    amountIn: 0.1,
    amountOut: 15,
    fee: 0.000005,
    baseTokenBalanceChange: -0.1,
    quoteTokenBalanceChange: 15,
  },
};

describe('POST /execute-quote (dflow)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the unsigned swap and sends it through the wallet-aware chokepoint', async () => {
    const unsignedTx = { kind: 'unsigned-versioned-tx' };
    const sendAndConfirmTransactionForWallet = jest.fn(async () => ({ signature: 'exec-sig', fee: 0.000005 }));
    const mockSolanaInstance = {
      sendAndConfirmTransactionForWallet,
      connection: { getTransaction: jest.fn(async () => ({ meta: {} })) },
      getConfirmedTransactionData: jest.fn(async () => ({ meta: {} })),
      handleConfirmation: jest.fn(async () => confirmedResult),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const buildSwapTransactionUnsigned = jest.fn(async () => unsignedTx);
    (DFlow.getInstance as jest.Mock).mockResolvedValue({ buildSwapTransactionUnsigned });

    quoteCache.set('dflow-quote-1', {
      connector: 'dflow',
      network: 'mainnet-beta',
      inputToken: mockSOL,
      outputToken: mockUSDC,
      side: 'SELL',
      slippagePct: 0.5,
      quoteResponse: { slippageBps: 50 },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: WALLET, network: 'mainnet-beta', quoteId: 'dflow-quote-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ signature: 'exec-sig', status: 1 });
    expect(buildSwapTransactionUnsigned).toHaveBeenCalledWith(WALLET, { slippageBps: 50 });
    // The unsigned tx goes to the chokepoint with the executing wallet.
    expect(sendAndConfirmTransactionForWallet).toHaveBeenCalledWith(unsignedTx, WALLET);
    // A confirmed execution consumes the cached quote.
    expect(quoteCache.get('dflow-quote-1')).toBeNull();
  });

  it('returns 400 for an unknown or expired quote', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: WALLET, network: 'mainnet-beta', quoteId: 'missing-quote' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('Quote not found or expired');
  });

  it("returns 400 for another connector's cached quote", async () => {
    quoteCache.set('other-quote', { connector: 'jupiter' });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: WALLET, network: 'mainnet-beta', quoteId: 'other-quote' },
    });

    expect(response.statusCode).toBe(400);
  });
});
