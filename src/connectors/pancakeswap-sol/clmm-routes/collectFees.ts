import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { buildRemoveLiquidityTransaction } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmCollectFeesRequest } from '../schemas';

/**
 * Collect accumulated fees from a position WITHOUT touching its liquidity.
 *
 * The PancakeSwap Solana CLMM program (a Raydium CLMM fork) has no owner-facing
 * "collect fees" instruction — like Raydium, fees (and rewards) owed to a position are
 * transferred by `decrease_liquidity_v2`. Calling it with `liquidity = 0` collects the
 * owed fees while leaving the position's liquidity intact.
 */
async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);
  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  logger.info(`Collecting fees from position ${positionAddress} via zero-liquidity decrease`);

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // decrease_liquidity_v2 with liquidity = 0 transfers the owed fees (and rewards)
  // without removing any liquidity.
  const transaction = await buildRemoveLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    new BN(0), // liquidity: collect fees only
    new BN(0), // amount0Min
    new BN(0), // amount1Min
    600000, // Compute units
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // No liquidity was removed, so the position tokens received are exactly the fees.
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    const baseFeeCollected = Math.abs(balanceChanges[0]);
    const quoteFeeCollected = Math.abs(balanceChanges[1]);

    logger.info(
      `Fees collected from position ${positionAddress}: ${baseFeeCollected.toFixed(6)} ${baseToken.symbol}, ` +
        `${quoteFeeCollected.toFixed(6)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        baseFeeAmountCollected: baseFeeCollected,
        quoteFeeAmountCollected: quoteFeeCollected,
      },
    };
  }

  // A landed-but-failed transaction is terminal: fail loudly instead of returning
  // PENDING (callers would poll forever). Genuinely-not-landed keeps the pending shape.
  await solana.throwIfLandedWithError(signature, txData);

  return {
    signature,
    status: 0, // PENDING
  };
}

export { collectFees };

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description:
          'Collect accumulated fees from a PancakeSwap Solana CLMM position (zero-liquidity decrease; liquidity is not touched)',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', walletAddress, positionAddress } = request.body;

        return await collectFees(network, walletAddress!, positionAddress);
      } catch (e: any) {
        logger.error('Collect fees error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to collect fees';
        throw httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default collectFeesRoute;
