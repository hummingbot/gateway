import { swapInstructions } from '@orca-so/whirlpools';
import { fetchAllPositionWithFilter, fetchWhirlpool, positionWhirlpoolFilter } from '@orca-so/whirlpools-client';
import {
  getInitializableTickIndex,
  type IncreaseLiquidityQuote,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  priceToTickIndex,
  sqrtPriceToPrice,
  tickIndexToPrice,
  tickIndexToSqrtPrice,
  tryGetAmountDeltaA,
  tryGetAmountDeltaB,
} from '@orca-so/whirlpools-core';
import {
  address,
  createNoopSigner,
  type Address,
  type GetAccountInfoApi,
  type GetEpochInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type Rpc,
} from '@solana/kit';
import { Connection } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';

import { QuotePositionResponseType } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { getCurrentTransferFee } from './orca.position';
import { getOrcaDeployment } from './orca.sdk';

/** Extract token transfers grouped by their parent Whirlpool instruction. */
export async function extractInnerTransferAmounts(
  connection: Connection,
  signature: string,
  programId: string,
  tokenMints: string[],
  maxRetries: number = 5,
  retryDelayMs: number = 2000,
): Promise<{ transferGroups: number[][] }> {
  let parsedTx: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    parsedTx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (parsedTx) break;
    logger.info(`Waiting for parsed transaction (attempt ${attempt + 1}/${maxRetries})...`);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  if (!parsedTx) {
    logger.warn(`Could not fetch parsed transaction for ${signature} after ${maxRetries} attempts`);
    return { transferGroups: [] };
  }

  const innerInstructions = parsedTx.meta?.innerInstructions || [];
  const tokenBalances = [...(parsedTx.meta?.preTokenBalances || []), ...(parsedTx.meta?.postTokenBalances || [])];
  const accountKeys = parsedTx.transaction.message.accountKeys;
  const accountToMint: Record<string, string> = {};
  const accountToDecimals: Record<string, number> = {};
  const mintToDecimals: Record<string, number> = {};

  for (const tokenBalance of tokenBalances) {
    const accountAddress = accountKeys[tokenBalance.accountIndex]?.pubkey?.toString();
    if (accountAddress && tokenBalance.mint) {
      accountToMint[accountAddress] = tokenBalance.mint;
    }
    if (accountAddress && tokenBalance.uiTokenAmount?.decimals !== undefined) {
      accountToDecimals[accountAddress] = tokenBalance.uiTokenAmount.decimals;
    }
    if (tokenBalance.mint && tokenBalance.uiTokenAmount?.decimals !== undefined) {
      mintToDecimals[tokenBalance.mint] = tokenBalance.uiTokenAmount.decimals;
    }
  }

  const targetIndices: number[] = [];
  for (let index = 0; index < parsedTx.transaction.message.instructions.length; index++) {
    if (parsedTx.transaction.message.instructions[index].programId?.toString() === programId) {
      targetIndices.push(index);
    }
  }

  const transferGroups: number[][] = [];
  for (const targetIndex of targetIndices) {
    const innerBlock = innerInstructions.find((block: any) => block.index === targetIndex);
    if (!innerBlock?.instructions) continue;

    const mintAmounts = Object.fromEntries(tokenMints.map((mint) => [mint, 0])) as Record<string, number>;
    let hasTransfers = false;
    for (const innerInstruction of innerBlock.instructions) {
      const parsed = innerInstruction.parsed;
      if (!parsed) continue;

      let mint: string | undefined;
      let rawAmount: string | undefined;
      let decimals: number | undefined;
      if (parsed.type === 'transferChecked' && parsed.info) {
        mint = parsed.info.mint;
        rawAmount = parsed.info.tokenAmount?.amount;
        decimals = parsed.info.tokenAmount?.decimals;
      } else if (parsed.type === 'transfer' && parsed.info) {
        rawAmount = parsed.info.amount;
        mint = accountToMint[parsed.info.source] || accountToMint[parsed.info.destination];
        decimals = accountToDecimals[parsed.info.source] ?? accountToDecimals[parsed.info.destination];
      }

      if (!mint || !rawAmount || !tokenMints.includes(mint)) continue;
      decimals ??= mintToDecimals[mint] || 0;
      mintAmounts[mint] += Number(rawAmount) / 10 ** decimals;
      hasTransfers = true;
    }
    if (hasTransfers) {
      transferGroups.push(tokenMints.map((mint) => mintAmounts[mint] || 0));
    }
  }
  return { transferGroups };
}

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

