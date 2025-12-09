import { ApiV3PoolInfoStandardItem, ApiV3PoolInfoStandardItemCpmm, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas';
import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType, QuoteSwapResponse, QuoteSwapRequestType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumAmmQuoteSwapRequest } from '../schemas';

async function quoteAmmSwap(
  raydium: Raydium,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItem;
  let poolKeys: any;
  let rpcData: any;

  if (network === 'mainnet-beta') {
    // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
    const [poolInfoData, poolKeysData] = await raydium.getPoolfromAPI(poolId);
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItem;
    poolKeys = poolKeysData;
    rpcData = await raydium.raydiumSDK.liquidity.getRpcPoolInfo(poolId);
  } else {
    // note: getPoolInfoFromRpc method only returns required pool data for computing not all detail pool info
    const data = await raydium.raydiumSDK.liquidity.getPoolInfoFromRpc({
      poolId,
    });
    poolInfo = data.poolInfo;
    poolKeys = data.poolKeys;
    rpcData = data.poolRpcData;
  }

  const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()];

  if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
    throw httpErrors.badRequest('input mint does not match pool');

  if (poolInfo.mintA.address !== outputMint && poolInfo.mintB.address !== outputMint)
    throw httpErrors.badRequest('output mint does not match pool');

  const baseIn = inputMint === poolInfo.mintA.address;
  const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

  const effectiveSlippage = slippagePct / 100;

  if (amountIn) {
    const out = raydium.raydiumSDK.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    });

    return {
      poolInfo,
      mintIn,
      mintOut,
      amountIn: new BN(amountIn),
      amountOut: out.amountOut,
      minAmountOut: out.minAmountOut,
      maxAmountIn: new BN(amountIn),
      fee: out.fee,
      priceImpact: out.priceImpact,
    };
  } else if (amountOut) {
    const out = raydium.raydiumSDK.liquidity.computeAmountIn({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountOut: new BN(amountOut),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    });

    return {
      poolInfo,
      mintIn,
      mintOut,
      amountIn: out.amountIn,
      amountOut: new BN(amountOut),
      minAmountOut: new BN(amountOut),
      maxAmountIn: out.maxAmountIn,
      priceImpact: out.priceImpact,
    };
  }

  throw httpErrors.badRequest('Either amountIn or amountOut must be provided');
}

async function quoteCpmmSwap(
  raydium: Raydium,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItemCpmm;
  let poolKeys: any;
  let rpcData: any;

  if (network === 'mainnet-beta') {
    const [poolInfoData, poolKeysData] = await raydium.getPoolfromAPI(poolId);
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItemCpmm;
    poolKeys = poolKeysData;
    rpcData = await raydium.raydiumSDK.cpmm.getRpcPoolInfo(poolInfo.id, true);
  } else {
    const data = await raydium.raydiumSDK.cpmm.getPoolInfoFromRpc(poolId);
    poolInfo = data.poolInfo;
    poolKeys = data.poolKeys;
    rpcData = data.rpcData;
  }

  if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address)
    throw httpErrors.badRequest('input mint does not match pool');

  if (outputMint !== poolInfo.mintA.address && outputMint !== poolInfo.mintB.address)
    throw httpErrors.badRequest('output mint does not match pool');

  const baseIn = inputMint === poolInfo.mintA.address;

  if (amountIn) {
    // Exact input (swap base in)
    const inputAmount = new BN(amountIn);

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo!.tradeFeeRate,
    );

    // Apply slippage to output amount
    const effectiveSlippage = slippagePct / 100;
    const minAmountOut = swapResult.destinationAmountSwapped
      .mul(new BN(Math.floor((1 - effectiveSlippage) * 10000)))
      .div(new BN(10000));

    return {
      poolInfo,
      amountIn: inputAmount,
      amountOut: swapResult.destinationAmountSwapped,
      minAmountOut,
      maxAmountIn: inputAmount,
      fee: swapResult.tradeFee,
      priceImpact: null, // CPMM doesn't provide price impact
      inputMint,
      outputMint,
    };
  } else if (amountOut) {
    // Exact output (swap base out)
    const outputAmount = new BN(amountOut);
    const outputMintPk = new PublicKey(outputMint);

    // Log inputs to swapBaseOut
    logger.info(`CurveCalculator.swapBaseOut inputs: 
      poolMintA=${poolInfo.mintA.address}, 
      poolMintB=${poolInfo.mintB.address}, 
      tradeFeeRate=${rpcData.configInfo!.tradeFeeRate.toString()}, 
      baseReserve=${rpcData.baseReserve.toString()}, 
      quoteReserve=${rpcData.quoteReserve.toString()}, 
      outputMint=${outputMintPk.toString()}, 
      outputAmount=${outputAmount.toString()}`);

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swapBaseOut({
      poolMintA: poolInfo.mintA,
      poolMintB: poolInfo.mintB,
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
      baseReserve: rpcData.baseReserve,
      quoteReserve: rpcData.quoteReserve,
      outputMint: outputMintPk,
      outputAmount,
    });

    // Apply slippage to input amount
    const effectiveSlippage = slippagePct / 100;
    const maxAmountIn = swapResult.amountIn.mul(new BN(Math.floor((1 + effectiveSlippage) * 10000))).div(new BN(10000));

    return {
      poolInfo,
      amountIn: swapResult.amountIn,
      amountOut: outputAmount,
      minAmountOut: outputAmount,
      maxAmountIn,
      fee: swapResult.tradeFee,
      priceImpact: null, // CPMM doesn't provide price impact
      inputMint,
      outputMint,
    };
  }

  throw httpErrors.badRequest('Either amountIn or amountOut must be provided');
}

