import sensible from '@fastify/sensible';
import { FastifyInstance } from 'fastify';

jest.mock('../../src/wallet/utils');
jest.mock('../../src/config/utils');
jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/chains/ethereum/ethereum');
jest.mock('fs-extra');

import fsExtra from 'fs-extra';

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { updateDefaultWallet } from '../../src/config/utils';
import { setDefaultRoute } from '../../src/wallet/routes/setDefault';
import { validateChainName, getSafeWalletFilePath, isHardwareWallet } from '../../src/wallet/utils';
import { fastifyWithTypeProvider } from '../utils/testUtils';

const SOLANA_ADDRESS = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

describe('POST /setDefault', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    app = fastifyWithTypeProvider();
    await app.register(sensible);
    await app.register(setDefaultRoute);

    (validateChainName as jest.Mock).mockReturnValue(true);
    (getSafeWalletFilePath as jest.Mock).mockReturnValue('/wallets/solana/wallet.json');
    (Solana.validateAddress as jest.Mock).mockImplementation((address) => address);
    (Ethereum.validateAddress as jest.Mock).mockImplementation((address) => address);
    (updateDefaultWallet as jest.Mock).mockReturnValue(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets a local (keystore) wallet as default', async () => {
    (fsExtra.pathExists as unknown as jest.Mock).mockResolvedValue(true);
    (isHardwareWallet as jest.Mock).mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/setDefault',
      body: { chain: 'solana', address: SOLANA_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ chain: 'solana', address: SOLANA_ADDRESS });
    expect(updateDefaultWallet).toHaveBeenCalledWith(expect.anything(), 'solana', SOLANA_ADDRESS);
  });

  it('sets a hardware wallet as default even without a keystore file (regression)', async () => {
    // The pre-fix behavior only checked the keystore file, so a registered
    // Ledger wallet could never be made default.
    (fsExtra.pathExists as unknown as jest.Mock).mockResolvedValue(false);
    (isHardwareWallet as jest.Mock).mockResolvedValue(true);

    const response = await app.inject({
      method: 'POST',
      url: '/setDefault',
      body: { chain: 'solana', address: SOLANA_ADDRESS },
    });

    expect(response.statusCode).toBe(200);
    expect(isHardwareWallet).toHaveBeenCalledWith('solana', SOLANA_ADDRESS);
    expect(updateDefaultWallet).toHaveBeenCalledWith(expect.anything(), 'solana', SOLANA_ADDRESS);
  });

  it('404s when the wallet is in neither the keystore nor the hardware registry', async () => {
    (fsExtra.pathExists as unknown as jest.Mock).mockResolvedValue(false);
    (isHardwareWallet as jest.Mock).mockResolvedValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/setDefault',
      body: { chain: 'solana', address: SOLANA_ADDRESS },
    });

    expect(response.statusCode).toBe(404);
    expect(updateDefaultWallet).not.toHaveBeenCalled();
  });
});
