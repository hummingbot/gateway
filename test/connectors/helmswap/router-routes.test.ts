import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Helmswap } from '../../../src/connectors/helmswap/helmswap';
import { HelmswapApiError } from '../../../src/connectors/helmswap/helmswap-api';
import { executeQuote } from '../../../src/connectors/helmswap/router-routes/executeQuote';
import { executeSwap } from '../../../src/connectors/helmswap/router-routes/executeSwap';
import { quoteSwap } from '../../../src/connectors/helmswap/router-routes/quoteSwap';
import { quoteCache } from '../../../src/services/quote-cache';

jest.mock('../../../src/chains/ethereum/ethereum');
jest.mock('../../../src/connectors/helmswap/helmswap');

const RealHelmswap = jest.requireActual('../../../src/connectors/helmswap/helmswap').Helmswap;

const WALLET = '0x1234567890123456789012345678901234567890';
const ETH = { symbol: 'ETH', address: 'ETH', decimals: 18 };
const USDC = { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 };

const API_QUOTE = {
  ok: true,
  quote: { netOutAmount: '150000000', minOutNet: '149250000', priceImpactPct: 0.05 },
  fee: { feeBps: 10 },
  quoteTicket: { id: 't', expiresAt: 1800000000 },
};

const mockHelm = () => {
  const helm = {
    chainId: 8453,
    referrer: undefined,
    api: { quote: jest.fn().mockResolvedValue(API_QUOTE), buildTx: jest.fn() },
    parseTokenAmount: RealHelmswap.prototype.parseTokenAmount,
    formatTokenAmount: RealHelmswap.prototype.formatTokenAmount,
  };
  (Helmswap.getInstance as jest.Mock).mockResolvedValue(helm);
  (Helmswap.getSlippageBps as jest.Mock).mockImplementation(RealHelmswap.getSlippageBps);
  return helm;
};

const mockEthereum = () => {
  const tokens: Record<string, any> = { ETH, USDC };
  const wallet = { address: WALLET, sendTransaction: jest.fn().mockResolvedValue({ hash: '0xabc' }) };
  const ethereum = {
    nativeTokenSymbol: 'ETH',
    getToken: jest.fn(async (s: string) => tokens[s]),
    getWallet: jest.fn().mockResolvedValue(wallet),
    handleTransactionExecution: jest.fn().mockResolvedValue({ transactionHash: '0xabc', status: 1 }),
    handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ signature: '0xabc', status: 1 }),
    wallet,
  };
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);
  return ethereum;
};

