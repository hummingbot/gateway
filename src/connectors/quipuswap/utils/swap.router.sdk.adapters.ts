import BigNumber from "bignumber.js";
import {
    TokenStandardEnum,
    Trade,
    getAllowedRoutePairsCombinations as originalGetAllowedRoutePairsCombinations
} from "swap-router-sdk";
import { RoutePair } from "swap-router-sdk/dist/interface/route-pair.interface";
import { getTokenIdFromSlug, getTokenSlug, isExist, isTezosToken } from "./shared/helpers";
import { SwapPair, Token } from "./shared/types";
import { MAX_HOPS_COUNT } from "./config/constants";
import { calculateTradeExactInput } from "./trade";
import { WhitelistedPair } from "swap-router-sdk/dist/interface/whitelisted-pair.interface";

const FALLBACK_TOKEN_ID = 0;


export const swapRouterSdkTokenSlugToQuipuTokenSlug = (inputSlug: string, tokenStandard?: TokenStandardEnum) => {
    const { contractAddress, fa2TokenId } = getTokenIdFromSlug(inputSlug);

    if (isExist(fa2TokenId)) {
        return getTokenSlug({
            contractAddress,
            fa2TokenId: tokenStandard === TokenStandardEnum.FA2 ? fa2TokenId : undefined
        });
    }

    return inputSlug;
};


export const getSwapRouterSdkTokenSlug = (token: Token) =>
    getTokenSlug({
        ...token,
        fa2TokenId: isTezosToken(token) ? undefined : token.fa2TokenId ?? FALLBACK_TOKEN_ID
    });


export const getRoutePairsCombinations = (
    swapPair: SwapPair,
    routePairs: RoutePair[],
    whitelistedPairs: WhitelistedPair[]
) => {
    const { inputToken, outputToken } = swapPair;
    return originalGetAllowedRoutePairsCombinations(
        inputToken ? getSwapRouterSdkTokenSlug(inputToken) : undefined,
        outputToken ? getSwapRouterSdkTokenSlug(outputToken) : undefined,
        routePairs,
        whitelistedPairs,
        MAX_HOPS_COUNT
    );
};


export const getTradeWithSlippageTolerance = (
    inputAmount: BigNumber,
    bestTrade: Trade,
    tradingSlippage: BigNumber
) => {
    const originalValue = calculateTradeExactInput(
        inputAmount,
        bestTrade,
        tradingSlippage.toNumber()
    );

    return bestTrade && originalValue;
};