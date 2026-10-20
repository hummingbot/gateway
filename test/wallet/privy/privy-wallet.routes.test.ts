import sensible from '@fastify/sensible';
import { Keypair } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

jest.mock('fs-extra');
jest.mock('../../../src/config/utils');

import { updateDefaultWallet } from '../../../src/config/utils';
import { getWalletsRoute } from '../../../src/wallet/routes/getWallets';
import { privyWalletsRoute } from '../../../src/wallet/routes/privyWallets';
import { removeWalletRoute } from '../../../src/wallet/routes/removeWallet';
import { getSolanaSigner } from '../../../src/wallet/signers/registry';
import { MemoryFs } from '../../helpers/memory-fs';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

import { clearPrivyEnv, setPrivyEnv, stubPrivyHttp } from './privy-http-stub';

const WALLET_ID = 'ckwalletid0000000000000a';
const ADDRESS = Keypair.generate().publicKey.toBase58();
const SOL_DIR = './conf/wallets/solana';

const privyWallet = (overrides: object = {}) => ({
  id: WALLET_ID,
  address: ADDRESS,
  chain_type: 'solana',
  owner_id: 'owner',
  policy_ids: [],
  ...overrides,
});

describe('Privy wallet routes', () => {
  let app: FastifyInstance;
  let memoryFs: MemoryFs;

  beforeEach(async () => {
    jest.clearAllMocks();
    setPrivyEnv();
    memoryFs = new MemoryFs();
    memoryFs.install();
    app = fastifyWithTypeProvider();
    await app.register(sensible);
    await app.register(privyWalletsRoute);
    await app.register(getWalletsRoute);
    await app.register(removeWalletRoute);
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
    clearPrivyEnv();
  });

  const addPrivy = (privyWalletId: string, setDefault?: boolean) =>
    app.inject({ method: 'POST', url: '/add-privy', body: { chain: 'solana', privyWalletId, setDefault } });

  it('adds a wallet Privy confirms; it is listed, signs with the privy backend, and can be removed', async () => {
    const requests = stubPrivyHttp({ [`GET /v1/wallets/${WALLET_ID}`]: () => ({ status: 200, body: privyWallet() }) });

    const added = await addPrivy(WALLET_ID, true);

    expect(added.statusCode).toBe(200);
    expect(added.json()).toEqual({ address: ADDRESS, privyWalletId: WALLET_ID, signer: 'privy' });
    expect(requests).toHaveLength(1);
    expect(updateDefaultWallet).toHaveBeenCalledWith(expect.anything(), 'solana', ADDRESS);
    expect(JSON.parse(memoryFs.files.get(`${SOL_DIR}/privy-wallets.json`)).wallets).toEqual([
      { address: ADDRESS, privyWalletId: WALLET_ID, addedAt: expect.any(String) },
    ]);
    // No Privy secret is written to the wallet store.
    expect([...memoryFs.files.values()].join()).not.toMatch(/test-app-secret|wallet-auth/);

    const solana = (await app.inject({ method: 'GET', url: '/' })).json().find((w: any) => w.chain === 'solana');
    expect(solana.wallets).toEqual([{ address: ADDRESS, signer: 'privy' }]);
    expect((await getSolanaSigner(ADDRESS)).kind).toBe('privy');

    const removed = await app.inject({ method: 'DELETE', url: '/remove', body: { chain: 'solana', address: ADDRESS } });
    expect(removed.statusCode).toBe(200);
    expect(memoryFs.listStore('solana', 'privy-wallets.json')).toEqual([]);
  });

  it('refuses a Privy wallet of another chain', async () => {
    stubPrivyHttp({
      [`GET /v1/wallets/${WALLET_ID}`]: () => ({
        status: 200,
        body: privyWallet({ chain_type: 'ethereum', address: '0x000000000000000000000000000000000000dEaD' }),
      }),
    });

    const response = await addPrivy(WALLET_ID);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/is a ethereum wallet, not solana/);
  });

  it('returns 404 when Privy does not know the wallet id', async () => {
    stubPrivyHttp({ [`GET /v1/wallets/${WALLET_ID}`]: () => ({ status: 404, body: { error: 'Wallet not found' } }) });

    expect((await addPrivy(WALLET_ID)).statusCode).toBe(404);
  });

  it('rejects a malformed wallet id without calling Privy', async () => {
    const requests = stubPrivyHttp({});

    expect((await addPrivy('../../v1/apps/x')).statusCode).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it('refuses an address that already has a key in Gateway', async () => {
    memoryFs.files.set(`${SOL_DIR}/${ADDRESS}.json`, '{"encrypted":"key"}');
    stubPrivyHttp({ [`GET /v1/wallets/${WALLET_ID}`]: () => ({ status: 200, body: privyWallet() }) });

    const response = await addPrivy(WALLET_ID);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/already registered as a local wallet/);
  });

  it('creates a Privy wallet and adds it', async () => {
    const requests = stubPrivyHttp({ 'POST /v1/wallets': () => ({ status: 200, body: privyWallet() }) });

    const response = await app.inject({ method: 'POST', url: '/create-privy', body: { chain: 'solana' } });

    expect(response.statusCode).toBe(200);
    expect(requests[0].body.chain_type).toBe('solana');
    expect(JSON.parse(memoryFs.files.get(`${SOL_DIR}/privy-wallets.json`)).wallets[0].privyWalletId).toBe(WALLET_ID);
  });
});
