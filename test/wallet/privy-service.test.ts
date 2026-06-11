const mockSolanaSignTransaction = jest.fn();

jest.mock('@privy-io/node', () => ({
  PrivyClient: jest.fn().mockImplementation(() => ({
    wallets: () => ({
      solana: () => ({ signTransaction: mockSolanaSignTransaction }),
    }),
  })),
}));

import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import { PrivyService } from '../../src/wallet/privy/privy-service';
import { patch, unpatch } from '../services/patch';

const WALLET_ID = 'wallet_abc123';
const TX_B64 = 'dGVzdA==';

describe('PrivyService error handling', () => {
  let service: PrivyService;

  beforeEach(() => {
    jest.clearAllMocks();
    // App ID comes from config; the app secret is read from the environment.
    patch(ConfigManagerV2.getInstance(), 'get', (key: string) => (key === 'apiKeys.privyAppId' ? 'test-app-id' : ''));
    process.env.GATEWAY_PRIVY_APP_SECRET = 'test-app-secret';
    service = new PrivyService();
  });

  afterEach(() => {
    unpatch();
    delete process.env.GATEWAY_PRIVY_APP_SECRET;
  });

  it('maps policy_violation errors to a clear policy denial message', async () => {
    // Verified live shape: HTTP 400, body {"error": "...", "code": "policy_violation"}
    mockSolanaSignTransaction.mockRejectedValue(
      Object.assign(new Error('400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}'), {
        status: 400,
        error: { error: 'RPC request denied due to policy violation', code: 'policy_violation' },
      }),
    );

    await expect(service.signSolanaTransaction(WALLET_ID, TX_B64)).rejects.toThrow(
      'Privy signSolanaTransaction denied by wallet policy',
    );
  });

  it('maps missing authorization signature errors to a clear owner-key message', async () => {
    // Verified live shape: HTTP 401, body {"error": "Missing `privy-authorization-signature` header ..."}
    mockSolanaSignTransaction.mockRejectedValue(
      Object.assign(new Error('401'), {
        status: 401,
        error: { error: 'Missing `privy-authorization-signature` header or no signatures provided.' },
      }),
    );

    await expect(service.signSolanaTransaction(WALLET_ID, TX_B64)).rejects.toThrow(
      'requires an authorization key signature',
    );
  });

  it('sanitizes other errors to a generic message with the HTTP status', async () => {
    mockSolanaSignTransaction.mockRejectedValue(
      Object.assign(new Error('500 internal detail with wallet address 0xabc'), {
        status: 500,
        error: { error: 'internal detail with wallet address 0xabc' },
      }),
    );

    await expect(service.signSolanaTransaction(WALLET_ID, TX_B64)).rejects.toThrow(
      'Privy signSolanaTransaction failed (HTTP 500)',
    );
    await expect(service.signSolanaTransaction(WALLET_ID, TX_B64)).rejects.not.toThrow('0xabc');
  });
});
