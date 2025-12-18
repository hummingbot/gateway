import { TransactionBuilder } from '@orca-so/common-sdk';
import { fetchAllTickArray, fetchOracle, fetchWhirlpool, getTickArrayAddress } from '@orca-so/whirlpools-client';
import {
  IncreaseLiquidityQuote,
  TransferFee,
  getTickArrayStartTickIndex,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  isInitializedWithAdaptiveFee,
  priceToTickIndex,
  sqrtPriceToPrice,
  swapQuoteByInputToken,
} from '@orca-so/whirlpools-core';
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  PriceMath,
  PoolUtil,
  TickUtil,
  collectFeesQuote as collectFeesQuoteLegacy,
  WhirlpoolClient,
  WhirlpoolData,
  IGNORE_CACHE,
} from '@orca-so/whirlpools-sdk';
import type {
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetMultipleAccountsApi,
  Rpc,
  MaybeAccount,
  Account,
} from '@solana/kit';
import { address } from '@solana/kit';
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint, Mint } from '@solana-program/token-2022';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';
import { PositionInfo, QuotePositionResponseType } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

/**
 * Extracts detailed position information including fees, token amounts, and pricing.
 * This function fetches all necessary on-chain data and calculates derived values.
 *
 * @param {WhirlpoolClient} client - The Whirlpool client
 * @param {string} positionAddress - The position PDA address
 * @returns {Promise<PositionInfo>} - A promise that resolves to detailed position information.
 */
