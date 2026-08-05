import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraAmmAddLiquidityRequest } from '../schemas';

import { getLiquidityQuote } from './quoteLiquidity';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  const quote = await getLiquidityQuote(meteoraDamm, poolState, baseTokenAmount, quoteTokenAmount, slippagePct);
  if (quote.liquidityDelta.isZero()) {
    throw httpErrors.badRequest('Computed liquidity is zero — increase the token amounts');
  }

  const owner = new PublicKey(walletAddress);
  const pool = new PublicKey(poolAddress);

  // DAMM v2 positions are NFTs. Add to the wallet's largest existing position in this pool, or
  // create a new position NFT if the wallet has none.
  const existing = await meteoraDamm.getUserPositions(poolAddress, walletAddress);

  let transaction: Transaction;
  const extraSigners: Keypair[] = [];

  const shared = {
    liquidityDelta: quote.liquidityDelta,
    maxAmountTokenA: quote.maxAmountTokenA,
    maxAmountTokenB: quote.maxAmountTokenB,
    tokenAAmountThreshold: quote.maxAmountTokenA,
    tokenBAmountThreshold: quote.maxAmountTokenB,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAProgram,
    tokenBProgram,
  };

  if (existing.length > 0) {
    const target = existing[0];
    logger.info(`Adding liquidity to existing DAMM v2 position ${target.position.toBase58()} in pool ${poolAddress}`);
    transaction = await meteoraDamm.cpAmm.addLiquidity({
      owner,
      pool,
      position: target.position,
      positionNftAccount: target.positionNftAccount,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      ...shared,
    });
  } else {
    const positionNft = Keypair.generate();
    extraSigners.push(positionNft);
    logger.info(`Opening new DAMM v2 position (NFT ${positionNft.publicKey.toBase58()}) in pool ${poolAddress}`);
    transaction = await meteoraDamm.cpAmm.createPositionAndAddLiquidity({
      owner,
      pool,
      positionNft: positionNft.publicKey,
      ...shared,
    });
  }

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, extraSigners);
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      poolState.tokenAMint.toBase58(),
      poolState.tokenBMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0 }; // PENDING
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: typeof MeteoraAmmAddLiquidityRequest.static;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Meteora DAMM v2 pool (opens a position NFT if the wallet has none)',
        tags: ['/connector/meteora'],
        body: MeteoraAmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.body;
        const effectiveSlippage = slippagePct ?? MeteoraConfig.config.slippagePct;
        return await addLiquidity(
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          effectiveSlippage,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
