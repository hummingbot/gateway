import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import { Cardano } from '../../../chains/cardano/cardano';
import {
  QuoteLiquidityRequestType,
  QuoteLiquidityRequest,
  QuoteLiquidityResponseType,
  QuoteLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap';
import { Asset, DexV2Constant } from '@aiquant/minswap-sdk'; // ← pull in Asset helper + constants
import { formatTokenAmount } from '../minswap.utils';

export async function getMinswapAmmLiquidityQuote(
  network: string,
  poolAddress?: string,
  baseToken?: string,
  quoteToken?: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  _slippagePct?: number,
): Promise<{
  baseLimited: boolean;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseTokenAmountMax: number;
  quoteTokenAmountMax: number;
  baseTokenObj: any;
  quoteTokenObj: any;
  poolAddress?: string;
  rawBaseTokenAmount: BigNumber;
  rawQuoteTokenAmount: BigNumber;
  routerAddress: string;
}> {
  const networkToUse = network || 'mainnet';

  if (!baseToken || !quoteToken) {
    throw new Error('Base token and quote token are required');
  }
  if (baseTokenAmount === undefined && quoteTokenAmount === undefined) {
    throw new Error('At least one token amount must be provided');
  }

  const minswap = await Minswap.getInstance(networkToUse);
  const cardano = await Cardano.getInstance(networkToUse);

  const baseTokenObj = cardano.getTokenBySymbol(baseToken);
  const quoteTokenObj = cardano.getTokenBySymbol(quoteToken);
  if (!baseTokenObj || !quoteTokenObj) {
    throw new Error(
      `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
    );
  }

  let poolId = poolAddress;
  let existingPool = true;
  if (!poolId) {
    poolId = await minswap.findDefaultPool(baseToken, quoteToken, 'amm');
    if (!poolId) {
      existingPool = false;
      logger.info(
        `No existing pool found for ${baseToken}-${quoteToken}, providing theoretical quote`,
      );
    }
  }

  let baseTokenAmountOptimal = baseTokenAmount!;
  let quoteTokenAmountOptimal = quoteTokenAmount!;
  let baseLimited = false;

  if (existingPool) {
    // ── 1) Load the on‐chain pool state ─────────────────────
    //    For a V2 (Constant Product) pool, use the Cardano SDK's V2 "getPoolByPair"
    const a = Asset.fromString(baseTokenObj.policyId + baseTokenObj.assetName);
    const b = Asset.fromString(
      quoteTokenObj.policyId + quoteTokenObj.assetName,
    );
    const poolState = await minswap.blockfrostAdapter.getV2PoolByPair(a, b);
    if (!poolState) {
      throw new Error(`Unable to load pool ${poolId}`);
    }

    // ── 2) Pull reserves as bigints ────────────────────────
    const baseReserve: bigint = poolState.reserveA;
    const quoteReserve: bigint = poolState.reserveB;

    // ── 3) Convert user inputs into raw bigints ───────────
    const baseRaw = baseTokenAmount
      ? BigInt(
          Math.floor(baseTokenAmount * 10 ** baseTokenObj.decimals).toString(),
        )
      : null;
    const quoteRaw = quoteTokenAmount
      ? BigInt(
          Math.floor(
            quoteTokenAmount * 10 ** quoteTokenObj.decimals,
          ).toString(),
        )
      : null;

    // ── 4) Compute the “optimal” opposite amount ───────────
    if (baseRaw !== null && quoteRaw !== null) {
      // both sides provided → pick the limiting one
      const quoteOptimal = (baseRaw * quoteReserve) / baseReserve;
      if (quoteOptimal <= quoteRaw) {
        baseLimited = true;
        quoteTokenAmountOptimal = Number(
          formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals),
        );
      } else {
        baseLimited = false;
        const baseOptimal = (quoteRaw * baseReserve) / quoteReserve;
        baseTokenAmountOptimal = Number(
          formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals),
        );
      }
    } else if (baseRaw !== null) {
      // only base provided
      const quoteOptimal =
        baseReserve === BigInt(0)
          ? BigInt(0)
          : (baseRaw * quoteReserve) / baseReserve;
      quoteTokenAmountOptimal = Number(
        formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals),
      );
      baseLimited = true;
    } else if (quoteRaw !== null) {
      // only quote provided
      const baseOptimal =
        quoteReserve === BigInt(0)
          ? BigInt(0)
          : (quoteRaw * baseReserve) / quoteReserve;
      baseTokenAmountOptimal = Number(
        formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals),
      );
      baseLimited = false;
    }
  } else {
    // new pool → must supply both
    if (baseTokenAmount == null || quoteTokenAmount == null) {
      throw new Error(
        'For a new pool, you must supply both baseTokenAmount and quoteTokenAmount',
      );
    }
    baseLimited = false; // arbitrary; both get used
  }

  // ── 5) Convert back into Ethers BigNumber for any on‐chain tx ───
  const rawBaseTokenAmount = BigNumber.from(
    Math.floor(baseTokenAmountOptimal * 10 ** baseTokenObj.decimals).toString(),
  );
  const rawQuoteTokenAmount = BigNumber.from(
    Math.floor(
      quoteTokenAmountOptimal * 10 ** quoteTokenObj.decimals,
    ).toString(),
  );

  // ── 6) (Optional) pull router address if you later build txs ─────
  const routerAddress =
    DexV2Constant.CONFIG[networkToUse === 'mainnet' ? 1 : 0]
      .poolCreationAddress;

  return {
    baseLimited,
    baseTokenAmount: baseTokenAmountOptimal,
    quoteTokenAmount: quoteTokenAmountOptimal,
    baseTokenAmountMax: baseTokenAmount ?? baseTokenAmountOptimal,
    quoteTokenAmountMax: quoteTokenAmount ?? quoteTokenAmountOptimal,
    baseTokenObj,
    quoteTokenObj,
    poolAddress: poolId,
    rawBaseTokenAmount,
    rawQuoteTokenAmount,
    routerAddress,
  };
}

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get liquidity quote for Minswap',
        tags: ['minswap/amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            baseTokenAmount: { type: 'number', examples: [0.029314] },
            quoteTokenAmount: { type: 'number', examples: [1] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: QuoteLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.query;

        const quote = await getMinswapAmmLiquidityQuote(
          network,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );

        return {
          baseLimited: quote.baseLimited,
          baseTokenAmount: quote.baseTokenAmount,
          quoteTokenAmount: quote.quoteTokenAmount,
          baseTokenAmountMax: quote.baseTokenAmountMax,
          quoteTokenAmountMax: quote.quoteTokenAmountMax,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          'Failed to get liquidity quote',
        );
      }
    },
  );
};

export default quoteLiquidityRoute;
