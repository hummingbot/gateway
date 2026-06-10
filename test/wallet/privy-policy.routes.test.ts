import sensible from '@fastify/sensible';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../src/wallet/privy/privy-service');

import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { getPrivyService } from '../../src/wallet/privy/privy-service';
import { createPrivyPolicyRoute } from '../../src/wallet/routes/createPrivyPolicy';
import { patch, unpatch } from '../services/patch';

const ETH_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const SOLANA_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const POLICY_ID = 'policy_xyz789';
const WALLET_ID = 'wallet_abc123';
const TEST_PASSPHRASE = 'test-passphrase';
const OWNER_ID = 'quorum_456';

describe('Privy Policy Route', () => {
  let app: FastifyInstance;
  let mockPrivyService: {
    isConfigured: jest.Mock;
    hasAuthorizationKey: jest.Mock;
    createPolicy: jest.Mock;
    attachPolicyToWallet: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    app = Fastify();
    await app.register(sensible);
    await app.register(createPrivyPolicyRoute);

    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => TEST_PASSPHRASE);

    mockPrivyService = {
      isConfigured: jest.fn().mockReturnValue(true),
      hasAuthorizationKey: jest.fn().mockReturnValue(true),
      createPolicy: jest.fn().mockImplementation(async (params) => ({
        id: POLICY_ID,
        name: params.name,
        chainType: params.chainType,
        ownerId: OWNER_ID,
      })),
      attachPolicyToWallet: jest.fn().mockResolvedValue(undefined),
    };
    (getPrivyService as jest.Mock).mockReturnValue(mockPrivyService);
  });

  afterEach(async () => {
    unpatch();
    await app.close();
  });

  it('rejects an invalid passphrase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: 'wrong-passphrase',
        chain: 'ethereum',
        name: 'Eth allowlist',
        allowedAddresses: [ETH_ADDRESS],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(mockPrivyService.createPolicy).not.toHaveBeenCalled();
  });

  it('creates an ethereum policy with an allowlist ALLOW rule and a catch-all DENY rule', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'ethereum',
        name: 'Eth allowlist',
        allowedAddresses: [ETH_ADDRESS],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.policyId).toBe(POLICY_ID);
    expect(body.name).toBe('Eth allowlist');
    expect(body.chain).toBe('ethereum');
    expect(body.ownerId).toBe(OWNER_ID);
    expect(body.attachedToWalletId).toBeUndefined();
    expect(body.warnings).toEqual([]);

    expect(mockPrivyService.createPolicy).toHaveBeenCalledWith({
      chainType: 'ethereum',
      name: 'Eth allowlist',
      rules: [
        {
          name: 'Allow transactions to allowlisted addresses',
          method: 'eth_signTransaction',
          action: 'ALLOW',
          conditions: [
            {
              field_source: 'ethereum_transaction',
              field: 'to',
              operator: 'in',
              value: [ETH_ADDRESS],
            },
          ],
        },
        {
          name: 'Deny everything else',
          method: '*',
          action: 'DENY',
          conditions: [],
        },
      ],
    });
    expect(mockPrivyService.attachPolicyToWallet).not.toHaveBeenCalled();
  });

  it('creates a solana policy with a program allowlist rule', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'solana',
        name: 'Sol allowlist',
        allowedAddresses: [SOLANA_PROGRAM_ID],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.policyId).toBe(POLICY_ID);
    expect(body.chain).toBe('solana');

    expect(mockPrivyService.createPolicy).toHaveBeenCalledWith({
      chainType: 'solana',
      name: 'Sol allowlist',
      rules: [
        {
          name: 'Allow transactions with allowlisted programs',
          method: 'signTransaction',
          action: 'ALLOW',
          conditions: [
            {
              field_source: 'solana_program_instruction',
              field: 'programId',
              operator: 'in',
              value: [SOLANA_PROGRAM_ID],
            },
          ],
        },
        {
          name: 'Deny everything else',
          method: '*',
          action: 'DENY',
          conditions: [],
        },
      ],
    });
  });

  it('attaches the policy to a wallet when attachToWalletId is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'solana',
        name: 'Sol allowlist',
        allowedAddresses: [SOLANA_PROGRAM_ID],
        attachToWalletId: WALLET_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.attachedToWalletId).toBe(WALLET_ID);
    expect(mockPrivyService.attachPolicyToWallet).toHaveBeenCalledWith(WALLET_ID, POLICY_ID);
  });

  it('returns 400 when attaching the policy to the wallet fails', async () => {
    mockPrivyService.attachPolicyToWallet.mockRejectedValue(new Error('Privy attachPolicyToWallet failed (HTTP 401)'));

    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'solana',
        name: 'Sol allowlist',
        allowedAddresses: [SOLANA_PROGRAM_ID],
        attachToWalletId: WALLET_ID,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('could not be attached');
    expect(body.message).toContain(POLICY_ID);
  });

  it('warns when no authorization key is configured', async () => {
    mockPrivyService.hasAuthorizationKey.mockReturnValue(false);
    mockPrivyService.createPolicy.mockResolvedValue({
      id: POLICY_ID,
      name: 'Eth allowlist',
      chainType: 'ethereum',
      ownerId: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'ethereum',
        name: 'Eth allowlist',
        allowedAddresses: [ETH_ADDRESS],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ownerId).toBeUndefined();
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toContain('No authorization key');
  });

  it('returns 400 when Privy credentials are not configured', async () => {
    mockPrivyService.isConfigured.mockReturnValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'ethereum',
        name: 'Eth allowlist',
        allowedAddresses: [ETH_ADDRESS],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('credentials not configured');
    expect(mockPrivyService.createPolicy).not.toHaveBeenCalled();
  });

  it('returns 400 when policy creation fails', async () => {
    mockPrivyService.createPolicy.mockRejectedValue(new Error('Privy createPolicy failed (HTTP 422)'));

    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: {
        passphrase: TEST_PASSPHRASE,
        chain: 'ethereum',
        name: 'Eth allowlist',
        allowedAddresses: [ETH_ADDRESS],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('Failed to create Privy policy');
  });

  it('rejects an empty allowedAddresses array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/privy-policy',
      payload: { passphrase: TEST_PASSPHRASE, chain: 'ethereum', name: 'Eth allowlist', allowedAddresses: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrivyService.createPolicy).not.toHaveBeenCalled();
  });
});
