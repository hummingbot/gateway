import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { buildSwapV2Instruction } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions';
import { getTickArrayAddress } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser';
import {
  decodeTickArrayBitmaps,
  getSwapTickArrayStartIndices,
  getTickArrayBitmapExtensionAddress,
  isTickArrayInitialized,
} from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.tickarrays';

jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser', () => ({
  ...jest.requireActual('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser'),
  getTokenProgramForMint: jest.fn(async () => TOKEN_PROGRAM_ID),
}));

// Raw account layouts (independent of the implementation's constants).
const POOL_SIZE = 1544;
const POOL_BITMAP_OFFSET = 904; // PoolState.tick_array_bitmap
const EXT_SIZE = 8 + 32 + 2 * 14 * 64;
const EXT_POSITIVE_OFFSET = 40;
const EXT_NEGATIVE_OFFSET = 40 + 14 * 64;

function setBit(buf: Buffer, byteOffset: number, bit: number) {
  buf[byteOffset + (bit >> 3)] |= 1 << (bit & 7);
}

/** Mark array index k (start = k * 60 * spacing) initialized in the pool's default bitmap. */
function setPoolArray(pool: Buffer, k: number) {
  setBit(pool, POOL_BITMAP_OFFSET, k + 512);
}

function emptyAccounts() {
  return { pool: Buffer.alloc(POOL_SIZE), ext: Buffer.alloc(EXT_SIZE) };
}

