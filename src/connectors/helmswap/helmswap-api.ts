/**
 * HelmSwap public v1 HTTP client (GET /api/v1/quote, POST /api/v1/build-tx).
 * Docs: https://helmswap.com/developers
 *
 * The API returns quotes and unsigned transactions. This client never holds
 * keys, never signs, and never broadcasts.
 */
export const DEFAULT_HELMSWAP_BASE_URL = 'https://helmswap.com';
export const HELMSWAP_KEY_DOCS = 'https://helmswap.com/developers';
export const WSOL = 'So11111111111111111111111111111111111111112';

/** Live swap chains. Arbitrum (42161) and Polygon (137) are quote-only. */
export const LIVE_EVM_CHAIN_IDS = [8453, 56, 1, 4663, 57073, 999, 99901, 5042] as const;
export const QUOTE_ONLY_CHAIN_IDS = [42161, 137] as const;

export const CHAIN_ALIASES: Record<string, 'solana' | number> = {
  solana: 'solana',
  sol: 'solana',
  base: 8453,
  '8453': 8453,
  bnb: 56,
  bsc: 56,
  bnbchain: 56,
  '56': 56,
  eth: 1,
  ethereum: 1,
  mainnet: 1,
  '1': 1,
  robinhood: 4663,
  '4663': 4663,
  ink: 57073,
  '57073': 57073,
  hyperevm: 999,
  '999': 999,
  elysium: 99901,
  '99901': 99901,
  arc: 5042,
  '5042': 5042,
  arbitrum: 42161,
  '42161': 42161,
  polygon: 137,
  '137': 137,
};

export class HelmswapApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = 'HelmswapApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export type HelmswapApiOptions = {
  baseUrl?: string;
  /** Free key from https://helmswap.com/developers, sent as X-Helm-Key. Never a wallet key. */
  apiKey?: string;
  fetch?: typeof fetch;
};

export type SwapParams = {
  chain: 'solana' | number;
  tokenIn: string;
  tokenOut: string;
  /** Integer base units of tokenIn. */
  amountIn: string;
  slippageBps?: number;
  referrer?: string;
};

export function parseChain(raw?: string | number): 'solana' | number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'number') return raw;
  const trimmed = String(raw).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return CHAIN_ALIASES[trimmed.toLowerCase().replace(/\s+/g, '')];
}

export function isLiveBuildChain(chain: 'solana' | number): boolean {
  return chain === 'solana' || (LIVE_EVM_CHAIN_IDS as readonly number[]).includes(chain as number);
}

export function toBaseUnits(amount: string | number, decimals: number): string {
  const trimmed = String(amount).trim();
  if (!trimmed || trimmed.startsWith('-')) throw new Error('amount must be greater than zero');
  const [whole, frac = ''] = trimmed.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error('amount must be a positive number');
  }
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const raw = `${whole}${fracPadded}`.replace(/^0+/, '') || '0';
  if (raw === '0') throw new Error('amount must be greater than zero');
  return raw;
}

export function fromBaseUnits(raw: string, decimals: number): number {
  const s = String(raw);
  if (!/^\d+$/.test(s)) throw new Error('base units must be a non-negative integer string');
  const padded = s.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals);
  return Number(`${whole}.${frac}`);
}

export function nativeOrMint(token: string, chain: 'solana' | number): string {
  const t = token.trim();
  if (chain === 'solana' && t.toUpperCase() === 'SOL') return WSOL;
  return t;
}

export function quoteQuery(params: SwapParams): Record<string, string | number | undefined> {
  if (params.chain === 'solana') {
    return {
      chain: 'solana',
      inputMint: nativeOrMint(params.tokenIn, 'solana'),
      outputMint: nativeOrMint(params.tokenOut, 'solana'),
      amount: params.amountIn,
      slippageBps: params.slippageBps,
      referrer: params.referrer,
    };
  }
  return {
    chainId: params.chain,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    slippageBps: params.slippageBps,
    referrer: params.referrer,
  };
}

export function buildBody(
  params: SwapParams,
  quote: Record<string, unknown>,
  recipient: string,
): Record<string, unknown> {
  const ticket = quote.quoteTicket;
  if (!ticket || typeof ticket !== 'object') {
    throw new HelmswapApiError(
      'quote.quoteTicket is missing; call quote() first and pass the result unchanged.',
      400,
      'NO_TICKET',
    );
  }
  if (params.chain === 'solana') {
    const q = quoteQuery(params);
    return {
      chain: 'solana',
      inputMint: q.inputMint,
      outputMint: q.outputMint,
      amount: q.amount,
      slippageBps: params.slippageBps,
      recipient,
      quoteTicket: ticket,
      referrer: params.referrer,
    };
  }
  return {
    chainId: params.chain,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    slippageBps: params.slippageBps,
    recipient,
    quoteTicket: ticket,
    referrer: params.referrer,
  };
}

