import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { PublicKey } from '@solana/web3.js';
import { 
  GetSwapQuoteRequestType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequest,
  GetSwapQuoteResponseType 
} from '../../../schemas/trading-types/swap-schema';

/**
 * Get a swap quote for a launchpad token
 */
export async function getSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number
): Promise<{
  inputToken: any;
  outputToken: any;
  poolInfo: any;
  amountOut: number;
  minAmountOut: number;
  price: number;
}> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  
  // Get token information
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);
  
  if (!baseToken || !quoteToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`
    );
  }

  // Determine if this is a buy or sell relative to the Raydium SDK
  // Raydium SDK: buy = SOL to token, sell = token to SOL
  // Gateway API: BUY = user buys base (gives quote, gets base), SELL = user sells base (gives base, gets quote)
  const isBaseSOL = baseTokenSymbol.toUpperCase() === 'SOL';
  const isQuoteSOL = quoteTokenSymbol.toUpperCase() === 'SOL';
  
  if (!isBaseSOL && !isQuoteSOL) {
    throw fastify.httpErrors.badRequest(
      'Launchpad swaps must include SOL as one of the tokens'
    );
  }
  
  // Determine which token is the launchpad token and which is SOL
  const launchpadToken = isBaseSOL ? quoteToken : baseToken;
  
  // Map our side to Raydium's perspective
  const isBuy = (isBaseSOL && side === 'SELL') || (!isBaseSOL && side === 'BUY');
    
  // Get pool info from the blockchain
  const poolInfo = await raydium.getLaunchpadPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Launchpad pool data not found for address ${poolAddress}`);
  }
  
  // For buy orders, we're swapping SOL for token (ExactIn)
  // For sell orders, we're swapping token for SOL (ExactIn)
  const [inputToken, outputToken] = side === 'BUY' 
    ? [quoteToken, baseToken]
    : [baseToken, quoteToken];
  
  // Convert amount to the proper token's decimal precision
  const tokenDecimals = launchpadToken.decimals;
  const solDecimals = 9; // SOL decimals
  
  // Calculate amount to use for the swap based on side and which token is SOL
  let inAmount: number;
  if (isBuy) {
    // Buying token with SOL
    inAmount = amount;
  } else {
    // Selling token for SOL
    inAmount = amount;
  }
  
  // For now, since we don't have full SDK integration, use simplified calculations
  // In the future, we would use the actual SDK curve calculations from the poolInfo
  
  // Assume a fixed fee rate for now - in real implementation, this would come from the pool data
  const fee = 0.003; // 0.3% fee
  
  // Calculate price based on pool reserves (simplified formula)
  // In a real implementation, we would use poolInfo.mintAReserve and poolInfo.mintBReserve
  // For testing, we'll use a simple price for now
  const initialPrice = isBuy ? 0.01 : 100; // Default price: 1 SOL = 100 tokens
  
  // Calculate the output amount
  const amountOutRaw = isBuy 
      ? inAmount * initialPrice * (1 - fee) 
      : inAmount / initialPrice * (1 - fee);
  
  // Apply slippage for minimum amount out
  const effectiveSlippage = slippagePct || raydium.getSlippagePct();
  const minAmountOutRaw = amountOutRaw * (1 - effectiveSlippage/100);
  
  // Calculate final price
  const price = isBuy 
    ? 1 / initialPrice  // Price in token per SOL
    : initialPrice;     // Price in SOL per token
  
  return {
    inputToken,
    outputToken,
    poolInfo,
    amountOut: amountOutRaw,
    minAmountOut: minAmountOutRaw,
    price
  };
}

/**
 * Format and return the swap quote response
 */
export async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  const { inputToken, outputToken, amountOut, minAmountOut, price } = await getSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct
  );

  logger.info(`Raydium Launchpad swap quote: ${side} ${amount} ${baseTokenSymbol}/${quoteTokenSymbol} in pool ${poolAddress}`);

  // Format the response based on the Gateway swap schema
  const baseTokenChange = side === 'BUY' ? amountOut : -amount;
  const quoteTokenChange = side === 'BUY' ? -amount : amountOut;
  
  return {
    poolAddress,
    estimatedAmountIn: amount,
    estimatedAmountOut: amountOut,
    minAmountOut: minAmountOut,
    maxAmountIn: amount, // No slippage for input amount
    baseTokenBalanceChange: baseTokenChange,
    quoteTokenBalanceChange: quoteTokenChange,
    price: price,
    gasPrice: 0, // Not applicable for Solana
    gasLimit: 0, // Not applicable for Solana  
    gasCost: 0, // Not applicable for Solana
  };
}

/**
 * Quote swap route implementation
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Raydium Launchpad',
        tags: ['raydium/launchpad'],
        querystring: { 
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['MPLX'] },
            quoteToken: { type: 'string', examples: ['SOL'] },
            amount: { type: 'number', examples: [1.0] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['BUY'] },
            poolAddress: { type: 'string', examples: ['LD1vJ82z3gMbgUjpJQEmXPvUYcXKgvixnX7FeU3Q75JW'] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, poolAddress: requestedPoolAddress, slippagePct } = request.query;
        const networkToUse = network || 'mainnet-beta';

        // Get or find the pool address
        const raydium = await Raydium.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        
        if (!poolAddress) {
          // Create pool key by pairing the token with SOL
          // Format should match what's in the config (e.g., TOKEN-SOL)
          const isBaseSOL = baseToken.toUpperCase() === 'SOL';
          const tokenSymbol = isBaseSOL ? quoteToken : baseToken;
          const pairKey = `${tokenSymbol}-SOL`;
          
          poolAddress = await raydium.findDefaultPool(
            tokenSymbol,
            'SOL',
            'launchpad'
          );
          
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No launchpad pool found for pair ${pairKey}. Please check your configuration.`
            );
          }
        }

        // Get and return the swap quote
        return await formatSwapQuote(
          fastify,
          networkToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        // Preserve the original error if it's a FastifyError
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    }
  );
};

export default quoteSwapRoute;