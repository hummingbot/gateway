/**
 * Raydium AMM Quote Swap
 *
 * Quote operation to calculate swap amounts and price impact.
 * Handles both standard AMM and CPMM pool types.
 * Supports both exact input (sell) and exact output (buy) swaps.
 */

import { ApiV3PoolInfoStandardItem, ApiV3PoolInfoStandardItemCpmm, CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { QuoteSwapParams, QuoteSwapResult } from '../../types/amm';

/**
 * Quote swap for standard AMM pools
 */
async function quoteAmmSwap(
  raydium: any,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct?: number,
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItem;
  let rpcData: any;

  if (network === 'mainnet-beta') {
    const [poolInfoData, _poolKeys] = await raydium.getPoolfromAPI(poolId);
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItem;
    rpcData = await raydium.raydiumSDK.liquidity.getRpcPoolInfo(poolId);
  } else {
    const data = await raydium.raydiumSDK.liquidity.getPoolInfoFromRpc({ poolId });
    poolInfo = data.poolInfo;
    rpcData = data.poolRpcData;
  }

  const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()];

  if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
    throw new Error('input mint does not match pool');

  if (poolInfo.mintA.address !== outputMint && poolInfo.mintB.address !== outputMint)
    throw new Error('output mint does not match pool');

  const baseIn = inputMint === poolInfo.mintA.address;
  const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

  const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100;

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
      slippage: effectiveSlippage,
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
      slippage: effectiveSlippage,
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

  throw new Error('Either amountIn or amountOut must be provided');
}

/**
 * Quote swap for CPMM pools
 */
async function quoteCpmmSwap(
  raydium: any,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct?: number,
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItemCpmm;
  let rpcData: any;

  if (network === 'mainnet-beta') {
    const [poolInfoData, _poolKeys] = await raydium.getPoolfromAPI(poolId);
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItemCpmm;
    rpcData = await raydium.raydiumSDK.cpmm.getRpcPoolInfo(poolInfo.id, true);
  } else {
    const data = await raydium.raydiumSDK.cpmm.getPoolInfoFromRpc(poolId);
    poolInfo = data.poolInfo;
    rpcData = data.rpcData;
  }

  if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address)
    throw new Error('input mint does not match pool');

  if (outputMint !== poolInfo.mintA.address && outputMint !== poolInfo.mintB.address)
    throw new Error('output mint does not match pool');

  const baseIn = inputMint === poolInfo.mintA.address;

  if (amountIn) {
    const inputAmount = new BN(amountIn);

    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo!.tradeFeeRate,
    );

    const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100;
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
      priceImpact: null,
      inputMint,
      outputMint,
    };
  } else if (amountOut) {
    const outputAmount = new BN(amountOut);
    const outputMintPk = new PublicKey(outputMint);

    const swapResult = CurveCalculator.swapBaseOut({
      poolMintA: poolInfo.mintA,
      poolMintB: poolInfo.mintB,
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
      baseReserve: rpcData.baseReserve,
      quoteReserve: rpcData.quoteReserve,
      outputMint: outputMintPk,
      outputAmount,
    });

    const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100;
    const maxAmountIn = swapResult.amountIn.mul(new BN(Math.floor((1 + effectiveSlippage) * 10000))).div(new BN(10000));

    return {
      poolInfo,
      amountIn: swapResult.amountIn,
      amountOut: outputAmount,
      minAmountOut: outputAmount,
      maxAmountIn,
      fee: swapResult.tradeFee,
      priceImpact: null,
      inputMint,
      outputMint,
    };
  }

  throw new Error('Either amountIn or amountOut must be provided');
}

/**
 * Get raw swap quote (internal helper exported for use by execute-swap)
 */
