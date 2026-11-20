import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { cpmmPoolsCreatedBy } from '../../../src/connectors/raydium/launchlab/launchlab';

const CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

it("finds a creator's CPMM pools by the token in either mint slot, not by a derived config address", async () => {
  const mint = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const calls: any[] = [];
  const poolA = Keypair.generate().publicKey;
  const poolB = Keypair.generate().publicKey;
  const connection = {
    getProgramAccounts: async (program: PublicKey, config: any) => {
      calls.push({ program: program.toBase58(), filters: config.filters });
      const slot = config.filters[2].memcmp.offset === CpmmPoolInfoLayout.offsetOf('mintA') ? poolA : poolB;
      return [{ pubkey: slot, account: { data: Buffer.alloc(CpmmPoolInfoLayout.span) } }];
    },
  } as unknown as Connection;

  const pools = await cpmmPoolsCreatedBy(connection, mint, creator);

  expect(pools.map((p) => p.address.toBase58())).toEqual([poolA.toBase58(), poolB.toBase58()]);
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    expect(call.program).toBe(CPMM);
    expect(call.filters[0]).toEqual({ dataSize: CpmmPoolInfoLayout.span });
    expect(call.filters[1]).toEqual({
      memcmp: { offset: CpmmPoolInfoLayout.offsetOf('poolCreator'), bytes: creator.toBase58() },
    });
  }
  expect(calls.map((c) => c.filters[2].memcmp)).toEqual([
    { offset: CpmmPoolInfoLayout.offsetOf('mintA'), bytes: mint.toBase58() },
    { offset: CpmmPoolInfoLayout.offsetOf('mintB'), bytes: mint.toBase58() },
  ]);
});
