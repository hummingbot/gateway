import {
  HelmswapApi,
  HelmswapApiError,
  WSOL,
  buildBody,
  fromBaseUnits,
  isLiveBuildChain,
  mapHelmQuoteToRouter,
  minOutAmount,
  netOutAmount,
  parseChain,
  quoteQuery,
  toBaseUnits,
} from '../../../src/connectors/helmswap/helmswap-api';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TICKET = { id: 't1', expiresAt: 1800000000, quotedOutNet: '150000000' };

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('HelmSwap API helpers', () => {
  it('parses chain aliases and numeric ids', () => {
    expect(parseChain('solana')).toBe('solana');
    expect(parseChain('SOL')).toBe('solana');
    expect(parseChain('base')).toBe(8453);
    expect(parseChain('bsc')).toBe(56);
    expect(parseChain('mainnet')).toBe(1);
    expect(parseChain('8453')).toBe(8453);
    expect(parseChain(56)).toBe(56);
    expect(parseChain('')).toBeUndefined();
    expect(parseChain('not-a-chain')).toBeUndefined();
  });

  it('knows which chains can build transactions', () => {
    expect(isLiveBuildChain(1)).toBe(true);
    expect(isLiveBuildChain(8453)).toBe(true);
    expect(isLiveBuildChain(56)).toBe(true);
    expect(isLiveBuildChain('solana')).toBe(true);
    expect(isLiveBuildChain(42161)).toBe(false);
    expect(isLiveBuildChain(137)).toBe(false);
  });

  it('converts human amounts to and from base units', () => {
    expect(toBaseUnits('0.1', 18)).toBe('100000000000000000');
    expect(toBaseUnits('1.5', 6)).toBe('1500000');
    expect(toBaseUnits(2, 9)).toBe('2000000000');
    expect(fromBaseUnits('150000000', 6)).toBe(150);
    expect(fromBaseUnits('100000000000000000', 18)).toBe(0.1);
    expect(() => toBaseUnits('0', 18)).toThrow();
    expect(() => toBaseUnits('-1', 18)).toThrow();
    expect(() => toBaseUnits('abc', 18)).toThrow();
    expect(() => fromBaseUnits('1.5', 6)).toThrow();
  });

  it('converts small amounts written in exponent form', () => {
    // 0.0000001 of an 8-decimal token is 10 base units; String(0.0000001) is "1e-7".
    expect(toBaseUnits(0.0000001, 8)).toBe('10');
    expect(toBaseUnits('1e-7', 8)).toBe('10');
    expect(toBaseUnits('1.5e-6', 8)).toBe('150');
    expect(toBaseUnits('1e-9', 18)).toBe('1000000000');
    expect(() => toBaseUnits(1e-7, 6)).toThrow(/greater than zero/);
    expect(() => toBaseUnits('1e', 8)).toThrow(/positive number/);
  });

  it('builds Solana and EVM quote queries', () => {
    expect(quoteQuery({ chain: 'solana', tokenIn: 'SOL', tokenOut: 'MINT', amountIn: '10', slippageBps: 50 })).toEqual({
      chain: 'solana',
      inputMint: WSOL,
      outputMint: 'MINT',
      amount: '10',
      slippageBps: 50,
      referrer: undefined,
    });
    expect(quoteQuery({ chain: 8453, tokenIn: 'ETH', tokenOut: USDC_BASE, amountIn: '1000', slippageBps: 30 })).toEqual(
      {
        chainId: 8453,
        tokenIn: 'ETH',
        tokenOut: USDC_BASE,
        amountIn: '1000',
        slippageBps: 30,
        referrer: undefined,
      },
    );
  });

  it('builds the build-tx body from the quote ticket', () => {
    const evm = buildBody(
      { chain: 8453, tokenIn: 'ETH', tokenOut: USDC_BASE, amountIn: '1000', slippageBps: 30 },
      { quoteTicket: TICKET },
      '0xabc',
    );
    expect(evm).toMatchObject({ recipient: '0xabc', quoteTicket: TICKET });
    const sol = buildBody(
      { chain: 'solana', tokenIn: 'SOL', tokenOut: 'MINT', amountIn: '10', slippageBps: 50 },
      { quoteTicket: TICKET },
      'SoLRecipient',
    );
    expect(sol).toMatchObject({ chain: 'solana', inputMint: WSOL, recipient: 'SoLRecipient', quoteTicket: TICKET });
    expect(() => buildBody({ chain: 1, tokenIn: 'a', tokenOut: 'b', amountIn: '1' }, {}, '0x1')).toThrow(
      HelmswapApiError,
    );
  });

  it('reads net and minimum output', () => {
    expect(netOutAmount({ quote: { netOutAmount: '5' } })).toBe('5');
    expect(netOutAmount({ quoteTicket: { quotedOutNet: '7' } })).toBe('7');
    expect(minOutAmount({ quote: { netOutAmount: '5', minOutNet: '4' } })).toBe('4');
    expect(minOutAmount({ quote: { netOutAmount: '5' } })).toBe('5');
    try {
      netOutAmount({});
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HelmswapApiError);
      expect((err as HelmswapApiError).status).toBe(502);
      expect((err as HelmswapApiError).code).toBe('NO_NET_OUT');
    }
  });

  it('maps a quote to a Gateway router quote', () => {
    const mapped = mapHelmQuoteToRouter({
      quoteId: 'q1',
      quote: {
        quote: { netOutAmount: '150000000', minOutNet: '149250000', priceImpactPct: 0.12 },
        fee: { feeBps: 10 },
        quoteTicket: TICKET,
      },
      sellToken: 'ETH',
      buyToken: USDC_BASE,
      sellDecimals: 18,
      buyDecimals: 6,
      humanAmountIn: 0.05,
      indicative: false,
    });
    expect(mapped).toEqual({
      quoteId: 'q1',
      tokenIn: 'ETH',
      tokenOut: USDC_BASE,
      amountIn: 0.05,
      amountOut: 150,
      price: 3000,
      priceImpactPct: 0.12,
      minAmountOut: 149.25,
      maxAmountIn: 0.05,
      expirationTime: TICKET.expiresAt,
      feeBps: 10,
    });
    const indicative = mapHelmQuoteToRouter({
      quoteId: 'indicative-price',
      quote: { quote: { netOutAmount: '1' }, quoteTicket: TICKET },
      sellToken: 'a',
      buyToken: 'b',
      sellDecimals: 0,
      buyDecimals: 0,
      humanAmountIn: 0,
      indicative: true,
    });
    expect(indicative.expirationTime).toBeUndefined();
    expect(indicative.price).toBe(0);
    expect(indicative.priceImpactPct).toBe(0);
    expect(indicative.feeBps).toBeUndefined();
  });
});

