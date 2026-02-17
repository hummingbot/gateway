import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createCheckpointInstruction } from '../ore.instructions';
import {
  OreCheckpointRequest,
  OreCheckpointRequestType,
  OreCheckpointResponse,
  OreCheckpointResponseType,
} from '../schemas';

const ORE_DECIMALS = 11;

export async function checkpoint(
  network: string,
  walletAddress: string,
  roundIdStr?: string,
): Promise<OreCheckpointResponseType> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  const ore = await Ore.getInstance(network);
  const { wallet, isHardwareWallet } = await ore.prepareWallet(walletAddress);

  // Determine round ID to checkpoint
  let roundId: bigint;
  if (roundIdStr) {
    roundId = BigInt(roundIdStr);
  } else {
    // Default to the miner's last round
    const miner = await ore.getMinerAccount(walletAddress);
    if (!miner) {
      throw httpErrors.notFound(`Miner account not found for wallet: ${walletAddress}`);
    }
    roundId = miner.roundId;
  }

  // Verify miner has participated in this round
  const miner = await ore.getMinerAccount(walletAddress);
  if (!miner) {
    throw httpErrors.notFound(`Miner account not found for wallet: ${walletAddress}`);
  }

  // Check if already checkpointed (miner.roundId has moved past the requested round)
  if (miner.roundId > roundId) {
    throw httpErrors.badRequest(
      `Round ${roundId} has already been checkpointed. Miner is now on round ${miner.roundId}.`,
    );
  }

  // Verify miner actually participated in the specified round
  if (miner.roundId !== roundId) {
    throw httpErrors.badRequest(
      `Miner last participated in round ${miner.roundId}, not round ${roundId}. ` +
        `Checkpoint is only needed for rounds you participated in.`,
    );
  }

  // Get round info to determine winning square and calculate results
  const round = await ore.getRoundAccount(roundId);

  // Calculate winning square from slotHash
  const isFinalized = !round.slotHash.every((b) => b === 0);
  if (!isFinalized) {
    throw httpErrors.badRequest(`Round ${roundId} is not yet finalized. Wait for the round to complete.`);
  }

  const view = new DataView(round.slotHash.buffer, round.slotHash.byteOffset, 32);
  const r1 = view.getBigUint64(0, true);
  const r2 = view.getBigUint64(8, true);
  const r3 = view.getBigUint64(16, true);
  const r4 = view.getBigUint64(24, true);
  const rng = r1 ^ r2 ^ r3 ^ r4;
  const winningSquareIndex = Number(rng % 25n); // 0-indexed internally
  const winningSquare = winningSquareIndex + 1; // 1-indexed for API response

  // Get miner's deployed squares and total
  const deployedSquares: number[] = [];
  let totalDeployedLamports = 0n;
  let deployedToWinningSquare = false;
  let deployedToWinningSquareLamports = 0n;

  for (let i = 0; i < 25; i++) {
    if (miner.deployed[i] > 0n) {
      deployedSquares.push(i + 1); // 1-indexed for API response
      totalDeployedLamports += miner.deployed[i];
      if (i === winningSquareIndex) {
        deployedToWinningSquare = true;
        deployedToWinningSquareLamports = miner.deployed[i];
      }
    }
  }

  // Capture rewards before checkpoint
  const rewardsSolBefore = miner.rewardsSol;
  const rewardsOreBefore = miner.rewardsOre;

  // Create checkpoint instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const checkpointIx = createCheckpointInstruction(signerPubkey, roundId);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [checkpointIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  logger.info(`Creating checkpoint for round ${roundId}`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  // Get updated miner account to see new rewards
  const minerAfter = await ore.getMinerAccount(walletAddress);
  const rewardsSolAfter = minerAfter ? minerAfter.rewardsSol : rewardsSolBefore;
  const rewardsOreAfter = minerAfter ? minerAfter.rewardsOre : rewardsOreBefore;

  // Calculate winnings from this checkpoint
  const wonSolLamports = rewardsSolAfter - rewardsSolBefore;
  const wonOreRaw = rewardsOreAfter - rewardsOreBefore;

  return {
    signature,
    roundId: Number(roundId),
    winningSquare,
    deployedSquares,
    deployedSol: Number(totalDeployedLamports) / 1_000_000_000,
    won: deployedToWinningSquare,
    wonSol: Number(wonSolLamports) / 1_000_000_000,
    wonOre: Number(wonOreRaw) / 10 ** ORE_DECIMALS,
  };
}

export const checkpointRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreCheckpointRequestType;
    Reply: OreCheckpointResponseType;
  }>(
    '/check-round',
    {
      schema: {
        description: 'Settle miner rewards for a completed round and return results',
        tags: ['/connector/ore'],
        body: OreCheckpointRequest,
        response: {
          200: OreCheckpointResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.body.network || 'mainnet-beta';
        const walletAddress = request.body.walletAddress;
        const { roundId } = request.body;

        if (!walletAddress) {
          throw httpErrors.badRequest('walletAddress is required');
        }

        return await checkpoint(network, walletAddress, roundId);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default checkpointRoute;
