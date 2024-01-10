import { TradeOperation } from "swap-router-sdk";
import { TokensMap } from "./shared/types";
import { swapRouterSdkTokenSlugToQuipuTokenSlug } from "./swap.router.sdk.adapters";
import { isExist } from "./shared/helpers";


const SECOND_TUPLE_INDEX = 1;
const SINGLE_TOKEN_VALUE = 1;


export const extractTokensPools = (operation: TradeOperation, knownTokens: TokensMap) => {
    const {
        aTokenSlug,
        bTokenSlug,
        cTokenSlug,
        dTokenSlug,
        aTokenPool,
        bTokenPool,
        cTokenPool,
        dTokenPool,
        aTokenStandard,
        bTokenStandard,
        cTokenStandard,
        dTokenStandard
    } = operation;

    const tokensAmounts = [aTokenPool, bTokenPool, cTokenPool, dTokenPool];
    const tokensStandards = [aTokenStandard, bTokenStandard, cTokenStandard, dTokenStandard];
    const tokensPools = [aTokenSlug, bTokenSlug, cTokenSlug, dTokenSlug]
        .map((tokenSlug, index) => {
            if (!tokenSlug) {
                return null;
            }

            const token = knownTokens.get(swapRouterSdkTokenSlugToQuipuTokenSlug(tokenSlug, tokensStandards[index]));

            if (!isExist(token)) {
                throw new Error(`No Token Metadata of ${tokenSlug}`);
            }

            return { token, pool: tokensAmounts[index]! };
        })
        .filter(isExist);
    const [tokenBPool] = tokensPools.splice(SECOND_TUPLE_INDEX, SINGLE_TOKEN_VALUE);
    tokensPools.push(tokenBPool);

    return tokensPools;
};
