import { CoinGeckoService } from '../../src/services/coingecko-service';
import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import { createHttpClient, HttpClientError } from '../../src/services/http-client';

jest.mock('../../src/services/config-manager-v2');
jest.mock('../../src/services/http-client', () => ({
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
// An explicit factory: the real logger reads config at import time, which the
// mocked ConfigManagerV2 cannot serve.
jest.mock('../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// A CoinGecko key does not say which plan it belongs to, and the two are not
// interchangeable: a Demo key is only accepted on api.coingecko.com under
// x-cg-demo-api-key, a Pro key only on pro-api.coingecko.com under
// x-cg-pro-api-key. Sending either to the other host fails outright, so treating
// every configured key as Pro breaks every Demo user.
//
// CoinGecko names the right root URL when it rejects the pairing, so that reply
// is what resolves the plan. Payload below is the real 400 from the Demo host.

const DEMO_HOST = 'https://api.coingecko.com/api/v3/onchain';
const PRO_HOST = 'https://pro-api.coingecko.com/api/v3/onchain';
const PUBLIC_HOST = 'https://api.geckoterminal.com/api/v2';

const wrongRootUrl = (plan: 'demo' | 'pro') =>
  new (HttpClientError as any)('Request failed', {
    status: 400,
    data: {
      error_code: plan === 'pro' ? 10010 : 10011,
      status: {
        error_message:
          plan === 'pro'
            ? 'If you are using Pro API key, please change your root URL from api.coingecko.com to pro-api.coingecko.com'
            : 'If you are using Demo API key, please change your root URL from pro-api.coingecko.com to api.coingecko.com',
      },
    },
  });

const setConfig = (values: Record<string, any>) => {
  (ConfigManagerV2.getInstance as jest.Mock).mockReturnValue({
    get: (path: string) => values[path],
    getGeckoTerminalId: jest.fn(),
    parseChainNetwork: jest.fn(),
  });
};

/** Returns the clients handed out, in construction order. */
const clients: { baseURL: string; headers: Record<string, string>; get: jest.Mock }[] = [];

const OK = { data: { data: ['ok'] }, status: 200, statusText: 'OK' };

const primeClients = () => {
  clients.length = 0;
  // Every client succeeds by default, so a client built mid-call (the retry after a
  // plan correction) is already primed by the time the service reaches it.
  (createHttpClient as jest.Mock).mockImplementation((options: any) => {
    const client = {
      baseURL: options.baseURL,
      headers: options.headers,
      get: jest.fn().mockResolvedValue(OK),
    };
    clients.push(client);
    return client;
  });
};

const freshService = () => {
  (CoinGeckoService as any).instance = undefined;
  return CoinGeckoService.getInstance();
};

/** Reach one of the service's GETs without depending on a specific public method. */
const callGet = (service: CoinGeckoService, endpoint = '/networks/eth/dexes') => (service as any).get(endpoint);

describe('CoinGecko plan selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeClients();
  });

  it('uses the public GeckoTerminal host and no key header when no key is set', () => {
    setConfig({ 'apiKeys.coingecko': '' });
    freshService();

    expect(clients[0].baseURL).toBe(PUBLIC_HOST);
    expect(clients[0].headers['x-cg-pro-api-key']).toBeUndefined();
    expect(clients[0].headers['x-cg-demo-api-key']).toBeUndefined();
  });

  it('honours an explicitly configured demo plan without probing', async () => {
    setConfig({ 'apiKeys.coingecko': 'CG-demo', 'apiKeys.coingeckoPlan': 'demo' });
    const service = freshService();

    expect(clients[0].baseURL).toBe(DEMO_HOST);
    expect(clients[0].headers['x-cg-demo-api-key']).toBe('CG-demo');

    await callGet(service);

    expect(clients).toHaveLength(1); // never rebuilt
  });

  it('honours an explicitly configured pro plan', () => {
    setConfig({ 'apiKeys.coingecko': 'CG-pro', 'apiKeys.coingeckoPlan': 'pro' });
    freshService();

    expect(clients[0].baseURL).toBe(PRO_HOST);
    expect(clients[0].headers['x-cg-pro-api-key']).toBe('CG-pro');
  });

  it('switches to the demo host when CoinGecko says the key is a demo key', async () => {
    setConfig({ 'apiKeys.coingecko': 'CG-demo' }); // plan unset -> starts on pro
    const service = freshService();
    expect(clients[0].baseURL).toBe(PRO_HOST);

    clients[0].get.mockRejectedValue(wrongRootUrl('demo'));

    await expect(callGet(service)).resolves.toEqual(OK);
    expect(clients).toHaveLength(2);
    expect(clients[1].baseURL).toBe(DEMO_HOST);
    expect(clients[1].headers['x-cg-demo-api-key']).toBe('CG-demo');
  });

  it('raises anything that is not a host mismatch, rather than degrading to keyless', async () => {
    setConfig({ 'apiKeys.coingecko': 'CG-dead', 'apiKeys.coingeckoPlan': 'pro' });
    const service = freshService();

    const invalidKey = new (HttpClientError as any)('Request failed', {
      status: 401,
      data: { status: { error_code: 10002, error_message: 'API Key Missing.' } },
    });
    clients[0].get.mockRejectedValue(invalidKey);

    await expect(callGet(service)).rejects.toThrow('Request failed');
    expect(clients).toHaveLength(1); // no silent switch, no keyless retry
  });
});
