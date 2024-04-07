import BigNumber from "bignumber.js";
import { IAnalytics, ICalculateTokenResponse, IRouterResponse, ISwapDataResponse, PoolType } from "../plenty.types";
import { UniswapishPriceError } from "../../../services/error-handler";
import { logger } from "../../../services/logger";
import {
  calculateTokenInputVolatile,
  calculateTokenOutputVolatile,
  calculateTokensInGeneralStable,
  calculateTokensInTezCtez,
  calculateTokensOutGeneralStable,
  calculateTokensOutTezCtez
} from "./pricing";
import {
  loadSwapDataGeneralStable,
  loadSwapDataTezCtez,
  loadSwapDataTezPairs,
  loadSwapDataVolatile
} from "./swapdata";
import { allPaths, computeAllPaths, computeAllPathsReverse } from "./paths";
import { routerSwap } from "./router";
import { ParamsWithKind } from "@taquito/taquito";
import { Plenty } from "../plenty";
import { Tezosish } from "../../../services/common-interfaces";


export const calculateTokensOutWrapper = (
  plenty: Plenty,
  tokenInAmount: BigNumber,
  exchangefee: BigNumber,
  slippage: string,
  tokenIn: string,
  tokenOut: string,
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  tokenInPrecision?: BigNumber,
  tokenOutPrecision?: BigNumber,
  target?: BigNumber
): ICalculateTokenResponse => {
  try {
    const poolConfig = plenty.getPool(tokenIn, tokenOut);
    const type = poolConfig.type;
    let tokenInConfig = plenty.getTokenBySymbol(tokenIn);
    let tokenOutConfig = plenty.getTokenBySymbol(tokenOut);

    let outputData: ICalculateTokenResponse;

    if ((type === PoolType.VOLATILE || type === PoolType.TEZ) && tokenInSupply && tokenOutSupply) {
      outputData = calculateTokenOutputVolatile(
        tokenInAmount,
        tokenInSupply,
        tokenOutSupply,
        exchangefee,
        slippage,
        tokenOutConfig,
      );
    } else {
      if (tokenInConfig.symbol === "XTZ" && tokenOutConfig.symbol === "CTEZ" && target) {
        outputData = calculateTokensOutTezCtez(
          tokenInSupply,
          tokenOutSupply,
          tokenInAmount,
          exchangefee,
          slippage,
          target,
          tokenInConfig.symbol
        );
      } else if (tokenInConfig.symbol === "CTEZ" && tokenOutConfig.symbol === "XTZ" && target) {
        outputData = calculateTokensOutTezCtez(
          tokenOutSupply,
          tokenInSupply,
          tokenInAmount,
          exchangefee,
          slippage,
          target,
          tokenInConfig.symbol
        );
      } else if (tokenInSupply && tokenOutSupply && tokenInPrecision && tokenOutPrecision) {
        outputData = calculateTokensOutGeneralStable(
          tokenInSupply,
          tokenOutSupply,
          tokenInAmount,
          exchangefee,
          slippage,
          tokenInConfig,
          tokenOutConfig,
          tokenInPrecision,
          tokenOutPrecision
        );
      } else {
        throw new UniswapishPriceError("Plenty priceSwapOut: Invalid Parameter");
      }
    }

    return outputData;
  } catch (error) {
    logger.error("Plenty: Swap data error - " + error);
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};

export const calculateTokensInWrapper = (
  plenty: Plenty,
  tokenInAmount: BigNumber,
  Exchangefee: BigNumber,
  slippage: string,
  tokenIn: string,
  tokenOut: string,
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  tokenInPrecision?: BigNumber,
  tokenOutPrecision?: BigNumber,
  target?: BigNumber
): ICalculateTokenResponse => {
  try {
    const poolConfig = plenty.getPool(tokenIn, tokenOut);
    const type = poolConfig.type;
    let tokenInConfig = plenty.getTokenBySymbol(tokenIn);
    let tokenOutConfig = plenty.getTokenBySymbol(tokenOut);
    let outputData: ICalculateTokenResponse;

    if ((type === PoolType.VOLATILE || type === PoolType.TEZ) && tokenInSupply && tokenOutSupply) {
      outputData = calculateTokenInputVolatile(
        tokenInAmount,
        tokenInSupply,
        tokenOutSupply,
        Exchangefee,
        slippage,
        tokenInConfig,
        tokenOutConfig
      );
    } else {
      if (tokenIn === "XTZ" && tokenOut === "CTEZ" && target) {
        outputData = calculateTokensInTezCtez(
          tokenInSupply,
          tokenOutSupply,
          tokenInAmount,
          Exchangefee,
          slippage,
          target,
          tokenIn
        );
      } else if (tokenIn === "CTEZ" && tokenOut === "XTZ" && target) {
        outputData = calculateTokensInTezCtez(
          tokenOutSupply,
          tokenInSupply,
          tokenInAmount,
          Exchangefee,
          slippage,
          target,
          tokenIn
        );
      } else if (tokenInSupply && tokenOutSupply && tokenInPrecision && tokenOutPrecision) {
        outputData = calculateTokensInGeneralStable(
          tokenInSupply,
          tokenOutSupply,
          tokenInAmount,
          Exchangefee,
          slippage,
          tokenInConfig,
          tokenOutConfig,
          tokenInPrecision,
          tokenOutPrecision
        );
      } else {
        throw new Error("Invalid Parameter");
      }
    }

    return outputData;
  } catch (error) {
    console.log({ message: "swap data error", error });
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};

export const computeAllPathsWrapper = (
  plenty: Plenty,
  paths: string[],
  tokenInAmount: BigNumber,
  slippage: string = '1/200',
  swapData: ISwapDataResponse[][],
): IRouterResponse => {
  try {
    const bestPath = computeAllPaths(
      plenty,
      paths,
      tokenInAmount,
      slippage,
      swapData
    );

    const isStable: boolean[] = [];
    let finalPriceImpact = new BigNumber(0);
    let finalFeePerc = new BigNumber(0);

    for (var x of bestPath.priceImpact) {
      finalPriceImpact = finalPriceImpact.plus(x);
    }

    for (var y of bestPath.feePerc) {
      finalFeePerc = finalFeePerc.plus(y);
    }

    for (var z = 0; z < bestPath.path.length - 1; z++) {
      const dexType = plenty.getPool(bestPath.path[z], bestPath.path[z + 1]).type;
      if (dexType === PoolType.STABLE) isStable.push(true);
      else isStable.push(false);
    }

    const exchangeRate = bestPath.tokenOutAmount.dividedBy(tokenInAmount);

    return {
      path: bestPath.path,
      tokenOutAmount: bestPath.tokenOutAmount,
      finalMinimumTokenOut: bestPath.minimumTokenOut[bestPath.minimumTokenOut.length - 1],
      minimumTokenOut: bestPath.minimumTokenOut,
      finalPriceImpact: finalPriceImpact,
      finalFeePerc: finalFeePerc,
      feePerc: bestPath.feePerc,
      isStable: isStable,
      exchangeRate: exchangeRate,
    };
  } catch (error) {
    logger.error('Plenty: compute all paths error - ', error);
    return {
      path: [],
      tokenOutAmount: new BigNumber(0),
      finalMinimumTokenOut: new BigNumber(0),
      minimumTokenOut: [],
      finalPriceImpact: new BigNumber(0),
      finalFeePerc: new BigNumber(0),
      feePerc: [],
      isStable: [],
      exchangeRate: new BigNumber(0),
    };
  }
};

export const computeReverseCalculationWrapper = (
  plenty: Plenty,
  paths: string[],
  tokenInAmount: BigNumber,
  slippage: string = '1/200',
  swapData: ISwapDataResponse[][],
  paths2: string[],
  swapData2: ISwapDataResponse[][]
): IRouterResponse => {
  try {
    const bestPath = computeAllPathsReverse(plenty, paths, tokenInAmount, slippage, swapData);
    let temp = computeAllPaths(plenty, paths2, bestPath.tokenOutAmount, slippage, swapData2);

    const path = paths2[0].split(" ");
    const tokenIn = path[0];
    const tokenInConfig = plenty.getTokenBySymbol(tokenIn);

    // Binary Search for user amount
    let low = bestPath.tokenOutAmount;
    while (temp.tokenOutAmount.isGreaterThan(tokenInAmount) && temp.tokenOutAmount.isGreaterThan(new BigNumber(0))) {
      low = low.minus(1);
      if (low.isLessThan(0)) {
        low = new BigNumber(1).dividedBy(new BigNumber(10).pow(tokenInConfig.decimals));
        break;
      }
      temp = computeAllPaths(plenty, paths2, low, slippage, swapData2);
    }

    let high = low.plus(1);
    let mid = new BigNumber(0);

    while (low.isLessThanOrEqualTo(high)) {
      mid = (low.plus(high)).dividedBy(2).decimalPlaces(tokenInConfig.decimals, 1);

      let currAns = computeAllPaths(plenty, paths2, mid, slippage, swapData2);
      if (currAns.tokenOutAmount.isEqualTo(tokenInAmount)) {
        break;
      }
      else if (tokenInAmount.isGreaterThan(currAns.tokenOutAmount)) {
        low = mid.plus(new BigNumber(1).dividedBy(new BigNumber(10).pow(tokenInConfig.decimals)));
      } else {
        high = mid.minus(new BigNumber(1).dividedBy(new BigNumber(10).pow(tokenInConfig.decimals)));
      }
    }


    const forwardPass = computeAllPaths(plenty, paths2, mid, slippage, swapData2);

    const isStable: boolean[] = [];
    let finalPriceImpact = new BigNumber(0);
    let finalFeePerc = new BigNumber(0);

    for (var x of forwardPass.priceImpact) {
      finalPriceImpact = finalPriceImpact.plus(x);
    }

    for (var x of forwardPass.feePerc) {
      finalFeePerc = finalFeePerc.plus(x);
    }

    for (var z = 0; z < forwardPass.path.length - 1; z++) {
      const dexType = plenty.getPool(forwardPass.path[z], forwardPass.path[z + 1]).type;
      if (dexType === PoolType.STABLE) isStable.push(true);
      else isStable.push(false);
    }

    const exchangeRate = tokenInAmount.dividedBy(mid);

    return {
      path: forwardPass.path,
      tokenOutAmount: mid,
      userFinalTokenOut: forwardPass.tokenOutAmount,
      finalMinimumTokenOut: forwardPass.minimumTokenOut[forwardPass.minimumTokenOut.length - 1],
      minimumTokenOut: forwardPass.minimumTokenOut,
      finalPriceImpact: finalPriceImpact,
      finalFeePerc: finalFeePerc,
      feePerc: forwardPass.feePerc,
      isStable: isStable,
      exchangeRate: exchangeRate,
    };
  } catch (error) {
    console.log(error);
    return {
      path: [],
      tokenOutAmount: new BigNumber(0),
      finalMinimumTokenOut: new BigNumber(0),
      minimumTokenOut: [],
      finalPriceImpact: new BigNumber(0),
      finalFeePerc: new BigNumber(0),
      feePerc: [],
      isStable: [],
      exchangeRate: new BigNumber(0),
    };
  }
};

export const swapWrapper = async (
  tezos: Tezosish,
  plenty: Plenty,
  tokenIn: string,
  tokenOut: string,
  tokenInAmount: BigNumber,
  caller: string,
  slippage?: string
): Promise<ParamsWithKind[]> => {

  const paths = await allPaths(
    tezos,
    plenty,
    tokenIn,
    tokenOut,
    true
  );

  const path = computeAllPathsWrapper(
    plenty,
    paths.paths,
    tokenInAmount,
    slippage,
    paths.swapData,
  );

  return await routerSwap(
    tezos,
    plenty,
    path.path,
    path.minimumTokenOut,
    caller,
    caller,
    tokenInAmount
  )
};

export const loadSwapDataWrapper = async (
  tezos: Tezosish,
  plenty: Plenty,
  analytics: IAnalytics[],
  tokenIn: string,
  tokenOut: string
): Promise<ISwapDataResponse> => {
  try {
    const dex = plenty.getPool(tokenIn, tokenOut);
    const dexType = dex.type;
    const poolAnalytics = analytics.find(analytic => analytic.pool === dex.address)!;

    let fullTokenIn = plenty.getTokenBySymbol(tokenIn);
    let fullTokenOut = plenty.getTokenBySymbol(tokenOut);

    let swapData: ISwapDataResponse;
    if (dexType === PoolType.TEZ) {
      swapData = loadSwapDataTezPairs(dex, poolAnalytics, fullTokenIn, fullTokenOut);
    } else if (dexType === PoolType.VOLATILE) {
      swapData = loadSwapDataVolatile(dex, poolAnalytics, fullTokenIn, fullTokenOut);
    } else {
      if (
        (tokenIn === "XTZ" && tokenOut === "CTEZ") ||
        (tokenIn === "CTEZ" && tokenOut === "XTZ")
      ) {
        const ctezAdmin = await tezos.getContractStorage(tezos.ctezAdminAddress);
        swapData = loadSwapDataTezCtez(dex, poolAnalytics, tokenIn, tokenOut);
        swapData.target = ctezAdmin.target;
      } else {
        swapData = loadSwapDataGeneralStable(dex, poolAnalytics, fullTokenIn, fullTokenOut);
      }
    }
    return swapData;
  } catch (error) {
    logger.error("Plenty: load swap data error - ", error);
    return {
      success: false,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      tokenInSupply: new BigNumber(0),
      tokenOutSupply: new BigNumber(0),
      exchangeFee: new BigNumber(0),
      lpToken: undefined,
    };
  }
};
