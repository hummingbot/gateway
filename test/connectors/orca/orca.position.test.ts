jest.mock('@orca-so/whirlpools-client', () => ({
  decodePosition: jest.fn(),
  decodeTickArray: jest.fn(),
  decodeWhirlpool: jest.fn(),
  fetchMaybePosition: jest.fn(),
  fetchWhirlpool: jest.fn(),
  getTickArrayAddress: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-core', () => ({
  collectFeesQuote: jest.fn(),
  getTickArrayStartTickIndex: jest.fn((tickIndex: number) => tickIndex),
  getTickIndexInArray: jest.fn(() => 0),
  sqrtPriceToPrice: jest.fn(() => 100),
  tickIndexToPrice: jest.fn((tickIndex: number) => tickIndex),
  tickIndexToSqrtPrice: jest.fn((tickIndex: number) => BigInt(tickIndex)),
  tryGetAmountDeltaA: jest.fn(() => 3_000_000_000n),
  tryGetAmountDeltaB: jest.fn(() => 4_000_000n),
}));
jest.mock('@solana/kit', () => ({
  address: jest.fn((value: string) => value),
  assertAccountExists: jest.fn((account: any) => {
    if (!account.exists) {
      throw new Error(`Account not found: ${account.address}`);
    }
  }),
  fetchEncodedAccounts: jest.fn(),
}));
jest.mock('@solana-program/token-2022', () => ({
  decodeMint: jest.fn(),
}));

import {
  decodePosition,
  decodeTickArray,
  decodeWhirlpool,
  fetchMaybePosition,
  fetchWhirlpool,
  getTickArrayAddress,
} from '@orca-so/whirlpools-client';
import { collectFeesQuote, tryGetAmountDeltaA, tryGetAmountDeltaB } from '@orca-so/whirlpools-core';
import { fetchEncodedAccounts } from '@solana/kit';
import { decodeMint } from '@solana-program/token-2022';

import { getPositionDetails } from '../../../src/connectors/orca/orca.position';

