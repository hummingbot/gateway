import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { DecimalUtil } from '@orca-so/common-sdk';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { StrategyType } from '@meteora-ag/dlmm';
import { logger } from '../../../services/logger';

// Schema definitions
const AddLiquidityRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  address: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  positionAddress: Type.String({ default: '' }),
  baseTokenAmount: Type.Number({ default: 1 }),
  quoteTokenAmount: Type.Number({ default: 1 }),
  slippagePct: Type.Optional(Type.Number({ default: 1 })),
  strategy: Type.Optional(Type.Number({ default: StrategyType.SpotImBalanced })),
});

const AddLiquidityResponse = Type.Object({
  signature: Type.String(),
  tokenXAddedAmount: Type.Number(),
  tokenYAddedAmount: Type.Number(),
  fee: Type.Number(),
});

type AddLiquidityRequestType = Static<typeof AddLiquidityRequest>;
type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

async function addLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
  strategy: StrategyType = StrategyType.SpotImBalanced
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  // Find the matching position info
  const { position: matchingLbPosition, info: matchingPositionInfo } = await meteora.getPosition(
    positionAddress,
    wallet.publicKey
  );

  if (!matchingLbPosition || !matchingPositionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Get requirement data
  const maxBinId = matchingLbPosition.positionData.upperBinId;
  const minBinId = matchingLbPosition.positionData.lowerBinId;

  const totalXAmount = new BN(
    DecimalUtil.toBN(new Decimal(baseTokenAmount), matchingPositionInfo.tokenX.decimal)
  );
  const totalYAmount = new BN(
    DecimalUtil.toBN(new Decimal(quoteTokenAmount), matchingPositionInfo.tokenY.decimal)
  );

  // Initialize DLMM pool
  const dlmmPool = await meteora.getDlmmPool(matchingPositionInfo.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  await dlmmPool.refetchStates();

  const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
    positionPubKey: matchingLbPosition.publicKey,
    user: wallet.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      maxBinId,
      minBinId,
      strategyType: strategy,
    },
    slippage: slippagePct ?? meteora.getSlippagePct(),
  });

  const signature = await solana.sendAndConfirmTransaction(addLiquidityTx, [wallet], 800_000);

  const { balanceChange: tokenXAddedAmount, fee } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenX.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  const { balanceChange: tokenYAddedAmount } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenY.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  return {
    signature,
    tokenXAddedAmount: Math.abs(tokenXAddedAmount),
    tokenYAddedAmount: Math.abs(tokenYAddedAmount),
    fee,
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  AddLiquidityRequest.properties.address.examples = [firstWalletAddress];

  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Meteora position',
        tags: ['meteora'],
        body: AddLiquidityRequest,
        response: {
          200: AddLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { address, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct, strategy } = request.body;
        const network = request.body.network || 'mainnet-beta';
        
        return await addLiquidity(
          fastify,
          network,
          address,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategy
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default addLiquidityRoute; 