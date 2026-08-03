import { PublicKey } from '@solana/web3.js';

import { OreConfig } from './ore.config';

/**
 * Account data structures parsed from on-chain ORE program state.
 *
 * ORE uses the Steel framework: each account is an 8-byte discriminator ([enumValue, 0, 0, 0, 0, 0, 0, 0])
 * followed by a `#[repr(C)]` Pod struct. All integers are little-endian.
 *
 * Layouts mirror the ORE `api` crate (regolith-labs/ore: `api/src/state/*.rs`) and were verified
 * against on-chain account sizes on mainnet. `Numeric` is a 16-byte fixed-point value.
 */

// ============================================================================
// Parsed Account Types
// ============================================================================

export interface BoardAccount {
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
  productionCostEma: bigint;
}

export interface MinerAccount {
  authority: PublicKey;
  autoReturn: bigint;
  checkpointId: bigint;
  checkpointFee: bigint;
  deployed: bigint[]; // 25 u64 values (SOL per square)
  mass: bigint[]; // 25 u64 values
  cumulative: bigint[]; // 25 u64 values
  roundId: bigint;
  rewardsFactor: Uint8Array; // 16 bytes (Numeric)
  rewardsSol: bigint;
  refinedOre: bigint;
  rewardsOre: bigint;
  lastClaimOreAt: bigint;
  lastClaimSolAt: bigint;
  lifetimeRewardsOre: bigint;
  lifetimeDeployed: bigint;
  lifetimeRewardsSol: bigint;
}

export interface RoundAccount {
  id: bigint;
  deployed: bigint[]; // 25 u64 values
  mass: bigint[]; // 25 u64 values
  count: bigint[]; // 25 u64 values (unique miners per square)
  slotHash: Uint8Array; // 32 bytes (entropy)
  expiresAt: bigint;
  motherlode: bigint;
  rentPayer: PublicKey;
  rewards: bigint[]; // 25 u64 values (ORE reward per square)
  totalVaulted: bigint;
  totalWinnings: bigint;
  totalMiners: bigint;
  topMiner: PublicKey;
  // Derived (not stored on-chain):
  totalDeployed: bigint; // sum(deployed)
  topMinerReward: bigint; // sum(rewards)
}

export interface TreasuryAccount {
  motherlode: bigint;
  minerRewardsFactor: Uint8Array; // 16 bytes (Numeric)
  totalRefined: bigint;
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
 * Parse Board account (ORE `state::Board`). Struct size 32 bytes (+8 disc = 40).
 * round_id (u64), start_slot (u64), end_slot (u64), production_cost_ema (u64).
 */
export function parseBoardAccount(data: Buffer): BoardAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Board)) {
    throw new Error('Invalid Board account discriminator');
  }

  return {
    roundId: readU64LE(data, 8),
    startSlot: readU64LE(data, 16),
    endSlot: readU64LE(data, 24),
    productionCostEma: readU64LE(data, 32),
  };
}

/**
 * Parse Miner account (ORE `state::Miner`). Struct size 744 bytes (+8 disc = 752).
 * Field order matches the Rust struct exactly.
 */
export function parseMinerAccount(data: Buffer): MinerAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Miner)) {
    throw new Error('Invalid Miner account discriminator');
  }

  let offset = 8;

  const authority = readPublicKey(data, offset);
  offset += 32;
  const autoReturn = readU64LE(data, offset);
  offset += 8;
  const checkpointId = readU64LE(data, offset);
  offset += 8;
  const checkpointFee = readU64LE(data, offset);
  offset += 8;
  const deployed = readU64Array(data, offset, 25);
  offset += 200;
  const mass = readU64Array(data, offset, 25);
  offset += 200;
  const cumulative = readU64Array(data, offset, 25);
  offset += 200;
  const roundId = readU64LE(data, offset);
  offset += 8;
  const rewardsFactor = new Uint8Array(data.subarray(offset, offset + 16));
  offset += 16;
  const rewardsSol = readU64LE(data, offset);
  offset += 8;
  const refinedOre = readU64LE(data, offset);
  offset += 8;
  const rewardsOre = readU64LE(data, offset);
  offset += 8;
  const lastClaimOreAt = readI64LE(data, offset);
  offset += 8;
  const lastClaimSolAt = readI64LE(data, offset);
  offset += 8;
  const lifetimeRewardsOre = readU64LE(data, offset);
  offset += 8;
  const lifetimeDeployed = readU64LE(data, offset);
  offset += 8;
  const lifetimeRewardsSol = readU64LE(data, offset);

  return {
    authority,
    autoReturn,
    checkpointId,
    checkpointFee,
    deployed,
    mass,
    cumulative,
    roundId,
    rewardsFactor,
    rewardsSol,
    refinedOre,
    rewardsOre,
    lastClaimOreAt,
    lastClaimSolAt,
    lifetimeRewardsOre,
    lifetimeDeployed,
    lifetimeRewardsSol,
  };
}

/**
 * Parse Round account (ORE `state::Round`). Struct size 944 bytes (+8 disc = 952).
 * Field order matches the Rust struct exactly.
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
  const mass = readU64Array(data, offset, 25);
  offset += 200;
  const count = readU64Array(data, offset, 25);
  offset += 200;
  const slotHash = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;
  const expiresAt = readU64LE(data, offset);
  offset += 8;
  const motherlode = readU64LE(data, offset);
  offset += 8;
  const rentPayer = readPublicKey(data, offset);
  offset += 32;
  const rewards = readU64Array(data, offset, 25);
  offset += 200;
  const totalVaulted = readU64LE(data, offset);
  offset += 8;
  const totalWinnings = readU64LE(data, offset);
  offset += 8;
  const totalMiners = readU64LE(data, offset);
  offset += 8;
  const topMiner = readPublicKey(data, offset);

  const totalDeployed = deployed.reduce((a, b) => a + b, 0n);
  const topMinerReward = rewards.reduce((a, b) => a + b, 0n);

  return {
    id,
    deployed,
    mass,
    count,
    slotHash,
    expiresAt,
    motherlode,
    rentPayer,
    rewards,
    totalVaulted,
    totalWinnings,
    totalMiners,
    topMiner,
    totalDeployed,
    topMinerReward,
  };
}

/**
 * Parse Treasury account (ORE `state::Treasury`). Struct size 40 bytes (+8 disc = 48).
 * motherlode (u64), miner_rewards_factor (Numeric, 16 bytes), total_refined (u64), total_unclaimed (u64).
 */
export function parseTreasuryAccount(data: Buffer): TreasuryAccount {
  if (!verifyDiscriminator(data, OreConfig.ACCOUNT_DISCRIMINATORS.Treasury)) {
    throw new Error('Invalid Treasury account discriminator');
  }

  return {
    motherlode: readU64LE(data, 8),
    minerRewardsFactor: new Uint8Array(data.subarray(16, 32)),
    totalRefined: readU64LE(data, 32),
    totalUnclaimed: readU64LE(data, 40),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert square indices array to bitmask.
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
 * Convert bitmask to square indices array.
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