describe('Orca position snapshot', () => {
  const rpc = {
    getEpochInfo: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({ epoch: 42n }),
    })),
  } as any;
  const deployment = { programId: 'orca-program' } as any;

  const encoded = Array.from({ length: 6 }, (_, index) => ({ encoded: index }));
  const discoveredPosition = {
    exists: true,
    address: 'position',
    data: {
      whirlpool: 'pool',
      tickLowerIndex: 10,
      tickUpperIndex: 20,
    },
  };
  const discoveredWhirlpool = {
    exists: true,
    address: 'pool',
    data: {
      tokenMintA: 'mint-a',
      tokenMintB: 'mint-b',
      tickSpacing: 1,
    },
  };
  const position = {
    exists: true,
    address: 'position',
    data: {
      ...discoveredPosition.data,
      liquidity: 1_000n,
    },
  };
  const whirlpool = {
    exists: true,
    address: 'pool',
    data: {
      ...discoveredWhirlpool.data,
      tickCurrentIndex: 15,
      sqrtPrice: 15n,
    },
  };
  const mintA = {
    exists: true,
    address: 'mint-a',
    data: { decimals: 9, extensions: { __option: 'None' } },
  };
  const mintB = {
    exists: true,
    address: 'mint-b',
    data: { decimals: 6, extensions: { __option: 'None' } },
  };
  const lowerTickArray = { exists: true, address: 'lower-ticks', data: { ticks: [{ lower: true }] } };
  const upperTickArray = { exists: true, address: 'upper-ticks', data: { ticks: [{ upper: true }] } };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchMaybePosition as jest.Mock).mockResolvedValue(discoveredPosition);
    (fetchWhirlpool as jest.Mock).mockResolvedValue(discoveredWhirlpool);
    (getTickArrayAddress as jest.Mock).mockImplementation(async (_pool: string, startIndex: number) => [
      startIndex === 10 ? 'lower-ticks' : 'upper-ticks',
    ]);
    (fetchEncodedAccounts as jest.Mock).mockResolvedValue(encoded);
    (decodePosition as jest.Mock).mockImplementation((account) =>
      account === encoded[0] ? position : { exists: false, address: 'position' },
    );
    (decodeWhirlpool as jest.Mock).mockReturnValue(whirlpool);
    (decodeMint as jest.Mock).mockImplementation((account) => (account === encoded[2] ? mintA : mintB));
    (decodeTickArray as jest.Mock).mockImplementation((account) =>
      account === encoded[4] ? lowerTickArray : upperTickArray,
    );
    (collectFeesQuote as jest.Mock).mockReturnValue({ feeOwedA: 5_000_000n, feeOwedB: 7_000_000n });
  });

  it.each([
    { name: 'below range', tickCurrentIndex: 5, baseTokenAmount: 3, quoteTokenAmount: 0 },
    { name: 'in range', tickCurrentIndex: 15, baseTokenAmount: 3, quoteTokenAmount: 4 },
    { name: 'above range', tickCurrentIndex: 25, baseTokenAmount: 0, quoteTokenAmount: 4 },
  ])('calculates $name amounts from one final account batch', async (testCase) => {
    whirlpool.data.tickCurrentIndex = testCase.tickCurrentIndex;

    const result = await getPositionDetails(rpc, 'position', deployment);

    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
    expect(fetchEncodedAccounts).toHaveBeenCalledWith(rpc, [
      'position',
      'pool',
      'mint-a',
      'mint-b',
      'lower-ticks',
      'upper-ticks',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        address: 'position',
        poolAddress: 'pool',
        baseTokenAmount: testCase.baseTokenAmount,
        quoteTokenAmount: testCase.quoteTokenAmount,
        baseFeeAmount: 0.005,
        quoteFeeAmount: 7,
      }),
    );
    expect(tryGetAmountDeltaA).toHaveBeenCalledTimes(testCase.tickCurrentIndex < 20 ? 1 : 0);
    expect(tryGetAmountDeltaB).toHaveBeenCalledTimes(testCase.tickCurrentIndex >= 10 ? 1 : 0);
  });

  it('returns null when the position is absent during discovery', async () => {
    (fetchMaybePosition as jest.Mock).mockResolvedValue({ exists: false, address: 'position' });

    await expect(getPositionDetails(rpc, 'position', deployment)).resolves.toBeNull();
    expect(fetchWhirlpool).not.toHaveBeenCalled();
    expect(fetchEncodedAccounts).not.toHaveBeenCalled();
  });

  it('returns null when the position closes before the final account batch', async () => {
    (decodePosition as jest.Mock).mockReturnValue({ exists: false, address: 'position' });

    await expect(getPositionDetails(rpc, 'position', deployment)).resolves.toBeNull();
    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
    expect(decodeWhirlpool).not.toHaveBeenCalled();
  });

  it('propagates an inconsistent fee-growth calculation without connector-specific retry', async () => {
    (collectFeesQuote as jest.Mock).mockImplementation(() => {
      throw new Error('Amount exceeds max u64');
    });

    await expect(getPositionDetails(rpc, 'position', deployment)).rejects.toThrow('Amount exceeds max u64');
    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
  });

  it('rejects when discovery metadata changes before the final batch', async () => {
    (decodePosition as jest.Mock).mockReturnValue({
      ...position,
      data: { ...position.data, tickUpperIndex: 21 },
    });

    await expect(getPositionDetails(rpc, 'position', deployment)).rejects.toThrow(
      'Orca position changed while its account snapshot was being assembled',
    );
    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
    expect(collectFeesQuote).not.toHaveBeenCalled();
  });

  it('propagates non-snapshot failures without retrying', async () => {
    (fetchEncodedAccounts as jest.Mock).mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(getPositionDetails(rpc, 'position', deployment)).rejects.toThrow('429 Too Many Requests');
    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
  });

  it('propagates a missing Whirlpool dependency instead of reporting the position closed', async () => {
    (decodeWhirlpool as jest.Mock).mockReturnValue({ exists: false, address: 'pool' });

    await expect(getPositionDetails(rpc, 'position', deployment)).rejects.toThrow('Account not found: pool');
    expect(fetchEncodedAccounts).toHaveBeenCalledTimes(1);
  });
});
