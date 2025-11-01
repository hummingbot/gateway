import {
  fetchPosition,
  fetchWhirlpool,
  fetchAllTickArray,
  getPositionAddress,
  getTickArrayAddress,
  fetchOracle,
} from '@orca-so/whirlpools-client';
import {
  collectFeesQuote,
  getTickArrayStartTickIndex,
  getTickIndexInArray,
  sqrtPriceToPrice,
  tickIndexToPrice,
  TransferFee,
  tickIndexToSqrtPrice,
  positionStatus,
  swapQuoteByInputToken,
  isInitializedWithAdaptiveFee,
  priceToTickIndex,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  IncreaseLiquidityQuote,
} from '@orca-so/whirlpools-core';
import type {
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetMultipleAccountsApi,
  Rpc,
  MaybeAccount,
  Account,
} from '@solana/kit';
import { address } from '@solana/kit';
import { fetchAllMint, Mint } from '@solana-program/token-2022';

import { PositionInfo, QuotePositionResponseType } from '../../schemas/clmm-schema';

/**
 * Extracts detailed position information including fees, token amounts, and pricing.
 * This function fetches all necessary on-chain data and calculates derived values.
 *
 * @param {SolanaRpc} rpc - The Solana RPC client used to fetch account data.
 * @param {string} positionMintAddress - The position mint address.
 * @returns {Promise<PositionInfo>} - A promise that resolves to detailed position information.
 */
