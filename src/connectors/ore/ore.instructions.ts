import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, TransactionInstruction, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY } from '@solana/web3.js';

import { OreConfig } from './ore.config';

/**
 * Instruction builders for ORE program.
 * ORE uses Steel framework with single u8 discriminators (NOT Anchor 8-byte discriminators).
 * Instruction data format: [discriminator (1 byte)] [args...]
 * All integers are little-endian.
 */

// ============================================================================
// Instruction Data Builders
// ============================================================================

/**
 * Build deploy instruction data
 * Args: amount (u64), squares (u32)
 */
function buildDeployData(amountLamports: bigint, squaresBitmask: number): Buffer {
  const buffer = Buffer.alloc(1 + 8 + 4);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.deploy, 0);
  buffer.writeBigUInt64LE(amountLamports, 1);
  buffer.writeUInt32LE(squaresBitmask, 9);
  return buffer;
}

/**
 * Build checkpoint instruction data
 * Args: none
 */
function buildCheckpointData(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.checkpoint, 0);
  return buffer;
}

/**
 * Build claimSol instruction data
 * Args: none
 */
function buildClaimSolData(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.claimSol, 0);
  return buffer;
}

/**
 * Build claimOre instruction data
 * Args: none
 */
function buildClaimOreData(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.claimOre, 0);
  return buffer;
}

/**
 * Build deposit (stake) instruction data
 * Args: amount (u64)
 */
function buildDepositData(amount: bigint): Buffer {
  const buffer = Buffer.alloc(1 + 8);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.deposit, 0);
  buffer.writeBigUInt64LE(amount, 1);
  return buffer;
}

/**
 * Build withdraw (unstake) instruction data
 * Args: amount (u64)
 */
function buildWithdrawData(amount: bigint): Buffer {
  const buffer = Buffer.alloc(1 + 8);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.withdraw, 0);
  buffer.writeBigUInt64LE(amount, 1);
  return buffer;
}

/**
 * Build claimYield instruction data
 * Args: amount (u64)
 */
function buildClaimYieldData(amount: bigint): Buffer {
  const buffer = Buffer.alloc(1 + 8);
  buffer.writeUInt8(OreConfig.DISCRIMINATORS.claimYield, 0);
  buffer.writeBigUInt64LE(amount, 1);
  return buffer;
}

// ============================================================================
// Instruction Builders
// ============================================================================

/**
 * Create deploy instruction
 * Deploys SOL to selected squares for the current round.
 */
export function createDeployInstruction(
  signer: PublicKey,
  amountLamports: bigint,
  squaresBitmask: number,
  currentRoundId: bigint,
  entropyVarAddress: PublicKey,
): TransactionInstruction {
  const [automation] = OreConfig.getAutomationPDA(signer);
  const [board] = OreConfig.getBoardPDA();
  const [config] = OreConfig.getConfigPDA();
  const [miner] = OreConfig.getMinerPDA(signer);
  const [round] = OreConfig.getRoundPDA(currentRoundId);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: signer, isSigner: false, isWritable: false }, // authority (read-only)
    { pubkey: automation, isSigner: false, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: round, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: OreConfig.ORE_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: entropyVarAddress, isSigner: false, isWritable: true },
    { pubkey: OreConfig.ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildDeployData(amountLamports, squaresBitmask),
  });
}

/**
 * Create checkpoint instruction
 * Settles miner rewards for a completed round.
 */
export function createCheckpointInstruction(signer: PublicKey, completedRoundId: bigint): TransactionInstruction {
  const [board] = OreConfig.getBoardPDA();
  const [miner] = OreConfig.getMinerPDA(signer);
  const [round] = OreConfig.getRoundPDA(completedRoundId);
  const [treasury] = OreConfig.getTreasuryPDA();

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: board, isSigner: false, isWritable: false },
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
 * Create claimSol instruction
 * Claims SOL rewards from the miner account.
 */
export function createClaimSolInstruction(signer: PublicKey): TransactionInstruction {
  const [miner] = OreConfig.getMinerPDA(signer);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildClaimSolData(),
  });
}

/**
 * Create claimOre instruction
 * Claims ORE token rewards from the treasury vault.
 */
export function createClaimOreInstruction(signer: PublicKey): TransactionInstruction {
  const [miner] = OreConfig.getMinerPDA(signer);
  const [treasury] = OreConfig.getTreasuryPDA();

  // Get treasury's ORE token account
  const treasuryTokens = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, treasury, true);

  // Get signer's ORE token account (recipient)
  const recipient = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, signer);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: miner, isSigner: false, isWritable: true },
    { pubkey: OreConfig.ORE_TOKEN_MINT, isSigner: false, isWritable: false },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: treasuryTokens, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildClaimOreData(),
  });
}

/**
 * Create deposit (stake) instruction
 * Deposits ORE into a staking account.
 */
export function createDepositInstruction(signer: PublicKey, amount: bigint): TransactionInstruction {
  const [stake] = OreConfig.getStakePDA(signer);
  const [treasury] = OreConfig.getTreasuryPDA();

  // Get signer's ORE token account (sender)
  const sender = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, signer);

  // Get stake's ORE token account
  const stakeTokens = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, stake, true);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: OreConfig.ORE_TOKEN_MINT, isSigner: false, isWritable: false },
    { pubkey: sender, isSigner: false, isWritable: true },
    { pubkey: stake, isSigner: false, isWritable: true },
    { pubkey: stakeTokens, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildDepositData(amount),
  });
}

/**
 * Create withdraw (unstake) instruction
 * Withdraws ORE from a staking account.
 */
export function createWithdrawInstruction(signer: PublicKey, amount: bigint): TransactionInstruction {
  const [stake] = OreConfig.getStakePDA(signer);
  const [treasury] = OreConfig.getTreasuryPDA();

  // Get signer's ORE token account (recipient)
  const recipient = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, signer);

  // Get stake's ORE token account
  const stakeTokens = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, stake, true);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: OreConfig.ORE_TOKEN_MINT, isSigner: false, isWritable: false },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: stake, isSigner: false, isWritable: true },
    { pubkey: stakeTokens, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildWithdrawData(amount),
  });
}

/**
 * Create claimYield instruction
 * Claims accrued staking rewards.
 */
export function createClaimYieldInstruction(signer: PublicKey, amount: bigint): TransactionInstruction {
  const [stake] = OreConfig.getStakePDA(signer);
  const [treasury] = OreConfig.getTreasuryPDA();

  // Get signer's ORE token account (recipient)
  const recipient = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, signer);

  // Get treasury's ORE token account
  const treasuryTokens = getAssociatedTokenAddressSync(OreConfig.ORE_TOKEN_MINT, treasury, true);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: OreConfig.ORE_TOKEN_MINT, isSigner: false, isWritable: false },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: stake, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: treasuryTokens, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: OreConfig.ORE_PROGRAM_ID,
    data: buildClaimYieldData(amount),
  });
}
