import { Solana } from '../../../../src/chains/solana/solana';
import { Okx } from '../../../../src/connectors/okx/okx';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/okx/okx');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/okx/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

const confirmedResult = {
  signature: 'okx-sig',
  status: 1,
  data: {
    tokenIn: mockSOL.address,
    tokenOut: mockUSDC.address,
    amountIn: 0.1,
    amountOut: 15,
    fee: 0.000005,
    baseTokenBalanceChange: -0.1,
    quoteTokenBalanceChange: 15,
    slippagePct: 0.5,
  },
};

describe('POST /execute-quote (okx)', () => {
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

  it('re-fetches the wallet-bound route and sends it through the wallet-aware chokepoint', async () => {
    const unsignedTx = { kind: 'okx-unsigned-tx' };
    const sendAndConfirmTransactionForWallet = jest.fn(async () => ({ signature: 'okx-sig', fee: 0.000005 }));
    const mockSolanaInstance = {
      sendAndConfirmTransactionForWallet,
      connection: { getTransaction: jest.fn(async () => ({ meta: {} })) },
      getConfirmedTransactionData: jest.fn(async () => ({ meta: {} })),
      handleConfirmation: jest.fn(async () => confirmedResult),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const getSwapTransaction = jest.fn(async () => ({ transaction: unsignedTx }));
    (Okx.getInstance as jest.Mock).mockResolvedValue({ getSwapTransaction });

    quoteCache.set('okx-quote-1', {
      connector: 'okx',
      network: 'mainnet-beta',
      inputToken: mockSOL,
      outputToken: mockUSDC,
      side: 'SELL',
      slippagePct: 0.5,
      amountRaw: '100000000',
      swapMode: 'exactIn',
      routerResult: {},
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      body: { walletAddress: WALLET, network: 'mainnet-beta', quoteId: 'okx-quote-1' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({ signature: 'okx-sig', status: 1 });
    // The applied slippage survives the SwapExecuteResponse serializer.
    expect(body.data.slippagePct).toBe(0.5);
    // The route is re-fetched with the executing wallet and the cached parameters.
    expect(getSwapTransaction).toHaveBeenCalledWith(
      WALLET,
      mockSOL.address,
      mockUSDC.address,
      '100000000',
      'exactIn',
      0.5,
    );
    expect(sendAndConfirmTransactionForWallet).toHaveBeenCalledWith(unsignedTx, WALLET);
    // The confirmation helper receives the retry-fetched txData and the applied slippage
    // so it can decide the status (never `txData !== null`) and echo slippagePct.
    expect(mockSolanaInstance.getConfirmedTransactionData).toHaveBeenCalledWith('okx-sig');
    expect(mockSolanaInstance.handleConfirmation).toHaveBeenCalledWith(
      'okx-sig',
      { meta: {} },
      mockSOL.address,
      mockUSDC.address,
      WALLET,
      undefined,
      0.5,
    );
    expect(quoteCache.get('okx-quote-1')).toBeNull();
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
