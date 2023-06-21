import BigNumber from "bignumber.js";
import { IConfigToken, IPoolData, ISwapDataResponse } from "../plenty.types";
import { logger } from "../../../services/logger";
import { ContractAbstraction } from "@taquito/taquito";
import { Tezosish } from "../../../services/common-interfaces";


export const loadSwapDataTezPairs = async (
  tezos: Tezosish,
  dex: IPoolData,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): Promise<ISwapDataResponse> => {
  try {
    const AMM = dex.config;

    const dexContractAddress = AMM.address;
    if (dexContractAddress === "false") {
      throw new Error("No dex found");
    }

    const storageResponse = await tezos.getContractStorage(dexContractAddress);

    const token1Pool = new BigNumber(storageResponse.token1_pool);
    const token2Pool = new BigNumber(storageResponse.token2_pool);
    let lpTokenSupply = new BigNumber(storageResponse.totalSupply);
    const lpFee = new BigNumber(storageResponse.lpFee);

    const lpToken = AMM.lpToken;

    let tokenInSupply = new BigNumber(0);
    let tokenOutSupply = new BigNumber(0);
    if (tokenOut.symbol === AMM.token2.symbol) {
      tokenOutSupply = token2Pool;
      tokenInSupply = token1Pool;
    } else if (tokenOut.symbol === AMM.token1.symbol) {
      tokenOutSupply = token1Pool;
      tokenInSupply = token2Pool;
    }

    tokenInSupply = tokenInSupply.dividedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    lpTokenSupply = lpTokenSupply.dividedBy(new BigNumber(10).pow(lpToken.decimals));

    const exchangeFee = new BigNumber(1).dividedBy(lpFee);

    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpTokenSupply,
      lpToken,
    };
  } catch (error) {
    logger.error("Plenty: Tez pair swap data error", error);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply: new BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: new BigNumber(0),
      exchangeFee: new BigNumber(0),
      lpTokenSupply: new BigNumber(0),
      lpToken: undefined,
    };
  }
};

export const loadSwapDataVolatile = async (
  tezos: Tezosish,
  dex: IPoolData,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): Promise<ISwapDataResponse> => {
  try {
    const AMM = dex.config;

    const dexContractAddress = AMM.address;
    if (dexContractAddress === "false") {
      throw new Error("No dex found");
    }

    const storageResponse = await tezos.getContractStorage(dexContractAddress);

    const token1Pool = new BigNumber(storageResponse.token1_pool);
    const token2Pool = new BigNumber(storageResponse.token2_pool);
    let lpTokenSupply = new BigNumber(storageResponse.totalSupply);
    const lpFee = new BigNumber(storageResponse.lpFee);

    const lpToken = AMM.lpToken;

    let tokenInSupply = new BigNumber(0);
    let tokenOutSupply = new BigNumber(0);
    if (tokenOut.symbol === AMM.token2.symbol) {
      tokenOutSupply = token2Pool;
      tokenInSupply = token1Pool;
    } else if (tokenOut.symbol === AMM.token1.symbol) {
      tokenOutSupply = token1Pool;
      tokenInSupply = token2Pool;
    }

    tokenInSupply = tokenInSupply.dividedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    lpTokenSupply = lpTokenSupply.dividedBy(new BigNumber(10).pow(lpToken.decimals));
    const exchangeFee = new BigNumber(1).dividedBy(lpFee);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpTokenSupply,
      lpToken,
    };
  } catch (error) {
    logger.error("Plenty: Volatileswap data error", error);
    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply: new BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: new BigNumber(0),
      exchangeFee: new BigNumber(0),
      lpTokenSupply: new BigNumber(0),
      lpToken: undefined,
    };
  }
};

export const loadSwapDataTezCtez = async (
  tezos: Tezosish,
  dex: IPoolData,
  ctez: ContractAbstraction<any>,
  tokenIn: string,
  tokenOut: string
): Promise<ISwapDataResponse> => {
  try {
    const AMM = dex.config;
    const storageResponse = await tezos.getContractStorage(AMM.address);

    let tezSupply: BigNumber = new BigNumber(storageResponse.tezPool);
    let ctezSupply: BigNumber = new BigNumber(storageResponse.ctezPool);
    let lpTokenSupply: BigNumber = new BigNumber(storageResponse.lqtTotal);
    const exchangeFee = new BigNumber(storageResponse.lpFee);
    const lpToken = AMM.lpToken;
    const ctezStorage = await ctez.storage() as any;
    const target = new BigNumber(ctezStorage.target);

    tezSupply = tezSupply.dividedBy(new BigNumber(10).pow(6));
    ctezSupply = ctezSupply.dividedBy(new BigNumber(10).pow(6));
    lpTokenSupply = lpTokenSupply.dividedBy(new BigNumber(10).pow(6));

    let tokenInSupply = new BigNumber(0);
    let tokenOutSupply = new BigNumber(0);
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
      lpTokenSupply,
      lpToken,
      target,
    };
  } catch (error) {
    logger.error('Plenty: Tez-Ctez swap data error - ', error);
    return {
      success: false,
      tokenInSupply: new BigNumber(0),
      tokenOutSupply: new BigNumber(0),
      tokenIn,
      tokenOut,
      exchangeFee: new BigNumber(0),
      lpTokenSupply: new BigNumber(0),
      lpToken: undefined,
      target: new BigNumber(0),
    };
  }
};

export const loadSwapDataGeneralStable = async (
  tezos: Tezosish,
  dex: IPoolData,
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): Promise<ISwapDataResponse> => {
  try {
    const AMM = dex.config;
    const storageResponse = await tezos.getContractStorage(AMM.address);

    const token1Pool = new BigNumber(storageResponse.token1Pool);
    const token2Pool = new BigNumber(storageResponse.token2Pool);
    const token1Precision = new BigNumber(AMM.token1Precision as string);
    const token2Precision = new BigNumber(AMM.token2Precision as string);

    let tokenInSupply = new BigNumber(0);
    let tokenOutSupply = new BigNumber(0);
    let tokenInPrecision = new BigNumber(0);
    let tokenOutPrecision = new BigNumber(0);
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
    const exchangeFee = new BigNumber(storageResponse.lpFee);
    let lpTokenSupply = new BigNumber(storageResponse.lqtTotal);
    const lpToken = AMM.lpToken;

    tokenInSupply = tokenInSupply.dividedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    lpTokenSupply = lpTokenSupply.dividedBy(new BigNumber(10).pow(lpToken.decimals));

    return {
      success: true,
      tokenIn: tokenIn.symbol,
      tokenInSupply,
      tokenOut: tokenOut.symbol,
      tokenOutSupply,
      exchangeFee,
      lpTokenSupply,
      lpToken,
      tokenInPrecision,
      tokenOutPrecision,
    };
  } catch (error) {
    logger.error('Plenty: load swap data general error - ', error);
    return {
      success: false,
      tokenIn: tokenIn.symbol,
      tokenInSupply: new BigNumber(0),
      tokenOut: tokenOut.symbol,
      tokenOutSupply: new BigNumber(0),
      exchangeFee: new BigNumber(0),
      lpTokenSupply: new BigNumber(0),
      lpToken: undefined,
      tokenInPrecision: new BigNumber(0),
      tokenOutPrecision: new BigNumber(0),
    };
  }
};
