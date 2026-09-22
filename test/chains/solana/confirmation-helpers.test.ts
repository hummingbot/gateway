/**
 * Unit tests for the shared route-level confirmation helpers:
 * Solana.getConfirmedTransactionData and Solana.handleConfirmation.
 *
 * Exercised via Function.prototype.call against a hand-built `this` (like the
 * sendAndConfirmTransactionForWallet tests) so the branching can be asserted without
 * standing up the Solana singleton / RPC.
 *
 * These pin the G4 contract: existence of txData is never equated with confirmation —
 * a landed-but-failed transaction throws TRANSACTION_FAILED, and a just-confirmed
 * transaction whose data lags RPC visibility is found via the retrying fetch instead of
 * being misreported as PENDING.
 */

import { Solana } from '../../../src/chains/solana/solana';

const buildLandedWithErrorException = (Solana.prototype as any).buildLandedWithErrorException;

const getConfirmedTransactionData = (Solana.prototype as any).getConfirmedTransactionData as (
  this: unknown,
  signature: string,
) => Promise<any>;

const handleConfirmation = (Solana.prototype as any).handleConfirmation as (
  this: unknown,
  signature: string,
  txData: any,
  tokenIn: string,
  tokenOut: string,
  walletAddress: string,
  side?: 'BUY' | 'SELL',
  slippagePct?: number,
) => Promise<{ signature: string; status: number; data?: any }>;

const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const TOKEN_IN = 'So11111111111111111111111111111111111111112';
const TOKEN_OUT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const failedTxData = {
  meta: { err: { InstructionError: [1, { Custom: 6001 }] }, logMessages: [] },
};

describe('Solana.getConfirmedTransactionData', () => {
  it('uses the retrying fetch and returns the transaction data when it succeeded', async () => {
    const fetchWithRetry = jest.fn(async () => ({ meta: { err: null, fee: 5000 } }));
    const fakeThis = { _fetchTransactionWithRetry: fetchWithRetry, buildLandedWithErrorException };

    const txData = await getConfirmedTransactionData.call(fakeThis, 'sig');
    expect(txData).toEqual({ meta: { err: null, fee: 5000 } });
    expect(fetchWithRetry).toHaveBeenCalledWith('sig');
  });

  it('throws TRANSACTION_FAILED when the transaction landed on-chain with an error', async () => {
    const fakeThis = {
      _fetchTransactionWithRetry: jest.fn(async () => failedTxData),
      buildLandedWithErrorException,
    };

    const error = await getConfirmedTransactionData.call(fakeThis, 'landed-sig').then(
      () => {
        throw new Error('expected getConfirmedTransactionData to throw');
      },
      (e: any) => e,
    );
    expect(error.message).toMatch(/Transaction landed-sig landed on-chain but failed/);
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(error.statusCode).toBe(400);
  });

  it('returns null when the transaction is genuinely not visible yet', async () => {
    const fakeThis = { _fetchTransactionWithRetry: jest.fn(async () => null), buildLandedWithErrorException };
    await expect(getConfirmedTransactionData.call(fakeThis, 'gone-sig')).resolves.toBeNull();
  });
});

describe('Solana.handleConfirmation', () => {
  const confirmedThis = () => ({
    buildLandedWithErrorException,
    _fetchTransactionWithRetry: jest.fn(async () => null),
    extractBalanceChangesAndFee: jest.fn(async () => ({ balanceChanges: [-0.1, 14.85], fee: 0.000005 })),
  });

  it('reports CONFIRMED with the applied slippagePct echoed in data', async () => {
    const fakeThis = confirmedThis();
    const result = await handleConfirmation.call(
      fakeThis,
      'sig',
      { meta: { err: null } },
      TOKEN_IN,
      TOKEN_OUT,
      WALLET,
      'SELL',
      0.75,
    );

    expect(result.status).toBe(1);
    expect(result.data).toMatchObject({
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      amountIn: 0.1,
      amountOut: 14.85,
      slippagePct: 0.75,
    });
    // Data was supplied, so no re-fetch happened.
    expect(fakeThis._fetchTransactionWithRetry).not.toHaveBeenCalled();
  });

  it('throws TRANSACTION_FAILED for a landed-but-failed transaction instead of misreporting it', async () => {
    const fakeThis = confirmedThis();
    const error = await handleConfirmation.call(fakeThis, 'landed-sig', failedTxData, TOKEN_IN, TOKEN_OUT, WALLET).then(
      () => {
        throw new Error('expected handleConfirmation to throw');
      },
      (e: any) => e,
    );
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(fakeThis.extractBalanceChangesAndFee).not.toHaveBeenCalled();
  });

  it('re-fetches with retry when the caller has no txData, so a lagging RPC does not yield a false PENDING', async () => {
    const fakeThis = confirmedThis();
    fakeThis._fetchTransactionWithRetry = jest.fn(async () => ({ meta: { err: null } }));

    const result = await handleConfirmation.call(fakeThis, 'sig', null, TOKEN_IN, TOKEN_OUT, WALLET);
    expect(fakeThis._fetchTransactionWithRetry).toHaveBeenCalledWith('sig');
    expect(result.status).toBe(1);
  });

  it('returns the pending shape only when the transaction is genuinely not found', async () => {
    const fakeThis = confirmedThis();
    const result = await handleConfirmation.call(fakeThis, 'pending-sig', null, TOKEN_IN, TOKEN_OUT, WALLET);
    expect(result).toEqual({ signature: 'pending-sig', status: 0, data: undefined });
  });
});
