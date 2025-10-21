import { BorshCoder, Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from './pancakeswap-sol';
import {
  buildSwapV2Instruction,
  buildClosePositionInstruction,
  buildDecreaseLiquidityV2Instruction,
  buildIncreaseLiquidityV2Instruction,
  buildOpenPositionWithToken22NftInstruction,
} from './pancakeswap-sol.instructions';
import {
  getTokenProgramForMint,
  getTickArrayStartIndexFromTick,
  getTickArrayAddress,
  parsePositionData,
  parsePoolTickSpacing,
  MEMO_PROGRAM_ID,
} from './pancakeswap-sol.parser';

const clmmIdl = require('./idl/clmm.json') as Idl;

export async function buildSwapTransaction(
  solana: Solana,
  poolAddress: string,
  walletPubkey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  otherAmountThreshold: BN,
  sqrtPriceLimitX64: BN,
  isBaseInput: boolean,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Detect token programs for input/output mints
  const [inputTokenProgram, outputTokenProgram] = await Promise.all([
    getTokenProgramForMint(solana, inputMint),
    getTokenProgramForMint(solana, outputMint),
  ]);

  // Get token accounts with correct token programs
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, walletPubkey, false, inputTokenProgram);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, walletPubkey, false, outputTokenProgram);

  // Check if token accounts exist
  const [inputAccountInfo, outputAccountInfo] = await Promise.all([
    solana.connection.getAccountInfo(inputTokenAccount),
    solana.connection.getAccountInfo(outputTokenAccount),
  ]);

  // Track if we're using WSOL (to close it after swap)
  const isInputSOL = inputMint.equals(NATIVE_MINT);

  // Create input token account if needed
  if (!inputAccountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        walletPubkey, // payer
        inputTokenAccount, // ata
        walletPubkey, // owner
        inputMint, // mint
        inputTokenProgram, // token program
      ),
    );
  }

  // If input is native SOL, wrap it (regardless of whether account exists)
  if (isInputSOL) {
    // Transfer SOL to WSOL account to wrap it
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: walletPubkey,
        toPubkey: inputTokenAccount,
        lamports: amount.toNumber(),
      }),
    );
    // Sync native (wraps SOL to WSOL)
    instructions.push(createSyncNativeInstruction(inputTokenAccount, inputTokenProgram));
  }

  // Create output token account if needed
  if (!outputAccountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        walletPubkey, // payer
        outputTokenAccount, // ata
        walletPubkey, // owner
        outputMint, // mint
        outputTokenProgram, // token program
      ),
    );
  }

  // Build and add swap instruction
  const swapIx = await buildSwapV2Instruction(
    solana,
    poolAddress,
    walletPubkey,
    inputMint,
    outputMint,
    amount,
    otherAmountThreshold,
    sqrtPriceLimitX64,
    isBaseInput,
  );
  instructions.push(swapIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function buildClosePositionTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  computeUnits: number = 400000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const closePositionIx = await buildClosePositionInstruction(solana, positionNftMint, walletPubkey);

  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Add close position instruction
  instructions.push(closePositionIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function buildTransactionWithInstructions(
  solana: Solana,
  walletPubkey: PublicKey,
  instructions: TransactionInstruction[],
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const allInstructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  allInstructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    allInstructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Add provided instructions
  allInstructions.push(...instructions);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions: allInstructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function buildRemoveLiquidityTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  liquidityToRemove: BN,
  amount0Min: BN,
  amount1Min: BN,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const removeLiqIx = await buildDecreaseLiquidityV2Instruction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidityToRemove,
    amount0Min,
    amount1Min,
  );

  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Add remove liquidity instruction
  instructions.push(removeLiqIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function buildAddLiquidityTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  liquidity: BN,
  amount0Max: BN,
  amount1Max: BN,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const addLiqIx = await buildIncreaseLiquidityV2Instruction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidity,
    amount0Max,
    amount1Max,
  );

  const instructions: TransactionInstruction[] = [];

  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  instructions.push(addLiqIx);

  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function buildOpenPositionTransaction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  tickLowerIndex: number,
  tickUpperIndex: number,
  amount0Max: BN,
  amount1Max: BN,
  withMetadata: boolean,
  baseFlag: boolean,
  computeUnits: number = 800000,
  priorityFeePerCU?: number,
): Promise<{ transaction: VersionedTransaction; positionNftMint: Keypair }> {
  // Generate new keypair for NFT mint
  const positionNftMint = Keypair.generate();

  const openPositionIx = await buildOpenPositionWithToken22NftInstruction(
    solana,
    poolAddress,
    walletPubkey,
    positionNftMint,
    tickLowerIndex,
    tickUpperIndex,
    amount0Max,
    amount1Max,
    withMetadata,
    baseFlag,
  );

  const instructions: TransactionInstruction[] = [];

  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  instructions.push(openPositionIx);

  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  return { transaction, positionNftMint };
}
