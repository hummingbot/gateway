/**
 * Wallet records and external wallets (#673, #682): existing wallet files load as the
 * signer they always were, an external wallet is added and listed with its signer,
 * and an execute request for it is refused with the route's build twin named.
 */
import sensible from '@fastify/sensible';
import { Keypair } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

jest.mock('fs-extra');
jest.mock('../../src/config/utils');

import { updateDefaultWallet } from '../../src/config/utils';
import { addExternalWalletRoute } from '../../src/wallet/routes/addExternalWallet';
import { getWalletsRoute } from '../../src/wallet/routes/getWallets';
import { removeWalletRoute } from '../../src/wallet/routes/removeWallet';
import {
  externalWalletRefusal,
  getEthereumSigner,
  getSolanaSigner,
  trackRequestRoute,
} from '../../src/wallet/signers/registry';
import { listWalletRecords } from '../../src/wallet/signers/wallet-store';
import { MemoryFs } from '../helpers/memory-fs';
import { fastifyWithTypeProvider } from '../utils/testUtils';

const LOCAL = Keypair.generate().publicKey.toBase58();
const LEDGER = Keypair.generate().publicKey.toBase58();
const EXTERNAL = Keypair.generate().publicKey.toBase58();
const EVM_LOCAL = '0x742d35CC6634C0532925a3b844Bc9e7595f2BdF8';
const SOL_DIR = './conf/wallets/solana';

describe('wallet records', () => {
  let memoryFs: MemoryFs;

  beforeEach(() => {
    memoryFs = new MemoryFs();
    memoryFs.install();
  });

  it('loads existing key files and hardware lists as local and hardware wallets, rewriting nothing', async () => {
    const hardwareFile = JSON.stringify({
      wallets: [{ address: LEDGER, publicKey: LEDGER, derivationPath: "44'/501'/0'", addedAt: '2026-01-01' }],
    });
    memoryFs.files.set(`${SOL_DIR}/${LOCAL}.json`, '{"encrypted":"key"}');
    memoryFs.files.set(`${SOL_DIR}/hardware-wallets.json`, hardwareFile);
    memoryFs.files.set(`./conf/wallets/ethereum/${EVM_LOCAL}.json`, '{"crypto":{}}');
    const before = new Map(memoryFs.files);

    expect(await listWalletRecords('solana')).toEqual([
      { chain: 'solana', address: LOCAL, signer: 'local' },
      {
        chain: 'solana',
        address: LEDGER,
        signer: 'hardware',
        derivationPath: "44'/501'/0'",
        addedAt: '2026-01-01',
        privyWalletId: undefined,
      },
    ]);
    expect((await getSolanaSigner(LEDGER)).kind).toBe('hardware');
    expect((await getEthereumSigner(EVM_LOCAL.toLowerCase())).kind).toBe('local');
    expect(memoryFs.files).toEqual(before);
  });

  it('refuses to pick a signer for an address two stores list', async () => {
    memoryFs.files.set(`${SOL_DIR}/${LOCAL}.json`, '{"encrypted":"key"}');
    memoryFs.files.set(`${SOL_DIR}/external-wallets.json`, JSON.stringify({ wallets: [{ address: LOCAL }] }));

    await expect(getSolanaSigner(LOCAL)).rejects.toThrow(/listed by more than one signer store/);
  });

  it('answers an unknown address with a 404 that says how to add it', async () => {
    await expect(getSolanaSigner(LOCAL)).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('POST /wallet/add-external'),
    });
  });
});

describe('external wallet routes', () => {
  let app: FastifyInstance;
  let memoryFs: MemoryFs;

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryFs = new MemoryFs();
    memoryFs.install();
    app = fastifyWithTypeProvider();
    await app.register(sensible);
    await app.register(addExternalWalletRoute);
    await app.register(getWalletsRoute);
    await app.register(removeWalletRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  const addExternal = (address: string, setDefault?: boolean) =>
    app.inject({ method: 'POST', url: '/add-external', body: { chain: 'solana', address, setDefault } });

  it('adds an address-only wallet that GET /wallet lists with its signer', async () => {
    memoryFs.files.set(`${SOL_DIR}/${LOCAL}.json`, '{"encrypted":"key"}');

    const added = await addExternal(EXTERNAL, true);
    expect(added.statusCode).toBe(200);
    expect(added.json()).toEqual({ address: EXTERNAL, signer: 'external' });
    expect(updateDefaultWallet).toHaveBeenCalledWith(expect.anything(), 'solana', EXTERNAL);

    const solana = (await app.inject({ method: 'GET', url: '/' })).json().find((w: any) => w.chain === 'solana');
    expect(solana.wallets).toEqual([
      { address: LOCAL, signer: 'local' },
      { address: EXTERNAL, signer: 'external' },
    ]);
    // walletAddresses keeps meaning "wallets with a key in Gateway".
    expect(solana.walletAddresses).toEqual([LOCAL]);
    expect((await getSolanaSigner(EXTERNAL)).kind).toBe('external');
  });

  it('refuses an address that already has a key in Gateway', async () => {
    memoryFs.files.set(`${SOL_DIR}/${LOCAL}.json`, '{"encrypted":"key"}');

    const response = await addExternal(LOCAL);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/already registered as a local wallet/);
    expect(memoryFs.listStore('solana', 'external-wallets.json')).toEqual([]);
  });

  it('refuses an address that is not one', async () => {
    expect((await addExternal('not-an-address')).statusCode).toBe(400);
  });

  it('removes an external wallet from its list', async () => {
    await addExternal(EXTERNAL);

    const response = await app.inject({
      method: 'DELETE',
      url: '/remove',
      body: { chain: 'solana', address: EXTERNAL },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe(`External wallet ${EXTERNAL} removed successfully`);
    expect(memoryFs.listStore('solana', 'external-wallets.json')).toEqual([]);
  });
});

describe('the refusal of an execute request for an external wallet', () => {
  // The refusal is thrown deep in the chokepoint, after the handler has awaited quotes
  // and RPC calls; it still knows which route it is in.
  const appWithRoute = async (url: string) => {
    const app = fastifyWithTypeProvider();
    await app.register(sensible);
    trackRequestRoute(app);
    app.post(url, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      throw externalWalletRefusal('solana', EXTERNAL, 'Gateway holds no key for an external wallet');
    });
    return app;
  };

  it("names the route's build twin and the submit route", async () => {
    const app = await appWithRoute('/trading/router/execute-swap');

    const response = await app.inject({ method: 'POST', url: '/trading/router/execute-swap', body: { a: 1 } });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(
      'Use POST /trading/router/build-swap to build the unsigned transaction, sign it with the wallet',
    );
    expect(response.json().message).toContain('POST /chains/solana/submit');
    await app.close();
  });

  it('says so when no build route serves the operation on the chain yet', async () => {
    const app = await appWithRoute('/trading/launch/claim-creator-fees');

    const response = await app.inject({ method: 'POST', url: '/trading/launch/claim-creator-fees', body: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/No build route serves this operation on solana yet/);
    await app.close();
  });
});