export async function getPositionDetails(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetEpochInfoApi>,
  positionMintAddress: string,
): Promise<PositionInfo> {
  const currentEpoch = await rpc.getEpochInfo().send();
  const positionAddress = await getPositionAddress(address(positionMintAddress));
  const position = await fetchPosition(rpc, positionAddress[0]);
  const whirlpool = await fetchWhirlpool(rpc, position.data.whirlpool);

  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  const lowerTickArrayStartIndex = getTickArrayStartTickIndex(position.data.tickLowerIndex, whirlpool.data.tickSpacing);
  const upperTickArrayStartIndex = getTickArrayStartTickIndex(position.data.tickUpperIndex, whirlpool.data.tickSpacing);

  const [lowerTickArrayAddress, upperTickArrayAddress] = await Promise.all([
    getTickArrayAddress(whirlpool.address, lowerTickArrayStartIndex).then((x) => x[0]),
    getTickArrayAddress(whirlpool.address, upperTickArrayStartIndex).then((x) => x[0]),
  ]);

  const [lowerTickArray, upperTickArray] = await fetchAllTickArray(rpc, [lowerTickArrayAddress, upperTickArrayAddress]);

  const lowerTick =
    lowerTickArray.data.ticks[
      getTickIndexInArray(position.data.tickLowerIndex, lowerTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];
  const upperTick =
    upperTickArray.data.ticks[
      getTickIndexInArray(position.data.tickUpperIndex, upperTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];

  const feesQuote = collectFeesQuote(
    whirlpool.data,
    position.data,
    lowerTick,
    upperTick,
    getCurrentTransferFee(mintA, currentEpoch.epoch),
    getCurrentTransferFee(mintB, currentEpoch.epoch),
  );

  const [baseTokenAmount, quoteTokenAmount] = getTokenEstimatesFromLiquidity(
    position.data.liquidity,
    whirlpool.data.sqrtPrice,
    position.data.tickLowerIndex,
    position.data.tickUpperIndex,
    false,
  );

  const price = sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals);

  const lowerPrice = tickIndexToPrice(position.data.tickLowerIndex, mintA.data.decimals, mintB.data.decimals);

  const upperPrice = tickIndexToPrice(position.data.tickUpperIndex, mintA.data.decimals, mintB.data.decimals);

  return {
    address: positionMintAddress,
    baseTokenAddress: whirlpool.data.tokenMintA,
    quoteTokenAddress: whirlpool.data.tokenMintB,
    poolAddress: position.data.whirlpool,
    baseFeeAmount: Number(feesQuote.feeOwedA) / Math.pow(10, mintA.data.decimals),
    quoteFeeAmount: Number(feesQuote.feeOwedB) / Math.pow(10, mintB.data.decimals),
    lowerPrice,
    upperPrice,
    lowerBinId: position.data.tickLowerIndex,
    upperBinId: position.data.tickUpperIndex,
    baseTokenAmount: Number(baseTokenAmount) / Math.pow(10, mintA.data.decimals),
    quoteTokenAmount: Number(quoteTokenAmount) / Math.pow(10, mintB.data.decimals),
    price,
  };
}

/**
 * Retrieves the current transfer fee configuration for a given token mint based on the current epoch.
 *
 * This function checks the mint's transfer fee configuration and returns the appropriate fee
 * structure (older or newer) depending on the current epoch. If no transfer fee configuration is found,
 * it returns `undefined`.
 *
 * @param {Mint} mint - The mint account of the token, which may include transfer fee extensions.
 * @param {bigint} currentEpoch - The current epoch to determine the applicable transfer fee.
 *
 * @returns {TransferFee | undefined} - The transfer fee configuration for the given mint, or `undefined` if no transfer fee is configured.
 */
function getCurrentTransferFee(
  mint: MaybeAccount<Mint> | Account<Mint> | null,
  currentEpoch: bigint,
): TransferFee | undefined {
  if (mint == null || ('exists' in mint && !mint.exists) || mint.data.extensions.__option === 'None') {
    return undefined;
  }
  const feeConfig = mint.data.extensions.value.find((x) => x.__kind === 'TransferFeeConfig');
  if (feeConfig == null) {
    return undefined;
  }
  const transferFee =
    currentEpoch >= feeConfig.newerTransferFee.epoch ? feeConfig.newerTransferFee : feeConfig.olderTransferFee;
  return {
    feeBps: transferFee.transferFeeBasisPoints,
    maxFee: transferFee.maximumFee,
  };
}

/**
 * Calculate token A amount from liquidity
 * @internal
 */
function getTokenAFromLiquidity(
  liquidityDelta: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  roundUp: boolean,
): bigint {
  const sqrtPriceDiff = sqrtPriceUpper - sqrtPriceLower;
  const numerator = (liquidityDelta * sqrtPriceDiff) << 64n;
  const denominator = sqrtPriceUpper * sqrtPriceLower;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (roundUp && remainder !== 0n) {
    return quotient + 1n;
  }
  return quotient;
}

/**
 * Calculate token B amount from liquidity
 * @internal
 */
function getTokenBFromLiquidity(
  liquidityDelta: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  roundUp: boolean,
): bigint {
  const sqrtPriceDiff = sqrtPriceUpper - sqrtPriceLower;
  const mul = liquidityDelta * sqrtPriceDiff;
  const result = mul >> 64n;

  if (roundUp && (mul & ((1n << 64n) - 1n)) > 0n) {
    return result + 1n;
  }
  return result;
}

/**
 * Calculate the estimated token amounts for a given liquidity delta and price range.
 * This is a TypeScript implementation of the Rust function `try_get_token_estimates_from_liquidity`.
 *
 * @param liquidityDelta - The amount of liquidity to get token estimates for
 * @param currentSqrtPrice - The current sqrt price of the pool
 * @param tickLowerIndex - The lower tick index of the range
 * @param tickUpperIndex - The upper tick index of the range
 * @param roundUp - Whether to round the token amounts up
 * @returns A tuple containing the estimated amounts of token A and token B
 */
export function getTokenEstimatesFromLiquidity(
  liquidityDelta: bigint,
  currentSqrtPrice: bigint,
  tickLowerIndex: number,
  tickUpperIndex: number,
  roundUp: boolean,
): [bigint, bigint] {
  if (liquidityDelta === 0n) {
    return [0n, 0n];
  }

  const sqrtPriceLower = tickIndexToSqrtPrice(tickLowerIndex);
  const sqrtPriceUpper = tickIndexToSqrtPrice(tickUpperIndex);

  const status = positionStatus(currentSqrtPrice, tickLowerIndex, tickUpperIndex);

  // PositionStatus enum values: Invalid = 0, PriceBelowRange = 1, PriceInRange = 2, PriceAboveRange = 3
  if (status === 'priceBelowRange') {
    // PriceBelowRange
    const tokenA = getTokenAFromLiquidity(liquidityDelta, sqrtPriceLower, sqrtPriceUpper, roundUp);
    return [tokenA, 0n];
  } else if (status === 'priceInRange') {
    // PriceInRange
    const tokenA = getTokenAFromLiquidity(liquidityDelta, currentSqrtPrice, sqrtPriceUpper, roundUp);
    const tokenB = getTokenBFromLiquidity(liquidityDelta, sqrtPriceLower, currentSqrtPrice, roundUp);
    return [tokenA, tokenB];
  } else if (status === 'priceAboveRange') {
    // PriceAboveRange
    const tokenB = getTokenBFromLiquidity(liquidityDelta, sqrtPriceLower, sqrtPriceUpper, roundUp);
    return [0n, tokenB];
  }

  // Invalid
  return [0n, 0n];
}

/**
 * Quote information for a swap on Orca
 */
export interface OrcaSwapQuote {
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  outputAmount: number;
  minOutputAmount: number;
  maxInputAmount: number;
  priceImpactPct: number;
  price: number;
  estimatedAmountIn: bigint;
  estimatedAmountOut: bigint;
}

/**
 * Gets a swap quote for an Orca whirlpool using the Orca SDK
 * @param rpc - Solana RPC client
 * @param poolAddress - The whirlpool address
 * @param inputTokenMint - Input token mint address
 * @param outputTokenMint - Output token mint address
 * @param amount - The amount to swap (in token units, not lamports)
 * @param side - 'BUY' for exact output, 'SELL' for exact input
 * @param slippagePct - Slippage tolerance percentage (default 1%)
 * @returns OrcaSwapQuote with quote details
 */
export async function getOrcaSwapQuote(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetEpochInfoApi>,
  poolAddress: string,
  inputTokenMint: string,
  outputTokenMint: string,
  amount: number,
  slippagePct: number = 1,
): Promise<OrcaSwapQuote> {
  const currentEpoch = await rpc.getEpochInfo().send();
  const whirlpoolAddress = address(poolAddress);
  const whirlpool = await fetchWhirlpool(rpc, whirlpoolAddress);

  if (!whirlpool.data) {
    throw new Error(`Whirlpool not found: ${poolAddress}`);
  }

  const isAdaptiveFee = isInitializedWithAdaptiveFee(whirlpool.data);
  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  // Determine if we're swapping A->B or B->A
  const aToB = inputTokenMint === whirlpool.data.tokenMintA;
  const inputMint = aToB ? mintA : mintB;
  const outputMint = aToB ? mintB : mintA;

  // Fetch tick arrays needed for swap calculation
  const tickSpacing = whirlpool.data.tickSpacing;
  const currentTickIndex = whirlpool.data.tickCurrentIndex;

  // Get the starting tick array index
  const startTickIndex = getTickArrayStartTickIndex(currentTickIndex, tickSpacing);

  // Fetch multiple tick arrays (we need at least 3 for most swaps)
  const tickArrayAddresses = [];
  for (let i = -1; i <= 1; i++) {
    const tickArrayAddress = await getTickArrayAddress(whirlpoolAddress, startTickIndex + i * tickSpacing * 88);
    tickArrayAddresses.push(tickArrayAddress[0]);
  }

  const tickArrays = await fetchAllTickArray(rpc, tickArrayAddresses);

  // Convert amount to lamports/token units
  const decimalsToUse = inputMint.data.decimals;
  const amountBigInt = BigInt(Math.floor(amount * Math.pow(10, decimalsToUse)));

  // Get transfer fees
  const inputTransferFee = getCurrentTransferFee(inputMint, currentEpoch.epoch);
  const outputTransferFee = getCurrentTransferFee(outputMint, currentEpoch.epoch);

  // Get oracle only if isAdaptiveFee is true
  let oracle = { data: null };
  if (isAdaptiveFee) {
    oracle = await fetchOracle(rpc, whirlpool.address);
    if (!oracle.data) {
      throw new Error(`Oracle not found: ${whirlpool.address}`);
    }
  } else {
    // If not adaptive fee, supply dummy oracle structure as expected later
    oracle.data = null;
  }

  // Get timestamp in big int
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  // Get swap quote
  const quote = swapQuoteByInputToken(
    amountBigInt,
    aToB,
    slippagePct * 100, // Convert to basis points (1% = 100)
    whirlpool.data,
    oracle.data,
    tickArrays.map((ta) => ta.data),
    timestamp,
    inputTransferFee,
    outputTransferFee,
  );
  const estimatedAmountIn = quote.tokenIn;
  const estimatedAmountOut = quote.tokenEstOut;

  // Convert bigints to human-readable numbers
  const inputAmount = Number(estimatedAmountIn) / Math.pow(10, inputMint.data.decimals);
  const outputAmount = Number(estimatedAmountOut) / Math.pow(10, outputMint.data.decimals);

  // Apply slippage for min/max amounts
  const minOutputAmount = outputAmount * (1 - slippagePct / 100);
  const maxInputAmount = inputAmount * (1 + slippagePct / 100);

  // Calculate price and price impact
  const currentPrice = sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals);
  const executionPrice = outputAmount / inputAmount;

  const priceImpactPct = aToB
    ? Math.abs((executionPrice - currentPrice) / currentPrice) * 100
    : Math.abs((1 / executionPrice - 1 / currentPrice) / (1 / currentPrice)) * 100;

  return {
    inputToken: inputTokenMint,
    outputToken: outputTokenMint,
    inputAmount,
    outputAmount,
    minOutputAmount,
    maxInputAmount,
    priceImpactPct,
    price: executionPrice,
    estimatedAmountIn,
    estimatedAmountOut,
  };
}