export async function getRawSwapQuote(
  raydium: Raydium,
  network: string,
  poolId: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<any> {
  // Convert side to exactIn
  const exactIn = side === 'SELL';

  logger.info(
    `getRawSwapQuote: poolId=${poolId}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, exactIn=${exactIn}`,
  );

  // Get pool info to determine if it's AMM or CPMM
  const ammPoolInfo = await raydium.getAmmPoolInfo(poolId);

  if (!ammPoolInfo) {
    throw httpErrors.notFound(`Pool not found: ${poolId}`);
  }

  logger.info(`Pool type: ${ammPoolInfo.poolType}`);

  // Resolve tokens from symbols or addresses
  const solana = await Solana.getInstance(network);

  let resolvedBaseToken = await solana.getToken(baseToken);
  let resolvedQuoteToken = await solana.getToken(quoteToken);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    // If tokens not found in list but we have pool info, create dummy token info
    // The swap quote doesn't need accurate symbol/decimals since it uses pool's on-chain data
    if (
      !resolvedBaseToken &&
      (baseToken === ammPoolInfo.baseTokenAddress || baseToken === ammPoolInfo.quoteTokenAddress)
    ) {
      resolvedBaseToken = {
        address: baseToken,
        symbol: baseToken.length > 10 ? baseToken.slice(0, 6) : baseToken,
        name: baseToken.length > 10 ? baseToken.slice(0, 6) : baseToken,
        decimals: 9, // Default, will be overridden by pool data
        chainId: 0, // Solana mainnet
      };
    }

    if (
      !resolvedQuoteToken &&
      (quoteToken === ammPoolInfo.baseTokenAddress || quoteToken === ammPoolInfo.quoteTokenAddress)
    ) {
      resolvedQuoteToken = {
        address: quoteToken,
        symbol: quoteToken.length > 10 ? quoteToken.slice(0, 6) : quoteToken,
        name: quoteToken.length > 10 ? quoteToken.slice(0, 6) : quoteToken,
        decimals: 9, // Default, will be overridden by pool data
        chainId: 0, // Solana mainnet
      };
    }

    // If still not resolved, throw error
    if (!resolvedBaseToken || !resolvedQuoteToken) {
      throw httpErrors.notFound(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`);
    }
  }

  logger.info(
    `Base token: ${resolvedBaseToken.symbol}, address=${resolvedBaseToken.address}, decimals=${resolvedBaseToken.decimals}`,
  );
  logger.info(
    `Quote token: ${resolvedQuoteToken.symbol}, address=${resolvedQuoteToken.address}, decimals=${resolvedQuoteToken.decimals}`,
  );

  const baseTokenAddress = resolvedBaseToken.address;
  const quoteTokenAddress = resolvedQuoteToken.address;

  // Verify input and output tokens match pool tokens
  if (baseTokenAddress !== ammPoolInfo.baseTokenAddress && baseTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw httpErrors.badRequest(`Base token ${baseToken} is not in pool ${poolId}`);
  }

  if (quoteTokenAddress !== ammPoolInfo.baseTokenAddress && quoteTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw httpErrors.badRequest(`Quote token ${quoteToken} is not in pool ${poolId}`);
  }

  // Determine which token is input and which is output based on exactIn flag
  const [inputToken, outputToken] = exactIn
    ? [resolvedBaseToken, resolvedQuoteToken]
    : [resolvedQuoteToken, resolvedBaseToken];

  logger.info(`Input token: ${inputToken.symbol}, address=${inputToken.address}, decimals=${inputToken.decimals}`);
  logger.info(`Output token: ${outputToken.symbol}, address=${outputToken.address}, decimals=${outputToken.decimals}`);

  // Convert amount to string with proper decimals based on which token we're using
  const inputDecimals = inputToken.decimals;
  const outputDecimals = outputToken.decimals;

  // Create amount with proper decimals for the token being used (input for exactIn, output for exactOut)
  const amountInWithDecimals = exactIn ? new Decimal(amount).mul(10 ** inputDecimals).toFixed(0) : undefined;

  const amountOutWithDecimals = !exactIn ? new Decimal(amount).mul(10 ** outputDecimals).toFixed(0) : undefined;

  logger.info(`Amount in human readable: ${amount}`);
  logger.info(`Amount in with decimals: ${amountInWithDecimals}, Amount out with decimals: ${amountOutWithDecimals}`);

  let result;
  if (ammPoolInfo.poolType === 'amm') {
    result = await quoteAmmSwap(
      raydium,
      network,
      poolId,
      inputToken.address,
      outputToken.address,
      amountInWithDecimals,
      amountOutWithDecimals,
      slippagePct,
    );
  } else if (ammPoolInfo.poolType === 'cpmm') {
    result = await quoteCpmmSwap(
      raydium,
      network,
      poolId,
      inputToken.address,
      outputToken.address,
      amountInWithDecimals,
      amountOutWithDecimals,
      slippagePct,
    );
  } else {
    throw httpErrors.badRequest(`Unsupported pool type: ${ammPoolInfo.poolType}`);
  }

  logger.info(
    `Raw quote result: amountIn=${result.amountIn.toString()}, amountOut=${result.amountOut.toString()}, inputMint=${result.inputMint}, outputMint=${result.outputMint}`,
  );

  // Add price calculation
  const price =
    side === 'SELL'
      ? result.amountOut.toString() / result.amountIn.toString()
      : result.amountIn.toString() / result.amountOut.toString();

  return {
    ...result,
    inputToken,
    outputToken,
    price,
  };
}

async function formatSwapQuote(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}`,
  );

  const raydium = await Raydium.getInstance(network);
  const solana = await Solana.getInstance(network);

  // Resolve tokens from symbols or addresses
  const resolvedBaseToken = await solana.getToken(baseToken);
  const resolvedQuoteToken = await solana.getToken(quoteToken);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw httpErrors.notFound(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`);
  }

  logger.info(
    `Resolved base token: ${resolvedBaseToken.symbol}, address=${resolvedBaseToken.address}, decimals=${resolvedBaseToken.decimals}`,
  );
  logger.info(
    `Resolved quote token: ${resolvedQuoteToken.symbol}, address=${resolvedQuoteToken.address}, decimals=${resolvedQuoteToken.decimals}`,
  );

  // Get pool info
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  logger.info(
    `Pool info: type=${poolInfo.poolType}, baseToken=${poolInfo.baseTokenAddress}, quoteToken=${poolInfo.quoteTokenAddress}`,
  );

  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side as 'BUY' | 'SELL',
    slippagePct,
  );

  logger.info(`Quote result: amountIn=${quote.amountIn.toString()}, amountOut=${quote.amountOut.toString()}`);

  // Use the token objects returned from getRawSwapQuote
  const inputToken = quote.inputToken;
  const outputToken = quote.outputToken;

  logger.info(`Using input token decimals: ${inputToken.decimals}, output token decimals: ${outputToken.decimals}`);

  // Convert BN values to numbers with correct decimal precision
  const estimatedAmountIn = new Decimal(quote.amountIn.toString()).div(10 ** inputToken.decimals).toNumber();

  const estimatedAmountOut = new Decimal(quote.amountOut.toString()).div(10 ** outputToken.decimals).toNumber();

  const minAmountOut = new Decimal(quote.minAmountOut.toString()).div(10 ** outputToken.decimals).toNumber();

  const maxAmountIn = new Decimal(quote.maxAmountIn.toString()).div(10 ** inputToken.decimals).toNumber();

  logger.info(
    `Converted amounts: estimatedAmountIn=${estimatedAmountIn}, estimatedAmountOut=${estimatedAmountOut}, minAmountOut=${minAmountOut}, maxAmountIn=${maxAmountIn}`,
  );

  // Calculate balance changes correctly based on which tokens are being swapped
  const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
  const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

  logger.info(
    `Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`,
  );

  // Add price calculation
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Determine tokenIn and tokenOut based on side
  const tokenIn = side === 'SELL' ? resolvedBaseToken.address : resolvedQuoteToken.address;
  const tokenOut = side === 'SELL' ? resolvedQuoteToken.address : resolvedBaseToken.address;

  // Calculate fee and price impact
  const fee = quote.fee ? new Decimal(quote.fee.toString()).div(10 ** inputToken.decimals).toNumber() : 0;
  const priceImpactPct = quote.priceImpact ? quote.priceImpact * 100 : 0;

  return {
    // Base QuoteSwapResponse fields
    poolAddress,
    tokenIn,
    tokenOut,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    slippagePct: slippagePct,
    minAmountOut,
    maxAmountIn,
    priceImpactPct,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Raydium AMM',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmQuoteSwapRequest,
        response: {
          200: QuoteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;
        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw httpErrors.badRequest('baseToken, quoteToken, amount, and side are required');
        }

        const raydium = await Raydium.getInstance(networkToUse);
        const solana = await Solana.getInstance(networkToUse);

        let poolAddressToUse = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressToUse) {
          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'raydium',
            networkToUse,
            'amm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No AMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        const result = await formatSwapQuote(
          networkToUse,
          poolAddressToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(networkToUse);
        } catch (error) {
          logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
        }

        return result;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        if (e.message?.includes('Pool not found')) {
          throw httpErrors.notFound(e.message);
        }
        if (e.message?.includes('Token not found')) {
          throw httpErrors.badRequest(e.message);
        }
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

// Export quoteSwap wrapper for chain-level routes
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  return await formatSwapQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);
}
