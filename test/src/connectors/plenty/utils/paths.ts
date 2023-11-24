import BigNumber from "bignumber.js";
import { IBestPathResponse, IConfigToken, IConfigTokens, ISwapDataResponse } from "../plenty.types";
import { calculateTokensInWrapper, calculateTokensOutWrapper, loadSwapDataWrapper } from "./wrappers";
import { Plenty } from "../plenty";
import { Tezosish } from "../../../services/common-interfaces";
import { logger } from "../../../services/logger";


export const allPaths = async (
  tezos: Tezosish,
  plenty: Plenty,
  tokenIn: string,
  tokenOut: string,
  multihop: boolean
): Promise<{ paths: string[], swapData: ISwapDataResponse[][] }> => {
  try {
    const TOKEN = plenty.tokenList as Record<string, IConfigToken>;
    // Making Empty Visited Array
    const visited: { [x: string]: boolean } = {};

    // Reinitializing paths to remove any gunk
    let paths: string[] = [];

    // Initialise Visited with false
    Object.keys(TOKEN).forEach(function (key) {
      visited[key] = false;
    });

    allPathHelper(tokenIn, tokenOut, visited, tokenIn, TOKEN, paths);

    let tempPaths: string[] = [];

    for (const i in paths) {
      const path = paths[i].split(' ');
      if (!multihop) {
        if (path.length === 2)
          tempPaths.push(paths[i]);
      }
      else {
        if (path.length <= 5)
          tempPaths.push(paths[i]);
      }
    }
    tempPaths.sort((a, b) => a.length - b.length);
    paths = tempPaths;

    let swapData: ISwapDataResponse[][] = [];
    const promises: Promise<ISwapDataResponse>[] = [];
    const analytics = await plenty.getAnalytics();

    for (const path of paths) {
      const pathArray = path.split(' ');
      swapData.push([]);
      for (let j = 0; j < pathArray.length - 1; j++) {
        promises.push(loadSwapDataWrapper(tezos, plenty, analytics, pathArray[j], pathArray[j + 1]));
      }
    }

    const responses = await Promise.all(promises);

    let responseIndex = 0;
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i].split(' ');

      for (let j = 0; j < path.length - 1; j++) {
        swapData[i][j] = responses[responseIndex++];
      }
    }

    return {
      paths,
      swapData
    };

  } catch (error) {
    logger.error("Plenty: all paths error - ", error);
    return {
      paths: [],
      swapData: []
    };
  }
};

const allPathHelper = (
  src: string,
  dest: string,
  visited: { [x: string]: boolean },
  psf: string,
  TOKEN: IConfigTokens,
  paths: string[],
) => {
  if (src === dest) {
    paths.push(psf);
  }
  visited[src] = true;
  for (const x in TOKEN[src].pairs) {
    if (visited[TOKEN[src].pairs[x]] == false) {
      allPathHelper(
        TOKEN[src].pairs[x],
        dest,
        visited,
        psf + ' ' + TOKEN[src].pairs[x],
        TOKEN,
        paths
      );
    }
  }
  visited[src] = false;
};

