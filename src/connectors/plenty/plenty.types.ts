import BigNumber from "bignumber.js";
import { OperationContentsAndResult } from "@taquito/rpc";

export interface PlentyTrade {
    executionPrice: BigNumber;
    routeParams: IRouterResponse;
    amountIn: BigNumber;
};

export interface CurrencyAmount extends BigNumber { };

export interface ExpectedTrade {
    trade: PlentyTrade;
    expectedAmount: CurrencyAmount;
}

export interface ExecutedTrade {
    hash: string;
    operations: OperationContentsAndResult[];
}

export enum PoolType {
    VOLATILE = "VOLATILE",
    STABLE = "STABLE",
    TEZ = "TEZ",
}

export interface ICalculateTokenResponse {
    tokenOutAmount: BigNumber;
    fees: BigNumber;
    feePerc: BigNumber;
    minimumOut: BigNumber;
    exchangeRate: BigNumber;
    priceImpact: BigNumber;
    error?: any;
}

export enum TokenStandard {
    FA12 = "FA1.2",
    FA2 = "FA2",
    TEZ = "TEZ",
}

export enum Chain {
    ETHEREUM = "ETHEREUM",
    BSC = "BSC",
    POLYGON = "POLYGON",
    TEZOS = "TEZOS",
}

export interface IConfigToken {
    name: string;
    symbol: string;
    decimals: number;
    standard: TokenStandard;
    address?: string;
    tokenId?: number;
    thumbnailUri?: string;
    originChain: Chain;
    pairs: string[];
    iconUrl?: string;
}

export interface IConfigTokens {
    [tokenSymbol: string]: IConfigToken;
}

export interface ISwapDataResponse {
    success: boolean;
    tokenIn: string;
    tokenOut: string;
    exchangeFee: BigNumber;
    lpTokenSupply: BigNumber;
    lpToken: IConfigLPToken | undefined;
    tokenInPrecision?: BigNumber;
    tokenOutPrecision?: BigNumber;
    tokenInSupply: BigNumber;
    tokenOutSupply: BigNumber;
    target?: BigNumber;
}

export interface IConfigLPToken {
    address: string;
    decimals: number;
}

export interface IConfigPool {
    address: string;
    token1: IConfigToken;
    token2: IConfigToken;
    lpToken: IConfigLPToken;
    type: PoolType;
    token1Precision?: string;
    token2Precision?: string;
    gauge?: string;
    bribe?: string;
    fees?: number;
}

export interface IRouterResponse {
    path: string[];
    tokenOutAmount: BigNumber;
    userFinalTokenOut?: BigNumber;
    finalMinimumTokenOut: BigNumber;
    minimumTokenOut: BigNumber[];
    finalPriceImpact: BigNumber;
    finalFeePerc: BigNumber;
    feePerc: BigNumber[];
    isStable: boolean[];
    exchangeRate: BigNumber;
}

export interface IBestPathResponse {
    path: string[];
    bestPathSwapData: ISwapDataResponse[];
    tokenOutAmount: BigNumber;
    minimumTokenOut: BigNumber[];
    fees: BigNumber[];
    feePerc: BigNumber[];
    priceImpact: BigNumber[];
}

export interface IPoolData {
    config: IConfigPool;
    contract: any
}