import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
  GetSwapQuoteRequest,
  GetSwapQuoteResponse
} from '../../../services/swap-interfaces';
import BN from 'bn.js';
import { PoolUtils } from '@raydium-io/raydium-sdk-v2';

async function getSwapQuote(
  fastify: FastifyInstance,
  network: string,
  inputMint: string,
  amount: number,
  slippagePct: number
): Promise<GetSwapQuoteResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await RaydiumCLMM.getInstance(network);
  
  const poolInfo = await raydium.findBestPoolForSwap(inputMint);
  const decimals = await solana.getTokenDecimals(inputMint);
  const amountBN = new BN(amount * 10 ** decimals);

  const { minAmountOut } = await PoolUtils.computeAmountOutFormat({
    poolInfo,
    amountIn: amountBN,
    slippage: slippagePct / 100,
    tokenOut: inputMint === poolInfo.mintA.address ? poolInfo.mintB : poolInfo.mintA
  });

  return {
    estimatedAmountIn: amount,
    estimatedAmountOut: minAmountOut.amount.raw.toNumber() / 10 ** (await solana.getTokenDecimals(minAmountOut.token)),
    minAmountOut: minAmountOut.amount.raw.toNumber() / 10 ** (await solana.getTokenDecimals(minAmountOut.token)),
    priceImpact: 0 // Can be calculated based on pool liquidity
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Raydium CLMM',
        tags: ['raydium-clmm'],
        querystring: GetSwapQuoteRequest,
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, inputMint, amount, slippagePct } = request.query;
        return await getSwapQuote(
          fastify,
          network || 'mainnet-beta',
          inputMint,
          amount,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to get swap quote');
      }
    }
  );
};

export default quoteSwapRoute;
