import { VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { HelmswapApiError } from '../../../src/connectors/helmswap/helmswap-api';
import { HelmswapSol } from '../../../src/connectors/helmswap-sol/helmswap-sol';
import { executeQuote } from '../../../src/connectors/helmswap-sol/router-routes/executeQuote';
import { executeSwap } from '../../../src/connectors/helmswap-sol/router-routes/executeSwap';
import { quoteSwap } from '../../../src/connectors/helmswap-sol/router-routes/quoteSwap';
import { quoteCache } from '../../../src/services/quote-cache';

jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/connectors/helmswap-sol/helmswap-sol');

const RealHelmswapSol = jest.requireActual('../../../src/connectors/helmswap-sol/helmswap-sol').HelmswapSol;

const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const SOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

const API_QUOTE = {
  ok: true,
  quote: { netOutAmount: '15000000', minOutNet: '14925000', priceImpactPct: 0.01 },
  quoteTicket: { id: 't', expiresAt: 1800000000 },
};

const setup = () => {
  const helm = {
    referrer: undefined,
    api: { quote: jest.fn().mockResolvedValue(API_QUOTE), buildTx: jest.fn() },
    parseTokenAmount: RealHelmswapSol.prototype.parseTokenAmount,
    formatTokenAmount: RealHelmswapSol.prototype.formatTokenAmount,
  };
  (HelmswapSol.getInstance as jest.Mock).mockResolvedValue(helm);
  (HelmswapSol.getSlippageBps as jest.Mock).mockImplementation(RealHelmswapSol.getSlippageBps);
  const tokens: Record<string, any> = { SOL, USDC };
  const solana = {
    getToken: jest.fn(async (s: string) => tokens[s]),
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig' }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue({}),
    handleConfirmation: jest
      .fn()
      .mockResolvedValue({ signature: 'sig', status: 1, data: { amountIn: 0.1, amountOut: 15 } }),
  };
  (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
  return { helm, solana };
};

describe('HelmSwap Solana router routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({} as VersionedTransaction);
  });

  it('quotes an exact-input sell', async () => {
    const { helm } = setup();
    const result = await quoteSwap('mainnet-beta', 'SOL', 'USDC', 0.1, 'SELL', 0.5);
    expect(helm.api.quote).toHaveBeenCalledWith({
      chain: 'solana',
      tokenIn: SOL.address,
      tokenOut: USDC.address,
      amountIn: '100000000',
      slippageBps: 50,
      referrer: undefined,
    });
    expect(result).toMatchObject({ amountIn: 0.1, amountOut: 15, minAmountOut: 14.925, price: 150 });
    expect(quoteCache.get(result.quoteId, 'helmswap-sol')).toEqual(API_QUOTE);
  });

  it('rejects BUY, unknown tokens and API errors', async () => {
    const { helm } = setup();
    await expect(quoteSwap('mainnet-beta', 'SOL', 'USDC', 1, 'BUY')).rejects.toThrow(/exact-input/);
    await expect(quoteSwap('mainnet-beta', 'NOPE', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow(/Token not found/);
    helm.api.quote.mockRejectedValueOnce(new HelmswapApiError('No route', 400));
    await expect(quoteSwap('mainnet-beta', 'SOL', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow('No route');
    helm.api.quote.mockRejectedValueOnce(new Error('network down'));
    await expect(quoteSwap('mainnet-beta', 'SOL', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow('network down');
  });

  it('builds, signs through Gateway, confirms and clears the quote', async () => {
    const { helm, solana } = setup();
    helm.api.buildTx.mockResolvedValue({ ok: true, tx: { transactionBase64: Buffer.from('tx').toString('base64') } });
    const result = await executeSwap(WALLET, 'mainnet-beta', 'SOL', 'USDC', 0.1, 'SELL', 0.5);
    expect(result).toMatchObject({ signature: 'sig', status: 1 });
    expect(solana.sendAndConfirmTransactionForWallet).toHaveBeenCalledWith({}, WALLET);
    expect(solana.handleConfirmation).toHaveBeenCalledWith(
      'sig',
      {},
      SOL.address,
      USDC.address,
      WALLET,
      undefined,
      0.5,
    );
  });

  it('handles missing quotes, build errors and empty builds', async () => {
    const { helm } = setup();
    await expect(executeQuote(WALLET, 'mainnet-beta', 'missing')).rejects.toThrow(/not found or expired/);
    const fresh = async () => (await quoteSwap('mainnet-beta', 'SOL', 'USDC', 0.1, 'SELL', 0.5)).quoteId;

    helm.api.buildTx.mockRejectedValueOnce(new HelmswapApiError('A free HelmSwap API key is required', 401));
    await expect(executeQuote(WALLET, 'mainnet-beta', await fresh())).rejects.toThrow(/API key is required/);

    helm.api.buildTx.mockRejectedValueOnce(new Error('boom'));
    await expect(executeQuote(WALLET, 'mainnet-beta', await fresh())).rejects.toThrow('boom');

    helm.api.buildTx.mockResolvedValueOnce({ ok: true, tx: {} });
    await expect(executeQuote(WALLET, 'mainnet-beta', await fresh())).rejects.toThrow(/no unsigned Solana/);
  });
});

describe('HelmswapSol connector class', () => {
  it('shares one instance and validates slippage', async () => {
    const helm = await RealHelmswapSol.getInstance('mainnet-beta');
    expect(await RealHelmswapSol.getInstance('mainnet-beta')).toBe(helm);
    expect(RealHelmswapSol.getSlippageBps(1)).toBe(100);
    expect(() => RealHelmswapSol.getSlippageBps(-1)).toThrow();
    expect(helm.parseTokenAmount(0.1, 9)).toBe('100000000');
    expect(helm.formatTokenAmount('100000000', 9)).toBe('0.1');
  });
});
