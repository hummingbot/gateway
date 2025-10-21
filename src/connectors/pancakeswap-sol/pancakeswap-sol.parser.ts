import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from './pancakeswap-sol';

// Memo program
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Price limit constants for CLMM swaps
// These represent the min/max sqrt(price) * 2^64 based on tick bounds
export const MIN_SQRT_PRICE_X64 = new BN('4295048016'); // Minimum sqrt price
export const MAX_SQRT_PRICE_X64 = new BN('79226673515401279992447579055'); // Maximum sqrt price

/**
 * Helper to detect which token program a mint uses
 */
export async function getTokenProgramForMint(solana: Solana, mint: PublicKey): Promise<PublicKey> {
  // Try Token2022 first
  try {
    const accountInfo = await solana.connection.getAccountInfo(mint);
    if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID;
    }
  } catch (e) {
    // Fall through to TOKEN_PROGRAM_ID
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Calculate tick array start index from tick and tick spacing
 */
export function getTickArrayStartIndexFromTick(tick: number, tickSpacing: number): number {
  const ticksPerArray = tickSpacing * 60; // CLMM uses 60 ticks per array
  return Math.floor(tick / ticksPerArray) * ticksPerArray;
}

/**
 * Convert price to tick index
 * tick = log(price) / log(1.0001)
 */
export function priceToTick(price: number, decimalDiff: number): number {
  const adjustedPrice = price / Math.pow(10, decimalDiff);
  const tick = Math.log(adjustedPrice) / Math.log(1.0001);
  return Math.round(tick);
}

/**
 * Round tick to nearest valid tick based on tick spacing
 */
export function roundTickToSpacing(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Derive tick array address from pool and start index
 */
export function getTickArrayAddress(poolAddress: PublicKey, startIndex: number): PublicKey {
  // Note: PDA seeds use big-endian encoding for i32 values
  const startIndexBuffer = Buffer.alloc(4);
  startIndexBuffer.writeInt32BE(startIndex, 0);

  const [tickArrayAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('tick_array'), poolAddress.toBuffer(), startIndexBuffer],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  return tickArrayAddress;
}

/**
 * Parse position account data to extract key fields
 */
export function parsePositionData(data: Buffer): {
  poolId: PublicKey;
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: BN;
} {
  // Based on PersonalPositionState struct:
  // discriminator (8) + bump (1) + nft_mint (32) = 41 bytes
  let offset = 41;

  // pool_id (32 bytes)
  const poolId = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // tick_lower_index (i32 = 4 bytes)
  const tickLowerIndex = data.readInt32LE(offset);
  offset += 4;

  // tick_upper_index (i32 = 4 bytes)
  const tickUpperIndex = data.readInt32LE(offset);
  offset += 4;

  // liquidity (u128 = 16 bytes)
  const liquidityBytes = data.slice(offset, offset + 16);
  const liquidity = new BN(liquidityBytes, 'le');

  return { poolId, tickLowerIndex, tickUpperIndex, liquidity };
}

/**
 * Parse pool account data to extract tick spacing
 */
export function parsePoolTickSpacing(data: Buffer): number {
  // Skip discriminator (8) + bump (1) + amm_config (32) + owner (32) = 73 bytes
  // Skip token_mint_0 (32) + token_mint_1 (32) = 64 bytes
  // Skip token_vault_0 (32) + token_vault_1 (32) = 64 bytes
  // Skip observation_key (32) = 32 bytes
  // Skip mint_decimals_0 (1) + mint_decimals_1 (1) = 2 bytes
  // Total offset = 73 + 64 + 64 + 32 + 2 = 235
  const offset = 235;

  // tick_spacing is u16 (2 bytes)
  const tickSpacing = data.readUInt16LE(offset);
  return tickSpacing;
}
