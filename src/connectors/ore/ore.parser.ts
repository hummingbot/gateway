import { PublicKey } from '@solana/web3.js';

import { OreConfig } from './ore.config';

/**
 * Account data structures parsed from on-chain data.
 * ORE uses Steel framework with 8-byte discriminators followed by struct fields.
 * All integers are little-endian.
 */

// ============================================================================
// Parsed Account Types
// ============================================================================

export interface BoardAccount {
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
  epochId: bigint;
}

export interface ConfigAccount {
  admin: PublicKey;
  buryAuthority: PublicKey;
  feeCollector: PublicKey;
  swapProgram: PublicKey;
  varAddress: PublicKey;
  buffer: bigint;
}

export interface MinerAccount {
  authority: PublicKey;
  deployed: bigint[]; // 25 u64 values
  cumulative: bigint[]; // 25 u64 values
  checkpointFee: bigint;
  checkpointId: bigint;
  lastClaimOreAt: bigint;
  lastClaimSolAt: bigint;
  rewardsFactor: Uint8Array; // 16 bytes (Numeric/I80F48)
  rewardsSol: bigint;
  rewardsOre: bigint;
  refinedOre: bigint;
  roundId: bigint;
  lifetimeRewardsSol: bigint;
  lifetimeRewardsOre: bigint;
  lifetimeDeployed: bigint;
}

export interface RoundAccount {
  id: bigint;
  deployed: bigint[]; // 25 u64 values
  slotHash: Uint8Array; // 32 bytes
  count: bigint[]; // 25 u64 values
  expiresAt: bigint;
  motherlode: bigint;
  rentPayer: PublicKey;
  topMiner: PublicKey;
  topMinerReward: bigint;
  totalDeployed: bigint;
  totalMiners: bigint;
  totalVaulted: bigint;
  totalWinnings: bigint;
}

export interface StakeAccount {
  authority: PublicKey;
  balance: bigint;
  bufferA: bigint;
  bufferB: bigint;
  bufferC: bigint;
  bufferD: bigint;
  bufferE: bigint;
  lastClaimAt: bigint;
  lastDepositAt: bigint;
  lastWithdrawAt: bigint;
  rewardsFactor: Uint8Array; // 16 bytes (Numeric/I80F48)
  rewards: bigint;
  lifetimeRewards: bigint;
  bufferF: bigint;
}

export interface TreasuryAccount {
  balance: bigint;
  bufferA: bigint;
  motherlode: bigint;
  minerRewardsFactor: Uint8Array; // 16 bytes
  stakeRewardsFactor: Uint8Array; // 16 bytes
  bufferB: bigint;
  totalRefined: bigint;
  totalStaked: bigint;
  totalUnclaimed: bigint;
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function readU64LE(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readI64LE(data: Buffer, offset: number): bigint {
  return data.readBigInt64LE(offset);
}

function readPublicKey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64Array(data: Buffer, offset: number, count: number): bigint[] {
  const result: bigint[] = [];
  for (let i = 0; i < count; i++) {
    result.push(readU64LE(data, offset + i * 8));
  }
  return result;
}

function verifyDiscriminator(data: Buffer, expected: readonly number[]): boolean {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Account Parsers
// ============================================================================

/**
 * Parse Board account data
 * Layout:
 * - 8 bytes: discriminator [105, 0, 0, 0, 0, 0, 0, 0]
 * - 8 bytes: round_id (u64)
 * - 8 bytes: start_slot (u64)
 * - 8 bytes: end_slot (u64)
 * - 8 bytes: epoch_id (u64)
 */
export function parseBoardAccount(data: Buffer): BoardAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Board)) {
    throw new Error('Invalid Board account discriminator');
  }

  let offset = 8; // Skip discriminator

  const roundId = readU64LE(data, offset);
  offset += 8;

  const startSlot = readU64LE(data, offset);
  offset += 8;

  const endSlot = readU64LE(data, offset);
  offset += 8;

  const epochId = readU64LE(data, offset);

  return { roundId, startSlot, endSlot, epochId };
}

/**
 * Parse Config account data
 * Layout:
 * - 8 bytes: discriminator [101, 0, 0, 0, 0, 0, 0, 0]
 * - 32 bytes: admin (PublicKey)
 * - 32 bytes: bury_authority (PublicKey)
 * - 32 bytes: fee_collector (PublicKey)
 * - 32 bytes: swap_program (PublicKey)
 * - 32 bytes: var_address (PublicKey)
 * - 8 bytes: buffer (u64)
 */
export function parseConfigAccount(data: Buffer): ConfigAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Config)) {
    throw new Error('Invalid Config account discriminator');
  }

  let offset = 8;

  const admin = readPublicKey(data, offset);
  offset += 32;

  const buryAuthority = readPublicKey(data, offset);
  offset += 32;

  const feeCollector = readPublicKey(data, offset);
  offset += 32;

  const swapProgram = readPublicKey(data, offset);
  offset += 32;

  const varAddress = readPublicKey(data, offset);
  offset += 32;

  const buffer = readU64LE(data, offset);

  return { admin, buryAuthority, feeCollector, swapProgram, varAddress, buffer };
}

