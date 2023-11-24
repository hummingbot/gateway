import BigNumber from "bignumber.js";
import { IConfigToken, IConfigPool, ISwapDataResponse, IAnalytics } from "../plenty.types";
import { logger } from "../../../services/logger";


export const loadSwapDataTezPairs = (
  AMM: IConfigPool,
  poolAnalytics: IAnalytics,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): ISwapDataResponse => {
  try {
    const dexContractAddress = AMM.address;
    if (dexContractAddress === "false") {
      throw new Error("No dex found");
    }

    const token1Pool = BigNumber(poolAnalytics.tvl.token1Amount).multipliedBy(10 ** AMM.token1.decimals);
    const token2Pool = BigNumber(poolAnalytics.tvl.token2Amount).multipliedBy(10 ** AMM.token2.decimals);
    const lpFee = BigNumber(AMM.fees);

    const lpToken = AMM.lpToken;

    let tokenInSupply = BigNumber(0);
    let tokenOutSupply = BigNumber(0);
    if (tokenOut.symbol === AMM.token2.symbol) {
      tokenOutSupply = token2Pool;
      tokenInSupply = token1Pool;
    } else if (tokenOut.symbol === AMM.token1.symbol) {
      tokenOutSupply = token1Pool;
      tokenInSupply = token2Pool;
    }

    tokenInSupply = tokenInSupply.dividedBy(BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(BigNumber(10).pow(tokenOut.decimals));

    const exchangeFee = BigNumber(1).dividedBy(lpFee);

    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpToken,
    };
  } catch (error) {
    logger.error("Plenty: Tez pair swap data error", error);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply: BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: BigNumber(0),
      exchangeFee: BigNumber(0),
      lpToken: undefined,
    };
  }
};

export const loadSwapDataVolatile = (
  AMM: IConfigPool,
  poolAnalytics: IAnalytics,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): ISwapDataResponse => {
  try {
    const dexContractAddress = AMM.address;
    if (dexContractAddress === "false") {
      throw new Error("No dex found");
    }

    const token1Pool = BigNumber(poolAnalytics.tvl.token1Amount).multipliedBy(10 ** AMM.token1.decimals);
    const token2Pool = BigNumber(poolAnalytics.tvl.token2Amount).multipliedBy(10 ** AMM.token2.decimals);
    const lpFee = BigNumber(AMM.fees);

    const lpToken = AMM.lpToken;

    let tokenInSupply = BigNumber(0);
    let tokenOutSupply = BigNumber(0);
    if (tokenOut.symbol === AMM.token2.symbol) {
      tokenOutSupply = token2Pool;
      tokenInSupply = token1Pool;
    } else if (tokenOut.symbol === AMM.token1.symbol) {
      tokenOutSupply = token1Pool;
      tokenInSupply = token2Pool;
    }

    tokenInSupply = tokenInSupply.dividedBy(BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(BigNumber(10).pow(tokenOut.decimals));
    const exchangeFee = BigNumber(1).dividedBy(lpFee);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpToken,
    };
  } catch (error) {
    logger.error("Plenty: Volatileswap data error", error);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply: BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: BigNumber(0),
      exchangeFee: BigNumber(0),
      lpToken: undefined,
    };
  }
};

export const loadSwapDataTezCtez = (
  AMM: IConfigPool,
  poolAnalytics: IAnalytics,
  tokenIn: string,
  tokenOut: string
): ISwapDataResponse => {
  try {
    let tezSupply: BigNumber = BigNumber(poolAnalytics.tvl.token1Amount).multipliedBy(10 ** AMM.token1.decimals);
    let ctezSupply: BigNumber = BigNumber(poolAnalytics.tvl.token2Amount).multipliedBy(10 ** AMM.token2.decimals);
    const exchangeFee = BigNumber(AMM.fees);
    const lpToken = AMM.lpToken;

    tezSupply = tezSupply.dividedBy(BigNumber(10).pow(6));
    ctezSupply = ctezSupply.dividedBy(BigNumber(10).pow(6));

    let tokenInSupply = BigNumber(0);
    let tokenOutSupply = BigNumber(0);
    if (tokenOut === AMM.token2.symbol) {
      tokenOutSupply = ctezSupply;
      tokenInSupply = tezSupply;
    } else if (tokenOut === AMM.token1.symbol) {
      tokenOutSupply = tezSupply;
      tokenInSupply = ctezSupply;
    }

    return {
      success: true,
      tokenInSupply,
      tokenOutSupply,
      tokenIn,
      tokenOut,
      exchangeFee,
      lpToken,
    };
  } catch (error) {
    logger.error('Plenty: Tez-Ctez swap data error - ', error);
    return {
      success: false,
      tokenInSupply: BigNumber(0),
      tokenOutSupply: BigNumber(0),
      tokenIn,
      tokenOut,
      exchangeFee: BigNumber(0),
      lpToken: undefined,
      target: BigNumber(0),
    };
  }
};

export const loadSwapDataGeneralStable = (
  AMM: IConfigPool,
  poolAnalytics: IAnalytics,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): ISwapDataResponse => {
  try {
    const token1Pool = BigNumber(poolAnalytics.tvl.token1Amount).multipliedBy(10 ** AMM.token1.decimals);
    const token2Pool = BigNumber(poolAnalytics.tvl.token2Amount).multipliedBy(10 ** AMM.token2.decimals);
    const token1Precision = BigNumber(AMM.token1Precision as string);
    const token2Precision = BigNumber(AMM.token2Precision as string);

    let tokenInSupply = BigNumber(0);
    let tokenOutSupply = BigNumber(0);
    let tokenInPrecision = BigNumber(0);
    let tokenOutPrecision = BigNumber(0);
    if (tokenOut.symbol === AMM.token2.symbol) {
      tokenOutSupply = token2Pool;
      tokenOutPrecision = token2Precision;
      tokenInSupply = token1Pool;
      tokenInPrecision = token1Precision;
    } else if (tokenOut.symbol === AMM.token1.symbol) {
      tokenOutSupply = token1Pool;
      tokenOutPrecision = token1Precision;
      tokenInSupply = token2Pool;
      tokenInPrecision = token2Precision;
    }
    const exchangeFee = BigNumber(AMM.fees);
    const lpToken = AMM.lpToken;

    tokenInSupply = tokenInSupply.dividedBy(BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(BigNumber(10).pow(tokenOut.decimals));

    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpToken,
      tokenInPrecision,
      tokenOutPrecision,
    };
  } catch (error) {
    logger.error('Plenty: load swap data general error - ', error);
    return {
      success: false,
      tokenIn: tokenIn.symbol,
      tokenInSupply: BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: BigNumber(0),
      exchangeFee: BigNumber(0),
      lpToken: undefined,
      tokenInPrecision: BigNumber(0),
      tokenOutPrecision: BigNumber(0),
    };
  }
};
