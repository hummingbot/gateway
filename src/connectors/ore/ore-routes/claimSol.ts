import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createClaimSolInstruction } from '../ore.instructions';
import {
  OreClaimSolRequest,
  OreClaimSolRequestType,
  OreTransactionResponse,
  OreTransactionResponseType,
} from '../schemas';

export async function claimSol(network: string, walletAddress: string): Promise<OreTransactionResponseType> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  const ore = await Ore.getInstance(network);
  const { wallet, isHardwareWallet } = await ore.prepareWallet(walletAddress);

  // Verify miner account exists
  const miner = await ore.getMinerAccount(walletAddress);
  if (!miner) {
    throw httpErrors.notFound(`Miner account not found for wallet: ${walletAddress}`);
  }

  // Check if there are SOL rewards to claim
  if (miner.rewardsSol <= 0n) {
    throw httpErrors.badRequest('No SOL rewards available to claim');
  }

  // Create claim SOL instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const claimSolIx = createClaimSolInstruction(signerPubkey);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [claimSolIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  const rewardsLamports = miner.rewardsSol;
  logger.info(`Claiming ${rewardsLamports} lamports in SOL rewards`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Claimed ${rewardsLamports} lamports in SOL rewards`,
  };
}

export const claimSolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreClaimSolRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/claim-sol',
    {
      schema: {
        description: 'Claim SOL rewards from mining',
        tags: ['/connector/ore'],
        body: OreClaimSolRequest,
        response: {
          200: OreTransactionResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.body.network || 'mainnet-beta';
        const walletAddress = request.body.walletAddress;

        if (!walletAddress) {
          throw httpErrors.badRequest('walletAddress is required');
        }

        return await claimSol(network, walletAddress);
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

export default claimSolRoute;
