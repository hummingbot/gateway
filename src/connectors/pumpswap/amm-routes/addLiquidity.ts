import { Static } from '@sinclair/typebox';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pumpswap } from '../pumpswap';
import { buildDepositInstruction } from '../pumpswap.instructions';
import { PumpswapAmmAddLiquidityRequest } from '../schemas';

import { quoteLiquidity } from './quoteLiquidity';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PumpswapAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Pumpswap AMM pool',
        tags: ['/connector/pumpswap'],
        body: PumpswapAmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.body;

        const pumpswap = await Pumpswap.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Prepare wallet
        const { wallet, isHardwareWallet } = await pumpswap.prepareWallet(walletAddress);
        const walletPubkey = isHardwareWallet ? (wallet as any) : (wallet as any).publicKey;

        // Get pool info
        const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
        if (!poolInfo) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Get quote to determine amounts
        const quote = await quoteLiquidity(
          fastify,
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );

        // Resolve tokens
        const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
        const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.notFound('Token not found');
        }

        // Convert amounts to BN
        const maxBaseAmountIn = new BN(new Decimal(quote.baseTokenAmountMax).mul(10 ** baseToken.decimals).toFixed(0));
        const maxQuoteAmountIn = new BN(
          new Decimal(quote.quoteTokenAmountMax).mul(10 ** quoteToken.decimals).toFixed(0),
        );

        // Calculate LP tokens to mint
        // For AMM: LP = sqrt(base * quote) - minimum liquidity
        // Simplified: use pool ratio to calculate LP tokens
        const poolPubkey = new (await import('@solana/web3.js')).PublicKey(poolAddress);
        const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);
        if (!poolAccountInfo) {
          throw fastify.httpErrors.notFound('Pool account not found');
        }

        const poolData = poolAccountInfo.data;
        const lpSupply = poolData.readBigUInt64LE(203); // offset 203-210

        // Calculate LP tokens based on share of new liquidity
        const newBaseReserve = poolInfo.baseTokenAmount + quote.baseTokenAmount;
        const newQuoteReserve = poolInfo.quoteTokenAmount + quote.quoteTokenAmount;
        const newK = newBaseReserve * newQuoteReserve;
        const oldK = poolInfo.baseTokenAmount * poolInfo.quoteTokenAmount;
        const lpTokenAmountOut = new BN(
          Math.floor((Number(lpSupply) * (Math.sqrt(newK) - Math.sqrt(oldK))) / Math.sqrt(oldK)).toString(),
        );

        // Build deposit instruction
        const depositIx = await buildDepositInstruction(
          solana,
          poolPubkey,
          walletPubkey,
          lpTokenAmountOut,
          maxBaseAmountIn,
          maxQuoteAmountIn,
        );

        // Build transaction
        const instructions = [depositIx];
        const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');
        const messageV0 = new (await import('@solana/web3.js')).TransactionMessage({
          payerKey: walletPubkey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        // Sign transaction
        const signedTransaction = (await pumpswap.signTransaction(
          transaction,
          walletAddress,
          isHardwareWallet,
          wallet,
        )) as VersionedTransaction;

        // Simulate
        await solana.simulateWithErrorHandling(signedTransaction);

        // Send and confirm
        const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(signedTransaction);

        // Handle confirmation
        const result = await solana.handleConfirmation(
          signature,
          confirmed,
          txData,
          baseToken.address,
          quoteToken.address,
          walletAddress,
          'SELL', // Not a swap, but needed for confirmation handler
        );

        if (result.status === 1) {
          logger.info(`Liquidity added successfully: ${signature}`);
        }

        return {
          signature,
          status: result.status,
          data:
            result.status === 1
              ? {
                  fee: result.data?.fee || 0,
                  baseTokenAmountAdded: quote.baseTokenAmount,
                  quoteTokenAmountAdded: quote.quoteTokenAmount,
                }
              : undefined,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