describe('HelmswapApi', () => {
  it('sends quote requests with the key header and strips a trailing slash', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, quoteTicket: TICKET }));
    const api = new HelmswapApi({ baseUrl: 'https://example.test/', apiKey: 'k', fetch: fetchMock });
    expect(api.hasApiKey).toBe(true);
    const result = await api.quote({ chain: 8453, tokenIn: 'ETH', tokenOut: USDC_BASE, amountIn: '1000' });
    expect(result.quoteTicket).toEqual(TICKET);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/api/v1/quote?chainId=8453&tokenIn=ETH&tokenOut=${USDC_BASE}&amountIn=1000`);
    expect(init.method).toBe('GET');
    expect(init.headers['X-Helm-Key']).toBe('k');
    expect(init.body).toBeUndefined();
  });

  it('posts build-tx with a JSON body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, tx: { to: '0x1', data: '0x' } }));
    const api = new HelmswapApi({ fetch: fetchMock });
    expect(api.hasApiKey).toBe(false);
    await api.buildTx({ chain: 1, tokenIn: 'ETH', tokenOut: USDC_BASE, amountIn: '1' }, { quoteTicket: TICKET }, '0xr');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://helmswap.com/api/v1/build-tx');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toMatchObject({ recipient: '0xr' });
    expect(init.headers['X-Helm-Key']).toBeUndefined();
  });

  it('requires a key for Solana builds and refuses quote-only chains', async () => {
    const fetchMock = jest.fn();
    const api = new HelmswapApi({ fetch: fetchMock });
    await expect(
      api.buildTx({ chain: 'solana', tokenIn: 'SOL', tokenOut: 'M', amountIn: '1' }, { quoteTicket: TICKET }, 'r'),
    ).rejects.toMatchObject({ status: 401, code: 'API_KEY_REQUIRED' });
    await expect(
      api.buildTx({ chain: 42161, tokenIn: 'ETH', tokenOut: 'X', amountIn: '1' }, { quoteTicket: TICKET }, 'r'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns API errors and non-JSON responses into HelmswapApiError', async () => {
    const api = new HelmswapApi({
      fetch: jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(400, { ok: false, error: 'Unsupported token', code: 'BAD_TOKEN' }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: false }))
        .mockResolvedValueOnce({
          ok: false,
          status: 402,
          json: async () => {
            throw new Error('not json');
          },
        }),
    });
    const params = { chain: 1 as const, tokenIn: 'ETH', tokenOut: 'X', amountIn: '1' };
    await expect(api.quote(params)).rejects.toMatchObject({
      status: 400,
      code: 'BAD_TOKEN',
      message: 'Unsupported token',
    });
    await expect(api.quote(params)).rejects.toMatchObject({ status: 200, message: 'HelmSwap request failed (200)' });
    await expect(api.quote(params)).rejects.toMatchObject({ status: 402 });
  });
});
