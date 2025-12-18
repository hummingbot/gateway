import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ore } from '../ore';
import { createDepositInstruction } from '../ore.instructions';
import { OreStakeRequest, OreStakeRequestType, OreTransactionResponse, OreTransactionResponseType } from '../schemas';

const ORE_DECIMALS = 11; // ORE token has 11 decimals

export async function stake(
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

  // Convert amount to raw units (ORE has 11 decimals)
  const rawAmount = BigInt(Math.floor(amount * 10 ** ORE_DECIMALS));

  // Create deposit instruction
  const signerPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;
  const depositIx = createDepositInstruction(signerPubkey, rawAmount);

  // Build transaction
  const solana = ore.solana;
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [depositIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  logger.info(`Staking ${amount} ORE`);

  // Sign and send
  const signature = await ore.signAndSendTransaction(transaction, walletAddress, isHardwareWallet);

  return {
    signature,
    message: `Staked ${amount} ORE`,
  };
}

export const stakeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OreStakeRequestType;
    Reply: OreTransactionResponseType;
  }>(
    '/stake',
    {
      schema: {
        description: 'Stake ORE tokens',
        tags: ['/connector/ore'],
        body: OreStakeRequest,
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

        return await stake(network, walletAddress, amount);
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

export default stakeRoute;
