import sensible from '@fastify/sensible';
import { FastifyInstance } from 'fastify';

jest.mock('../../src/config/utils');
jest.mock('fs-extra');

import { updateDefaultWallet } from '../../src/config/utils';
import { setDefaultRoute } from '../../src/wallet/routes/setDefault';
import { MemoryFs } from '../helpers/memory-fs';
import { fastifyWithTypeProvider } from '../utils/testUtils';

const SOLANA_ADDRESS = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const DIR = './conf/wallets/solana';

describe('POST /setDefault', () => {
  let app: FastifyInstance;
  let memoryFs: MemoryFs;

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryFs = new MemoryFs();
    memoryFs.install();

    app = fastifyWithTypeProvider();
    await app.register(sensible);
    await app.register(setDefaultRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  const setDefault = () =>
    app.inject({ method: 'POST', url: '/setDefault', body: { chain: 'solana', address: SOLANA_ADDRESS } });

  it.each([
    ['a local (keystore) wallet', `${DIR}/${SOLANA_ADDRESS}.json`, 'encrypted-key'],
    // Regression: only the keystore file used to be checked, so a Ledger could never be the default.
    [
      'a hardware wallet with no keystore file',
      `${DIR}/hardware-wallets.json`,
      JSON.stringify({ wallets: [{ address: SOLANA_ADDRESS, derivationPath: "44'/501'/0'" }] }),
    ],
    ['an external wallet', `${DIR}/external-wallets.json`, JSON.stringify({ wallets: [{ address: SOLANA_ADDRESS }] })],
  ])('sets %s as default', async (_label, path, content) => {
    memoryFs.files.set(path, content);

    const response = await setDefault();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ chain: 'solana', address: SOLANA_ADDRESS });
    expect(updateDefaultWallet).toHaveBeenCalledWith(expect.anything(), 'solana', SOLANA_ADDRESS);
  });

  it('404s when no signer store lists the wallet', async () => {
    const response = await setDefault();

    expect(response.statusCode).toBe(404);
    expect(updateDefaultWallet).not.toHaveBeenCalled();
  });
});
