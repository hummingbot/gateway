import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora-damm');
const getUnClaimLpFee = jest.fn();
jest.mock('@meteora-ag/cp-amm-sdk', () => ({ getUnClaimLpFee: (...a: unknown[]) => getUnClaimLpFee(...a) }));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = '11111111111111111111111111111112';
const POSITION = new PublicKey('SysvarRent111111111111111111111111111111111');
const NFT_ACCOUNT = new PublicKey('SysvarC1ock11111111111111111111111111111111');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

const claimPositionFee = jest.fn();
const sendAndConfirmTransactionForWallet = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({
    getPoolState: jest
      .fn()
      .mockResolvedValue({ tokenAMint: USDC, tokenBMint: WSOL, tokenAVault: USDC, tokenBVault: WSOL }),
    getTokenPrograms: jest.fn().mockReturnValue({ tokenAProgram: USDC, tokenBProgram: WSOL }),
    getUserPositions: jest
      .fn()
      .mockResolvedValue([{ position: POSITION, positionNftAccount: NFT_ACCOUNT, positionState: {} }]),
    cpAmm: { claimPositionFee },
  });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet,
    getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [1.5, 0.02] }),
  });
  claimPositionFee.mockResolvedValue(new Transaction());
  sendAndConfirmTransactionForWallet.mockResolvedValue({ signature: 'sig', fee: 0 });
});

describe('meteora AMM collectFees (DAMM v2)', () => {
  it("claims the named position's fees to its owner and reports what came in", async () => {
    getUnClaimLpFee.mockReturnValue({ feeTokenA: new BN(10), feeTokenB: new BN(0), rewards: [] });
    const { collectFees } = await import('../../../../src/connectors/meteora/amm-routes/collectFees');

    const result = await collectFees('mainnet-beta', WALLET, POOL, POSITION.toBase58());

    expect(claimPositionFee).toHaveBeenCalledWith(
      expect.objectContaining({ owner: new PublicKey(WALLET), position: POSITION, positionNftAccount: NFT_ACCOUNT }),
    );
    expect(result).toEqual({
      signature: 'sig',
      status: 1,
      data: {
        fee: 0.000005,
        poolAddress: POOL,
        positionAddress: POSITION.toBase58(),
        baseFeeAmountCollected: 1.5,
        quoteFeeAmountCollected: 0.02,
      },
    });
  });

  it('refuses a position with no fees, before building anything', async () => {
    getUnClaimLpFee.mockReturnValue({ feeTokenA: new BN(0), feeTokenB: new BN(0), rewards: [] });
    const { collectFees } = await import('../../../../src/connectors/meteora/amm-routes/collectFees');

    await expect(collectFees('mainnet-beta', WALLET, POOL, POSITION.toBase58())).rejects.toThrow(
      'has no fees to collect',
    );
    expect(claimPositionFee).not.toHaveBeenCalled();
  });

  it('refuses a position the wallet does not hold in this pool', async () => {
    const { collectFees } = await import('../../../../src/connectors/meteora/amm-routes/collectFees');
    await expect(collectFees('mainnet-beta', WALLET, POOL, WSOL.toBase58())).rejects.toThrow('not found for wallet');
  });
});
