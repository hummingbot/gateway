import { EDatumType, ESwapType, ISwapConfigArgs, TSupportedNetworks } from '@aiquant/sundaeswap-core';
import { DatumBuilderLucidV3, TxBuilderLucidV3 } from '@aiquant/sundaeswap-core/lucid';
import { AssetAmount, IAssetAmountMetadata } from '@sundaeswap/asset';
import { FastifyPluginAsync } from 'fastify';

import { CardanoToken } from '#src/tokens/types';

import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
  ExecuteSwapRequest,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Sundaeswap AMM (Cardano)',
        tags: ['/connector/sundaeswap/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string' },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            amount: { type: 'number', examples: [100] }, // always BASE token amount
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
        const { network, walletAddress: reqAddr, baseToken, quoteToken, amount, side, slippagePct = 1 } = request.body;

        const net = (network || 'mainnet') as TSupportedNetworks;
        const sundaeswap = await Sundaeswap.getInstance(net);

        // Determine wallet
        const walletAddr = reqAddr || (await sundaeswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address provided');
        }
        const wallet = await sundaeswap.cardano.getWalletFromAddress(walletAddr);
        sundaeswap.cardano.lucidInstance.selectWalletFromPrivateKey(wallet);

        // Determine pool
        const poolAddr = await sundaeswap.findDefaultPool(baseToken, quoteToken, 'amm');
        if (!poolAddr) {
          throw fastify.httpErrors.notFound(`Pool not found for ${baseToken}-${quoteToken}`);
        }
        const poolData = await sundaeswap.getPoolData(poolAddr);

        // Get token objects
        const baseTokenObj = sundaeswap.cardano.getTokenBySymbol(baseToken);
        const quoteTokenObj = sundaeswap.cardano.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest('Token not found');
        }

        // Match Uniswap logic exactly
        const exactIn = side === 'SELL';
        const [inputTokenObj, outputTokenObj] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

        // Handle SundaeSwap's asset ID format
        const inputAssetId =
          inputTokenObj.symbol === 'ADA' ? 'ada.lovelace' : `${inputTokenObj.policyId}.${inputTokenObj.assetName}`;

        const outputAssetId =
          outputTokenObj.symbol === 'ADA' ? 'ada.lovelace' : `${outputTokenObj.policyId}.${outputTokenObj.assetName}`;

        // Get pool assets and reserves
        const assetA = poolData.assetA.assetId.trim();
        const assetB = poolData.assetB.assetId.trim();
        const reserveA = BigInt(poolData.liquidity.aReserve);
        const reserveB = BigInt(poolData.liquidity.bReserve);

        // Map input/output tokens to pool reserves
        let inputReserve: bigint;
        let outputReserve: bigint;

        if (inputAssetId === assetA) {
          inputReserve = reserveA;
          outputReserve = reserveB;
        } else if (inputAssetId === assetB) {
          inputReserve = reserveB;
          outputReserve = reserveA;
        } else {
          throw fastify.httpErrors.badRequest(`Input token ${inputAssetId} not found in pool`);
        }

        // Validate output token is in pool
        const outputInPool = outputAssetId === assetA || outputAssetId === assetB;
        if (!outputInPool) {
          throw fastify.httpErrors.badRequest(`Output token ${outputAssetId} not found in pool`);
        }

        //  Convert amount using BASE token decimals (like Uniswap)
        const fee = poolData.currentFee; // e.g., 0.005 for 0.5%
        let inputAmount: bigint;
        let outputAmount: bigint;

        if (exactIn) {
          // SELL: spending exact amount of baseToken
          inputAmount = BigInt(Math.floor(amount * 10 ** baseTokenObj.decimals));

          // Apply AMM formula: dy = (y * dx * (1 - fee)) / (x + dx * (1 - fee))
          const inputAfterFee = (inputAmount * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
          outputAmount = (outputReserve * inputAfterFee) / (inputReserve + inputAfterFee);
        } else {
          // BUY: wanting to receive exact amount of baseToken
          outputAmount = BigInt(Math.floor(amount * 10 ** baseTokenObj.decimals));

          // Check liquidity
          if (outputAmount >= outputReserve) {
            throw fastify.httpErrors.badRequest('Insufficient liquidity: requested amount exceeds available reserves');
          }

          // Apply AMM formula: dx = (x * dy) / ((y - dy) * (1 - fee))
          const numerator = inputReserve * outputAmount;
          const denominator = ((outputReserve - outputAmount) * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
          inputAmount = numerator / denominator;
        }

        // Prepare asset metadata for the input token with correct format
        const asset: IAssetAmountMetadata =
          inputTokenObj.symbol === 'ADA'
            ? {
                assetId: 'ada.lovelace',
                decimals: 6,
              }
            : {
                assetId: `${inputTokenObj.policyId}.${inputTokenObj.assetName}`,
                decimals: inputTokenObj.decimals,
              };

        // Prepare suppliedAsset
        const suppliedAsset: AssetAmount = new AssetAmount(inputAmount, asset);

        // Build swap transaction
        const args: ISwapConfigArgs = {
          swapType: { type: ESwapType.MARKET, slippage: slippagePct / 100 },
          pool: poolData,
          orderAddresses: {
            DestinationAddress: {
              address: walletAddr,
              datum: { type: EDatumType.NONE },
            },
          },
          suppliedAsset,
        };

        const txBuilder = new TxBuilderLucidV3(sundaeswap.cardano.lucidInstance, new DatumBuilderLucidV3(net));
        const swapResult = await txBuilder.swap({ ...args });

        const builtTx = await swapResult.build();
        const { submit } = await builtTx.sign();

        const txHash = await submit();

        // Format response values
        const inputAmountHuman = Number(inputAmount) / 10 ** inputTokenObj.decimals;
        const outputAmountHuman = Number(outputAmount) / 10 ** outputTokenObj.decimals;

        // Balance changes
        const baseTokenBalanceChange = side === 'BUY' ? outputAmountHuman : -inputAmountHuman;
        const quoteTokenBalanceChange = side === 'BUY' ? -inputAmountHuman : outputAmountHuman;

        return {
          signature: txHash,
          status: 1,
          data: {
            tokenIn: side === 'SELL' ? baseToken : quoteToken,
            tokenOut: side === 'SELL' ? quoteToken : baseToken,
            amountIn: inputAmountHuman,
            amountOut: outputAmountHuman,
            fee: builtTx.builtTx.fee,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
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
