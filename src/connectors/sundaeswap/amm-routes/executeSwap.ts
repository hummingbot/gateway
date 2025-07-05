import { FastifyPluginAsync } from 'fastify';
import {
  ExecuteSwapRequestType,
  ExecuteSwapRequest,
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Sundaeswap } from '../sundaeswap';
import { formatTokenAmount } from '../sundaeswap.utils';
import {
  EDatumType,
  ESwapType,
  ISwapConfigArgs,
  TSupportedNetworks,
} from '@aiquant/sundaeswap-core';
import {
  DatumBuilderLucidV3,
  TxBuilderLucidV3,
} from '@aiquant/sundaeswap-core/lucid';
import { AssetAmount, IAssetAmountMetadata } from '@sundaeswap/asset';
import { BigNumber } from 'ethers';
import { CardanoTokenInfo } from '../../../chains/cardano/cardano';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Sundaeswap AMM (Cardano)',
        tags: ['sundaeswap/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            walletAddress: { type: 'string' },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['SUNDAE'] },
            amount: { type: 'number', examples: [100] }, // always quote amount
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
          amount,
          side,
          slippagePct = 1,
          poolAddress: reqPool,
        } = request.body;

        const net = (network || 'mainnet') as TSupportedNetworks;
        const sundaeswap = await Sundaeswap.getInstance(net);

        // determine wallet
        const walletAddr =
          reqAddr || (await sundaeswap.cardano.getFirstWalletAddress());
        if (!walletAddr) {
          throw fastify.httpErrors.badRequest('No wallet address provided');
        }
        const wallet =
          await sundaeswap.cardano.getWalletFromAddress(walletAddr);
        sundaeswap.cardano.lucidInstance.selectWalletFromPrivateKey(wallet);

        // determine pool
        const poolAddr =
          reqPool ||
          (await sundaeswap.findDefaultPool(baseToken, quoteToken, 'amm'));
        if (!poolAddr) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
        }
        const poolData = await sundaeswap.getPoolData(poolAddr);

        // Get token objects
        const baseTokenObj = sundaeswap.cardano.getTokenBySymbol(baseToken);
        const quoteTokenObj = sundaeswap.cardano.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest('Token not found');
        }

        // Get pool assets and reserves
        const assetA = poolData.assetA.assetId.trim();
        const assetB = poolData.assetB.assetId.trim();
        const reserveA = BigInt(poolData.liquidity.aReserve);
        const reserveB = BigInt(poolData.liquidity.bReserve);

        // Determine which token corresponds to which asset in the pool
        const baseAssetId =
          baseTokenObj.address ||
          `${baseTokenObj.policyId}.${baseTokenObj.assetName}`;
        const quoteAssetId =
          quoteTokenObj.address ||
          `${quoteTokenObj.policyId}.${quoteTokenObj.assetName}`;

        let baseReserve: bigint;
        let quoteReserve: bigint;

        // Match tokens to pool reserves
        if (baseAssetId.trim() === assetA) {
          baseReserve = reserveA;
          quoteReserve = reserveB;
        } else if (baseAssetId.trim() === assetB) {
          baseReserve = reserveB;
          quoteReserve = reserveA;
        } else {
          throw fastify.httpErrors.badRequest(
            `Base token ${baseAssetId} not found in pool`,
          );
        }

        // Validate quote token is in the pool
        const quoteInPool =
          quoteAssetId.trim() === assetA || quoteAssetId.trim() === assetB;
        if (!quoteInPool) {
          throw fastify.httpErrors.badRequest(
            `Quote token ${quoteAssetId} not found in pool`,
          );
        }

        // Convert amount to smallest units and calculate swap amounts
        const fee = poolData.currentFee; // e.g., 0.005 for 0.5%
        let inputAmount: bigint;
        let outputAmount: bigint;
        let inputTokenObj: CardanoTokenInfo;
        let outputTokenObj: CardanoTokenInfo;

        if (side === 'SELL') {
          // SELL: spending `amount` of quoteToken, receiving baseToken
          inputTokenObj = quoteTokenObj;
          outputTokenObj = baseTokenObj;
          inputAmount = BigInt(
            Math.floor(amount * 10 ** quoteTokenObj.decimals),
          );

          // Apply AMM formula for sell (exactIn): dy = (y * dx * (1 - fee)) / (x + dx * (1 - fee))
          const inputAfterFee =
            (inputAmount * BigInt(Math.floor((1 - fee) * 10000))) / 10000n;
          outputAmount =
            (baseReserve * inputAfterFee) / (quoteReserve + inputAfterFee);
        } else {
          // BUY: wanting to receive `amount` of quoteToken, paying baseToken
          inputTokenObj = baseTokenObj;
          outputTokenObj = quoteTokenObj;
          outputAmount = BigInt(
            Math.floor(amount * 10 ** quoteTokenObj.decimals),
          );

          // Check if we have enough liquidity
          if (outputAmount >= quoteReserve) {
            throw fastify.httpErrors.badRequest(
              'Insufficient liquidity: requested amount exceeds available reserves',
            );
          }

          // Apply AMM formula for buy (exactOut): dx = (x * dy) / ((y - dy) * (1 - fee))
          const numerator = baseReserve * outputAmount;
          const denominator =
            ((quoteReserve - outputAmount) *
              BigInt(Math.floor((1 - fee) * 10000))) /
            10000n;
          inputAmount = numerator / denominator;
        }

        // Prepare asset metadata for the input token
        const asset: IAssetAmountMetadata =
          inputTokenObj.symbol === 'ADA'
            ? {
                assetId: 'ada.lovelace',
                decimals: 6,
              }
            : {
                assetId:
                  inputTokenObj.address ||
                  `${inputTokenObj.policyId}.${inputTokenObj.assetName}`,
                decimals: inputTokenObj.decimals,
              };

        // Prepare suppliedAsset
        let suppliedAsset: AssetAmount = new AssetAmount(inputAmount, asset);

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

        const txBuilder = new TxBuilderLucidV3(
          sundaeswap.cardano.lucidInstance,
          new DatumBuilderLucidV3(net),
        );
        const swapResult = await txBuilder.swap({ ...args });
        console.log('working upto here', swapResult);

        const builtTx = await swapResult.build();
        console.log('working upto here!', builtTx);
        const { submit } = await builtTx.sign();

        const txHash = await submit();

        // Format response values - convert back to human readable amounts
        const inputAmountHuman =
          Number(inputAmount) / 10 ** inputTokenObj.decimals;
        const outputAmountHuman =
          Number(outputAmount) / 10 ** outputTokenObj.decimals;

        // Calculate balance changes
        const baseTokenBalanceChange =
          side === 'BUY' ? outputAmountHuman : -inputAmountHuman;
        const quoteTokenBalanceChange =
          side === 'BUY' ? -inputAmountHuman : outputAmountHuman;

        return {
          signature: txHash,
          totalInputSwapped: inputAmountHuman,
          totalOutputSwapped: outputAmountHuman,
          fee: builtTx.builtTx.fee,
          baseTokenBalanceChange,
          quoteTokenBalanceChange,
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
