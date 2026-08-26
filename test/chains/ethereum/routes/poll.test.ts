// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { pollEthereumTransaction } from '../../../../src/chains/ethereum/routes/poll';
import { TransactionStatusCode } from '../../../../src/schemas/chain-schema';

// Mock the Ethereum class
jest.mock('../../../../src/chains/ethereum/ethereum', () => ({
  Ethereum: {
    getInstance: jest.fn(),
  },
}));

const mockEthereum = Ethereum as jest.Mocked<typeof Ethereum>;

const TX_HASH = '0x' + 'ab'.repeat(32);

describe('pollEthereumTransaction', () => {
  const mockEthereumInstance = {
    getCurrentBlockNumber: jest.fn(),
    getTransaction: jest.fn(),
    getTransactionReceipt: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEthereum.getInstance.mockResolvedValue(mockEthereumInstance as any);
    mockEthereumInstance.getCurrentBlockNumber.mockResolvedValue(21000000);
  });

  it('returns NOT_FOUND when the node does not know the transaction', async () => {
    mockEthereumInstance.getTransaction.mockResolvedValue(null);

    const result = await pollEthereumTransaction(null as any, 'mainnet', TX_HASH);

    expect(result.txStatus).toBe(TransactionStatusCode.NOT_FOUND);
    expect(mockEthereumInstance.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('returns PENDING while the transaction sits in the mempool', async () => {
    mockEthereumInstance.getTransaction.mockResolvedValue({
      hash: TX_HASH,
      gasLimit: { toString: () => '21000' },
      value: { toString: () => '0' },
    });
    mockEthereumInstance.getTransactionReceipt.mockResolvedValue(null);

    const result = await pollEthereumTransaction(null as any, 'mainnet', TX_HASH);

    expect(result.txStatus).toBe(TransactionStatusCode.PENDING);
    expect(result.txBlock).toBe(-1);
  });

  it('returns CONFIRMED for a mined transaction with receipt status 1', async () => {
    mockEthereumInstance.getTransaction.mockResolvedValue({
      hash: TX_HASH,
      gasLimit: { toString: () => '21000' },
      value: { toString: () => '0' },
    });
    mockEthereumInstance.getTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 20999999, logs: [] });

    const result = await pollEthereumTransaction(null as any, 'mainnet', TX_HASH);

    expect(result.txStatus).toBe(TransactionStatusCode.CONFIRMED);
    expect(result.txBlock).toBe(20999999);
  });

  it('returns FAILED for a reverted transaction (receipt status 0)', async () => {
    // Regression: receipt.status 0 is a number, so the old
    // `typeof status === 'number' ? 1 : -1` mapping reported reverts as confirmed.
    mockEthereumInstance.getTransaction.mockResolvedValue({
      hash: TX_HASH,
      gasLimit: { toString: () => '21000' },
      value: { toString: () => '0' },
    });
    mockEthereumInstance.getTransactionReceipt.mockResolvedValue({ status: 0, blockNumber: 20999999, logs: [] });

    const result = await pollEthereumTransaction(null as any, 'mainnet', TX_HASH);

    expect(result.txStatus).toBe(TransactionStatusCode.FAILED);
  });
});
