import { FastifyPluginAsync } from 'fastify';
import {
  ExecuteSwapRequestType,
  ExecuteSwapRequest,
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import {
  ADA,
  Asset,
  Dex,
  calculateSwapExactIn,
  calculateSwapExactOut,
} from '@aiquant/minswap-sdk';
import { formatTokenAmount } from '../minswap.utils';
import { Blockfrost, Lucid, TxComplete } from '@aiquant/lucid-cardano';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Minswap AMM (Cardano)',
        tags: ['minswap/amm'],
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
        response: { 200: ExecuteSwapResponse },
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
          poolAddress: reqPool,
        } = request.body;

        const net = network || 'mainnet';
        const minswap = await Minswap.getInstance(net);

        const walletAddr =
          reqAddr || (await minswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address provided');
        }

        const poolAddr =
          reqPool ||
          (await minswap.findDefaultPool(baseToken, quoteToken, 'amm'));
        if (!poolAddr) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
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
        const poolState = await minswap.blockfrostAdapter.getV2PoolByPair(
          assetA,
          assetB,
        );
        if (!poolState) {
          throw fastify.httpErrors.notFound('Pool state unavailable');
        }
        const baseReserve = poolState.reserveA;
        const quoteReserve = poolState.reserveB;

        // 1) interpret `amount` as quoteUnits
        const amountIn = BigInt(
          Math.floor(amount * 10 ** quoteInfo.decimals).toString(),
        );
        const pct = BigInt(slippagePct);

        // 2) build via SDK
        const privateKey =
          await minswap.cardano.getWalletFromAddress(walletAddr);
        minswap.cardano.lucidInstance.selectWalletFromPrivateKey(privateKey);
        const dex = new Dex(minswap.cardano.lucidInstance);

        let txBuild: TxComplete;
        let rawOut: bigint;

        if (side === 'SELL') {
          // SELL quote → receive base  (exact‑in)
          const { amountOut: idealBaseOut } = calculateSwapExactIn({
            amountIn,
            reserveIn: quoteReserve,
            reserveOut: baseReserve,
          });
          const minBaseOut = (idealBaseOut * (100n - pct)) / 100n;
          rawOut = minBaseOut;
          txBuild = await dex.buildSwapExactInTx({
            sender: walletAddr,
            availableUtxos:
              await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: quoteToken === 'ADA' ? ADA : assetB,
            amountIn,
            assetOut: baseToken === 'ADA' ? ADA : assetA,
            minimumAmountOut: minBaseOut,
            isLimitOrder: false,
          });
        } else {
          // BUY quote → means you want exactly `amountIn` quote out, spending base (exact‑out)
          const exactQuoteOut = amountIn;
          rawOut = exactQuoteOut;
          const { amountIn: idealBaseIn } = calculateSwapExactOut({
            exactAmountOut: exactQuoteOut,
            reserveIn: baseReserve,
            reserveOut: quoteReserve,
          });

          const maxBaseIn = (idealBaseIn * (100n + pct)) / 100n;

          txBuild = await dex.buildSwapExactOutTx({
            sender: walletAddr,
            availableUtxos:
              await minswap.cardano.lucidInstance.utxosAt(walletAddr),
            assetIn: baseToken === 'ADA' ? ADA : assetA,
            maximumAmountIn: maxBaseIn,
            assetOut: quoteToken === 'ADA' ? ADA : assetB,
            expectedAmountOut: exactQuoteOut,
          });
        }

        // 3) sign & submit
        const signed = await txBuild.sign().complete();

        const txHash = await signed.submit();

        return {
          signature: txHash,
          totalInputSwapped: amount, // quote in
          totalOutputSwapped: Number(
            formatTokenAmount(
              rawOut.toString(),
              side === 'SELL' ? baseInfo.decimals : quoteInfo.decimals,
            ),
          ),
          fee: txBuild.fee,
          // for SELL: base balance goes +, quote goes −
          // for BUY:  quote goes +, base goes −
          baseTokenBalanceChange:
            side === 'SELL'
              ? +formatTokenAmount(rawOut.toString(), baseInfo.decimals)
              : -Number(amount),
          quoteTokenBalanceChange:
            side === 'SELL'
              ? -Number(amount)
              : +formatTokenAmount(rawOut.toString(), quoteInfo.decimals),
        };
      } catch (err: any) {
        logger.error('Swap failed:', err);
        if (err.statusCode) throw err;
        throw fastify.httpErrors.internalServerError(
          `Swap execution error: ${err.message}`,
        );
      }
    },
  );
};

export default executeSwapRoute;