export async function getPositionDetails(client: WhirlpoolClient, positionAddress: string): Promise<PositionInfo> {
  const positionPubkey = new PublicKey(positionAddress);

  // Use legacy SDK's fetcher which handles position PDA addresses directly
  const position = await client.getPosition(positionPubkey, IGNORE_CACHE);
  if (!position) {
    throw httpErrors.notFound(`Position not found or closed: ${positionAddress}`);
  }

  await position.refreshData();

  const whirlpool = position.getWhirlpoolData();
  const positionData = position.getData();

  if (!whirlpool) {
    throw httpErrors.notFound(`Whirlpool not found for position: ${positionAddress}`);
  }

  const mintA = await client.getFetcher().getMintInfo(whirlpool.tokenMintA);
  const mintB = await client.getFetcher().getMintInfo(whirlpool.tokenMintB);

  if (!mintA || !mintB) {
    throw new Error('Failed to fetch mint info');
  }

  const lowerTickArrayStartIndex = TickUtil.getStartTickIndex(positionData.tickLowerIndex, whirlpool.tickSpacing);
  const upperTickArrayStartIndex = TickUtil.getStartTickIndex(positionData.tickUpperIndex, whirlpool.tickSpacing);

  const lowerTickArrayPda = PDAUtil.getTickArray(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    positionData.whirlpool,
    lowerTickArrayStartIndex,
  );
  const upperTickArrayPda = PDAUtil.getTickArray(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    positionData.whirlpool,
    upperTickArrayStartIndex,
  );

  const [lowerTickArray, upperTickArray] = await Promise.all([
    client.getFetcher().getTickArray(lowerTickArrayPda.publicKey),
    client.getFetcher().getTickArray(upperTickArrayPda.publicKey),
  ]);

  if (!lowerTickArray || !upperTickArray) {
    throw new Error('Failed to fetch tick arrays');
  }

  const lowerTickOffset = (positionData.tickLowerIndex - lowerTickArrayStartIndex) / whirlpool.tickSpacing;
  const upperTickOffset = (positionData.tickUpperIndex - upperTickArrayStartIndex) / whirlpool.tickSpacing;

  const lowerTick = lowerTickArray.ticks[lowerTickOffset];
  const upperTick = upperTickArray.ticks[upperTickOffset];

  // Get current epoch for transfer fee calculations
  const currentEpoch = await client.getContext().connection.getEpochInfo();

  // Calculate fees owed using legacy SDK
  const feesQuote = collectFeesQuoteLegacy({
    whirlpool,
    position: positionData,
    tickLower: lowerTick,
    tickUpper: upperTick,
    tokenExtensionCtx: {
      tokenMintWithProgramA: mintA,
      tokenMintWithProgramB: mintB,
      currentEpoch: currentEpoch.epoch,
    },
  });

  // Use legacy SDK utilities for calculations
  const tokenAmounts = PoolUtil.getTokenAmountsFromLiquidity(
    positionData.liquidity,
    whirlpool.sqrtPrice,
    PriceMath.tickIndexToSqrtPriceX64(positionData.tickLowerIndex),
    PriceMath.tickIndexToSqrtPriceX64(positionData.tickUpperIndex),
    false, // round down
  );

  const price = PriceMath.sqrtPriceX64ToPrice(whirlpool.sqrtPrice, mintA.decimals, mintB.decimals);
  const lowerPrice = PriceMath.tickIndexToPrice(positionData.tickLowerIndex, mintA.decimals, mintB.decimals);
  const upperPrice = PriceMath.tickIndexToPrice(positionData.tickUpperIndex, mintA.decimals, mintB.decimals);

  return {
    address: positionAddress,
    baseTokenAddress: whirlpool.tokenMintA.toString(),
    quoteTokenAddress: whirlpool.tokenMintB.toString(),
    poolAddress: positionData.whirlpool.toString(),
    baseFeeAmount: Number(feesQuote.feeOwedA.toString()) / Math.pow(10, mintA.decimals),
    quoteFeeAmount: Number(feesQuote.feeOwedB.toString()) / Math.pow(10, mintB.decimals),
    lowerPrice: lowerPrice.toNumber(),
    upperPrice: upperPrice.toNumber(),
    lowerBinId: positionData.tickLowerIndex,
    upperBinId: positionData.tickUpperIndex,
    baseTokenAmount: Number(tokenAmounts.tokenA.toString()) / Math.pow(10, mintA.decimals),
    quoteTokenAmount: Number(tokenAmounts.tokenB.toString()) / Math.pow(10, mintB.decimals),
    price: price.toNumber(),
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

/**
 * Adds instructions to handle token ATA creation, WSOL wrapping, and WSOL unwrapping when needed.
 * For receiving tokens (collectFees, removeLiquidity): Creates ATA if it doesn't exist.
 * For sending tokens (addLiquidity): Creates ATA and wraps SOL if token is WSOL.
 * For unwrapping WSOL: Closes WSOL ATA and returns all SOL to wallet.
 *
 * @param {TransactionBuilder} builder - The transaction builder to add instructions to
 * @param {WhirlpoolClient} client - The whirlpool client
 * @param {PublicKey} tokenMint - The token mint address to check
 * @param {PublicKey} tokenOwnerAccount - The ATA address for the token
 * @param {PublicKey} tokenProgram - The token program ID
 * @param {'wrap' | 'receive' | 'unwrap'} mode - 'wrap' for adding liquidity, 'receive' for collecting fees/removing liquidity, 'unwrap' for closing WSOL ATA
 * @param {BN} [amountToWrap] - Required for 'wrap' mode: amount of SOL to wrap in lamports
 * @param {Solana} [solana] - Required for 'unwrap' mode: Solana instance to use unwrapSOL method
 */
export async function handleWsolAta(
  builder: TransactionBuilder,
  client: WhirlpoolClient,
  tokenMint: PublicKey,
  tokenOwnerAccount: PublicKey,
  tokenProgram: PublicKey,
  mode: 'wrap' | 'receive' | 'unwrap',
  amountToWrap?: BN,
  solana?: Solana,
): Promise<void> {
  const isWsol = tokenMint.equals(NATIVE_MINT);
  const ataInfo = await client.getContext().connection.getAccountInfo(tokenOwnerAccount);

  if (mode === 'unwrap') {
    // For unwrapping WSOL: close WSOL ATA and return all SOL to wallet
    if (!isWsol) {
      logger.info('Token is not WSOL, skipping unwrap');
      return;
    }

    if (!solana) {
      throw new Error('Solana instance required for unwrap mode');
    }

    logger.info('Unwrapping WSOL: closing WSOL ATA to return SOL to wallet');
    const unwrapInstruction = solana.unwrapSOL(client.getContext().wallet.publicKey, tokenProgram);
    builder.addInstruction({
      instructions: [unwrapInstruction],
      cleanupInstructions: [],
      signers: [],
    });
  } else if (mode === 'receive') {
    // For receiving tokens: only create ATA if it doesn't exist
    if (!ataInfo) {
      logger.info(`${isWsol ? 'WSOL' : 'Token'} ATA doesn't exist, creating it`);
      builder.addInstruction({
        instructions: [
          createAssociatedTokenAccountIdempotentInstruction(
            client.getContext().wallet.publicKey,
            tokenOwnerAccount,
            client.getContext().wallet.publicKey,
            tokenMint,
            tokenProgram,
          ),
        ],
        cleanupInstructions: [],
        signers: [],
      });
    }
  } else if (mode === 'wrap') {
    // For sending tokens
    if (isWsol) {
      // WSOL: check existing balance and only wrap the difference
      if (!amountToWrap || amountToWrap.lten(0)) {
        return;
      }

      if (!solana) {
        throw new Error('Solana instance required for wrap mode with WSOL');
      }

      // Use solana.wrapSOL with checkBalance=true to only wrap the difference
      const wrapInstructions = await solana.wrapSOL(
        client.getContext().wallet.publicKey,
        amountToWrap.toNumber(),
        tokenProgram,
        true, // checkBalance: only wrap the difference
      );

      if (wrapInstructions.length > 0) {
        builder.addInstruction({
          instructions: wrapInstructions,
          cleanupInstructions: [],
          signers: [],
        });
      }
    } else {
      // Regular token: just create ATA if it doesn't exist
      if (!ataInfo) {
        builder.addInstruction({
          instructions: [
            createAssociatedTokenAccountIdempotentInstruction(
              client.getContext().wallet.publicKey,
              tokenOwnerAccount,
              client.getContext().wallet.publicKey,
              tokenMint,
              tokenProgram,
            ),
          ],
          cleanupInstructions: [],
          signers: [],
        });
      }
    }
  }
}

/**
 * Gets tick array pubkeys for a position's lower and upper tick indices.
 * Helper function to reduce code duplication across CLMM routes.
 */
export function getTickArrayPubkeys(
  position: { tickLowerIndex: number; tickUpperIndex: number },
  whirlpool: WhirlpoolData,
  whirlpoolPubkey: PublicKey,
): { lower: PublicKey; upper: PublicKey } {
  return {
    lower: PDAUtil.getTickArrayFromTickIndex(
      position.tickLowerIndex,
      whirlpool.tickSpacing,
      whirlpoolPubkey,
      ORCA_WHIRLPOOL_PROGRAM_ID,
    ).publicKey,
    upper: PDAUtil.getTickArrayFromTickIndex(
      position.tickUpperIndex,
      whirlpool.tickSpacing,
      whirlpoolPubkey,
      ORCA_WHIRLPOOL_PROGRAM_ID,
    ).publicKey,
  };
}
