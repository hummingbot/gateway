import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createClaimOreInstruction } from '../ore.instructions';
import {
  OreClaimOreRequest,
  OreClaimOreRequestType,
  OreTransactionResponse,
  OreTransactionResponseType,
} from '../schemas';

export async function claimOre(network: string, walletAddress: string): Promise<OreTransactionResponseType> {
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

  // Check if there are ORE rewards to claim
  if (miner.rewardsOre <= 0n) {
    throw httpErrors.badRequest('No ORE rewards available to claim');
  }

  // Create claim ORE instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const claimOreIx = createClaimOreInstruction(signerPubkey);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [claimOreIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  const rewardsOre = miner.rewardsOre;
  logger.info(`Claiming ${rewardsOre} ORE token rewards`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Claimed ${rewardsOre} ORE token rewards`,
  };
}

export const claimOreRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreClaimOreRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/claim-ore',
    {
      schema: {
        description: 'Claim ORE token rewards from mining',
        tags: ['/connector/ore'],
        body: OreClaimOreRequest,
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

        return await claimOre(network, walletAddress);
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

export default claimOreRoute;