export const computeAllPaths = (
  plenty: Plenty,
  paths: string[],
  tokenInAmount: BigNumber,
  slippage: string,
  swapData: ISwapDataResponse[][],
): IBestPathResponse => {
  try {
    let bestPath;

    for (const i in paths) {
      // Adding input from user
      const tokenInAmountArr: BigNumber[] = [];
      tokenInAmountArr.push(tokenInAmount);

      const fees: BigNumber[] = [];
      const minimumTokenOut: BigNumber[] = [];
      const feePerc: BigNumber[] = [];
      const priceImpact: BigNumber[] = [];

      const path = paths[i].split(' ');
      for (let j = 0; j < path.length - 1; j++) {
        // Getting Swap Details
        const res = swapData[i][j];

        // Calculating individual Token out value
        const output = calculateTokensOutWrapper(
          plenty,
          tokenInAmountArr[j],
          res.exchangeFee,
          slippage,
          path[j],
          path[j + 1],
          res.tokenInSupply,
          res.tokenOutSupply,
          res.tokenInPrecision ?? undefined,
          res.tokenOutPrecision ?? undefined,
          res.target ?? undefined
        );

        tokenInAmountArr.push(output.tokenOutAmount);
        minimumTokenOut.push(output.minimumOut);
        fees.push(output.fees);
        feePerc.push(output.feePerc);
        priceImpact.push(output.priceImpact);
      }

      // Update bestPath
      if (bestPath) {
        // update best path
        if (
          tokenInAmountArr[tokenInAmountArr.length - 1].isGreaterThan(bestPath.tokenOutAmount)
        ) {
          bestPath.path = path;
          bestPath.tokenOutAmount = tokenInAmountArr[tokenInAmountArr.length - 1];
          bestPath.minimumTokenOut = minimumTokenOut;
          bestPath.fees = fees;
          bestPath.feePerc = feePerc;
          bestPath.priceImpact = priceImpact;
          bestPath.bestPathSwapData = swapData[i];
        }
      } else {
        // add current path as best path
        bestPath = {
          path: path,
          tokenOutAmount: tokenInAmountArr[tokenInAmountArr.length - 1],
          minimumTokenOut: minimumTokenOut,
          fees: fees,
          feePerc: feePerc,
          priceImpact: priceImpact,
          bestPathSwapData: swapData[i],
        };
      }
    }

    if (bestPath) return bestPath;
    else throw new Error('Can not calculate Route');
  } catch (error) {
    logger.error('Plenty: compute all paths error - ', error);
    const bestPath = {
      path: [],
      bestPathSwapData: [],
      tokenOutAmount: new BigNumber(0),
      minimumTokenOut: [],
      priceImpact: [],
      fees: [],
      feePerc: [],
    };
    return bestPath;
  }
};

export const computeAllPathsReverse = (
  plenty: Plenty,
  paths: string[],
  tokenInAmount: BigNumber,
  slippage: string,
  swapData: ISwapDataResponse[][],
): IBestPathResponse => {
  try {
    let bestPath;

    for (const i in paths) {
      // Adding input from user
      const tokenInAmountArr: BigNumber[] = [];
      tokenInAmountArr.push(tokenInAmount);

      const fees: BigNumber[] = [];
      const minimumTokenOut: BigNumber[] = [];
      const feePerc: BigNumber[] = [];
      const priceImpact: BigNumber[] = [];

      const path = paths[i].split(' ');
      for (let j = 0; j < path.length - 1; j++) {
        // Getting Swap Details
        const res = swapData[i][j];

        // Calculating individual Token out value
        const output = calculateTokensInWrapper(
          plenty,
          tokenInAmountArr[j],
          res.exchangeFee,
          slippage,
          path[j],
          path[j + 1],
          res.tokenInSupply,
          res.tokenOutSupply,
          res.tokenInPrecision ?? undefined,
          res.tokenOutPrecision ?? undefined,
          res.target ?? undefined
        );

        tokenInAmountArr.push(output.tokenOutAmount);
        minimumTokenOut.push(output.minimumOut);
        fees.push(output.fees);
        feePerc.push(output.feePerc);
        priceImpact.push(output.priceImpact);
      }

      // Update bestPath
      if (bestPath) {
        // update best path
        if (
          tokenInAmountArr[tokenInAmountArr.length - 1].isGreaterThan(bestPath.tokenOutAmount)
        ) {
          bestPath.path = path;
          bestPath.tokenOutAmount = tokenInAmountArr[tokenInAmountArr.length - 1];
          bestPath.minimumTokenOut = minimumTokenOut;
          bestPath.fees = fees;
          bestPath.feePerc = feePerc;
          bestPath.priceImpact = priceImpact;
          bestPath.bestPathSwapData = swapData[i];
        }
      } else {
        // add current path as best path
        bestPath = {
          path: path,
          tokenOutAmount: tokenInAmountArr[tokenInAmountArr.length - 1],
          minimumTokenOut: minimumTokenOut,
          fees: fees,
          feePerc: feePerc,
          priceImpact: priceImpact,
          bestPathSwapData: swapData[i],
        };
      }
    }

    if (bestPath) return bestPath;
    else throw new Error('Can not calculate Route');
  } catch (error) {
    console.log(error);
    const bestPath = {
      path: [],
      bestPathSwapData: [],
      tokenOutAmount: new BigNumber(0),
      minimumTokenOut: [],
      priceImpact: [],
      fees: [],
      feePerc: [],
    };
    return bestPath;
  }
};