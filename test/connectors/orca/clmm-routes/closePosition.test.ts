import { Transaction } from '@solana/web3.js';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/connectors/orca/orca.utils', () => ({
  extractInnerTransferAmounts: jest.fn(),
}));
jest.mock('@orca-so/whirlpools', () => ({
  closePositionInstructions: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchMaybePosition: jest.fn(),
  fetchWhirlpool: jest.fn(),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchMint: jest.fn(),
}));

import { closePositionInstructions } from '@orca-so/whirlpools';
import { fetchMaybePosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { fetchMint } from '@solana-program/token-2022';

import { Solana } from '../../../../src/chains/solana/solana';
import { closePosition } from '../../../../src/connectors/orca/clmm-routes/closePosition';
import { Orca } from '../../../../src/connectors/orca/orca';
import { extractInnerTransferAmounts } from '../../../../src/connectors/orca/orca.utils';

const WALLET = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const POSITION = 'HqoV7Qv27REUtq26uVBhqmaipPC381dj7UceLn433SoH';
const POSITION_MINT = 'BvBi69W7X9jAWHQxuUtwM9KfwC7QXwqHmT1r2X3NLE1G';
const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const TOKEN_A = 'SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3';
const TOKEN_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const RECONCILED_SIGNATURE = '4PhzvqSiHGPUqTuPrhMr9ttbb49LQLjV1DH8sHQUBbtt6cyxN8aHiVjEPyCHX76wbUddgJSiW2kLkPv4m8jyL8ML';

const existingPosition = {
  exists: true,
  data: { positionMint: POSITION_MINT, whirlpool: POOL, liquidity: 100n },
};

const setupCloseMocks = (sendForWallet: jest.Mock, getTransaction = jest.fn().mockResolvedValue(null)) => {
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet: sendForWallet,
    connection: { getTransaction },
  });
  const deployment = { programId: PROGRAM, configAddress: POOL };
  (Orca.getInstance as jest.Mock).mockResolvedValue({
    solanaKitRpc: {},
    deployment,
    config: { slippagePct: 1 },
  });
  (fetchMaybePosition as jest.Mock).mockResolvedValue(existingPosition);
  (fetchWhirlpool as jest.Mock).mockResolvedValue({
    data: { tokenMintA: TOKEN_A, tokenMintB: TOKEN_B },
  });
  (fetchMint as jest.Mock).mockResolvedValue({ programAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' });
  (closePositionInstructions as jest.Mock).mockResolvedValue({
    instructions: [
      { programAddress: PROGRAM, accounts: [], data: new Uint8Array([1]) },
      { programAddress: PROGRAM, accounts: [], data: new Uint8Array([2]) },
      { programAddress: PROGRAM, accounts: [], data: new Uint8Array([3]) },
      { programAddress: PROGRAM, accounts: [], data: new Uint8Array([4]) },
    ],
    quote: { liquidityDelta: 100n },
    feesQuote: { feeOwedA: 5n, feeOwedB: 2n },
    rewardsQuote: { rewards: [{ rewardsOwed: 9n }, { rewardsOwed: 0n }, { rewardsOwed: 0n }] },
  });
  (extractInnerTransferAmounts as jest.Mock).mockResolvedValue({ transferGroups: [] });
  return deployment;
};

describe('closePosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Orca v8 complete close instructions and the unchanged Gateway signer', async () => {
    const sendForWallet = jest.fn().mockResolvedValue({ signature: 'close-signature', fee: 0.00001 });
    const deployment = setupCloseMocks(sendForWallet);

    const result = await closePosition('mainnet-beta', WALLET, POSITION);
    expect(result.signature).toBe('close-signature');
    expect(closePositionInstructions).toHaveBeenCalledWith(
      {},
      POSITION_MINT,
      expect.objectContaining({
        slippageToleranceBps: 100,
        whirlpoolDeployment: deployment,
        authority: expect.objectContaining({ address: WALLET }),
      }),
    );
    expect(sendForWallet).toHaveBeenCalledWith(expect.any(Transaction), WALLET);
    const transaction = sendForWallet.mock.calls[0][0] as Transaction;
    expect(transaction.instructions).toHaveLength(4);
    expect(transaction.feePayer?.toBase58()).toBe(WALLET);
  });

  it('rebuilds and retries immediately when an attempt fails and the position remains open', async () => {
    const sendForWallet = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary simulation failure'))
      .mockResolvedValueOnce({ signature: 'retry-signature', fee: 0.00002 });
    setupCloseMocks(sendForWallet);

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.signature).toBe('retry-signature');
    expect(closePositionInstructions).toHaveBeenCalledTimes(2);
    expect(sendForWallet).toHaveBeenCalledTimes(2);
    expect(fetchMaybePosition).toHaveBeenCalledTimes(2);
    expect(sendForWallet.mock.calls[0][0]).not.toBe(sendForWallet.mock.calls[1][0]);
  });

  it('reconciles a close when the position disappears after an uncertain send result', async () => {
    const sendForWallet = jest
      .fn()
      .mockRejectedValue(new Error(`Transaction ${RECONCILED_SIGNATURE} was not confirmed before timeout`));
    const getTransaction = jest.fn().mockResolvedValue({
      meta: { err: null, fee: 6143, preBalances: [], postBalances: [] },
      transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: [] }) } },
    });
    setupCloseMocks(sendForWallet, getTransaction);
    (fetchMaybePosition as jest.Mock).mockResolvedValueOnce(existingPosition).mockResolvedValueOnce({ exists: false });

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.signature).toBe(RECONCILED_SIGNATURE);
    expect(result.data?.fee).toBe(0.000006143);
    expect(sendForWallet).toHaveBeenCalledTimes(1);
    expect(getTransaction).toHaveBeenCalledWith(RECONCILED_SIGNATURE, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  });

  it('stops after three failed fresh attempts while the position remains open', async () => {
    const sendForWallet = jest.fn().mockRejectedValue(new Error('persistent close failure'));
    setupCloseMocks(sendForWallet);

    await expect(closePosition('mainnet-beta', WALLET, POSITION)).rejects.toThrow('persistent close failure');
    expect(closePositionInstructions).toHaveBeenCalledTimes(3);
    expect(sendForWallet).toHaveBeenCalledTimes(3);
    expect(fetchMaybePosition).toHaveBeenCalledTimes(4);
  });

  it('maps an unreadable position to a 404 before building close instructions', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue({});
    (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
    (fetchMaybePosition as jest.Mock).mockResolvedValue({ exists: false });
    await expect(closePosition('mainnet-beta', WALLET, POSITION)).rejects.toMatchObject({ statusCode: 404 });
    expect(closePositionInstructions).not.toHaveBeenCalled();
  });
});
