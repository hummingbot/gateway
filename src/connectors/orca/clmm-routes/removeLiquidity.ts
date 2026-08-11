import { decreaseLiquidityInstructions } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { Static } from '@sinclair/typebox';
import { address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';
import { OrcaClmmRemoveLiquidityRequest } from '../schemas';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  liquidityPct: number,
  slippagePct: number,
): Promise<RemoveLiquidityResponseType> {
  if (liquidityPct <= 0 || liquidityPct > 100) {
    throw httpErrors.badRequest('liquidityPct must be between 0 and 100');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const walletPublicKey = new PublicKey(walletAddress);
  const position = await fetchPosition(orca.solanaKitRpc, address(positionAddress));
  const whirlpool = await fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool);
  const [mintA, mintB] = await fetchAllMint(orca.solanaKitRpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const liquidityAmount = BigInt(
    new Decimal(position.data.liquidity.toString()).mul(liquidityPct).div(100).floor().toFixed(0),
  );

  if (liquidityAmount <= 0n || liquidityAmount > position.data.liquidity) {
    throw httpErrors.badRequest('Invalid liquidity amount calculated');
  }

  const result = await decreaseLiquidityInstructions(
    orca.solanaKitRpc,
    position.data.positionMint,
    { liquidity: liquidityAmount },
    {
      authority: createOrcaAuthority(walletAddress),
      slippageToleranceBps: Math.round(slippagePct * 100),
      whirlpoolDeployment: orca.deployment,
    },
  );
  logger.info(
    `Removing ${liquidityPct}% liquidity, estimated: ` +
      `${(Number(result.quote.tokenEstA) / 10 ** mintA.data.decimals).toFixed(6)} tokenA, ` +
      `${(Number(result.quote.tokenEstB) / 10 ** mintB.data.decimals).toFixed(6)} tokenB`,
  );

  const transaction = buildOrcaTransaction(result.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const tokenAAddress = whirlpool.data.tokenMintA.toString();
  const tokenBAddress = whirlpool.data.tokenMintB.toString();
  const [tokenA, tokenB, balanceResult] = await Promise.all([
    solana.getToken(tokenAAddress),
    solana.getToken(tokenBAddress),
    solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [tokenAAddress, tokenBAddress]),
  ]);
  const { balanceChanges } = balanceResult;

  logger.info(
    `Liquidity removed: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA?.symbol || 'tokenA'}, ` +
      `${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB?.symbol || 'tokenB'}`,
  );

  return {
    signature,
    status: 1,
    data: {
      fee,
      baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
      quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
    },
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmRemoveLiquidityRequest,
        response: { 200: RemoveLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, liquidityPct = 100, slippagePct = 1, network } = request.body;
        return await removeLiquidity(network, walletAddress, positionAddress, liquidityPct, slippagePct);
      } catch (error) {
        logger.error(error);
        if (error.statusCode) throw error;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;
