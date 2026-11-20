import { BorshCoder } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { buildOpenPositionWithToken22NftInstruction } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions';

jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const clmmIdl = require('../../../src/connectors/pancakeswap-sol/idl/clmm.json');

// GW-28: the first pancakeswap-sol open failed on chain with
// `PriceSlippageCheck  Left: 891739  Right: 891740`. Among the causes, base_flag was
// passed as `{ some: false }`. Borsh writes an Option's bool as `value ? 1 : 0`, and an
// object is truthy, so every "size from the quote side" request encoded Some(TRUE) and
// told the program to size from the base side. These run the builder the open route
// calls and decode what it produced.

/** A pool account with only the fields the builder reads: four keys and the tick spacing. */
const poolAccount = () => {
  const data = Buffer.alloc(300);
  let offset = 9 + 64; // discriminator + bump, amm_config, owner
  for (let i = 0; i < 4; i++) {
    data.set(Keypair.generate().publicKey.toBytes(), offset); // mint0, mint1, vault0, vault1
    offset += 32;
  }
  data.writeUInt16LE(10, 235); // tick_spacing
  return { data, owner: PublicKey.default };
};

const decodeBaseFlag = async (baseFlag: boolean | null) => {
  // The pool reads as the pool; every other account read is one of its classic SPL mints.
  const poolAddress = Keypair.generate().publicKey;
  const pool = poolAccount();
  const getAccountInfo = jest.fn(async (key: PublicKey) =>
    key.equals(poolAddress) ? pool : { data: Buffer.alloc(82), owner: TOKEN_PROGRAM_ID },
  );
  const solana: any = { connection: { getAccountInfo } };
  const ix = await buildOpenPositionWithToken22NftInstruction(
    solana,
    poolAddress,
    Keypair.generate().publicKey,
    Keypair.generate(),
    -100,
    100,
    new BN(1000),
    new BN(2000),
    true,
    baseFlag,
    new BN(12345),
  );
  const decoded = new BorshCoder(clmmIdl).instruction.decode(ix.data) as any;
  expect(decoded.name).toBe('open_position_with_token22_nft');
  return decoded.data.base_flag;
};

describe('buildOpenPositionWithToken22NftInstruction base_flag', () => {
  it.each([
    ['None, so the program uses the computed liquidity', null, null],
    ['Some(false), sizing from the quote side', false, false],
    ['Some(true), sizing from the base side', true, true],
  ])('encodes %s', async (_label, baseFlag, expected) => {
    expect(await decodeBaseFlag(baseFlag)).toBe(expected);
  });
});
