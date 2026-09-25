import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { buildRewardAccountSetup } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions';

// A position on a pool whose reward slot 1 is active with a Token-2022 mint
// and whose slots 0 and 2 are off: one account to create, under the mint's
// own token program.
const wallet = Keypair.generate().publicKey;
const nftMint = Keypair.generate().publicKey;
const pool = Keypair.generate().publicKey;
const rewardMint = Keypair.generate().publicKey;
const [personal] = PublicKey.findProgramAddressSync(
  [Buffer.from('position'), nftMint.toBuffer()],
  PANCAKESWAP_CLMM_PROGRAM_ID,
);

function chain() {
  const position = Buffer.alloc(281);
  position.set(pool.toBytes(), 41);
  const poolData = Buffer.alloc(1544);
  const reward1 = 397 + 169;
  poolData.writeUInt8(3, reward1);
  poolData.set(rewardMint.toBytes(), reward1 + 57);
  const accounts = new Map<string, { owner: PublicKey; data: Buffer }>([
    [personal.toBase58(), { owner: PANCAKESWAP_CLMM_PROGRAM_ID, data: position }],
    [pool.toBase58(), { owner: PANCAKESWAP_CLMM_PROGRAM_ID, data: poolData }],
    [rewardMint.toBase58(), { owner: TOKEN_2022_PROGRAM_ID, data: Buffer.alloc(82) }],
  ]);
  return { connection: { getAccountInfo: async (k: PublicKey) => accounts.get(k.toBase58()) ?? null } } as any;
}

describe('pancakeswap-sol reward accounts', () => {
  it("creates the wallet's account for each active reward, idempotently, under the mint's program", async () => {
    const ixs = await buildRewardAccountSetup(chain(), nftMint, wallet);
    expect(ixs).toHaveLength(1);
    const [create] = ixs;
    expect(create.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(Array.from(create.data)).toEqual([1]); // CreateIdempotent
    expect(
      create.keys[1].pubkey.equals(getAssociatedTokenAddressSync(rewardMint, wallet, true, TOKEN_2022_PROGRAM_ID)),
    ).toBe(true);
    expect(create.keys[5].pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(create.keys[5].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(false);
  });

  it('throws when the position does not exist', async () => {
    await expect(buildRewardAccountSetup(chain(), Keypair.generate().publicKey, wallet)).rejects.toThrow(
      'Position account not found',
    );
  });
});