/**
 * Parse Miner account data
 * Layout:
 * - 8 bytes: discriminator [103, 0, 0, 0, 0, 0, 0, 0]
 * - 32 bytes: authority (PublicKey)
 * - 200 bytes: deployed ([u64; 25])
 * - 200 bytes: cumulative ([u64; 25])
 * - 8 bytes: checkpoint_fee (u64)
 * - 8 bytes: checkpoint_id (u64)
 * - 8 bytes: last_claim_ore_at (i64)
 * - 8 bytes: last_claim_sol_at (i64)
 * - 16 bytes: rewards_factor (Numeric)
 * - 8 bytes: rewards_sol (u64)
 * - 8 bytes: rewards_ore (u64)
 * - 8 bytes: refined_ore (u64)
 * - 8 bytes: round_id (u64)
 * - 8 bytes: lifetime_rewards_sol (u64)
 * - 8 bytes: lifetime_rewards_ore (u64)
 * - 8 bytes: lifetime_deployed (u64)
 */
export function parseMinerAccount(data: Buffer): MinerAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Miner)) {
    throw new Error('Invalid Miner account discriminator');
  }

  let offset = 8;

  const authority = readPublicKey(data, offset);
  offset += 32;

  const deployed = readU64Array(data, offset, 25);
  offset += 200;

  const cumulative = readU64Array(data, offset, 25);
  offset += 200;

  const checkpointFee = readU64LE(data, offset);
  offset += 8;

  const checkpointId = readU64LE(data, offset);
  offset += 8;

  const lastClaimOreAt = readI64LE(data, offset);
  offset += 8;

  const lastClaimSolAt = readI64LE(data, offset);
  offset += 8;

  const rewardsFactor = new Uint8Array(data.subarray(offset, offset + 16));
  offset += 16;

  const rewardsSol = readU64LE(data, offset);
  offset += 8;

  const rewardsOre = readU64LE(data, offset);
  offset += 8;

  const refinedOre = readU64LE(data, offset);
  offset += 8;

  const roundId = readU64LE(data, offset);
  offset += 8;

  const lifetimeRewardsSol = readU64LE(data, offset);
  offset += 8;

  const lifetimeRewardsOre = readU64LE(data, offset);
  offset += 8;

  const lifetimeDeployed = readU64LE(data, offset);

  return {
    authority,
    deployed,
    cumulative,
    checkpointFee,
    checkpointId,
    lastClaimOreAt,
    lastClaimSolAt,
    rewardsFactor,
    rewardsSol,
    rewardsOre,
    refinedOre,
    roundId,
    lifetimeRewardsSol,
    lifetimeRewardsOre,
    lifetimeDeployed,
  };
}

/**
 * Parse Round account data
 * Layout:
 * - 8 bytes: discriminator [109, 0, 0, 0, 0, 0, 0, 0]
 * - 8 bytes: id (u64)
 * - 200 bytes: deployed ([u64; 25])
 * - 32 bytes: slot_hash ([u8; 32])
 * - 200 bytes: count ([u64; 25])
 * - 8 bytes: expires_at (u64)
 * - 8 bytes: motherlode (u64)
 * - 32 bytes: rent_payer (PublicKey)
 * - 32 bytes: top_miner (PublicKey)
 * - 8 bytes: top_miner_reward (u64)
 * - 8 bytes: total_deployed (u64)
 * - 8 bytes: total_miners (u64)
 * - 8 bytes: total_vaulted (u64)
 * - 8 bytes: total_winnings (u64)
 */
export function parseRoundAccount(data: Buffer): RoundAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Round)) {
    throw new Error('Invalid Round account discriminator');
  }

  let offset = 8;

  const id = readU64LE(data, offset);
  offset += 8;

  const deployed = readU64Array(data, offset, 25);
  offset += 200;

  const slotHash = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const count = readU64Array(data, offset, 25);
  offset += 200;

  const expiresAt = readU64LE(data, offset);
  offset += 8;

  const motherlode = readU64LE(data, offset);
  offset += 8;

  const rentPayer = readPublicKey(data, offset);
  offset += 32;

  const topMiner = readPublicKey(data, offset);
  offset += 32;

  const topMinerReward = readU64LE(data, offset);
  offset += 8;

  const totalDeployed = readU64LE(data, offset);
  offset += 8;

  const totalMiners = readU64LE(data, offset);
  offset += 8;

  const totalVaulted = readU64LE(data, offset);
  offset += 8;

  const totalWinnings = readU64LE(data, offset);

  return {
    id,
    deployed,
    slotHash,
    count,
    expiresAt,
    motherlode,
    rentPayer,
    topMiner,
    topMinerReward,
    totalDeployed,
    totalMiners,
    totalVaulted,
    totalWinnings,
  };
}

