import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';

import { OreConfig } from './ore.config';

/**
 * Instruction builders for the ORE program.
 * ORE uses the Steel framework with single-byte discriminators (NOT Anchor 8-byte discriminators).
 * Instruction data format: [discriminator (1 byte)] [args...] with all integers little-endian.
 *
 * Account layouts and discriminators are taken from the ORE `api` crate
 * (regolith-labs/ore: `api/src/sdk.rs`, `api/src/instruction.rs`) and were verified against
 * live mainnet transactions of the deployed program (oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv).
 */

// ============================================================================
// Instruction Data Builders
// ============================================================================

/**
 * Build deploy instruction data.
 * Args: amount (u64), squares bitmask (u32)  →  Deploy { amount: [u8;8], squares: [u8;4] }
 */
function buildDeployData(amountLamports: bigint, squaresBitmask: number): Buffer {
  const buffer = Buffer.alloc(1 + 8 + 4);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.deploy, 0);
  buffer.writeBigUInt64LE(amountLamports, 1);
  buffer.writeUInt32LE(squaresBitmask, 9);
  return buffer;
}

/** Build checkpoint instruction data. Args: none. */
function buildCheckpointData(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.checkpoint, 0);
  return buffer;
}

/** Build claimSol instruction data. Args: none. */
function buildClaimSolData(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.claimSol, 0);
  return buffer;
}

/**
 * Build claimOre instruction data.
 * Args: bps (u64)  →  ClaimORE { bps: [u8;8] }. bps is the portion to claim in basis points
 * (10000 = 100%), clamped on-chain to <= 10000.
 */
function buildClaimOreData(bps: bigint): Buffer {
  const buffer = Buffer.alloc(1 + 8);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.claimOre, 0);
  buffer.writeBigUInt64LE(bps, 1);
  return buffer;
}

// ============================================================================
// Instruction Builders
// ============================================================================

/**
 * Create deploy instruction.
 * Deploys SOL to selected squares for the current round.
 * Account layout (12): ORE `sdk::deploy`.
 */
export function createDeployInstruction(
  signer: PublicKey,
  amountLamports: bigint,
  squaresBitmask: number,
  currentRoundId: bigint,
): TransactionInstruction {
  // For a user-signed deploy the signer is also the miner authority.
  const authority = signer;
  const [automation] = OreConfig.getAutomationPDA(authority);
  const [board] = OreConfig.getBoardPDA();
  const [config] = OreConfig.getConfigPDA();
  const [miner] = OreConfig.getMinerPDA(authority);
  const [round] = OreConfig.getRoundPDA(currentRoundId);
  const [treasury] = OreConfig.getTreasuryPDA();

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: true },
    { pubkey: automation, isSigner: false, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: round, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: OreConfig.ORE_PROGRAM_ID, isSigner: false, isWritable: false },
    // Entropy accounts.
    { pubkey: OreConfig.ENTROPY_VAR_ADDRESS, isSigner: false, isWritable: true },
    { pubkey: OreConfig.ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildDeployData(amountLamports, squaresBitmask),
  });
}

/**
 * Create checkpoint instruction.
 * Settles miner rewards for a completed round.
 * Account layout (8): ORE `sdk::checkpoint`.
 */
export function createCheckpointInstruction(signer: PublicKey, completedRoundId: bigint): TransactionInstruction {
  const authority = signer;
  const [automation] = OreConfig.getAutomationPDA(authority);
  const [board] = OreConfig.getBoardPDA();
  const [miner] = OreConfig.getMinerPDA(authority);
  const [round] = OreConfig.getRoundPDA(completedRoundId);
  const [treasury] = OreConfig.getTreasuryPDA();

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: true },
    { pubkey: automation, isSigner: false, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: round, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildCheckpointData(),
  });
}

/**
 * Create claimSol instruction.
 * Claims SOL rewards from the miner account.
 * Account layout (5): ORE `sdk::claim_sol`.
 */
export function createClaimSolInstruction(signer: PublicKey): TransactionInstruction {
  const [board] = OreConfig.getBoardPDA();
  const [miner] = OreConfig.getMinerPDA(signer);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: OreConfig.ORE_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildClaimSolData(),
  });
}

/**
 * Create claimOre instruction.
 * Claims a portion (bps of 10000) of the miner's ORE rewards from the treasury vault.
 * Account layout (11): ORE `sdk::claim_ore`.
 */
export function createClaimOreInstruction(signer: PublicKey, bps: bigint): TransactionInstruction {
  const [board] = OreConfig.getBoardPDA();
  const [miner] = OreConfig.getMinerPDA(signer);
  const [treasury] = OreConfig.getTreasuryPDA();

  // Treasury's ORE token account (source) and signer's ORE token account (recipient).
  const treasuryTokens = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, treasury, true);
  const recipient = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, signer);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: OreConfig.ORE_TOKEN_MINT, isSigner: false, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: treasuryTokens, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: OreConfig.ORE_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildClaimOreData(bps),
  });
}
