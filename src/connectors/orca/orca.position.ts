import {
  fetchAllTickArray,
  fetchPosition,
  fetchWhirlpool,
  getTickArrayAddress,
  type WhirlpoolDeployment,
} from '@orca-so/whirlpools-client';
import {
  collectFeesQuote,
  getTickArrayStartTickIndex,
  getTickIndexInArray,
  sqrtPriceToPrice,
  tickIndexToPrice,
  tickIndexToSqrtPrice,
  tryGetAmountDeltaA,
  tryGetAmountDeltaB,
  type TransferFee,
} from '@orca-so/whirlpools-core';
import {
  address,
  type GetAccountInfoApi,
  type GetEpochInfoApi,
  type GetMultipleAccountsApi,
  type Rpc,
  Account,
  MaybeAccount,
} from '@solana/kit';
import { fetchAllMint, type Mint } from '@solana-program/token-2022';

import { PositionInfo } from '../../schemas/clmm-schema';

type OrcaRpc = Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetEpochInfoApi>;

export const getCurrentTransferFee = (
  mint: MaybeAccount<Mint> | Account<Mint>,
  currentEpoch: bigint,
): TransferFee | undefined => {
  if (('exists' in mint && !mint.exists) || mint.data.extensions.__option === 'None') {
    return undefined;
  }

  const config = mint.data.extensions.value.find((extension) => extension.__kind === 'TransferFeeConfig');
  if (!config) {
    return undefined;
  }

  const fee = currentEpoch >= config.newerTransferFee.epoch ? config.newerTransferFee : config.olderTransferFee;
  return {
    feeBps: fee.transferFeeBasisPoints,
    maxFee: fee.maximumFee,
  };
};

export const getPositionDetails = async (
  rpc: OrcaRpc,
  positionAddress: string,
  deployment: WhirlpoolDeployment,
): Promise<PositionInfo> => {
  const position = await fetchPosition(rpc, address(positionAddress));
  const whirlpool = await fetchWhirlpool(rpc, position.data.whirlpool);
  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  const lowerStartIndex = getTickArrayStartTickIndex(position.data.tickLowerIndex, whirlpool.data.tickSpacing);
  const upperStartIndex = getTickArrayStartTickIndex(position.data.tickUpperIndex, whirlpool.data.tickSpacing);
  const [[lowerTickArrayAddress], [upperTickArrayAddress]] = await Promise.all([
    getTickArrayAddress(whirlpool.address, lowerStartIndex, deployment.programId),
    getTickArrayAddress(whirlpool.address, upperStartIndex, deployment.programId),
  ]);
  const [lowerTickArray, upperTickArray] = await fetchAllTickArray(rpc, [lowerTickArrayAddress, upperTickArrayAddress]);
  const lowerTick =
    lowerTickArray.data.ticks[
      getTickIndexInArray(position.data.tickLowerIndex, lowerStartIndex, whirlpool.data.tickSpacing)
    ];
  const upperTick =
    upperTickArray.data.ticks[
      getTickIndexInArray(position.data.tickUpperIndex, upperStartIndex, whirlpool.data.tickSpacing)
    ];

  const currentEpoch = await rpc.getEpochInfo().send();
  const fees = collectFeesQuote(
    whirlpool.data,
    position.data,
    lowerTick,
    upperTick,
    getCurrentTransferFee(mintA, currentEpoch.epoch),
    getCurrentTransferFee(mintB, currentEpoch.epoch),
  );

  const lowerSqrtPrice = tickIndexToSqrtPrice(position.data.tickLowerIndex);
  const upperSqrtPrice = tickIndexToSqrtPrice(position.data.tickUpperIndex);
  let tokenA = 0n;
  let tokenB = 0n;

  if (position.data.liquidity > 0n) {
    if (whirlpool.data.tickCurrentIndex < position.data.tickLowerIndex) {
      tokenA = tryGetAmountDeltaA(lowerSqrtPrice, upperSqrtPrice, position.data.liquidity, false);
    } else if (whirlpool.data.tickCurrentIndex >= position.data.tickUpperIndex) {
      tokenB = tryGetAmountDeltaB(lowerSqrtPrice, upperSqrtPrice, position.data.liquidity, false);
    } else {
      tokenA = tryGetAmountDeltaA(whirlpool.data.sqrtPrice, upperSqrtPrice, position.data.liquidity, false);
      tokenB = tryGetAmountDeltaB(lowerSqrtPrice, whirlpool.data.sqrtPrice, position.data.liquidity, false);
    }
  }

  const scaleA = 10 ** mintA.data.decimals;
  const scaleB = 10 ** mintB.data.decimals;

  return {
    address: positionAddress,
    baseTokenAddress: whirlpool.data.tokenMintA.toString(),
    quoteTokenAddress: whirlpool.data.tokenMintB.toString(),
    poolAddress: position.data.whirlpool.toString(),
    baseFeeAmount: Number(fees.feeOwedA) / scaleA,
    quoteFeeAmount: Number(fees.feeOwedB) / scaleB,
    lowerPrice: tickIndexToPrice(position.data.tickLowerIndex, mintA.data.decimals, mintB.data.decimals),
    upperPrice: tickIndexToPrice(position.data.tickUpperIndex, mintA.data.decimals, mintB.data.decimals),
    lowerBinId: position.data.tickLowerIndex,
    upperBinId: position.data.tickUpperIndex,
    baseTokenAmount: Number(tokenA) / scaleA,
    quoteTokenAmount: Number(tokenB) / scaleB,
    price: sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals),
  };
};
