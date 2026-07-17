import { Solana } from '../../../../src/chains/solana/solana';
import { buildVersionedTransactionFromInstructions } from '../../../../src/connectors/titan/titan.utils';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/titan/titan.utils', () => ({
  ...jest.requireActual('../../../../src/connectors/titan/titan.utils'),
  buildVersionedTransactionFromInstructions: jest.fn(),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/titan/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const OTHER_WALLET = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

const confirmedResult = {
  signature: 'titan-sig',
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

const cachedTitanQuote = () => ({
  connector: 'titan',
  network: 'mainnet-beta',
  wallet: WALLET,
  inputToken: mockSOL,
  outputToken: mockUSDC,
  side: 'SELL',
  slippagePct: 0.5,
  swapRoute: { instructions: [{ ix: 1 }], addressLookupTables: ['alt1'] },
});

describe('POST /execute-quote (titan)', () => {
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

  it('compiles the cached instructions and sends them through the wallet-aware chokepoint', async () => {
    const unsignedTx = { kind: 'titan-unsigned-v0-tx' };
    const sendAndConfirmTransactionForWallet = jest.fn(async () => ({ signature: 'titan-sig', fee: 0.000005 }));
    const mockConnection = { getTransaction: jest.fn(async () => ({ meta: {} })) };
    const mockSolanaInstance = {
      sendAndConfirmTransactionForWallet,
      connection: mockConnection,
      handleConfirmation: jest.fn(async () => confirmedResult),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (buildVersionedTransactionFromInstructions as jest.Mock).mockResolvedValue(unsignedTx);

    quoteCache.set('titan-quote-1', cachedTitanQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: WALLET, network: 'mainnet-beta', quoteId: 'titan-quote-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ signature: 'titan-sig', status: 1 });
    expect(buildVersionedTransactionFromInstructions).toHaveBeenCalledWith(
      mockConnection,
      WALLET,
      [{ ix: 1 }],
      ['alt1'],
    );
    expect(sendAndConfirmTransactionForWallet).toHaveBeenCalledWith(unsignedTx, WALLET);
    expect(quoteCache.get('titan-quote-1')).toBeNull();
  });

  it('rejects execution from a wallet other than the one the quote was built for', async () => {
    quoteCache.set('titan-quote-2', cachedTitanQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: OTHER_WALLET, network: 'mainnet-beta', quoteId: 'titan-quote-2' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('re-quote');
    // The mismatched attempt must not consume the quote.
    expect(quoteCache.get('titan-quote-2')).not.toBeNull();
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
});