export function netOutAmount(quote: Record<string, unknown>): string {
  const inner = (quote.quote ?? {}) as Record<string, unknown>;
  const raw =
    inner.netOutAmount ??
    quote.netOutAmount ??
    (quote.quoteTicket as { quotedOutNet?: string } | undefined)?.quotedOutNet;
  if (raw == null) throw new HelmswapApiError('HelmSwap quote had no netOutAmount.', 502, 'NO_NET_OUT', quote);
  return String(raw);
}

export function minOutAmount(quote: Record<string, unknown>): string {
  const inner = (quote.quote ?? {}) as Record<string, unknown>;
  return String(inner.minOutNet ?? inner.minNetOutAmount ?? netOutAmount(quote));
}

export class HelmswapApi {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HelmswapApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_HELMSWAP_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  get hasApiKey() {
    return Boolean(this.apiKey);
  }

  async quote(params: SwapParams): Promise<Record<string, unknown>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(quoteQuery(params))) {
      if (value !== undefined) query.set(key, String(value));
    }
    return this.request('GET', `/api/v1/quote?${query.toString()}`);
  }

  async buildTx(
    params: SwapParams,
    quote: Record<string, unknown>,
    recipient: string,
  ): Promise<Record<string, unknown>> {
    if (params.chain === 'solana' && !this.apiKey) {
      throw new HelmswapApiError(
        'A free HelmSwap API key is required to build Solana transactions. Create one at https://helmswap.com/developers.',
        401,
        'API_KEY_REQUIRED',
      );
    }
    if (!isLiveBuildChain(params.chain)) {
      throw new HelmswapApiError(
        `build-tx is not available on chain ${params.chain} (quote-only).`,
        503,
        'FEE_ROUTER_NOT_CONFIGURED',
      );
    }
    return this.request('POST', '/api/v1/build-tx', buildBody(params, quote, recipient));
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body) headers['content-type'] = 'application/json';
    if (this.apiKey) headers['X-Helm-Key'] = this.apiKey;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new HelmswapApiError(`HelmSwap returned a non-JSON response (${response.status})`, response.status);
    }
    if (!response.ok || json?.ok === false) {
      throw new HelmswapApiError(
        (typeof json?.error === 'string' && json.error) || `HelmSwap request failed (${response.status})`,
        response.status,
        typeof json?.code === 'string' ? json.code : undefined,
        json,
      );
    }
    return json;
  }
}

export type HelmRouterQuote = {
  quoteId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  price: number;
  priceImpactPct: number;
  minAmountOut: number;
  maxAmountIn: number;
  expirationTime?: number;
  feeBps?: number;
};

/** Map a HelmSwap v1 quote body to a Gateway-style router quote. */
export function mapHelmQuoteToRouter(opts: {
  quoteId: string;
  quote: Record<string, unknown>;
  sellToken: string;
  buyToken: string;
  sellDecimals: number;
  buyDecimals: number;
  humanAmountIn: number;
  indicative: boolean;
}): HelmRouterQuote {
  const net = netOutAmount(opts.quote);
  const min = minOutAmount(opts.quote);
  const amountOut = fromBaseUnits(net, opts.buyDecimals);
  const minAmountOut = fromBaseUnits(min, opts.buyDecimals);
  const amountIn = opts.humanAmountIn;
  const inner = (opts.quote.quote ?? {}) as Record<string, unknown>;
  const fee = (opts.quote.fee ?? inner.fee ?? {}) as Record<string, unknown>;
  const impactRaw = opts.quote.priceImpactPct ?? inner.priceImpactPct;
  const ticket = opts.quote.quoteTicket as { expiresAt?: number } | undefined;
  return {
    quoteId: opts.quoteId,
    tokenIn: opts.sellToken,
    tokenOut: opts.buyToken,
    amountIn,
    amountOut,
    price: amountIn === 0 ? 0 : amountOut / amountIn,
    priceImpactPct: typeof impactRaw === 'number' ? impactRaw : 0,
    minAmountOut,
    maxAmountIn: amountIn,
    expirationTime: opts.indicative ? undefined : ticket?.expiresAt,
    feeBps: typeof fee.feeBps === 'number' ? fee.feeBps : undefined,
  };
}
