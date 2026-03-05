import { Static } from '@sinclair/typebox';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pumpswap } from '../pumpswap';
import { buildWithdrawInstruction } from '../pumpswap.instructions';
import { PumpswapAmmRemoveLiquidityRequest } from '../schemas';

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PumpswapAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Pumpswap AMM pool',
        tags: ['/connector/pumpswap'],
        body: PumpswapAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body;

        const pumpswap = await Pumpswap.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Prepare wallet
        const { wallet, isHardwareWallet } = await pumpswap.prepareWallet(walletAddress);
        const walletPubkey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;

        // Get pool info
        const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
        if (!poolInfo) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Get pool account to find LP mint
        const poolPubkey = new PublicKey(poolAddress);
        const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);
        if (!poolAccountInfo) {
          throw fastify.httpErrors.notFound('Pool account not found');
        }

        const poolData = poolAccountInfo.data;
        const lpMint = new PublicKey(poolData.slice(107, 139));

        // Get user's LP token balance
        const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletPubkey, {
          mint: lpMint,
        });

        if (lpTokenAccounts.value.length === 0) {
          throw fastify.httpErrors.badRequest('No LP tokens found for this wallet');
        }

        const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
        const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount);
        const lpTokenBalance = accountInfo.value.uiAmount || 0;

        if (lpTokenBalance === 0) {
          throw fastify.httpErrors.badRequest('LP token balance is zero');
        }

        // Calculate LP tokens to burn
        const lpTokenAmountToBurn = (lpTokenBalance * percentageToRemove) / 100;

        // Resolve tokens
        const baseToken = await solana.getToken(poolInfo.baseTokenAddress);
        const quoteToken = await solana.getToken(poolInfo.quoteTokenAddress);

        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.notFound('Token not found');
        }

        // Calculate expected output amounts
        // Convert LP supply from raw to UI format (LP mint has 9 decimals)
        const lpSupplyRaw = poolData.readBigUInt64LE(203);
        const lpMintDecimals = 9;
        const lpSupply = Number(lpSupplyRaw) / Math.pow(10, lpMintDecimals);

        // Calculate share (both values in UI format)
        const share = lpTokenAmountToBurn / lpSupply;
        const expectedBaseOut = poolInfo.baseTokenAmount * share;
        const expectedQuoteOut = poolInfo.quoteTokenAmount * share;

        // Apply slippage (minimum amounts)
        const slippageMultiplier = 1 - 0.01; // 1% slippage
        const minBaseAmountOut = new BN(
          new Decimal(expectedBaseOut * slippageMultiplier).mul(10 ** baseToken.decimals).toFixed(0),
        );
        const minQuoteAmountOut = new BN(
          new Decimal(expectedQuoteOut * slippageMultiplier).mul(10 ** quoteToken.decimals).toFixed(0),
        );

        const lpTokenAmountIn = new BN(
          new Decimal(lpTokenAmountToBurn).mul(10 ** accountInfo.value.decimals).toFixed(0),
        );

        // Build withdraw instruction
        const withdrawIx = await buildWithdrawInstruction(
          solana,
          poolPubkey,
          walletPubkey,
          lpTokenAmountIn,
          minBaseAmountOut,
          minQuoteAmountOut,
        );

        // Build transaction
        const instructions = [withdrawIx];
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
          logger.info(`Liquidity removed successfully: ${signature}`);
        }

        return {
          signature,
          status: result.status,
          data:
            result.status === 1
              ? {
                  fee: result.data?.fee || 0,
                  baseTokenAmountRemoved: expectedBaseOut,
                  quoteTokenAmountRemoved: expectedQuoteOut,
                }
              : undefined,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;