/**
 * Estimates the token amounts and liquidity required to open a position at the given price range.
 * When both baseTokenAmount and quoteTokenAmount are provided, uses the one that results in less liquidity.
 *
 * @param {SolanaRpc} rpc - The Solana RPC client used to fetch pool data.
 * @param {string} poolAddress - The address of the whirlpool.
 * @param {number} lowerPrice - The lower price of the position range.
 * @param {number} upperPrice - The upper price of the position range.
 * @param {number} [baseTokenAmount] - Optional amount of base token (token A) to deposit.
 * @param {number} [quoteTokenAmount] - Optional amount of quote token (token B) to deposit.
 * @param {number} [slippagePct=1] - Slippage tolerance as a percentage (default 1%).
 * @returns {Promise<QuotePositionResponseType>} - A promise that resolves to the estimated position details.
 */
export async function quotePosition(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetEpochInfoApi>,
  poolAddress: string,
  lowerPrice: number,
  upperPrice: number,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = 1,
): Promise<QuotePositionResponseType> {
  const currentEpoch = await rpc.getEpochInfo().send();
  const whirlpool = await fetchWhirlpool(rpc, address(poolAddress));

  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  const slippageToleranceBps = Math.floor(slippagePct * 100);

  // Convert prices to tick indexes
  const tickLowerIndex = priceToTickIndex(lowerPrice, mintA.data.decimals, mintB.data.decimals);
  const tickUpperIndex = priceToTickIndex(upperPrice, mintA.data.decimals, mintB.data.decimals);

  const transferFeeA = getCurrentTransferFee(mintA, currentEpoch.epoch);
  const transferFeeB = getCurrentTransferFee(mintB, currentEpoch.epoch);

  // Convert token amounts to bigint with proper decimals
  const baseAmountBigInt = baseTokenAmount
    ? BigInt(Math.floor(baseTokenAmount * Math.pow(10, mintA.data.decimals)))
    : undefined;
  const quoteAmountBigInt = quoteTokenAmount
    ? BigInt(Math.floor(quoteTokenAmount * Math.pow(10, mintB.data.decimals)))
    : undefined;

  let resBase: IncreaseLiquidityQuote | undefined;
  let resQuote: IncreaseLiquidityQuote | undefined;

  // Calculate quote based on base token amount
  if (baseAmountBigInt !== undefined && baseAmountBigInt > 0n) {
    resBase = increaseLiquidityQuoteA(
      baseAmountBigInt,
      slippageToleranceBps,
      whirlpool.data.sqrtPrice,
      tickLowerIndex,
      tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
  }

  // Calculate quote based on quote token amount
  if (quoteAmountBigInt !== undefined && quoteAmountBigInt > 0n) {
    resQuote = increaseLiquidityQuoteB(
      quoteAmountBigInt,
      slippageToleranceBps,
      whirlpool.data.sqrtPrice,
      tickLowerIndex,
      tickUpperIndex,
      transferFeeA,
      transferFeeB,
    );
  }

  let baseLimited = false;
  let res: IncreaseLiquidityQuote;

  // Determine which amount to use if both are provided
  if (resBase && resQuote) {
    const baseLiquidity = resBase.liquidityDelta;
    const quoteLiquidity = resQuote.liquidityDelta;
    baseLimited = Number(baseLiquidity) < Number(quoteLiquidity);
    res = baseLimited ? resBase : resQuote;
  } else {
    // Otherwise use the one that was calculated
    baseLimited = !!resBase;
    res = resBase || resQuote;
  }

  if (!res) {
    throw new Error('Either baseTokenAmount or quoteTokenAmount must be provided');
  }

  // Convert bigint values to human-readable numbers with proper decimals
  return {
    baseLimited,
    baseTokenAmount: Number(res.tokenEstA) / Math.pow(10, mintA.data.decimals),
    quoteTokenAmount: Number(res.tokenEstB) / Math.pow(10, mintB.data.decimals),
    baseTokenAmountMax: Number(res.tokenMaxA) / Math.pow(10, mintA.data.decimals),
    quoteTokenAmountMax: Number(res.tokenMaxB) / Math.pow(10, mintB.data.decimals),
    liquidity: Number(res.liquidityDelta),
  };
}
