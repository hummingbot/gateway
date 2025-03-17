import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { logger } from '../../../../services/logger';
import {
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapResponse
} from '../../../../services/swap-interfaces';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';

/**
 * Execute a swap on Hydration
 */
async function executeSwap(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
): Promise<ExecuteSwapResponseType> {
  try {
    // Validate inputs
    if (!baseTokenIdentifier || !quoteTokenIdentifier) {
      throw httpBadRequest('Base token and quote token are required');
    }

    if (!amount || amount <= 0) {
      throw httpBadRequest('Amount must be a positive number');
    }

    if (side !== 'buy' && side !== 'sell') {
      throw httpBadRequest('Side must be "buy" or "sell"');
    }

    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);

    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);

    // Execute swap
    const result = await hydration.executeSwap(
      wallet,
      baseTokenIdentifier,
      quoteTokenIdentifier,
      amount,
      side,
      poolAddress,
      slippagePct
    );

    logger.info(`Executed swap: ${amount} ${side === 'buy' ? quoteTokenIdentifier : baseTokenIdentifier} for ${result.totalOutputSwapped} ${side === 'buy' ? baseTokenIdentifier : quoteTokenIdentifier}`);

    return {
      signature: result.signature,
      totalInputSwapped: result.totalInputSwapped,
      totalOutputSwapped: result.totalOutputSwapped,
      fee: result.fee,
      baseTokenBalanceChange: result.baseTokenBalanceChange,
      quoteTokenBalanceChange: result.quoteTokenBalanceChange,
      priceImpact: result.priceImpact
    } as ExecuteSwapResponseType;
  } catch (error) {
    logger.error(`Failed to execute swap: ${error.message}`);
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
}

/**
 * Route handler for executing a swap
 */
export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';

  try {
    firstWalletAddress = await polkadot.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  // Update schema example
  ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Hydration',
        tags: ['hydration'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['DOT'] },
            quoteToken: { type: 'string', examples: ['USDT'] },
            amount: { type: 'number', examples: [1.5] },
            side: { type: 'string', enum: ['buy', 'sell'], examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            slippagePct: { type: 'number', examples: [0.5] }
          }
        },
        response: {
          200: ExecuteSwapResponse
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body as ExecuteSwapRequestType;
        const network = (request.body as ExecuteSwapRequestType).network || 'mainnet';

        logger.info(`Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddress}`);

        return await executeSwap(
          fastify,
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'buy' | 'sell',
          poolAddress,
          slippagePct
        );
      } catch (e) {
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message || 'Request failed');
        }
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default executeSwapRoute;

