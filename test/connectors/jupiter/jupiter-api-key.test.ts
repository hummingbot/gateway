// api.jup.ag answers 401 to a request with no key or a rejected one, and the keyless
// lite-api.jup.ag, deprecated Dec 31, 2025, has answered the same way since. The quote
// path used to fold that into "No route found for SOL -> USDC", which sent users to
// investigate liquidity and token support when the fix was one config line (#691).

jest.mock('../../../src/services/config-manager-v2');
jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/chains/solana/solana.utils', () => ({
  getAvailableSolanaNetworks: () => ['mainnet-beta'],
}));
jest.mock('../../../src/services/http-client', () => ({
  createHttpClient: jest.fn(),
  HttpClientError: class HttpClientError extends Error {
    data?: any;
    status?: number;
    constructor(message: string, options?: { data?: any; status?: number }) {
      super(message);
      this.data = options?.data;
      this.status = options?.status;
    }
  },
}));
jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const SOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

// The API key is read when the jupiter module loads, so each case loads it afresh; the
// mocks are then taken from the same fresh registry the module imports from.
const loadJupiter = async (apiKey: string | undefined) => {
  jest.resetModules();
  const { ConfigManagerV2 } = await import('../../../src/services/config-manager-v2');
  const { createHttpClient, HttpClientError } = await import('../../../src/services/http-client');
  const { Solana } = await import('../../../src/chains/solana/solana');

  const values: Record<string, any> = {
    'jupiter.slippagePct': 1,
    'jupiter.priorityLevel': 'medium',
    'jupiter.maxLamports': 1000000,
    'jupiter.onlyDirectRoutes': false,
    'jupiter.restrictIntermediateTokens': true,
    'jupiter.apiKey': apiKey,
  };
  (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({ get: (path: string) => values[path] });

  const get = jest
    .fn()
    .mockRejectedValue(new (HttpClientError as any)('Request failed with status 401', { status: 401 }));
  (createHttpClient as jest.Mock).mockReturnValue({ get, post: jest.fn() });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    network: 'mainnet-beta',
    getToken: jest.fn(async (id: string) => (id === 'SOL' ? SOL : USDC)),
  });

  const { Jupiter } = await import('../../../src/connectors/jupiter/jupiter');
  return { jupiter: await Jupiter.getInstance('mainnet-beta'), get };
};

describe('Jupiter quote when the API answers 401', () => {
  it('names the missing API key, with the 401, when none is configured', async () => {
    const { jupiter } = await loadJupiter(undefined);

    await expect(jupiter.getQuote('SOL', 'USDC', 0.1)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('no API key is configured'),
    });
    await expect(jupiter.getQuote('SOL', 'USDC', 0.1)).rejects.not.toMatchObject({
      message: expect.stringContaining('No route'),
    });
  });

  it('names the rejected API key, with the 401, when one is configured', async () => {
    const { jupiter } = await loadJupiter('not-a-real-key');

    await expect(jupiter.getQuote('SOL', 'USDC', 0.1)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('rejected the configured API key'),
    });
  });

  it('does not retry a 401 as if it were a rate limit', async () => {
    const { jupiter, get } = await loadJupiter(undefined);

    await expect(jupiter.getQuote('SOL', 'USDC', 0.1)).rejects.toMatchObject({ statusCode: 401 });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
