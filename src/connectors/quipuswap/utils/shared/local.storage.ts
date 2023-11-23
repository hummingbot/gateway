import { SAVED_TOKENS_KEY } from "../config/constants";
import { Nullable, SupportedNetwork, TokenWithQSNetworkType } from "./types";

const localStorage = new Map<string, any>();

interface RawTokenWithQSNetworkType extends Omit<TokenWithQSNetworkType, 'fa2TokenId' | 'isWhitelisted'> {
    fa2TokenId?: string;
    isWhitelisted?: Nullable<boolean>;
}

export const getSavedTokensApi = (networkId?: SupportedNetwork) => {
    const allRawTokens: Array<RawTokenWithQSNetworkType> = JSON.parse(
        localStorage.get(SAVED_TOKENS_KEY) || '[]'
    );

    const allTokens: TokenWithQSNetworkType[] = allRawTokens.map(({ fa2TokenId, ...restProps }) => ({
        ...restProps,
        fa2TokenId: fa2TokenId === undefined ? undefined : Number(fa2TokenId),
        isWhitelisted: null
    }));

    return networkId
        ? allTokens.filter(({ network: tokenNetwork }) => !tokenNetwork || tokenNetwork === networkId)
        : allTokens;
};