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
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            amount: { type: 'number', examples: [1.5] }, // now always quote
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
          amount, // this is always quote quantity
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

        // On‑chain reserves

        const { poolState } = await minswap.getPoolData(poolAddr);
        if (!poolState) {
          throw fastify.httpErrors.notFound('Pool state unavailable');
        }
        const baseReserve = poolState.reserveA;
        const quoteReserve = poolState.reserveB;

        const pct = BigInt(slippagePct);

        // 2) build via SDK
        const privateKey = await minswap.cardano.getWalletFromAddress(walletAddr);
        minswap.cardano.lucidInstance.selectWalletFromPrivateKey(privateKey);
        const dex = new Dex(minswap.cardano.lucidInstance);

        let txBuild: TxComplete;
        let baseAmountChange: number;
        let quoteAmountChange: number;
        let totalInputSwapped: number;
        let totalOutputSwapped: number;

        if (side === 'SELL') {
          // SELL: selling quote tokens to get base tokens
          // `amount` is the amount of quote tokens to sell (input)
          const amountIn = BigInt(Math.floor(amount * 10 ** quoteInfo.decimals).toString());

          const { amountOut: idealBaseOut } = calculateSwapExactIn({
            amountIn,
            reserveIn: quoteReserve,
            reserveOut: baseReserve,
          });
          const minBaseOut = (idealBaseOut * (100n - pct)) / 100n;

          txBuild = await dex.buildSwapExactInTx({
            sender: walletAddr,
            availableUtxos: await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: quoteToken === 'ADA' ? ADA : assetB,
            amountIn,
            assetOut: baseToken === 'ADA' ? ADA : assetA,
            minimumAmountOut: minBaseOut,
            isLimitOrder: false,
          });

          // SELL: spending quote tokens (-), receiving base tokens (+)
          quoteAmountChange = -Number(amount);
          baseAmountChange = +Number(formatTokenAmount(minBaseOut.toString(), baseInfo.decimals));
          totalInputSwapped = amount; // quote tokens spent
          totalOutputSwapped = Number(formatTokenAmount(minBaseOut.toString(), baseInfo.decimals)); // base tokens received
        } else {
          // BUY: buying quote tokens with base tokens
          // `amount` is the amount of quote tokens to buy (output)
          const exactQuoteOut = BigInt(Math.floor(amount * 10 ** quoteInfo.decimals).toString());

          const { amountIn: idealBaseIn } = calculateSwapExactOut({
            exactAmountOut: exactQuoteOut,
            reserveIn: baseReserve,
            reserveOut: quoteReserve,
          });

          const maxBaseIn = (idealBaseIn * (100n + pct)) / 100n;

          txBuild = await dex.buildSwapExactOutTx({
            sender: walletAddr,
            availableUtxos: await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: baseToken === 'ADA' ? ADA : assetA,
            maximumAmountIn: maxBaseIn,
            assetOut: quoteToken === 'ADA' ? ADA : assetB,
            expectedAmountOut: exactQuoteOut,
          });

          // BUY: spending base tokens (-), receiving quote tokens (+)
          baseAmountChange = -Number(formatTokenAmount(maxBaseIn.toString(), baseInfo.decimals));
          quoteAmountChange = +Number(amount);
          totalInputSwapped = Number(formatTokenAmount(maxBaseIn.toString(), baseInfo.decimals)); // base tokens spent
          totalOutputSwapped = amount; // quote tokens received
        }

        // 3) sign & submit
        const signed = await txBuild.sign().complete();

        const txHash = await signed.submit();

        return {
          signature: txHash,
          status: 1, // 1 = CONFIRMED, 0 = PENDING, -1 = FAILED
          data: {
            tokenIn: side === 'SELL' ? quoteToken : baseToken,
            tokenOut: side === 'SELL' ? baseToken : quoteToken,
            amountIn: side === 'SELL' ? totalInputSwapped : totalInputSwapped,
            amountOut: side === 'SELL' ? totalOutputSwapped : totalOutputSwapped,
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