describe('HelmSwap EVM router routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('quotes an exact-input sell and caches a firm quote', async () => {
    const helm = mockHelm();
    mockEthereum();
    const result = await quoteSwap('base', 'ETH', 'USDC', 0.05, 'SELL', 0.5, false, WALLET);
    expect(helm.api.quote).toHaveBeenCalledWith({
      chain: 8453,
      tokenIn: 'ETH',
      tokenOut: USDC.address,
      amountIn: '50000000000000000',
      slippageBps: 50,
      referrer: undefined,
    });
    expect(result).toMatchObject({ amountIn: 0.05, amountOut: 150, minAmountOut: 149.25, price: 3000, feeBps: 10 });
    expect(quoteCache.get(result.quoteId, 'helmswap')).toEqual(API_QUOTE);
  });

  it('returns an indicative price without caching', async () => {
    mockHelm();
    mockEthereum();
    const result = await quoteSwap('base', 'ETH', 'USDC', 0.05, 'SELL', 0.5, true);
    expect(result.quoteId).toBe('indicative-price');
    expect(result.expirationTime).toBeUndefined();
  });

  it('rejects BUY, unknown tokens, API errors and unbuildable routes', async () => {
    const helm = mockHelm();
    mockEthereum();
    await expect(quoteSwap('base', 'ETH', 'USDC', 1, 'BUY')).rejects.toThrow(/exact-input/);
    await expect(quoteSwap('base', 'NOPE', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow(/Token not found/);
    helm.api.quote.mockRejectedValueOnce(new HelmswapApiError('Unsupported token', 400));
    await expect(quoteSwap('base', 'ETH', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow('Unsupported token');
    helm.api.quote.mockRejectedValueOnce(new Error('network down'));
    await expect(quoteSwap('base', 'ETH', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow('network down');
    helm.api.quote.mockResolvedValueOnce({ ...API_QUOTE, priceImpact: { buildable: false, warning: 'Too thin' } });
    await expect(quoteSwap('base', 'ETH', 'USDC', 1, 'SELL', 0.5)).rejects.toThrow('Too thin');
  });

  it('builds, sends approvals then the swap, and clears the quote', async () => {
    const helm = mockHelm();
    const ethereum = mockEthereum();
    helm.api.buildTx.mockResolvedValue({
      ok: true,
      approvals: [{ to: '0xtoken', data: '0xapprove' }],
      tx: { to: '0xrouter', data: '0xswap', value: '0x1' },
    });
    const result = await executeSwap(WALLET, 'base', 'ETH', 'USDC', 0.05, 'SELL', 0.5);
    expect(result).toEqual({ signature: '0xabc', status: 1 });
    expect(ethereum.wallet.sendTransaction).toHaveBeenNthCalledWith(1, {
      to: '0xtoken',
      data: '0xapprove',
      value: '0x0',
    });
    expect(ethereum.wallet.sendTransaction).toHaveBeenNthCalledWith(2, {
      to: '0xrouter',
      data: '0xswap',
      value: '0x1',
    });
    expect(ethereum.handleExecuteQuoteTransactionConfirmation).toHaveBeenCalledWith(
      { transactionHash: '0xabc', status: 1 },
      'ETH',
      USDC.address,
      0.05,
      150,
      undefined,
      undefined,
      0.5,
    );
    const [params, cached, recipient] = helm.api.buildTx.mock.calls[0];
    expect(params.chain).toBe(8453);
    expect(cached).toEqual(API_QUOTE);
    expect(recipient).toBe(WALLET);
  });

  it('handles missing quotes, build errors, empty builds, pending and failed transactions', async () => {
    const helm = mockHelm();
    const ethereum = mockEthereum();
    await expect(executeQuote(WALLET, 'base', 'missing')).rejects.toThrow(/not found or expired/);

    const fresh = async () => (await quoteSwap('base', 'ETH', 'USDC', 0.05, 'SELL', 0.5, false, WALLET)).quoteId;

    helm.api.buildTx.mockRejectedValueOnce(new HelmswapApiError('Quote expired', 400));
    await expect(executeQuote(WALLET, 'base', await fresh())).rejects.toThrow('Quote expired');

    helm.api.buildTx.mockRejectedValueOnce(new Error('boom'));
    await expect(executeQuote(WALLET, 'base', await fresh())).rejects.toThrow('boom');

    helm.api.buildTx.mockResolvedValueOnce({ ok: true });
    await expect(executeQuote(WALLET, 'base', await fresh())).rejects.toThrow(/no unsigned transaction/);

    helm.api.buildTx.mockResolvedValue({ ok: true, tx: { to: '0xrouter', data: '0xswap' } });
    ethereum.handleExecuteQuoteTransactionConfirmation.mockReturnValueOnce({ signature: '0xabc', status: 0 });
    const pendingId = await fresh();
    await expect(executeQuote(WALLET, 'base', pendingId)).resolves.toMatchObject({ status: 0 });
    expect(quoteCache.get(pendingId, 'helmswap')).toBeDefined();

    ethereum.handleExecuteQuoteTransactionConfirmation.mockReturnValueOnce({ signature: '0xabc', status: -1 });
    await expect(executeQuote(WALLET, 'base', await fresh())).rejects.toThrow(/failed on-chain/);
  });
});

describe('Helmswap connector class', () => {
  it('maps networks to chain ids and validates slippage', async () => {
    const helm = await RealHelmswap.getInstance('base');
    expect(helm.chainId).toBe(8453);
    expect(await RealHelmswap.getInstance('base')).toBe(helm);
    expect((await RealHelmswap.getInstance('bsc')).chainId).toBe(56);
    await expect(RealHelmswap.getInstance('arbitrum')).rejects.toThrow(/does not support/);
    expect(RealHelmswap.getSlippageBps(0.5)).toBe(50);
    expect(() => RealHelmswap.getSlippageBps(11)).toThrow();
    expect(helm.parseTokenAmount(1.5, 6)).toBe('1500000');
    expect(helm.formatTokenAmount('1500000', 6)).toBe('1.5');
  });
});
