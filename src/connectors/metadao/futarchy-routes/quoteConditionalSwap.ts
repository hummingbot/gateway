import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import {
  MetaDaoQuoteConditionalSwapRequest,
  MetaDaoQuoteConditionalSwapRequestType,
  MetaDaoQuoteConditionalSwapResponse,
  MetaDaoQuoteConditionalSwapResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { MetaDao } from '../metadao';

export const quoteConditionalSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoQuoteConditionalSwapRequestType;
    Reply: MetaDaoQuoteConditionalSwapResponseType;
  }>(
    '/quote-conditional-swap',
    {
      schema: {
        description: 'Get a quote for conditional market swap on MetaDAO (PASS or FAIL market)',
        tags: ['/connector/metadao'],
        querystring: MetaDaoQuoteConditionalSwapRequest,
        response: {
          200: MetaDaoQuoteConditionalSwapResponse,
        },
      },
    },
    async (request): Promise<MetaDaoQuoteConditionalSwapResponseType> => {
      const { dao: daoAddress, proposal: proposalAddress, market, side, amount, slippagePct = 0.5 } = request.query;
      const network = request.query.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);

        // Check pool state - must be in futarchy state for conditional swaps
        const poolStateType = metadao.getPoolStateType(daoAccount);
        if (poolStateType !== 'futarchy') {
          throw fastify.httpErrors.badRequest('Conditional swaps are only available when a proposal market is active');
        }

        // Fetch proposal and validate state
        const proposalAccount = await metadao.getProposal(proposalAddress);
        const proposalState = metadao.getProposalState(proposalAccount);

        if (proposalState !== 'pending') {
          throw fastify.httpErrors.badRequest(`Proposal is not in active trading state (current: ${proposalState})`);
        }

        // Get proposal PDAs for conditional token mints
        const pdas = await metadao.getProposalPdas(daoAddress, proposalAddress);

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        // Get the appropriate pool and determine input/output mints
        const pool = market === 'PASS' ? metadao.getPassPool(daoAccount) : metadao.getFailPool(daoAccount);

        if (!pool) {
          throw fastify.httpErrors.internalServerError(`${market} pool not found in futarchy state`);
        }

        // Determine input/output mints and symbols based on market and side
        let tokenIn: string;
        let tokenOut: string;
        let inputSymbol: string;
        let outputSymbol: string;

        const baseSymbol = await metadao.getTokenSymbol(daoAccount.baseMint.toString());
        const quoteSymbol = await metadao.getTokenSymbol(daoAccount.quoteMint.toString());

        const prefix = market === 'PASS' ? 'p' : 'f';

        if (side === 'BUY') {
          // BUY conditional base with conditional quote
          if (market === 'PASS') {
            tokenIn = pdas.passQuoteMint.toString();
            tokenOut = pdas.passBaseMint.toString();
          } else {
            tokenIn = pdas.failQuoteMint.toString();
            tokenOut = pdas.failBaseMint.toString();
          }
          inputSymbol = `${prefix}${quoteSymbol}`;
          outputSymbol = `${prefix}${baseSymbol}`;
        } else {
          // SELL conditional base for conditional quote
          if (market === 'PASS') {
            tokenIn = pdas.passBaseMint.toString();
            tokenOut = pdas.passQuoteMint.toString();
          } else {
            tokenIn = pdas.failBaseMint.toString();
            tokenOut = pdas.failQuoteMint.toString();
          }
          inputSymbol = `${prefix}${baseSymbol}`;
          outputSymbol = `${prefix}${quoteSymbol}`;
        }

        const slippageMultiplier = 1 - slippagePct / 100;
        const maxSlippageMultiplier = 1 + slippagePct / 100;
        const rawBaseAmount = metadao.toRawAmount(amount, baseDecimals);

        let rawAmountIn = rawBaseAmount;
        let rawAmountOut = metadao.calculateSwapOutput(
          rawAmountIn,
          pool.baseReserves,
          pool.quoteReserves,
          daoAccount.protocolFeeBps,
          daoAccount.lpFeeBps,
        ).output;
        let amountIn = amount;
        let amountOut = metadao.fromRawAmount(rawAmountOut, quoteDecimals);
        let minAmountOut = amountOut * slippageMultiplier;
        let maxAmountIn = amount;
        let priceImpactPct = metadao.calculateSwapOutput(
          rawAmountIn,
          pool.baseReserves,
          pool.quoteReserves,
          daoAccount.protocolFeeBps,
          daoAccount.lpFeeBps,
        ).priceImpact;

        if (side === 'BUY') {
          rawAmountOut = rawBaseAmount;
          rawAmountIn = metadao.calculateSwapInputForOutput(
            rawAmountOut,
            pool.quoteReserves,
            pool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          const quoteResult = metadao.calculateSwapOutput(
            rawAmountIn,
            pool.quoteReserves,
            pool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          amountIn = metadao.fromRawAmount(rawAmountIn, quoteDecimals);
          amountOut = amount;
          minAmountOut = amount;
          maxAmountIn = amountIn * maxSlippageMultiplier;
          priceImpactPct = quoteResult.priceImpact;
        }

        const price = amountOut > 0 ? amountIn / amountOut : 0;

        // Calculate trading end time (3 days from launch)
        const tradingEndsAt = proposalAccount.launchedAt.toNumber() + 3 * 24 * 60 * 60;

        // Generate quote ID and cache
        const quoteId = uuidv4();
        quoteCache.set(quoteId, {
          daoAddress,
          proposalAddress,
          market,
          side,
          amount,
          amountIn,
          amountOut,
          minAmountOut,
          maxAmountIn,
          rawInputAmount: rawAmountIn.toString(),
          rawOutputAmount: rawAmountOut.toString(),
          inputDecimals: side === 'BUY' ? quoteDecimals : baseDecimals,
          outputDecimals: side === 'BUY' ? baseDecimals : quoteDecimals,
          inputMint: tokenIn,
          outputMint: tokenOut,
        });

        const response: MetaDaoQuoteConditionalSwapResponseType = {
          quoteId,
          pool: daoAddress,
          proposal: proposalAddress,
          market,
          side,
          tokenIn,
          tokenOut,
          inputSymbol,
          outputSymbol,
          amountIn,
          amountOut,
          price,
          priceImpactPct,
          minAmountOut,
          maxAmountIn,
          poolReserves: {
            base: metadao.fromRawAmount(pool.baseReserves, baseDecimals),
            quote: metadao.fromRawAmount(pool.quoteReserves, quoteDecimals),
            baseRaw: pool.baseReserves.toString(),
            quoteRaw: pool.quoteReserves.toString(),
          },
          proposalState,
          tradingEndsAt,
          pdas: {
            question: pdas.question.toString(),
            baseVault: pdas.baseVault.toString(),
            quoteVault: pdas.quoteVault.toString(),
            passBaseMint: pdas.passBaseMint.toString(),
            passQuoteMint: pdas.passQuoteMint.toString(),
            failBaseMint: pdas.failBaseMint.toString(),
            failQuoteMint: pdas.failQuoteMint.toString(),
          },
        };

        return response;
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error getting conditional swap quote for DAO ${daoAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to get conditional swap quote: ${error}`);
      }
    },
  );
};
