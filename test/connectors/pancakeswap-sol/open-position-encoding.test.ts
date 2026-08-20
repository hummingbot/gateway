import { BorshCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';

const clmmIdl = require('../../../src/connectors/pancakeswap-sol/idl/clmm.json');

// GW-28: the first pancakeswap-sol open failed on chain with
// `PriceSlippageCheck  Left: 891739  Right: 891740` — one unit of USDC against a 2%
// tolerance that should have allowed seventeen thousand of them. Two defects, both here.

const coder = new BorshCoder(clmmIdl);
const args = {
  tick_lower_index: -100,
  tick_upper_index: 100,
  tick_array_lower_start_index: -600,
  tick_array_upper_start_index: 0,
  liquidity: new BN(12345),
  amount_0_max: new BN(1000),
  amount_1_max: new BN(2000),
  with_metadata: true,
};
const encode = (base_flag: unknown) =>
  coder.instruction
    .encode('open_position_with_token22_nft', { ...args, base_flag })
    .toString('hex')
    .slice(-4);

describe('open_position base_flag encoding', () => {
  it('encodes null as None — one byte, not two', () => {
    // None is what the route sends: it tells the program to use the liquidity we
    // computed and treat the maxes as ceilings.
    const none = coder.instruction.encode('open_position_with_token22_nft', { ...args, base_flag: null });
    const some = coder.instruction.encode('open_position_with_token22_nft', { ...args, base_flag: false });

    expect(none.length).toBe(some.length - 1);
    expect(none.toString('hex').slice(-2)).toBe('00');
  });

  it('encodes false as Some(false), not Some(true)', () => {
    expect(encode(false)).toBe('0100');
    expect(encode(true)).toBe('0101');
  });

  it('encoded `{ some: false }` as Some(TRUE), which is how this shipped', () => {
    // Borsh writes an Option as 0x00, or 0x01 followed by the value, and its bool
    // layout is `value ? 1 : 0`. An object is truthy, so BOTH branches of
    // `baseFlag ? { some: true } : { some: false }` encoded Some(true): every request
    // that meant "size from the quote side" told the program to size from the base
    // side. This asserts the trap rather than the fix, so nobody reintroduces it
    // believing the object form works.
    expect(encode({ some: false })).toBe('0101');
    expect(encode({ some: false })).toBe(encode({ some: true }));
  });
});
