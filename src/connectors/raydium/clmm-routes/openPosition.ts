import { TxVersion, TickUtils } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import {
  OpenPositionRequest,
  OpenPositionResponse,
  OpenPositionRequestType,
  OpenPositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

import { quotePosition } from './quotePosition';

async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  baseTokenSymbol?: string,
  quoteTokenSymbol?: string,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  // If no pool address provided, find default pool using base and quote tokens
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    if (!baseTokenSymbol || !quoteTokenSymbol) {
      throw new Error(
        'Either poolAddress or both baseToken and quoteToken must be provided',
      );
    }

    poolAddressToUse = await raydium.findDefaultPool(
      baseTokenSymbol,
      quoteTokenSymbol,
      'clmm',
    );
    if (!poolAddressToUse) {
      throw new Error(
        `No CLMM pool found for pair ${baseTokenSymbol}-${quoteTokenSymbol}`,
      );
    }
  }

  const [poolInfo, poolKeys] =
    await raydium.getClmmPoolfromAPI(poolAddressToUse);
  const rpcData = await raydium.getClmmPoolfromRPC(poolAddressToUse);
  poolInfo.price = rpcData.currentPrice;

  const baseTokenInfo = await solana.getToken(poolInfo.mintA.address);
  const quoteTokenInfo = await solana.getToken(poolInfo.mintB.address);

  const { tick: lowerTick } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(lowerPrice),
    baseIn: true,
  });
  const { tick: upperTick } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(upperPrice),
    baseIn: true,
  });

  const quotePositionResponse = await quotePosition(
    _fastify,
    network,
    lowerPrice,
    upperPrice,
    poolAddressToUse,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  logger.info('Opening Raydium CLMM position...');
  const COMPUTE_UNITS = 300000;
  let currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(
      (currentPriorityFee * 1e6) / COMPUTE_UNITS,
    );
    const { transaction, extInfo } =
      await raydium.raydiumSDK.clmm.openPositionFromBase({
        poolInfo,
        poolKeys,
        tickUpper: Math.max(lowerTick, upperTick),
        tickLower: Math.min(lowerTick, upperTick),
        base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
        ownerInfo: { useSOLBalance: true },
        baseAmount: quotePositionResponse.baseLimited
          ? new BN(
              quotePositionResponse.baseTokenAmount *
                10 ** baseTokenInfo.decimals,
            )
          : new BN(
              quotePositionResponse.quoteTokenAmount *
                10 ** quoteTokenInfo.decimals,
            ),
        otherAmountMax: quotePositionResponse.baseLimited
          ? new BN(
              quotePositionResponse.quoteTokenAmountMax *
                10 ** quoteTokenInfo.decimals,
            )
          : new BN(
              quotePositionResponse.baseTokenAmountMax *
                10 ** baseTokenInfo.decimals,
            ),
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      });

    transaction.sign([wallet]);
    await solana.simulateTransaction(transaction);

    const { confirmed, signature, txData } =
      await solana.sendAndConfirmRawTransaction(transaction);
    if (confirmed && txData) {
      const totalFee = txData.meta.fee;
      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(
        signature,
        0,
      );
      const positionRent = Math.abs(balanceChange);

      const { baseTokenBalanceChange, quoteTokenBalanceChange } =
        await solana.extractPairBalanceChangesAndFee(
          signature,
          baseTokenInfo,
          quoteTokenInfo,
          wallet.publicKey.toBase58(),
        );

      return {
        signature,
        fee: totalFee / 1e9,
        positionAddress: extInfo.nftMint.toBase58(),
        positionRent,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      };
    }
    currentPriorityFee =
      currentPriorityFee * solana.config.priorityFeeMultiplier;
    logger.info(
      `Increasing priority fee to ${currentPriorityFee} lamports/CU (max fee of ${(currentPriorityFee / 1e9).toFixed(6)} SOL)`,
    );
  }
  throw new Error(
    `Open position failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`,
  );
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  const firstWalletAddress = await Solana.getWalletAddressExample();

  // Update schema example
  OpenPositionRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: OpenPositionRequestType;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Raydium CLMM position',
        tags: ['raydium/clmm'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            lowerPrice: { type: 'number', examples: [100] },
            upperPrice: { type: 'number', examples: [180] },
            poolAddress: {
              type: 'string',
              examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'],
            },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [15] },
          },
        },
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;
        const networkToUse = network || 'mainnet-beta';

        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided',
          );
        }

        return await openPosition(
          fastify,
          networkToUse,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          baseToken,
          quoteToken,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default openPositionRoute;
