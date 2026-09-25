import { CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium, RaydiumAmmPool } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

async function quoteAmmSwap(
  raydium: Raydium,
  pool: Extract<RaydiumAmmPool, { poolType: 'amm' }>,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<any> {
  const { poolInfo, poolKeys } = pool;

  if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
    throw httpErrors.badRequest('input mint does not match pool');

  if (poolInfo.mintA.address !== outputMint && poolInfo.mintB.address !== outputMint)
    throw httpErrors.badRequest('output mint does not match pool');

  const baseIn = inputMint === poolInfo.mintA.address;
  const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

  const effectiveSlippage = slippagePct / 100;

  if (amountIn) {
    const out = raydium.raydiumSDK.liquidity.computeAmountOut({
      poolInfo,
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    });

    return {
      poolInfo,
      poolKeys,
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
      poolInfo,
      amountOut: new BN(amountOut),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    });

    return {
      poolInfo,
      poolKeys,
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
  pool: Extract<RaydiumAmmPool, { poolType: 'cpmm' }>,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<any> {
  const { poolInfo, poolKeys, rpcData } = pool;

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
      poolKeys,
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
      poolKeys,
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

  // Pool state read from the chain; its owner program says whether it's AMM v4 or CPMM
  const pool = await raydium.getAmmPoolFromRpc(poolId);
  const poolBaseAddress = pool.poolInfo.mintA.address;
  const poolQuoteAddress = pool.poolInfo.mintB.address;

  logger.info(`Pool type: ${pool.poolType}`);

  // Resolve tokens from symbols or addresses
  const solana = await Solana.getInstance(network);

  let resolvedBaseToken = await solana.getToken(baseToken);
  let resolvedQuoteToken = await solana.getToken(quoteToken);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    // If tokens not found in list but we have pool info, create dummy token info
    // The swap quote doesn't need accurate symbol/decimals since it uses pool's on-chain data
    if (!resolvedBaseToken && (baseToken === poolBaseAddress || baseToken === poolQuoteAddress)) {
      resolvedBaseToken = {
        address: baseToken,
        symbol: baseToken.length > 10 ? baseToken.slice(0, 6) : baseToken,
        name: baseToken.length > 10 ? baseToken.slice(0, 6) : baseToken,
        decimals: 9, // Default, will be overridden by pool data
        chainId: 0, // Solana mainnet
      };
    }

    if (!resolvedQuoteToken && (quoteToken === poolBaseAddress || quoteToken === poolQuoteAddress)) {
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
  if (baseTokenAddress !== poolBaseAddress && baseTokenAddress !== poolQuoteAddress) {
    throw httpErrors.badRequest(`Base token ${baseToken} is not in pool ${poolId}`);
  }

  if (quoteTokenAddress !== poolBaseAddress && quoteTokenAddress !== poolQuoteAddress) {
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

  const result =
    pool.poolType === 'amm'
      ? await quoteAmmSwap(
          raydium,
          pool,
          inputToken.address,
          outputToken.address,
          amountInWithDecimals,
          amountOutWithDecimals,
          slippagePct,
        )
      : await quoteCpmmSwap(
          pool,
          inputToken.address,
          outputToken.address,
          amountInWithDecimals,
          amountOutWithDecimals,
          slippagePct,
        );

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
    poolType: pool.poolType,
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

/**
 * Standardized network-first swap quote for the Raydium AMM/CPMM connector.
 * `amount` is denominated in the base token; the counter ("quote") token is derived from the pool.
 * Imported by the unified /trading/amm dispatcher and by the Fastify route above.
 */
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const raydium = await Raydium.getInstance(network);
  const solana = await Solana.getInstance(network);

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);

  // Derive the counter ("quote") token from the pool given the requested base token.
  const baseTokenInfo = await solana.getToken(baseToken);
  const resolvedBaseAddress = baseTokenInfo ? baseTokenInfo.address : baseToken;
  let quoteToken: string;
  if (resolvedBaseAddress === ammPoolInfo.baseTokenAddress) {
    quoteToken = ammPoolInfo.quoteTokenAddress;
  } else if (resolvedBaseAddress === ammPoolInfo.quoteTokenAddress) {
    quoteToken = ammPoolInfo.baseTokenAddress;
  } else {
    throw httpErrors.badRequest(`Base token ${baseToken} is not in pool ${poolAddress}`);
  }

  return await formatSwapQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);
}