export async function getOrcaSwapQuote(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetEpochInfoApi & GetMinimumBalanceForRentExemptionApi>,
  poolAddress: string,
  baseTokenMint: string,
  quoteTokenMint: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = 1,
  network: string = 'mainnet-beta',
): Promise<OrcaSwapQuote> {
  const whirlpoolAddress = address(poolAddress);
  const whirlpool = await fetchWhirlpool(rpc, whirlpoolAddress);
  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const tokenAMint = whirlpool.data.tokenMintA.toString();
  const isBuy = side === 'BUY';
  const inputTokenMint = isBuy ? quoteTokenMint : baseTokenMint;
  const outputTokenMint = isBuy ? baseTokenMint : quoteTokenMint;
  const inputIsA = inputTokenMint === tokenAMint;
  const inputDecimals = inputIsA ? mintA.data.decimals : mintB.data.decimals;
  const outputDecimals = inputIsA ? mintB.data.decimals : mintA.data.decimals;
  const config = {
    signer: createNoopSigner(address('11111111111111111111111111111111')),
    slippageToleranceBps: Math.round(slippagePct * 100),
    whirlpoolDeployment: getOrcaDeployment(network),
  };
  const result = isBuy
    ? await swapInstructions(
        rpc,
        {
          outputAmount: BigInt(Math.floor(amount * 10 ** outputDecimals)),
          mint: address(outputTokenMint),
        },
        whirlpoolAddress,
        config,
      )
    : await swapInstructions(
        rpc,
        {
          inputAmount: BigInt(Math.floor(amount * 10 ** inputDecimals)),
          mint: address(inputTokenMint),
        },
        whirlpoolAddress,
        config,
      );

  const estimatedAmountIn = 'tokenMaxIn' in result.quote ? result.quote.tokenEstIn : result.quote.tokenIn;
  const estimatedAmountOut = 'tokenMaxIn' in result.quote ? result.quote.tokenOut : result.quote.tokenEstOut;
  const inputAmount = Number(estimatedAmountIn) / 10 ** inputDecimals;
  const outputAmount = Number(estimatedAmountOut) / 10 ** outputDecimals;
  const minOutputAmount =
    'tokenMinOut' in result.quote ? Number(result.quote.tokenMinOut) / 10 ** outputDecimals : outputAmount;
  const maxInputAmount =
    'tokenMaxIn' in result.quote ? Number(result.quote.tokenMaxIn) / 10 ** inputDecimals : inputAmount;
  const baseAmount = isBuy ? outputAmount : inputAmount;
  const quoteAmount = isBuy ? inputAmount : outputAmount;
  const executionPrice = baseAmount > 0 ? quoteAmount / baseAmount : 0;
  const currentPrice = sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals);
  const spotRate = baseTokenMint === tokenAMint ? currentPrice : 1 / currentPrice;

  return {
    inputToken: inputTokenMint,
    outputToken: outputTokenMint,
    inputAmount,
    outputAmount,
    minOutputAmount,
    maxInputAmount,
    priceImpactPct: spotRate > 0 ? Math.abs((spotRate - executionPrice) / spotRate) * 100 : 0,
    price: executionPrice,
    estimatedAmountIn,
    estimatedAmountOut,
  };
}

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
  const tickLowerIndex = getInitializableTickIndex(
    priceToTickIndex(lowerPrice, mintA.data.decimals, mintB.data.decimals),
    whirlpool.data.tickSpacing,
    false,
  );
  const tickUpperIndex = getInitializableTickIndex(
    priceToTickIndex(upperPrice, mintA.data.decimals, mintB.data.decimals),
    whirlpool.data.tickSpacing,
    true,
  );
  const transferFeeA = getCurrentTransferFee(mintA, currentEpoch.epoch);
  const transferFeeB = getCurrentTransferFee(mintB, currentEpoch.epoch);
  const baseAmount = baseTokenAmount ? BigInt(Math.floor(baseTokenAmount * 10 ** mintA.data.decimals)) : undefined;
  const quoteAmount = quoteTokenAmount ? BigInt(Math.floor(quoteTokenAmount * 10 ** mintB.data.decimals)) : undefined;
  const baseResult =
    baseAmount && baseAmount > 0n
      ? increaseLiquidityQuoteA(
          baseAmount,
          slippageToleranceBps,
          whirlpool.data.sqrtPrice,
          tickLowerIndex,
          tickUpperIndex,
          transferFeeA,
          transferFeeB,
        )
      : undefined;
  const quoteResult =
    quoteAmount && quoteAmount > 0n
      ? increaseLiquidityQuoteB(
          quoteAmount,
          slippageToleranceBps,
          whirlpool.data.sqrtPrice,
          tickLowerIndex,
          tickUpperIndex,
          transferFeeA,
          transferFeeB,
        )
      : undefined;

  let baseLimited = false;
  let result: IncreaseLiquidityQuote | undefined;
  if (baseResult && quoteResult) {
    baseLimited = baseResult.liquidityDelta < quoteResult.liquidityDelta;
    result = baseLimited ? baseResult : quoteResult;
  } else {
    baseLimited = !!baseResult;
    result = baseResult || quoteResult;
  }
  if (!result) {
    throw new Error('Either baseTokenAmount or quoteTokenAmount must be provided');
  }

  return {
    baseLimited,
    baseTokenAmount: Number(result.tokenEstA) / 10 ** mintA.data.decimals,
    quoteTokenAmount: Number(result.tokenEstB) / 10 ** mintB.data.decimals,
    baseTokenAmountMax: Number(result.tokenMaxA) / 10 ** mintA.data.decimals,
    quoteTokenAmountMax: Number(result.tokenMaxB) / 10 ** mintB.data.decimals,
    liquidity: Number(result.liquidityDelta),
  };
}

