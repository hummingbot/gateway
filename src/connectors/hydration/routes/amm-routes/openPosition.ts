import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { logger } from '../../../../services/logger';
import { Type, Static } from '@sinclair/typebox';
import { PositionStrategyType } from '../../hydration.types';
import { 
  OpenPositionRequest, 
  OpenPositionResponse, 
  OpenPositionResponseType,
} from '../../../../services/clmm-interfaces';
import { httpBadRequest, httpNotFound, ERROR_MESSAGES } from '../../../../services/error-handler';

/**
 * Open a new position on Hydration
 */
async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount: number | undefined,
  quoteTokenAmount: number | undefined,
  slippagePct?: number,
  strategyType: PositionStrategyType = PositionStrategyType.Balanced
): Promise<OpenPositionResponseType> {
  try {
    // Validate inputs
    if (lowerPrice >= upperPrice) {
      throw httpBadRequest('Lower price must be less than upper price');
    }

    if (!baseTokenAmount && !quoteTokenAmount) {
      throw httpBadRequest('Either base token amount or quote token amount must be provided');
    }

    if (baseTokenAmount !== undefined && baseTokenAmount <= 0) {
      throw httpBadRequest('Base token amount must be positive');
    }

    if (quoteTokenAmount !== undefined && quoteTokenAmount <= 0) {
      throw httpBadRequest('Quote token amount must be positive');
    }

    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Get pool info to verify it exists
    const poolInfo = await hydration.getPoolInfo(poolAddress);
    if (!poolInfo) {
      throw httpNotFound(`Pool not found: ${poolAddress}`);
    }
    
    // Open position
    const result = await hydration.openPosition(
      wallet,
      lowerPrice,
      upperPrice,
      poolAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
      strategyType
    );
    
    logger.info(`Opened position ${result.positionAddress} in pool ${poolAddress} with price range ${lowerPrice.toFixed(4)} - ${upperPrice.toFixed(4)}`);
    
    return {
      signature: result.signature,
      fee: result.fee,
      positionAddress: result.positionAddress,
      positionRent: result.positionRent,
      baseTokenAmountAdded: result.baseTokenAmountAdded,
      quoteTokenAmountAdded: result.quoteTokenAmountAdded,
    };
  } catch (error) {
    logger.error(`Failed to open position: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
}

// Define Hydration-specific open position request schema
export const HydrationOpenPositionRequest = Type.Intersect([
  OpenPositionRequest,
  Type.Object({
    strategyType: Type.Optional(Type.Number({ 
      enum: Object.values(PositionStrategyType).filter(x => typeof x === 'number')
    }))
  })
], { $id: 'HydrationOpenPositionRequest' });

export type HydrationOpenPositionRequestType = Static<typeof HydrationOpenPositionRequest>;

/**
 * Route handler for opening a position
 */
export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
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
  OpenPositionRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post(
    '/open-position',
    {
      schema: {
        description: 'Open a new Hydration position',
        tags: ['hydration'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            lowerPrice: { type: 'number', examples: [9.5] },
            upperPrice: { type: 'number', examples: [11.5] },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
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
          200: OpenPositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          walletAddress, 
          lowerPrice, 
          upperPrice, 
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType 
        } = request.body as HydrationOpenPositionRequestType;
        const networkToUse = network || 'mainnet';
        
        return await openPosition(
          fastify,
          networkToUse,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
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

export default openPositionRoute;