describe('pancakeswap-sol swap tick arrays', () => {
  describe('getSwapTickArrayStartIndices', () => {
    // A pool at tick -21674, spacing 1, whose current array (-21720, k = -362) is uninitialized.
    const { pool, ext } = emptyAccounts();
    for (const k of [-366, -364, -363, -361, -359, -358]) setPoolArray(pool, k);
    const bitmaps = decodeTickArrayBitmaps(pool, ext);

    it('skips an uninitialized current array to the next initialized one below (zeroForOne)', () => {
      expect(isTickArrayInitialized(bitmaps, -21720, 1)).toBe(false);
      expect(getSwapTickArrayStartIndices(bitmaps, -21674, 1, true)).toEqual([-21780, -21840, -21960]);
    });

    it('skips an uninitialized current array to the next initialized one above (oneForZero)', () => {
      expect(getSwapTickArrayStartIndices(bitmaps, -21674, 1, false)).toEqual([-21660, -21540, -21480]);
    });

    it('starts at the current array when it is initialized', () => {
      // tick -21700 is in array -21720 (k = -362) with spacing 1; mark it initialized.
      const { pool: p, ext: e } = emptyAccounts();
      for (const k of [-363, -362, -361]) setPoolArray(p, k);
      const b = decodeTickArrayBitmaps(p, e);
      expect(getSwapTickArrayStartIndices(b, -21700, 1, true)).toEqual([-21720, -21780]);
      expect(getSwapTickArrayStartIndices(b, -21700, 1, false)).toEqual([-21720, -21660]);
    });

    it('floors negative ticks to their array and honors tick spacing', () => {
      // spacing 10: arrays are 600 ticks. tick -1 is in array -600 (k = -1).
      const { pool: p, ext: e } = emptyAccounts();
      for (const k of [-3, -1, 0, 2]) setPoolArray(p, k);
      const b = decodeTickArrayBitmaps(p, e);
      expect(getSwapTickArrayStartIndices(b, -1, 10, true)).toEqual([-600, -1800]);
      expect(getSwapTickArrayStartIndices(b, -1, 10, false)).toEqual([-600, 0, 1200]);
      expect(getSwapTickArrayStartIndices(b, 0, 10, true)).toEqual([0, -600, -1800]);
    });

    it('continues into the negative bitmap extension', () => {
      const { pool: p, ext: e } = emptyAccounts();
      setPoolArray(p, -510);
      setBit(e, EXT_NEGATIVE_OFFSET, 511); // k = -513: first negative bitmap, top bit
      setBit(e, EXT_NEGATIVE_OFFSET, 512 + 511); // k = -1025: second negative bitmap, top bit
      setBit(e, EXT_NEGATIVE_OFFSET, 0); // k = -1024: first negative bitmap, bit 0
      const b = decodeTickArrayBitmaps(p, e);
      // spacing 1: k * 60
      expect(getSwapTickArrayStartIndices(b, -30540, 1, true)).toEqual([-30600, -30780, -61440]);
      expect(getSwapTickArrayStartIndices(b, -61441, 1, false)).toEqual([-61500, -61440, -30780]);
    });

    it('continues into the positive bitmap extension', () => {
      const { pool: p, ext: e } = emptyAccounts();
      setBit(e, EXT_POSITIVE_OFFSET, 0); // k = 512
      setBit(e, EXT_POSITIVE_OFFSET, 512 + 3); // k = 1027
      const b = decodeTickArrayBitmaps(p, e);
      expect(getSwapTickArrayStartIndices(b, 30000, 1, false)).toEqual([30720, 61620]);
      expect(getSwapTickArrayStartIndices(b, 70000, 1, true)).toEqual([61620, 30720]);
    });

    it('throws when no array is initialized in the swap direction', () => {
      expect(() => getSwapTickArrayStartIndices(bitmaps, -22000, 1, true)).toThrow(
        /No initialized tick array below tick -22000/,
      );
      expect(() => getSwapTickArrayStartIndices(bitmaps, -21000, 1, false)).toThrow(/no liquidity/);
    });
  });

  describe('buildSwapV2Instruction', () => {
    const poolAddress = new PublicKey('4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN');
    const [ammConfig, mint0, mint1, vault0, vault1, observation] = Array.from(
      { length: 6 },
      () => Keypair.generate().publicKey,
    );
    const wallet = Keypair.generate().publicKey;

    const { pool, ext } = emptyAccounts();
    pool.set(ammConfig.toBytes(), 9);
    pool.set(mint0.toBytes(), 73);
    pool.set(mint1.toBytes(), 105);
    pool.set(vault0.toBytes(), 137);
    pool.set(vault1.toBytes(), 169);
    pool.set(observation.toBytes(), 201);
    pool.writeUInt16LE(1, 235); // tick_spacing
    pool.writeInt32LE(-21674, 269); // tick_current
    for (const k of [-366, -364, -363, -361, -359]) setPoolArray(pool, k);

    const extension = getTickArrayBitmapExtensionAddress(poolAddress);
    const solana: any = {
      connection: {
        getAccountInfo: jest.fn(async (key: PublicKey) => {
          if (key.equals(poolAddress)) return { data: pool };
          if (key.equals(extension)) return { data: ext };
          throw new Error(`unexpected account fetch ${key}`);
        }),
      },
    };

    async function build(inputMint: PublicKey, outputMint: PublicKey) {
      return buildSwapV2Instruction(
        solana,
        poolAddress.toBase58(),
        wallet,
        inputMint,
        outputMint,
        new BN(1000),
        new BN(0),
        new BN(0),
        true,
      );
    }

    it('passes the bitmap extension, then the initialized tick arrays below, for token0 in', async () => {
      const ix = await build(mint0, mint1);
      expect(ix.programId.equals(PANCAKESWAP_CLMM_PROGRAM_ID)).toBe(true);
      expect(ix.keys).toHaveLength(13 + 1 + 3);
      expect(ix.keys[5].pubkey.equals(vault0)).toBe(true); // input_vault
      expect(ix.keys[6].pubkey.equals(vault1)).toBe(true); // output_vault
      expect(ix.keys[13]).toEqual({ pubkey: extension, isSigner: false, isWritable: false });
      expect(ix.keys.slice(14)).toEqual(
        [-21780, -21840, -21960].map((s) => ({
          pubkey: getTickArrayAddress(poolAddress, s),
          isSigner: false,
          isWritable: true,
        })),
      );
    });

    it('passes the initialized tick arrays above for token1 in', async () => {
      const ix = await build(mint1, mint0);
      expect(ix.keys).toHaveLength(13 + 1 + 2);
      expect(ix.keys[13].pubkey.equals(extension)).toBe(true);
      expect(ix.keys.slice(14).map((k) => k.pubkey.toBase58())).toEqual(
        [-21660, -21540].map((s) => getTickArrayAddress(poolAddress, s).toBase58()),
      );
    });

    it('rejects an input mint that is not in the pool', async () => {
      await expect(build(Keypair.generate().publicKey, mint1)).rejects.toThrow(/is not in pool/);
    });
  });
});
