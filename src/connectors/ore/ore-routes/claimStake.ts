import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createClaimYieldInstruction } from '../ore.instructions';
import {
  OreClaimStakeRequest,
  OreClaimStakeRequestType,
  OreTransactionResponse,
  OreTransactionResponseType,
} from '../schemas';

const ORE_DECIMALS = 11; // ORE token has 11 decimals

export async function claimStake(
  network: string,
  walletAddress: string,
  amount?: number,
): Promise<OreTransactionResponseType> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  const ore = await Ore.getInstance(network);
  const { wallet, isHardwareWallet } = await ore.prepareWallet(walletAddress);

  // Verify stake account exists and has rewards
  const stakeAccount = await ore.getStakeAccount(walletAddress);
  if (!stakeAccount) {
    throw httpErrors.notFound(`Stake account not found for wallet: ${walletAddress}`);
  }

  if (stakeAccount.rewards <= 0n) {
    throw httpErrors.badRequest('No staking rewards available to claim');
  }

  // Determine claim amount
  let claimAmount: bigint;
  if (amount !== undefined && amount > 0) {
    claimAmount = BigInt(Math.floor(amount * 10 ** ORE_DECIMALS));
    if (claimAmount > stakeAccount.rewards) {
      throw httpErrors.badRequest(
        `Requested amount exceeds available rewards. Available: ${Number(stakeAccount.rewards) / 10 ** ORE_DECIMALS} ORE`,
      );
    }
  } else {
    // Claim all available rewards
    claimAmount = stakeAccount.rewards;
  }

  // Create claim yield instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const claimYieldIx = createClaimYieldInstruction(signerPubkey, claimAmount);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [claimYieldIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  const humanAmount = Number(claimAmount) / 10 ** ORE_DECIMALS;
  logger.info(`Claiming ${humanAmount} ORE staking rewards`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Claimed ${humanAmount} ORE in staking rewards`,
  };
}

export const claimStakeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreClaimStakeRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/claim-stake',
    {
      schema: {
        description: 'Claim staking rewards',
        tags: ['/connector/ore'],
        body: OreClaimStakeRequest,
        response: {
          200: OreTransactionResponse,
        },
      },
    },
    async (request) => {
      try {
        const network = request.body.network || 'mainnet-beta';
        const walletAddress = request.body.walletAddress;
        const { amount } = request.body;

        if (!walletAddress) {
          throw httpErrors.badRequest('walletAddress is required');
        }

        return await claimStake(network, walletAddress, amount);
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

export default claimStakeRoute;
