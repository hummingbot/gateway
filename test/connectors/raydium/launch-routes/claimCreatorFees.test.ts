import { AccountLayout, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import * as launchlab from '../../../../src/connectors/raydium/launchlab/launchlab';

jest.mock('../../../../src/chains/solana/solana');

const CREATOR = new PublicKey('82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5');
const STRANGER = new PublicKey('DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9');
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const vaultData = (amount: bigint) => {
  const data = new Uint8Array(AccountLayout.span);
  AccountLayout.encode(
    {
      mint: NATIVE_MINT,
      owner: CREATOR,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return Buffer.from(data);
};

const send = jest.fn(async (_tx: Transaction) => ({ signature: 'sig', fee: 0 }));
const prime = (vault: bigint | null) => {
  jest.spyOn(launchlab, 'launchlabPoolByMint').mockResolvedValue({
    address: PublicKey.default,
    state: { creator: CREATOR, mintB: NATIVE_MINT, mintDecimalsB: 9 } as any,
  });
  jest.spyOn(launchlab, 'cpmmPoolsCreatedBy').mockResolvedValue([]);
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    connection: { getAccountInfo: jest.fn(async () => (vault === null ? null : { data: vaultData(vault) })) },
    sendAndConfirmTransactionForWallet: send,
    getConfirmedTransactionData: jest.fn(async () => ({ meta: { fee: 5000 } })),
  });
};

beforeEach(() => jest.clearAllMocks());

describe('raydium LaunchLab claimCreatorFees', () => {
  const claim = async (wallet: PublicKey) =>
    (await import('../../../../src/connectors/raydium/launch-routes/claimCreatorFees')).claimCreatorFees(
      'mainnet-beta',
      wallet.toBase58(),
      MINT,
    );

  it("opens the creator's wrapped-SOL account, claims the vault into it, and unwraps it", async () => {
    prime(BigInt(1_500_000_000));
    const result = await claim(CREATOR);
    const programs = send.mock.calls[0][0].instructions.map((ix) => ix.programId.toBase58());
    expect(programs).toEqual([
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      launchlab.LAUNCHLAB_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    expect(result).toMatchObject({ status: 1, claimed: 1.5, quoteMint: NATIVE_MINT.toBase58() });
  });

  it('refuses a wallet that is not the creator, and a creator owed nothing', async () => {
    prime(BigInt(1));
    await expect(claim(STRANGER)).rejects.toThrow('is not the creator');
    prime(null);
    await expect(claim(CREATOR)).rejects.toThrow('No Raydium LaunchLab creator fees to claim');
    expect(send).not.toHaveBeenCalled();
  });
});
