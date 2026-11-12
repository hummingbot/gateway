/**
 * pump launch surface: a bonding curve's pool-info (graduation measured in the
 * quote the curve will hold when its tokens sell out) and the creator-fee claim.
 */
import { bondingCurvePda } from '@pump-fun/pump-sdk';
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

const getCreatorVaultBalanceBothPrograms = jest.fn();
const collectCoinCreatorFeeInstructions = jest.fn();

jest.mock('@pump-fun/pump-sdk', () => ({
  ...jest.requireActual('@pump-fun/pump-sdk'),
  OnlinePumpSdk: jest.fn().mockImplementation(() => ({
    getCreatorVaultBalanceBothPrograms,
    collectCoinCreatorFeeInstructions,
  })),
}));
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: jest.fn(async (_c: unknown, mint: PublicKey) => ({ decimals: mint.equals(NATIVE_MINT) ? 9 : 6 })),
}));
jest.mock('../../../src/connectors/pump/pump', () => ({ Pump: { getInstance: jest.fn() } }));

import { claimCreatorFees } from '../../../src/connectors/pump/launch-routes/creatorFees';
import { getPoolInfo } from '../../../src/connectors/pump/launch-routes/poolInfo';
import { Pump } from '../../../src/connectors/pump/pump';

const MINT = PublicKey.unique();
const CREATOR = PublicKey.unique();

// pump.fun's launch terms: 1,073,000,000 virtual tokens against 30 virtual SOL,
// 793,100,000 of them for sale, 1B minted.
const freshCurve = {
  virtualTokenReserves: new BN('1073000000000000'),
  virtualQuoteReserves: new BN('30000000000'),
  realTokenReserves: new BN('793100000000000'),
  realQuoteReserves: new BN(0),
  tokenTotalSupply: new BN('1000000000000000'),
  complete: false,
  creator: CREATOR,
};

const sendAndConfirmTransactionForWallet = jest.fn();
const fakePump: any = {
  getCurveState: jest.fn(async () => ({
    bondingCurve: freshCurve,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteMint: NATIVE_MINT,
    graduated: false,
  })),
  solana: {
    connection: { getAccountInfo: jest.fn(async () => ({ owner: TOKEN_2022_PROGRAM_ID })) },
    sendAndConfirmTransactionForWallet,
    getConfirmedTransactionData: jest.fn(),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  (Pump.getInstance as jest.Mock).mockResolvedValue(fakePump);
});

describe('pump pool-info', () => {
  it('puts a fresh curve at zero progress toward its ~85 SOL graduation', async () => {
    const info = await getPoolInfo('mainnet-beta', { baseMint: MINT.toBase58() });
    expect(info.poolAddress).toBe(bondingCurvePda(MINT).toBase58());
    expect(info.creator).toBe(CREATOR.toBase58());
    expect(info.migrationProgress).toBe(0);
    expect(info.migrationQuoteThreshold).toBeCloseTo(85.005, 2);
    expect(info.price).toBeCloseTo(30 / 1_073_000_000, 15);
    expect(info.marketCap).toBeCloseTo(27.96, 2);
  });

  it('refuses a poolAddress that is not the mint’s curve', async () => {
    await expect(
      getPoolInfo('mainnet-beta', { baseMint: MINT.toBase58(), poolAddress: PublicKey.unique().toBase58() }),
    ).rejects.toThrow(/is not the pump curve/);
  });
});

describe('pump claimCreatorFees', () => {
  it('refuses to claim an empty vault without sending anything', async () => {
    getCreatorVaultBalanceBothPrograms.mockResolvedValue(new BN(0));
    await expect(claimCreatorFees('mainnet-beta', CREATOR.toBase58())).rejects.toThrow(/No pump creator fees/);
    expect(sendAndConfirmTransactionForWallet).not.toHaveBeenCalled();
  });
});
