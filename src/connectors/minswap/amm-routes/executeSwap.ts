import { TxComplete } from '@aiquant/lucid-cardano';
import { ADA, Asset, Dex, calculateSwapExactIn, calculateSwapExactOut } from '@aiquant/minswap-sdk';
import { FastifyPluginAsync } from 'fastify';

import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
  ExecuteSwapRequest,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import { formatTokenAmount } from '../minswap.utils';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Minswap AMM (Cardano)',
        tags: ['/connector/minswap/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string' },
            baseToken: { type: 'string', examples: ['MIN'] },
            quoteToken: { type: 'string', examples: ['ADA'] },
            amount: { type: 'number', examples: [10000] }, // now always BASE token amount
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            poolAddress: { type: 'string' },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress: reqAddr,
          baseToken,
          quoteToken,
          amount, // this is always BASE token quantity
          side,
          slippagePct = 1,
        } = request.body;

        const net = network || 'mainnet';
        const minswap = await Minswap.getInstance(net);

        const walletAddr = reqAddr || (await minswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address provided');
        }

        const poolAddr = await minswap.findDefaultPool(baseToken, quoteToken, 'amm');

        if (!poolAddr) {
          throw fastify.httpErrors.notFound(`Pool not found for ${baseToken}-${quoteToken}`);
        }

        const baseInfo = minswap.cardano.getTokenBySymbol(baseToken)!;
        const quoteInfo = minswap.cardano.getTokenBySymbol(quoteToken)!;

        // Build Assets
        const assetA: Asset = {
          policyId: baseInfo.policyId,
          tokenName: baseInfo.assetName,
        };
        const assetB: Asset = {
          policyId: quoteInfo.policyId,
          tokenName: quoteInfo.assetName,
        };

        const { poolState } = await minswap.getPoolData(poolAddr);
        if (!poolState) {
          throw fastify.httpErrors.notFound('Pool state unavailable');
        }

        // Determine reserves based on input/output tokens, not base/quote
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn ? [baseToken, quoteToken] : [quoteToken, baseToken];
        const [inputInfo, outputInfo] = exactIn ? [baseInfo, quoteInfo] : [quoteInfo, baseInfo];

        // Determine reserves based on actual input token
        const inputAssetId = inputToken === 'ADA' ? 'lovelace' : inputInfo.policyId + inputInfo.assetName;
        const idA = poolState.assetA;
        const idB = poolState.assetB;

        let reserveIn: bigint, reserveOut: bigint;
        if (inputAssetId === idA) {
          reserveIn = poolState.reserveA;
          reserveOut = poolState.reserveB;
        } else if (inputAssetId === idB) {
          reserveIn = poolState.reserveB;
          reserveOut = poolState.reserveA;
        } else {
          throw new Error(`Input token not in pool`);
        }

        const pct = BigInt(slippagePct);

        const privateKey = await minswap.cardano.getWalletFromAddress(walletAddr);
        minswap.cardano.lucidInstance.selectWalletFromPrivateKey(privateKey);
        const dex = new Dex(minswap.cardano.lucidInstance);

        let txBuild: TxComplete;
        let baseAmountChange: number;
        let quoteAmountChange: number;
        let totalInputSwapped: number;
        let totalOutputSwapped: number;

        if (side === 'SELL') {
          // SELL = selling BASE tokens to get QUOTE tokens
          // `amount` is the amount of base tokens to sell (input)
          const amountIn = BigInt(Math.floor(amount * 10 ** baseInfo.decimals).toString());

          const { amountOut: idealQuoteOut } = calculateSwapExactIn({
            amountIn,
            reserveIn,
            reserveOut,
          });
          const minQuoteOut = (idealQuoteOut * (100n - pct)) / 100n;

          txBuild = await dex.buildSwapExactInTx({
            sender: walletAddr,
            availableUtxos: await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: baseToken === 'ADA' ? ADA : assetA,
            amountIn,
            assetOut: quoteToken === 'ADA' ? ADA : assetB,
            minimumAmountOut: minQuoteOut,
            isLimitOrder: false,
          });

          // SELL: spending base tokens (-), receiving quote tokens (+)
          baseAmountChange = -Number(amount);
          quoteAmountChange = +Number(formatTokenAmount(minQuoteOut.toString(), quoteInfo.decimals));
          totalInputSwapped = amount; // base tokens spent
          totalOutputSwapped = Number(formatTokenAmount(minQuoteOut.toString(), quoteInfo.decimals)); // quote tokens received
        } else {
          // BUY = buying BASE tokens with QUOTE tokens
          // `amount` is the amount of base tokens to buy (output)
          const exactBaseOut = BigInt(Math.floor(amount * 10 ** baseInfo.decimals).toString());

          const { amountIn: idealQuoteIn } = calculateSwapExactOut({
            exactAmountOut: exactBaseOut,
            reserveIn,
            reserveOut,
          });

          const maxQuoteIn = (idealQuoteIn * (100n + pct)) / 100n;

          txBuild = await dex.buildSwapExactOutTx({
            sender: walletAddr,
            availableUtxos: await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: quoteToken === 'ADA' ? ADA : assetB,
            maximumAmountIn: maxQuoteIn,
            assetOut: baseToken === 'ADA' ? ADA : assetA,
            expectedAmountOut: exactBaseOut,
          });

          // BUY: spending quote tokens (-), receiving base tokens (+)
          quoteAmountChange = -Number(formatTokenAmount(maxQuoteIn.toString(), quoteInfo.decimals));
          baseAmountChange = +Number(amount);
          totalInputSwapped = Number(formatTokenAmount(maxQuoteIn.toString(), quoteInfo.decimals)); // quote tokens spent
          totalOutputSwapped = amount; // base tokens received
        }

        const signed = await txBuild.sign().complete();
        const txHash = await signed.submit();

        // Return correct token addresses and amounts
        return {
          signature: txHash,
          status: 1,
          data: {
            tokenIn: side === 'SELL' ? baseToken : quoteToken,
            tokenOut: side === 'SELL' ? quoteToken : baseToken,
            amountIn: totalInputSwapped,
            amountOut: totalOutputSwapped,
            fee: txBuild.fee,
            baseTokenBalanceChange: baseAmountChange,
            quoteTokenBalanceChange: quoteAmountChange,
          },
        };
      } catch (err: any) {
        logger.error('Swap failed:', err);
        if (err.statusCode) throw err;
        throw fastify.httpErrors.internalServerError(`Swap execution error: ${err.message}`);
      }
    },
  );
};

export default executeSwapRoute;
