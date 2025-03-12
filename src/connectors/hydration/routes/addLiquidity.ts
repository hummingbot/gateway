import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { Type, Static } from '@sinclair/typebox';
import { PositionStrategyType } from '../hydration.types';
import { 
  AddLiquidityRequest, 
  AddLiquidityResponse, 
  AddLiquidityResponseType 
} from '../../../services/clmm-interfaces';
import { httpBadRequest, httpNotFound, ERROR_MESSAGES } from '../../../services/error-handler';

/**
 * Add liquidity to an existing position
 */
async function addLiquidity(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
  strategyType: PositionStrategyType = PositionStrategyType.Balanced
): Promise<AddLiquidityResponseType> {
  try {
    // Validate inputs
    if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
      throw httpBadRequest(ERROR_MESSAGES.MISSING_AMOUNTS);
    }

    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Add liquidity
    const result = await hydration.addLiquidity(
      wallet,
      positionAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
      strategyType
    );
    
    logger.info(`Added liquidity to position ${positionAddress}: ${baseTokenAmount.toFixed(4)} base token, ${quoteTokenAmount.toFixed(4)} quote token`);
    
    return {
      signature: result.signature,
      baseTokenAmountAdded: result.baseTokenAmountAdded,
      quoteTokenAmountAdded: result.quoteTokenAmountAdded,
      fee: result.fee
    };
  } catch (error) {
    logger.error(`Failed to add liquidity: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
}

// Define Hydration-specific add liquidity request schema
export const HydrationAddLiquidityRequest = Type.Intersect([
  AddLiquidityRequest,
  Type.Object({
    strategyType: Type.Optional(Type.Number({ 
      enum: Object.values(PositionStrategyType).filter(x => typeof x === 'number')
    }))
  })
], { $id: 'HydrationAddLiquidityRequest' });

export type HydrationAddLiquidityRequestType = Static<typeof HydrationAddLiquidityRequest>;

/**
 * Route handler for adding liquidity
 */
export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';
  
  const foundWallet = await polkadot.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }
  
  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: HydrationAddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Hydration position',
        tags: ['hydration'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            positionAddress: { type: 'string', examples: ['hydration-position-0'] },
            baseTokenAmount: { type: 'number', examples: [10] },
            quoteTokenAmount: { type: 'number', examples: [100] },
            slippagePct: { type: 'number', examples: [0.5] },
            strategyType: { 
              type: 'number', 
              examples: [PositionStrategyType.Balanced],
              enum: Object.values(PositionStrategyType).filter(x => typeof x === 'number')
            }
          }
        },
        response: {
          200: AddLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          walletAddress, 
          positionAddress, 
          baseTokenAmount, 
          quoteTokenAmount, 
          slippagePct,
          strategyType
        } = request.body;
        const networkToUse = network || 'mainnet';
        
        return await addLiquidity(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType as PositionStrategyType
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default addLiquidityRoute;

