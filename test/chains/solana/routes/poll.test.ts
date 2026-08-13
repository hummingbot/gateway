// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { pollSolanaTransaction } from '../../../../src/chains/solana/routes/poll';
import { Solana } from '../../../../src/chains/solana/solana';
import { TransactionStatusCode } from '../../../../src/schemas/chain-schema';

// Mock the Solana class
jest.mock('../../../../src/chains/solana/solana', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana'),
  Solana: {
    getInstance: jest.fn(),
  },
}));

const mockSolana = Solana as jest.Mocked<typeof Solana>;

// 88-char base58-ish signature that passes the route's format validation
const VALID_SIGNATURE = '5'.repeat(88);

describe('pollSolanaTransaction', () => {
  const mockSolanaInstance = {
    getCurrentBlockNumber: jest.fn(),
    getTransaction: jest.fn(),
    getTransactionStatusCode: jest.fn(),
    getSignatureStatus: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSolana.getInstance.mockResolvedValue(mockSolanaInstance as any);
    mockSolanaInstance.getCurrentBlockNumber.mockResolvedValue(365795000);
  });

  it('returns CONFIRMED with fee when the transaction landed without error', async () => {
    mockSolanaInstance.getTransaction.mockResolvedValue({
      slot: 365794000,
      meta: { fee: 5000, err: null },
    });
    mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(TransactionStatusCode.CONFIRMED);

    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

    expect(result.txStatus).toBe(TransactionStatusCode.CONFIRMED);
    expect(result.txBlock).toBe(365794000);
    expect(result.fee).toBe(5000 / 1e9);
    expect(result.error).toBeNull();
  });

  it('attributes a failed transaction to the program named in the logs', async () => {
    // meta.err carries the code but no program; without the logs the parser cannot
    // reach the program's error table and every custom code reports UNKNOWN.
    mockSolanaInstance.getTransaction.mockResolvedValue({
      slot: 365794000,
      meta: {
        fee: 5000,
        err: { InstructionError: [0, { Custom: 6018 }] },
        logMessages: [
          'Program ComputeBudget111111111111111111111111111111 invoke [1]',
          'Program ComputeBudget111111111111111111111111111111 success',
          'Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc invoke [1]',
          'Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x1782',
        ],
      },
    });
    mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(TransactionStatusCode.FAILED);

    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

    expect(result.txStatus).toBe(TransactionStatusCode.FAILED);
    expect(result.error).toContain('SLIPPAGE_EXCEEDED');
    expect(result.error).not.toContain('UNKNOWN');
  });

  describe('null txData (not visible at confirmed commitment)', () => {
    beforeEach(() => {
      mockSolanaInstance.getTransaction.mockResolvedValue(null);
    });

    it('returns UNCONFIRMED when the cluster has seen the signature', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionStatusCode.PENDING);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(mockSolanaInstance.getSignatureStatus).toHaveBeenCalledWith(VALID_SIGNATURE);
      expect(result.txStatus).toBe(TransactionStatusCode.PENDING);
      expect(result.error).toBeNull();
    });

    it('returns NOT_FOUND when the signature is unknown to the cluster', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionStatusCode.NOT_FOUND);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(result.txStatus).toBe(TransactionStatusCode.NOT_FOUND);
      expect(result.error).toBeNull();
    });

    it('returns FAILED when the signature status carries an error', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionStatusCode.FAILED);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(result.txStatus).toBe(TransactionStatusCode.FAILED);
    });
  });

  it('returns NOT_FOUND for a malformed signature, which can never resolve', async () => {
    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', 'not-a-signature');

    expect(result.txStatus).toBe(TransactionStatusCode.NOT_FOUND);
    expect(result.error).toContain('INVALID_INPUT');
    expect(mockSolanaInstance.getTransaction).not.toHaveBeenCalled();
  });

  it('returns UNCONFIRMED (not NOT_FOUND) on a transient RPC error so callers keep polling', async () => {
    mockSolanaInstance.getTransaction.mockRejectedValue(new Error('RPC unavailable'));

    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

    expect(result.txStatus).toBe(TransactionStatusCode.PENDING);
    expect(result.error).toContain('RPC unavailable');
  });
});

describe('Solana.getSignatureStatus', () => {
  const { Solana: RealSolana } = jest.requireActual('../../../../src/chains/solana/solana');

  const makeInstance = (statusValue: any) => {
    const instance = Object.create(RealSolana.prototype);
    instance.connection = {
      getSignatureStatuses: jest.fn().mockResolvedValue({ value: [statusValue] }),
    };
    return instance;
  };

  it('maps a null status to NOT_FOUND', async () => {
    const instance = makeInstance(null);
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionStatusCode.NOT_FOUND);
    expect(instance.connection.getSignatureStatuses).toHaveBeenCalledWith([VALID_SIGNATURE], {
      searchTransactionHistory: true,
    });
  });

  it('maps a status with err to FAILED', async () => {
    const instance = makeInstance({
      err: { InstructionError: [2, { Custom: 6018 }] },
      confirmationStatus: 'confirmed',
    });
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionStatusCode.FAILED);
  });

  it('maps a processed (seen but unconfirmed) status to UNCONFIRMED', async () => {
    const instance = makeInstance({ err: null, confirmationStatus: 'processed' });
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionStatusCode.PENDING);
  });
});
