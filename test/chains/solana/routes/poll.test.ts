// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { pollSolanaTransaction } from '../../../../src/chains/solana/routes/poll';
import { Solana, TransactionResponseStatusCode } from '../../../../src/chains/solana/solana';

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
    mockSolanaInstance.getTransactionStatusCode.mockResolvedValue(TransactionResponseStatusCode.CONFIRMED);

    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

    expect(result.txStatus).toBe(TransactionResponseStatusCode.CONFIRMED);
    expect(result.txBlock).toBe(365794000);
    expect(result.fee).toBe(5000 / 1e9);
    expect(result.error).toBeNull();
  });

  describe('null txData (not visible at confirmed commitment)', () => {
    beforeEach(() => {
      mockSolanaInstance.getTransaction.mockResolvedValue(null);
    });

    it('returns UNCONFIRMED when the cluster has seen the signature', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionResponseStatusCode.UNCONFIRMED);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(mockSolanaInstance.getSignatureStatus).toHaveBeenCalledWith(VALID_SIGNATURE);
      expect(result.txStatus).toBe(TransactionResponseStatusCode.UNCONFIRMED);
      expect(result.error).toBeNull();
    });

    it('returns NOT_FOUND when the signature is unknown to the cluster', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionResponseStatusCode.NOT_FOUND);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(result.txStatus).toBe(TransactionResponseStatusCode.NOT_FOUND);
      expect(result.error).toBeNull();
    });

    it('returns FAILED when the signature status carries an error', async () => {
      mockSolanaInstance.getSignatureStatus.mockResolvedValue(TransactionResponseStatusCode.FAILED);

      const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

      expect(result.txStatus).toBe(TransactionResponseStatusCode.FAILED);
    });
  });

  it('returns NOT_FOUND for a malformed signature, which can never resolve', async () => {
    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', 'not-a-signature');

    expect(result.txStatus).toBe(TransactionResponseStatusCode.NOT_FOUND);
    expect(result.error).toContain('INVALID_INPUT');
    expect(mockSolanaInstance.getTransaction).not.toHaveBeenCalled();
  });

  it('returns UNCONFIRMED (not NOT_FOUND) on a transient RPC error so callers keep polling', async () => {
    mockSolanaInstance.getTransaction.mockRejectedValue(new Error('RPC unavailable'));

    const result = await pollSolanaTransaction(null as any, 'mainnet-beta', VALID_SIGNATURE);

    expect(result.txStatus).toBe(TransactionResponseStatusCode.UNCONFIRMED);
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
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionResponseStatusCode.NOT_FOUND);
    expect(instance.connection.getSignatureStatuses).toHaveBeenCalledWith([VALID_SIGNATURE], {
      searchTransactionHistory: true,
    });
  });

  it('maps a status with err to FAILED', async () => {
    const instance = makeInstance({
      err: { InstructionError: [2, { Custom: 6018 }] },
      confirmationStatus: 'confirmed',
    });
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionResponseStatusCode.FAILED);
  });

  it('maps a processed (seen but unconfirmed) status to UNCONFIRMED', async () => {
    const instance = makeInstance({ err: null, confirmationStatus: 'processed' });
    await expect(instance.getSignatureStatus(VALID_SIGNATURE)).resolves.toBe(TransactionResponseStatusCode.UNCONFIRMED);
  });
});
