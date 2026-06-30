/**
 * Route tests for /wallet/add-swig and /wallet/remove-swig: the passphrase gate, the
 * on-chain delegate-role verification, and the registry mutations. The chain + SDK seams
 * are mocked; these tests prove the route's validation and error mapping, not signing.
 */

import sensible from '@fastify/sensible';
import { Keypair, PublicKey } from '@solana/web3.js';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../src/services/config-manager-cert-passphrase');
jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/wallet/swig');
jest.mock('../../src/wallet/utils');
jest.mock('../../src/config/utils');

import { Solana } from '../../src/chains/solana/solana';
import { updateDefaultWallet } from '../../src/config/utils';
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { addSwigWalletRoute } from '../../src/wallet/routes/addSwigWallet';
import { removeSwigWalletRoute } from '../../src/wallet/routes/removeSwigWallet';
import { getSwigService } from '../../src/wallet/swig';
import { getSwigWallets, saveSwigWallets, getAllWalletAddressesForChain } from '../../src/wallet/utils';

const PASSPHRASE = 'correct-horse';
const ACCOUNT = Keypair.generate().publicKey.toBase58();
const OWNER = Keypair.generate().publicKey.toBase58();
const DELEGATE = Keypair.generate().publicKey.toBase58();
const WALLET = Keypair.generate().publicKey.toBase58();
const SWIG_ID = 'aZ9wq3K3v3kY3Jp1d2c4e5f6g7h8j9k1m2n3p4q5r6s7';

describe('Swig wallet routes', () => {
  let app: FastifyInstance;
  let requireRole: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = Fastify();
    await app.register(sensible);
    await app.register(addSwigWalletRoute);
    await app.register(removeSwigWalletRoute);

    (ConfigManagerCertPassphrase.readPassphrase as jest.Mock).mockReturnValue(PASSPHRASE);
    (Solana.getInstance as jest.Mock).mockResolvedValue({ connection: {} });
    (Solana.validateAddress as jest.Mock).mockImplementation((a: string) => a);

    // Default: a Swig whose delegate + owner roles both resolve, and a known funds-owner.
    requireRole = jest.fn();
    (getSwigService as jest.Mock).mockReturnValue({
      fetchSwig: jest.fn().mockResolvedValue({ id: 'swig' }),
      requireRole,
      getWalletAddress: jest.fn().mockResolvedValue(new PublicKey(WALLET)),
    });

    (getSwigWallets as jest.Mock).mockResolvedValue([]);
    (saveSwigWallets as jest.Mock).mockResolvedValue(undefined);
    (getAllWalletAddressesForChain as jest.Mock).mockResolvedValue([DELEGATE]);
    (updateDefaultWallet as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  const addBody = (overrides: Record<string, unknown> = {}) => ({
    network: 'mainnet-beta',
    accountAddress: ACCOUNT,
    ownerAddress: OWNER,
    delegateAddress: DELEGATE,
    id: SWIG_ID,
    passphrase: PASSPHRASE,
    ...overrides,
  });

  describe('POST /add-swig', () => {
    it('registers a Swig wallet whose delegate role exists on-chain', async () => {
      const res = await app.inject({ method: 'POST', url: '/add-swig', body: addBody() });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.address).toBe(WALLET);
      expect(body.delegateAddress).toBe(DELEGATE);
      expect(saveSwigWallets).toHaveBeenCalledTimes(1);
      const [, saved] = (saveSwigWallets as jest.Mock).mock.calls[0];
      expect(saved[0]).toMatchObject({ address: WALLET, accountAddress: ACCOUNT, delegateSigner: 'local' });
    });

    it('rejects a wrong passphrase with 401 and never touches the chain', async () => {
      const res = await app.inject({ method: 'POST', url: '/add-swig', body: addBody({ passphrase: 'nope' }) });

      expect(res.statusCode).toBe(401);
      expect(Solana.getInstance).not.toHaveBeenCalled();
      expect(saveSwigWallets).not.toHaveBeenCalled();
    });

    it('rejects with 400 when the delegate role is missing on-chain', async () => {
      requireRole.mockImplementation((_swig: unknown, _pk: unknown, label: string) => {
        if (label === 'delegate') throw new Error('No delegate role found on Swig for signer X');
        return { id: 0 };
      });

      const res = await app.inject({ method: 'POST', url: '/add-swig', body: addBody() });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/No delegate role found/);
      expect(saveSwigWallets).not.toHaveBeenCalled();
    });

    it('rejects duplicate registration with 400', async () => {
      (getSwigWallets as jest.Mock).mockResolvedValue([{ address: WALLET }]);

      const res = await app.inject({ method: 'POST', url: '/add-swig', body: addBody() });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/already registered/);
    });
  });

  describe('DELETE /remove-swig', () => {
    it('removes a registered Swig wallet', async () => {
      (getSwigWallets as jest.Mock).mockResolvedValue([{ address: WALLET }, { address: OWNER }]);

      const res = await app.inject({
        method: 'DELETE',
        url: '/remove-swig',
        body: { address: WALLET, passphrase: PASSPHRASE },
      });

      expect(res.statusCode).toBe(200);
      expect(saveSwigWallets).toHaveBeenCalledTimes(1);
      const [, saved] = (saveSwigWallets as jest.Mock).mock.calls[0];
      expect(saved).toEqual([{ address: OWNER }]);
    });

    it('rejects a wrong passphrase with 401', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/remove-swig',
        body: { address: WALLET, passphrase: 'nope' },
      });

      expect(res.statusCode).toBe(401);
      expect(saveSwigWallets).not.toHaveBeenCalled();
    });

    it('returns 404 when the wallet is not registered', async () => {
      (getSwigWallets as jest.Mock).mockResolvedValue([{ address: OWNER }]);

      const res = await app.inject({
        method: 'DELETE',
        url: '/remove-swig',
        body: { address: WALLET, passphrase: PASSPHRASE },
      });

      expect(res.statusCode).toBe(404);
      expect(saveSwigWallets).not.toHaveBeenCalled();
    });
  });
});