/**
 * Parse Stake account data
 * Layout:
 * - 8 bytes: discriminator [108, 0, 0, 0, 0, 0, 0, 0]
 * - 32 bytes: authority (PublicKey)
 * - 8 bytes: balance (u64)
 * - 8 bytes: buffer_a (u64)
 * - 8 bytes: buffer_b (u64)
 * - 8 bytes: buffer_c (u64)
 * - 8 bytes: buffer_d (u64)
 * - 8 bytes: buffer_e (u64)
 * - 8 bytes: last_claim_at (i64)
 * - 8 bytes: last_deposit_at (i64)
 * - 8 bytes: last_withdraw_at (i64)
 * - 16 bytes: rewards_factor (Numeric)
 * - 8 bytes: rewards (u64)
 * - 8 bytes: lifetime_rewards (u64)
 * - 8 bytes: buffer_f (u64)
 */
export function parseStakeAccount(data: Buffer): StakeAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Stake)) {
    throw new Error('Invalid Stake account discriminator');
  }

  let offset = 8;

  const authority = readPublicKey(data, offset);
  offset += 32;

  const balance = readU64LE(data, offset);
  offset += 8;

  const bufferA = readU64LE(data, offset);
  offset += 8;

  const bufferB = readU64LE(data, offset);
  offset += 8;

  const bufferC = readU64LE(data, offset);
  offset += 8;

  const bufferD = readU64LE(data, offset);
  offset += 8;

  const bufferE = readU64LE(data, offset);
  offset += 8;

  const lastClaimAt = readI64LE(data, offset);
  offset += 8;

  const lastDepositAt = readI64LE(data, offset);
  offset += 8;

  const lastWithdrawAt = readI64LE(data, offset);
  offset += 8;

  const rewardsFactor = new Uint8Array(data.subarray(offset, offset + 16));
  offset += 16;

  const rewards = readU64LE(data, offset);
  offset += 8;

  const lifetimeRewards = readU64LE(data, offset);
  offset += 8;

  const bufferF = readU64LE(data, offset);

  return {
    authority,
    balance,
    bufferA,
    bufferB,
    bufferC,
    bufferD,
    bufferE,
    lastClaimAt,
    lastDepositAt,
    lastWithdrawAt,
    rewardsFactor,
    rewards,
    lifetimeRewards,
    bufferF,
  };
}

/**
 * Parse Treasury account data
 * Layout:
 * - 8 bytes: discriminator [104, 0, 0, 0, 0, 0, 0, 0]
 * - 8 bytes: balance (u64)
 * - 8 bytes: buffer_a (u64)
 * - 8 bytes: motherlode (u64)
 * - 16 bytes: miner_rewards_factor (Numeric)
 * - 16 bytes: stake_rewards_factor (Numeric)
 * - 8 bytes: buffer_b (u64)
 * - 8 bytes: total_refined (u64)
 * - 8 bytes: total_staked (u64)
 * - 8 bytes: total_unclaimed (u64)
 */
export function parseTreasuryAccount(data: Buffer): TreasuryAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Treasury)) {
    throw new Error('Invalid Treasury account discriminator');
  }

  let offset = 8;

  const balance = readU64LE(data, offset);
  offset += 8;

  const bufferA = readU64LE(data, offset);
  offset += 8;

  const motherlode = readU64LE(data, offset);
  offset += 8;

  const minerRewardsFactor = new Uint8Array(data.subarray(offset, offset + 16));
  offset += 16;

  const stakeRewardsFactor = new Uint8Array(data.subarray(offset, offset + 16));
  offset += 16;

  const bufferB = readU64LE(data, offset);
  offset += 8;

  const totalRefined = readU64LE(data, offset);
  offset += 8;

  const totalStaked = readU64LE(data, offset);
  offset += 8;

  const totalUnclaimed = readU64LE(data, offset);

  return {
    balance,
    bufferA,
    motherlode,
    minerRewardsFactor,
    stakeRewardsFactor,
    bufferB,
    totalRefined,
    totalStaked,
    totalUnclaimed,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert square indices array to bitmask
 * @param squares Array of square indices (0-24)
 * @returns Bitmask as a number
 */
export function squaresToBitmask(squares: number[]): number {
  let bitmask = 0;
  for (const square of squares) {
    if (square < 0 || square > 24) {
      throw new Error(`Invalid square index: ${square}. Must be 0-24.`);
    }
    bitmask |= 1 << square;
  }
  return bitmask;
}

/**
 * Convert bitmask to square indices array
 * @param bitmask Bitmask number
 * @returns Array of square indices
 */
export function bitmaskToSquares(bitmask: number): number[] {
  const squares: number[] = [];
  for (let i = 0; i < 25; i++) {
    if (bitmask & (1 << i)) {
      squares.push(i);
    }
  }
  return squares;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
