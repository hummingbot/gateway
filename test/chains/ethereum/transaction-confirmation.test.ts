import { BigNumber } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';

// Unit tests for Ethereum.prototype.handleTransactionConfirmation — the single
// confirmation gate every EVM route that sends a transaction goes through.
//
// The contract it has to hold:
//   - no receipt (still pending) -> { confirmed: false } carrying the tx hash, never a throw,
//     so a caller can reconcile a transaction that lands after the poll window closes.
//   - reverted receipt (status 0) -> throws 400 TRANSACTION_FAILED. `receipt.status === 0`
//     must never reach a response body, where 0 reads as TransactionStatus.PENDING.
//   - confirmed receipt (status 1) -> { confirmed: true } with the receipt and the gas fee
//     already converted to native units.
//
// The class constructor is private and pulls in network state, so the method is invoked
// through Ethereum.prototype.<method>.call() against a stub carrying only what it reads.

type Stub = { handleTransactionExecution: jest.Mock };

const callHelper = (stub: Stub, tx: any) => (Ethereum.prototype as any).handleTransactionConfirmation.call(stub, tx);

describe('Ethereum.handleTransactionConfirmation', () => {
  it('reports a still-pending transaction as pending and preserves the tx hash', async () => {
    const stub: Stub = { handleTransactionExecution: jest.fn().mockResolvedValue(null) };

    const outcome = await callHelper(stub, { hash: '0xpendinghash' });

    expect(outcome).toEqual({ confirmed: false, signature: '0xpendinghash' });
  });

  it('throws 400 TRANSACTION_FAILED for a reverted transaction instead of reporting PENDING', async () => {
    const stub: Stub = {
      handleTransactionExecution: jest.fn().mockResolvedValue({
        status: 0,
        transactionHash: '0xrevertedhash',
        gasUsed: BigNumber.from(21_000),
        effectiveGasPrice: BigNumber.from('1000000000'),
      }),
    };

    const error: any = await callHelper(stub, { hash: '0xrevertedhash' }).catch((e: any) => e);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(error.message).toContain('0xrevertedhash');
    expect(error.message).toMatch(/reverted on-chain/);
  });

  it('returns the receipt and the gas fee in native units for a confirmed transaction', async () => {
    const receipt = {
      status: 1,
      transactionHash: '0xconfirmedhash',
      logs: [],
      // 21,000 gas at 1 gwei = 0.000021 ETH
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    };
    const stub: Stub = { handleTransactionExecution: jest.fn().mockResolvedValue(receipt) };

    const outcome = await callHelper(stub, { hash: '0xconfirmedhash' });

    expect(outcome).toEqual({
      confirmed: true,
      signature: '0xconfirmedhash',
      receipt,
      fee: 0.000021,
    });
  });

  it('treats a receipt with no status as pending rather than guessing', async () => {
    const stub: Stub = {
      handleTransactionExecution: jest.fn().mockResolvedValue({
        status: undefined,
        transactionHash: '0xnostatushash',
      }),
    };

    const outcome = await callHelper(stub, { hash: '0xnostatushash' });

    expect(outcome).toEqual({ confirmed: false, signature: '0xnostatushash' });
  });
});
