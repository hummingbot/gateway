import { Contract } from '@ethersproject/contracts';
import { Static } from '@sinclair/typebox';
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk';
import { Decimal } from 'decimal.js';
import { BigNumber, constants, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum, TokenInfo } from '../../../chains/ethereum/ethereum';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { UniswapClmmCreatePoolRequest } from '../schemas';
import {
  IUniswapV3FactoryABI,
  IUniswapV3PoolSlot0ABI,
  INftManagerCreatePoolABI,
  getUniswapV3FactoryAddress,
  getUniswapV3NftManagerAddress,
} from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

// Uniswap V3 supported fee tiers (hundredths of a bip). 100=0.01%, 500=0.05%, 3000=0.30%, 10000=1.00%.
const VALID_FEE_TIERS = [100, 500, 3000, 10000];

// Default gas limit for CLMM create-pool. Deploying + initializing a V3 pool via the NFT manager
// costs more than a plain swap; a pool deployment is ~4-5M gas on mainnet.
const CLMM_CREATE_POOL_GAS_LIMIT = 6000000;

/**
 * Resolves a token symbol or address to its on-chain TokenInfo. Native ETH is not an ERC20 — a V3
 * pool is always built on WETH — so 'ETH' resolves to WETH for the pool's token address/decimals.
 */
async function resolveToken(ethereum: Ethereum, tokenOrAddress: string): Promise<TokenInfo> {
  const isEthInput = tokenOrAddress.toUpperCase() === 'ETH';
  const lookup = isEthInput ? 'WETH' : tokenOrAddress;
  const token = await ethereum.getToken(lookup);
  if (!token) {
    throw httpErrors.badRequest(`Token not found: ${tokenOrAddress}`);
  }
  return token;
}

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can
 * be seeded on-market instead of at an arbitrary ratio. Seeding off-market invites arbitrage bots to
 * instantly rebalance the pool. Uses a SELL quote of the base token via the network's configured swap
 * provider (an aggregator that does not require this not-yet-created pool); throws a clear error if no
 * market route exists.
 */
