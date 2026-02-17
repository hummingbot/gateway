import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createWithdrawInstruction } from '../ore.instructions';
import {
  OreUnstakeRequest,
  OreUnstakeRequestType,
  OreTransactionResponse,
  OreTransactionResponseType,
} from '../schemas';

const ORE_DECIMALS = 11; // ORE token has 11 decimals

export async function unstake(
  network: string,
  walletAddress: string,
  amount: number,
): Promise<OreTransactionResponseType> {
  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Validate amount
  if (amount <= 0) {
    throw httpErrors.badRequest('Amount must be greater than 0');
  }

  const ore = await Ore.getInstance(network);
  const { wallet, isHardwareWallet } = await ore.prepareWallet(walletAddress);

  // Verify stake account exists and has sufficient balance
  const stakeAccount = await ore.getStakeAccount(walletAddress);
  if (!stakeAccount) {
    throw httpErrors.notFound(`Stake account not found for wallet: ${walletAddress}`);
  }

  // Convert amount to raw units (ORE has 11 decimals)
  const rawAmount = BigInt(Math.floor(amount * 10 ** ORE_DECIMALS));

  if (stakeAccount.balance < rawAmount) {
    throw httpErrors.badRequest(
      `Insufficient staked balance. Available: ${Number(stakeAccount.balance) / 10 ** ORE_DECIMALS} ORE`,
    );
  }

  // Create withdraw instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const withdrawIx = createWithdrawInstruction(signerPubkey, rawAmount);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [withdrawIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  logger.info(`Unstaking ${amount} ORE`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Unstaked ${amount} ORE`,
  };
}

export const unstakeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreUnstakeRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/unstake',
    {
      schema: {
        description: 'Unstake ORE tokens',
        tags: ['/connector/ore'],
        body: OreUnstakeRequest,
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

        return await unstake(network, walletAddress, amount);
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

export default unstakeRoute;
