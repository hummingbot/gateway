import sensible from '@fastify/sensible';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../src/wallet/privy/privy-service');
jest.mock('../../src/wallet/utils');
jest.mock('../../src/chains/solana/solana');
jest.mock('../../src/chains/ethereum/ethereum');
jest.mock('../../src/config/utils');

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { getPrivyService } from '../../src/wallet/privy/privy-service';
import { addPrivyWalletRoute } from '../../src/wallet/routes/addPrivyWallet';
import { removePrivyWalletRoute } from '../../src/wallet/routes/removePrivyWallet';
import { getPrivyWallets, savePrivyWallets, validateChainName } from '../../src/wallet/utils';

const SOLANA_ADDRESS = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const WALLET_ID = 'wallet_abc123';

describe('Privy Wallet Routes', () => {
  let app: FastifyInstance;
  let mockPrivyService: {
    isConfigured: jest.Mock;
    getWalletInfo: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    app = Fastify();
    await app.register(sensible);
    await app.register(addPrivyWalletRoute);
    await app.register(removePrivyWalletRoute);

    mockPrivyService = {
      isConfigured: jest.fn().mockReturnValue(true),
      getWalletInfo: jest.fn().mockResolvedValue({
        id: WALLET_ID,
        address: SOLANA_ADDRESS,
        chainType: 'solana',
        policyIds: ['policy_123'],
        ownerId: 'quorum_456',
      }),
    };
    (getPrivyService as jest.Mock).mockReturnValue(mockPrivyService);

    (getPrivyWallets as jest.Mock).mockResolvedValue([]);
    (savePrivyWallets as jest.Mock).mockResolvedValue(undefined);
    (validateChainName as jest.Mock).mockReturnValue(true);
    (Solana.validateAddress as jest.Mock).mockImplementation((address) => address);
    (Ethereum.validateAddress as jest.Mock).mockImplementation((address) => address);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /add-privy', () => {
    it('registers a wallet with a policy and owner without warnings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'solana', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe(SOLANA_ADDRESS);
      expect(body.privyWalletId).toBe(WALLET_ID);
      expect(body.policyIds).toEqual(['policy_123']);
      expect(body.hasOwner).toBe(true);
      expect(body.warnings).toEqual([]);
      expect(savePrivyWallets).toHaveBeenCalledWith(
        'solana',
        expect.arrayContaining([expect.objectContaining({ address: SOLANA_ADDRESS, privyWalletId: WALLET_ID })]),
      );
    });

    it('warns when the wallet has no policy and no owner', async () => {
      mockPrivyService.getWalletInfo.mockResolvedValue({
        id: WALLET_ID,
        address: SOLANA_ADDRESS,
        chainType: 'solana',
        policyIds: [],
        ownerId: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'solana', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hasOwner).toBe(false);
      expect(body.policyIds).toEqual([]);
      expect(body.warnings).toHaveLength(2);
      expect(body.warnings[0]).toContain('No policy');
      expect(body.warnings[1]).toContain('No owner');
    });

    it('rejects when Privy credentials are not configured', async () => {
      mockPrivyService.isConfigured.mockReturnValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'solana', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('credentials not configured');
    });

    it('rejects a chain type mismatch', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'ethereum', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('chain type mismatch');
    });

    it('rejects an already registered wallet', async () => {
      (getPrivyWallets as jest.Mock).mockResolvedValue([
        { address: SOLANA_ADDRESS, privyWalletId: WALLET_ID, addedAt: new Date().toISOString() },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'solana', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('already registered');
    });

    it('rejects when the wallet cannot be fetched from Privy', async () => {
      mockPrivyService.getWalletInfo.mockRejectedValue(new Error('Privy getWalletInfo failed (HTTP 404)'));

      const response = await app.inject({
        method: 'POST',
        url: '/add-privy',
        payload: { chain: 'solana', privyWalletId: WALLET_ID },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('Failed to fetch Privy wallet');
    });
  });

  describe('DELETE /remove-privy', () => {
    it('removes a registered wallet', async () => {
      (getPrivyWallets as jest.Mock).mockResolvedValue([
        { address: SOLANA_ADDRESS, privyWalletId: WALLET_ID, addedAt: new Date().toISOString() },
      ]);

      const response = await app.inject({
        method: 'DELETE',
        url: '/remove-privy',
        payload: { chain: 'solana', address: SOLANA_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      expect(savePrivyWallets).toHaveBeenCalledWith('solana', []);
    });

    it('returns 404 for an unknown wallet', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/remove-privy',
        payload: { chain: 'solana', address: SOLANA_ADDRESS },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