export interface OrcaBinDistributionEntry {
  binId: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}

export async function computeOrcaBinDistribution(args: {
  rpc: Parameters<typeof fetchAllPositionWithFilter>[0];
  poolAddress: string;
  tickSpacing: number;
  currentTickIndex: number;
  currentSqrtPrice: bigint;
  decimalsA: number;
  decimalsB: number;
  binCount: number;
  programAddress?: Address;
}): Promise<OrcaBinDistributionEntry[]> {
  const {
    rpc,
    poolAddress,
    tickSpacing,
    currentTickIndex,
    currentSqrtPrice,
    decimalsA,
    decimalsB,
    binCount,
    programAddress,
  } = args;
  if (binCount <= 0) return [];

  const positionAccounts = await fetchAllPositionWithFilter(
    rpc,
    [positionWhirlpoolFilter(address(poolAddress))],
    programAddress,
  );
  const halfBins = Math.floor(binCount / 2);
  const snappedCurrent = Math.floor(currentTickIndex / tickSpacing) * tickSpacing;
  const firstBinStart = snappedCurrent - halfBins * tickSpacing;
  const scaleA = 10 ** decimalsA;
  const scaleB = 10 ** decimalsB;
  const bins: OrcaBinDistributionEntry[] = [];

  for (let index = 0; index < binCount; index++) {
    const tickStart = firstBinStart + index * tickSpacing;
    const tickEnd = tickStart + tickSpacing;
    let binLiquidity = 0n;
    for (const account of positionAccounts) {
      if (account.data.tickLowerIndex < tickEnd && account.data.tickUpperIndex > tickStart) {
        binLiquidity += account.data.liquidity;
      }
    }

    let rawA = 0n;
    let rawB = 0n;
    if (binLiquidity > 0n) {
      const sqrtA = tickIndexToSqrtPrice(tickStart);
      const sqrtB = tickIndexToSqrtPrice(tickEnd);
      if (currentTickIndex >= tickEnd) {
        rawB = tryGetAmountDeltaB(sqrtA, sqrtB, binLiquidity, false);
      } else if (currentTickIndex < tickStart) {
        rawA = tryGetAmountDeltaA(sqrtA, sqrtB, binLiquidity, false);
      } else {
        rawA = tryGetAmountDeltaA(currentSqrtPrice, sqrtB, binLiquidity, false);
        rawB = tryGetAmountDeltaB(sqrtA, currentSqrtPrice, binLiquidity, false);
      }
    }
    bins.push({
      binId: tickStart,
      price: tickIndexToPrice(tickStart, decimalsA, decimalsB),
      baseTokenAmount: Number(rawA) / scaleA,
      quoteTokenAmount: Number(rawB) / scaleB,
    });
  }
  return bins;
}
