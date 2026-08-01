import { Ethereum } from '../../../src/chains/ethereum/ethereum';

// Unit tests for Ethereum.prototype.handleTransactionExecution covering:
//   (a) fast confirmation path (tx.wait resolves before timeout)
//   (b) extended polling path (timeout, then getTransactionReceipt eventually
//       returns a receipt — caller must NOT treat this as failure)
//   (c) genuinely pending — both wait and extended poll return null
//
// The class constructor is private and pulls in a lot of network state, so we
// invoke the method through Ethereum.prototype.<method>.call() against a
// minimal stub that only carries the fields the method actually reads.

type Stub = {
  _transactionExecutionTimeoutMs: number;
  getTransactionReceipt: jest.Mock;
};

const callHandle = (stub: Stub, tx: any) => (Ethereum.prototype as any).handleTransactionExecution.call(stub, tx);

describe('Ethereum.handleTransactionExecution', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the receipt when tx.wait resolves before the timeout', async () => {
    const stub: Stub = {
      _transactionExecutionTimeoutMs: 30_000,
      getTransactionReceipt: jest.fn(),
    };
    const fakeReceipt = { status: 1, blockNumber: 100, transactionHash: '0xabc' };
    const tx = {
      hash: '0xabc',
      wait: jest.fn().mockResolvedValue(fakeReceipt),
    };

    const promise = callHandle(stub, tx);
    // Run any pending microtasks/timers so the resolved wait can win the race.
    await jest.runAllTimersAsync();
    const receipt = await promise;

    expect(receipt).toBe(fakeReceipt);
    expect(tx.wait).toHaveBeenCalledWith(1);
    expect(stub.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('polls for the receipt after the initial timeout and returns it once it appears', async () => {
    const stub: Stub = {
      _transactionExecutionTimeoutMs: 30_000,
      // Receipt becomes visible on the 2nd poll.
      getTransactionReceipt: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 1, blockNumber: 101, transactionHash: '0xdef' }),
    };
    const tx = {
      hash: '0xdef',
      // Never resolves — forces the timeout branch.
      wait: jest.fn().mockReturnValue(new Promise(() => {})),
    };

    const promise = callHandle(stub, tx);
    // Initial timeout (30s) + 2 poll intervals (5s each).
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(5_000);
    await jest.advanceTimersByTimeAsync(5_000);
    const receipt = await promise;

    expect(receipt).toMatchObject({ status: 1, blockNumber: 101 });
    expect(stub.getTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(stub.getTransactionReceipt).toHaveBeenCalledWith('0xdef');
  });

  it('returns null when the receipt is still missing after the extended poll window', async () => {
    const stub: Stub = {
      _transactionExecutionTimeoutMs: 30_000,
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
    };
    const tx = {
      hash: '0xghi',
      wait: jest.fn().mockReturnValue(new Promise(() => {})),
    };

    const promise = callHandle(stub, tx);
    // 30s initial + 90s extended window with 5s polls = 18 poll attempts.
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(90_000);
    const receipt = await promise;

    expect(receipt).toBeNull();
    // Polled up to 18 times (90_000 / 5_000).
    expect(stub.getTransactionReceipt).toHaveBeenCalledTimes(18);
  });
});