async function fetchMarketPrice(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
): Promise<number> {
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
    quote = await getUnifiedQuoteSwap(`ethereum-${network}`, baseToken, quoteToken, amount, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to seed the pool (${e.message}). ` +
        'Pass initialPrice explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(`No market route found for ${baseToken}/${quoteToken}. Pass initialPrice explicitly.`);
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  initialPrice?: number,
  fee?: number,
  gasPrice?: number,
  maxGas?: number,
): Promise<CreatePoolResponseType> {
  // Validate the fee tier — V3 only accepts a fixed set of tiers, each mapped to a tick spacing.
  if (fee === undefined) {
    throw httpErrors.badRequest('fee tier is required (one of 100, 500, 3000, 10000)');
  }
  if (!VALID_FEE_TIERS.includes(fee)) {
    throw httpErrors.badRequest(
      `Invalid fee tier ${fee}. Must be one of 100 (0.01%), 500 (0.05%), 3000 (0.30%), 10000 (1.00%)`,
    );
  }

  const ethereum = await Ethereum.getInstance(network);

  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  const baseTokenInfo = await resolveToken(ethereum, baseToken);
  const quoteTokenInfo = await resolveToken(ethereum, quoteToken);

  if (baseTokenInfo.address.toLowerCase() === quoteTokenInfo.address.toLowerCase()) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  // V3 requires token0 < token1 by address (ascending). Determine which side is token0.
  const baseIsToken0 = baseTokenInfo.address.toLowerCase() < quoteTokenInfo.address.toLowerCase();
  const token0 = baseIsToken0 ? baseTokenInfo : quoteTokenInfo;
  const token1 = baseIsToken0 ? quoteTokenInfo : baseTokenInfo;

  // Resolve the seed price (quote per base). Priority: explicit initialPrice → live market price.
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else {
    // Use 1 base unit as the probe amount for the market quote.
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken, 1);
    seedSource = 'market (unified swap router)';
  }

  // Convert the human seed price (quote per base) into sqrtPriceX96 for the (token0, token1) orientation.
  //
  // sqrtPriceX96 encodes sqrt(raw token1 per raw token0) * 2^96, where "raw" means base-unit amounts
  // (i.e. adjusted for each token's decimals). encodeSqrtRatioX96(amount1, amount0) == sqrt(amount1/amount0) * 2^96,
  // so we must supply amount1/amount0 == the RAW token1-per-token0 ratio.
  //
  //   humanRatio (token1 per token0) = seedPrice           when base == token0 (quote == token1)
  //                                  = 1 / seedPrice        when base == token1 (quote == token0)  ← price inverted
  //   rawRatio = humanRatio * 10^token1.decimals / 10^token0.decimals
  //
  // We therefore pass amount1 = humanRatio * 10^token1.decimals and amount0 = 10^token0.decimals. To keep both
  // integers (encodeSqrtRatioX96 requires JSBI integers) we multiply BOTH by a fixed precision factor — this
  // leaves the amount1/amount0 ratio unchanged while preserving the fractional part of humanRatio.
  //
  // This matches openPosition.ts, which converts a human price to a tick via
  // `rawPrice = humanPrice * 10^(token1.decimals - token0.decimals)` (rawPrice == rawRatio here), treating the
  // input as a token1-per-token0 price — consistent with our base==token0 case, and correctly inverted for base==token1.
  const humanRatio = baseIsToken0 ? new Decimal(seedPrice) : new Decimal(1).div(seedPrice);
  const precision = new Decimal(10).pow(18); // integer-preserving scale factor applied to both sides
  const amount1 = humanRatio.mul(new Decimal(10).pow(token1.decimals)).mul(precision).toFixed(0);
  const amount0 = new Decimal(10).pow(token0.decimals).mul(precision).toFixed(0);
  if (new Decimal(amount1).isZero() || new Decimal(amount0).isZero()) {
    throw httpErrors.badRequest('Computed sqrtPriceX96 inputs are zero — check initialPrice and token decimals');
  }
  const sqrtPriceX96 = encodeSqrtRatioX96(JSBI.BigInt(amount1), JSBI.BigInt(amount0));
  const sqrtPriceX96Str = sqrtPriceX96.toString();

  logger.info(
    `Creating Uniswap V3 pool ${baseTokenInfo.symbol}/${quoteTokenInfo.symbol} (fee ${fee}) seeded at ` +
      `${seedPrice} ${quoteTokenInfo.symbol}/${baseTokenInfo.symbol} [${seedSource}] — token0=${token0.symbol}, ` +
      `token1=${token1.symbol}, sqrtPriceX96=${sqrtPriceX96Str}`,
  );

  const factoryAddress = getUniswapV3FactoryAddress(network);
  const factory = new Contract(factoryAddress, IUniswapV3FactoryABI, ethereum.provider);

  // If a pool already exists AND is already initialized (slot0.sqrtPriceX96 != 0), reject — there is
  // nothing to create. A created-but-uninitialized pool (zero sqrtPriceX96) is still initialized below.
  const existingPool: string = await factory.getPool(token0.address, token1.address, fee);
  if (existingPool && existingPool !== constants.AddressZero) {
    const poolContract = new Contract(existingPool, IUniswapV3PoolSlot0ABI, ethereum.provider);
    const slot0 = await poolContract.slot0();
    if (!BigNumber.from(slot0.sqrtPriceX96).isZero()) {
      throw new Error(`Pool already exists and is initialized for this token pair and fee tier: ${existingPool}`);
    }
    logger.info(`Pool ${existingPool} deployed but uninitialized — initializing it at the seed price`);
  }

  // Create + initialize in a single idempotent call via the NonfungiblePositionManager. This deploys the
  // pool through the factory (if needed) and initializes it at sqrtPriceX96 (if needed) — preferred over
  // the two-tx Factory.createPool + Pool.initialize path. It is available on every V3 NFT manager.
  const nftManagerAddress = getUniswapV3NftManagerAddress(network);
  const nftManager = new Contract(nftManagerAddress, INftManagerCreatePoolABI, wallet);

  const gasOptions = await ethereum.prepareGasOptions(gasPrice, maxGas || CLMM_CREATE_POOL_GAS_LIMIT);

  const tx = await nftManager.createAndInitializePoolIfNecessary(
    token0.address,
    token1.address,
    fee,
    sqrtPriceX96Str,
    gasOptions,
  );

  logger.info(`Creating Uniswap V3 pool via tx ${tx.hash}`);

  const receipt = await ethereum.handleTransactionExecution(tx);

  // Read the (now-created) pool address from the factory — the authoritative source.
  const poolAddress: string = await factory.getPool(token0.address, token1.address, fee);

  if (receipt && receipt.status === 1) {
    const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18); // ETH has 18 decimals
    return {
      signature: receipt.transactionHash,
      status: 1, // CONFIRMED
      poolAddress,
      price: seedPrice,
      data: {
        fee: gasFee,
      },
    };
  }

  // Timed out (still broadcasting) or reverted — report as pending with the tx hash.
  return {
    signature: receipt ? receipt.transactionHash : tx.hash,
    status: 0, // PENDING
    poolAddress,
    price: seedPrice,
  };
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: Static<typeof UniswapClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description: 'Create and initialize a new Uniswap V3 (CLMM) pool at an initial price (no liquidity seeded)',
        tags: ['/connector/uniswap'],
        body: UniswapClmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          baseToken,
          quoteToken,
          fee,
          initialPrice,
          gasPrice,
          maxGas,
          walletAddress: requestedWalletAddress,
        } = request.body;

        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no wallets found.');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Route accepts gasPrice as a wei string (matching sibling requests); createPool expects gwei.
        const gasPriceGwei = gasPrice ? parseFloat(utils.formatUnits(gasPrice, 'gwei')) : undefined;

        return await createPool(network, walletAddress, baseToken, quoteToken, initialPrice, fee, gasPriceGwei, maxGas);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }

        if (e.message && e.message.includes('already exists')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest(
            'Insufficient ETH balance to pay for gas fees. Please add more ETH to your wallet.',
          );
        }

        throw fastify.httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;
