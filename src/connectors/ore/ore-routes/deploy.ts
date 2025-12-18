import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createDeployInstruction } from '../ore.instructions';
import { squaresToBitmask } from '../ore.parser';
import { OreDeployRequest, OreDeployRequestType, OreTransactionResponse, OreTransactionResponseType } from '../schemas';

import { checkpoint } from './checkpoint';

const LAMPORTS_PER_SOL = 1_000_000_000;

export async function deploy(
  network: string,
  walletAddress: string,
  amountSol: number,
  squares: number[],
): Promise<OreTransactionResponseType> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Validate amount
  if (amountSol <= 0) {
    throw httpErrors.badRequest('Amount must be greater than 0');
  }

  // Validate square indices (1-25) and convert to 0-indexed
  const squaresInternal: number[] = [];
  for (const sq of squares) {
    if (sq < 1 || sq > 25) {
      throw httpErrors.badRequest(`Invalid square index: ${sq}. Must be 1-25`);
    }
    squaresInternal.push(sq - 1); // Convert to 0-indexed for internal use
  }
  const squaresBitmask = squaresToBitmask(squaresInternal);

  if (squaresBitmask === 0) {
    throw httpErrors.badRequest('At least one square must be selected');
  }

  const ore = await Ore.getInstance(network);
  const { wallet, isHardwareWallet } = await ore.prepareWallet(walletAddress);

  // Get current board to determine round ID
  const board = await ore.getBoardAccount();
  const currentRoundId = board.roundId;

  // Check if miner needs to checkpoint first
  const miner = await ore.getMinerAccount(walletAddress);
  if (miner && miner.roundId < currentRoundId) {
    // Miner has pending rewards from a previous round - checkpoint first
    logger.info(`Miner needs checkpoint for round ${miner.roundId}, running checkpoint first...`);
    await checkpoint(network, walletAddress, miner.roundId.toString());
  }

  // Get config for entropy var address
  const config = await ore.getConfigAccount();

  // Convert SOL to lamports
  const amountLamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));

  // Create deploy instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const deployIx = createDeployInstruction(
    signerPubkey,
    amountLamports,
    squaresBitmask,
    currentRoundId,
    config.varAddress,
  );

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [deployIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  logger.info(`Deploying ${amountSol} SOL to squares (bitmask: ${squaresBitmask}) for round ${currentRoundId}`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Deployed ${amountSol} SOL to ${squares.length} square(s)`,
  };
}

export const deployRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreDeployRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/deploy',
    {
      schema: {
        description: 'Deploy SOL to squares in the current ORE round',
        tags: ['/connector/ore'],
        body: OreDeployRequest,
        response: {
          200: OreTransactionResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.body.network || 'mainnet-beta';
        const walletAddress = request.body.walletAddress;
        const { amount, squares } = request.body;

        if (!walletAddress) {
          throw httpErrors.badRequest('walletAddress is required');
        }

        return await deploy(network, walletAddress, amount, squares);
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

export default deployRoute;
