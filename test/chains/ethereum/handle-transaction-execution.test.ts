/**
 * Unit tests for Ethereum.handleTransactionExecution.
 *
 * The method races tx.wait(1) against a configured timeout.  If the timeout
 * fires first it enters an extended poll window (90 s, polling every 5 s)
 * before returning null.  Tests use fake timers so nothing waits in real time.
 *
 * Regression: Before PR #642 the extended poll was absent — a tx that took
 * longer than 30 s was silently dropped.  And approve.ts crashed with
 * TypeError when receipt was null (receipt.status dereference).
 */

// Isolate module so the constructor never runs.  We build a minimal prototype
// instance via Object.create to exercise the real method body.
jest.mock('../../../src/chains/ethereum/ethereum', () => {
  const actual = jest.requireActual('../../../src/chains/ethereum/ethereum');
  return actual;
});

import { Ethereum } from '../../../src/chains/ethereum/ethereum';

// Logger is imported transitively; silence it to keep test output clean.
jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  redactUrl: (u: string) => u,
}));

// --- helpers ----------------------------------------------------------------

function makeEthereumStub(timeoutMs: number, getReceiptImpl: jest.Mock): any {
  const stub: any = Object.create(Ethereum.prototype);
  // Private field accessed directly (TS private is compile-time only).
  stub._transactionExecutionTimeoutMs = timeoutMs;
  stub.getTransactionReceipt = getReceiptImpl;
  return stub;
}

function makeMockTx(waitImpl: jest.Mock): any {
  return { hash: '0xdeadbeef', wait: waitImpl };
}

const MOCK_RECEIPT = {
  transactionHash: '0xdeadbeef',
  status: 1,
  blockNumber: 12345678,
  gasUsed: { mul: jest.fn(), toString: () => '21000' },
  effectiveGasPrice: { toString: () => '1000000000' },
};

// ---------------------------------------------------------------------------

describe('Ethereum.handleTransactionExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy path: tx confirms before timeout ─────────────────────────────────

  it('returns receipt immediately when tx confirms before timeout', async () => {
    const ethereum = makeEthereumStub(30_000, jest.fn());
    const mockTx = makeMockTx(jest.fn().mockResolvedValue(MOCK_RECEIPT));

    const result = await ethereum.handleTransactionExecution(mockTx);

    expect(result).toEqual(MOCK_RECEIPT);
    // Extended-poll should not have been attempted.
    expect(ethereum.getTransactionReceipt).not.toHaveBeenCalled();
  });

  // ── Extended poll: receipt found during the extra window ──────────────────

  it('returns receipt found during extended poll window', async () => {
    jest.useFakeTimers();
    try {
      // A very short initial timeout so the race loses instantly.
      const ethereum = makeEthereumStub(
        0,
        jest
          .fn()
          .mockResolvedValueOnce(null) // first poll → still pending
          .mockResolvedValue(MOCK_RECEIPT), // second poll → confirmed
      );
      // tx.wait never resolves, simulating a slow transaction.
      const mockTx = makeMockTx(jest.fn().mockReturnValue(new Promise(() => {})));

      const promise = ethereum.handleTransactionExecution(mockTx);

      // Fire the initial 0 ms timeout so Promise.race picks the null path.
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual(MOCK_RECEIPT);
      expect(ethereum.getTransactionReceipt).toHaveBeenCalledWith('0xdeadbeef');
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Extended poll exhausted: returns null cleanly ─────────────────────────

  it('returns null when tx is still pending after the full extended poll window', async () => {
    jest.useFakeTimers();
    try {
      const ethereum = makeEthereumStub(0, jest.fn().mockResolvedValue(null));
      const mockTx = makeMockTx(jest.fn().mockReturnValue(new Promise(() => {})));

      const promise = ethereum.handleTransactionExecution(mockTx);

      // Advance through the full 90 s extended window (18 × 5000 ms polls).
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toBeNull();
      // The handler must return null — not throw a TypeError or any other error.
      // (Regression: the absence of null caused TypeError: Cannot read properties
      //  of null when approve.ts accessed receipt.status without a null guard.)
    } finally {
      jest.useRealTimers();
    }
  });
});
