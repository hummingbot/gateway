import { KeyObject } from 'crypto';

import {
  createPrivyWallet,
  getPrivyWallet,
  privySignEthereumTransaction,
  privySignSolanaTransaction,
  PrivyError,
} from '../../../src/wallet/privy/privy-client';

import {
  clearPrivyEnv,
  hasValidAuthorizationSignature,
  setPrivyEnv,
  stubPrivyHttp,
  TEST_APP_ID,
  TEST_APP_SECRET,
} from './privy-http-stub';

const WALLET_ID = 'ckwalletid0000000000000a';

describe('Privy client', () => {
  let publicKey: KeyObject;

  beforeEach(() => {
    ({ publicKey } = setPrivyEnv());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearPrivyEnv();
  });

  it('signs a Solana transaction with app credentials and an authorization signature', async () => {
    const requests = stubPrivyHttp({
      [`POST /v1/wallets/${WALLET_ID}/rpc`]: () => ({
        status: 200,
        body: { method: 'signTransaction', data: { signed_transaction: 'U0lHTkVE', encoding: 'base64' } },
      }),
    });

    await expect(privySignSolanaTransaction(WALLET_ID, 'VU5TSUdORUQ=')).resolves.toBe('U0lHTkVE');

    const [req] = requests;
    expect(req.body).toEqual({
      method: 'signTransaction',
      chain_type: 'solana',
      params: { transaction: 'VU5TSUdORUQ=', encoding: 'base64' },
    });
    expect(req.headers['privy-app-id']).toBe(TEST_APP_ID);
    expect(req.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${TEST_APP_ID}:${TEST_APP_SECRET}`).toString('base64')}`,
    );
    expect(hasValidAuthorizationSignature(req, publicKey)).toBe(true);
  });

  it('sends the populated Ethereum transaction as eth_signTransaction', async () => {
    const requests = stubPrivyHttp({
      [`POST /v1/wallets/${WALLET_ID}/rpc`]: () => ({
        status: 200,
        body: { method: 'eth_signTransaction', data: { signed_transaction: '0xf86c', encoding: 'rlp' } },
      }),
    });
    const tx = {
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      chain_id: '0x89',
      nonce: '0x7',
      data: '0x',
      value: '0x0',
      gas_limit: '0x5208',
      type: 2 as const,
      max_fee_per_gas: '0x3b9aca00',
      max_priority_fee_per_gas: '0x1',
    };

    await expect(privySignEthereumTransaction(WALLET_ID, tx)).resolves.toBe('0xf86c');
    expect(requests[0].body).toEqual({
      method: 'eth_signTransaction',
      chain_type: 'ethereum',
      params: { transaction: tx },
    });
    expect(hasValidAuthorizationSignature(requests[0], publicKey)).toBe(true);
  });

  it('creates a wallet owned by the authorization key', async () => {
    const requests = stubPrivyHttp({
      'POST /v1/wallets': () => ({
        status: 200,
        body: { id: WALLET_ID, address: 'addr', chain_type: 'solana', owner_id: 'owner', policy_ids: [] },
      }),
    });

    const wallet = await createPrivyWallet('solana');

    expect(wallet.id).toBe(WALLET_ID);
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    expect(requests[0].body).toEqual({ chain_type: 'solana', owner: { public_key: spki } });
  });

  it.each([
    ['../v1/apps', 'path traversal'],
    ['https://evil.example', 'a URL'],
    ['ABCDEFGHIJKLMNOPQRSTUVWX', 'uppercase'],
    ['short', 'too short'],
  ])('rejects wallet id %s (%s) before any request', async (walletId) => {
    const requests = stubPrivyHttp({});
    await expect(getPrivyWallet(walletId)).rejects.toMatchObject({ statusCode: 400 });
    expect(requests).toHaveLength(0);
  });

  it.each([
    [400, { error: 'Transaction violates policy', code: 'policy_violation' }, 403, /violates a policy/],
    [401, { error: 'Missing `privy-authorization-signature` header' }, 403, /PRIVY_AUTHORIZATION_KEY/],
    [401, { error: 'Invalid app ID or app secret' }, 503, /PRIVY_APP_ID and PRIVY_APP_SECRET/],
    [404, { error: 'Wallet not found' }, 404, /not found/],
    [429, { error: 'Too many requests' }, 429, /rate limit/],
    [400, { error: 'Invalid transaction: 0xdeadbeef trace-123', code: 'invalid_data' }, 400, /HTTP 400, invalid_data/],
    [500, { error: 'internal trace-123' }, 502, /HTTP 500/],
  ])('maps Privy HTTP %i %j to Gateway %i', async (status, body, gatewayStatus, message) => {
    stubPrivyHttp({ [`POST /v1/wallets/${WALLET_ID}/rpc`]: () => ({ status, body }) });

    const error: PrivyError = await privySignSolanaTransaction(WALLET_ID, 'AA==').catch((e) => e);

    expect(error).toBeInstanceOf(PrivyError);
    expect(error.statusCode).toBe(gatewayStatus);
    expect(error.message).toMatch(message);
    // Privy's own error text (trace ids, payload fragments) is never returned to the caller.
    expect(error.message).not.toContain('trace-123');
  });

  it('fails clearly when the credentials are not in the environment', async () => {
    clearPrivyEnv();
    const requests = stubPrivyHttp({});
    await expect(getPrivyWallet(WALLET_ID)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/PRIVY_APP_ID and PRIVY_APP_SECRET/),
    });
    expect(requests).toHaveLength(0);
  });
});