export async function getRawSwapQuote(
  raydium: any,
  solana: any,
  network: string,
  poolId: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<any> {
  const exactIn = side === 'SELL';

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolId);
  if (!ammPoolInfo) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  // Resolve tokens
  let resolvedBaseToken = await solana.getToken(baseToken);
  let resolvedQuoteToken = await solana.getToken(quoteToken);

  // Create dummy tokens if not found but addresses match pool
  if (!resolvedBaseToken && (baseToken === ammPoolInfo.baseTokenAddress || baseToken === ammPoolInfo.quoteTokenAddress)) {
    resolvedBaseToken = {
      address: baseToken,
      symbol: baseToken.slice(0, 6),
      name: baseToken.slice(0, 6),
      decimals: 9,
      chainId: 0,
    };
  }

  if (!resolvedQuoteToken && (quoteToken === ammPoolInfo.baseTokenAddress || quoteToken === ammPoolInfo.quoteTokenAddress)) {
    resolvedQuoteToken = {
      address: quoteToken,
      symbol: quoteToken.slice(0, 6),
      name: quoteToken.slice(0, 6),
      decimals: 9,
      chainId: 0,
    };
  }

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw new Error(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`);
  }

  const baseTokenAddress = resolvedBaseToken.address;
  const quoteTokenAddress = resolvedQuoteToken.address;

  // Verify tokens match pool
  if (baseTokenAddress !== ammPoolInfo.baseTokenAddress && baseTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Base token ${baseToken} is not in pool ${poolId}`);
  }

  if (quoteTokenAddress !== ammPoolInfo.baseTokenAddress && quoteTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Quote token ${quoteToken} is not in pool ${poolId}`);
  }

  // Determine input/output tokens
  const [inputToken, outputToken] = exactIn
    ? [resolvedBaseToken, resolvedQuoteToken]
    : [resolvedQuoteToken, resolvedBaseToken];

  // Convert amounts with proper decimals
  const inputDecimals = inputToken.decimals;
  const outputDecimals = outputToken.decimals;

  const amountInWithDecimals = exactIn ? new Decimal(amount).mul(10 ** inputDecimals).toFixed(0) : undefined;
  const amountOutWithDecimals = !exactIn ? new Decimal(amount).mul(10 ** outputDecimals).toFixed(0) : undefined;

  // Get quote based on pool type
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
    throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`);
  }

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

/**
 * Quote Swap
 *
 * Calculates swap amounts, price, and slippage for AMM/CPMM pools:
 * - Supports exact input (SELL) or exact output (BUY)
 * - Returns amounts with slippage protection
 * - Calculates price impact and fees
 *
 * @param raydium - Raydium connector instance
 * @param solana - Solana chain instance
 * @param params - Quote swap parameters
 * @returns Swap quote with amounts and price info
 */
export async function quoteSwap(
  raydium: any,
  solana: any,
  params: QuoteSwapParams,
): Promise<QuoteSwapResult> {
  const { network, poolAddress, tokenIn, tokenOut, amountIn, amountOut, slippagePct } = params;

  // Determine side and amount based on parameters
  let side: 'BUY' | 'SELL';
  let amount: number;

  if (amountIn !== undefined) {
    side = 'SELL';
    amount = amountIn;
  } else if (amountOut !== undefined) {
    side = 'BUY';
    amount = amountOut;
  } else {
    throw new Error('Either amountIn or amountOut must be provided');
  }

  // Get raw quote
  const quote = await getRawSwapQuote(
    raydium,
    solana,
    network,
    poolAddress,
    tokenIn,
    tokenOut,
    amount,
    side,
    slippagePct,
  );

  const inputToken = quote.inputToken;
  const outputToken = quote.outputToken;

  // Convert BN values to numbers
  const estimatedAmountIn = new Decimal(quote.amountIn.toString()).div(10 ** inputToken.decimals).toNumber();
  const estimatedAmountOut = new Decimal(quote.amountOut.toString()).div(10 ** outputToken.decimals).toNumber();
  const minAmountOut = new Decimal(quote.minAmountOut.toString()).div(10 ** outputToken.decimals).toNumber();
  const maxAmountIn = new Decimal(quote.maxAmountIn.toString()).div(10 ** inputToken.decimals).toNumber();

  // Calculate price
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Calculate price impact percentage
  const priceImpact = quote.priceImpact ? quote.priceImpact : 0;
  const priceImpactPct = priceImpact * 100;

  return {
    poolAddress,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    slippagePct: slippagePct || 1,
    minAmountOut,
    maxAmountIn,
    priceImpactPct,
  };
}
