import BigNumber from "bignumber.js";
import { NetworkType, Nullable, Optional, QSNetwork, Standard, SupportedNetwork, Token, TokenAddress, TokenId, TokenWithQSNetworkType, Undefined } from "./types";
import { TEZOS_TOKEN, networksQuipuTokens } from "../config/tokens";
import { getSavedTokensApi } from "./local.storage";
import { mapBackendToken } from "./backend.token.map";
import { InvalidTokensListError } from "./errors";
import { networkTokens } from "../config/config";

export const isMainnet = (network: SupportedNetwork) => network === NetworkType.MAINNET;

export const isNull = <T>(value: Nullable<T>): value is null => value === null;
export const isUndefined = <T>(value: Undefined<T>): value is undefined => value === undefined;
export const isExist = <T>(value: Optional<T>): value is T => !isNull(value) && !isUndefined(value);

const SEPARATOR = '_';
const FALLBACK_DECIMALS = 0;

export const getUniqArray = <T>(list: T[], getKey: (el: T) => string): T[] => {
    const map: Record<string, boolean> = {};

    return list.filter(el => {
        const key = getKey(el);
        if (!(key in map)) {
            map[key] = true;

            return true;
        }

        return false;
    });
};

export const getTokenIdFromSlug = (slug: string): TokenId => {
    const [contractAddress, fa2TokenId] = slug.split('_');

    return {
        contractAddress,
        fa2TokenId: fa2TokenId ? +fa2TokenId : undefined,
        type: fa2TokenId === undefined ? Standard.Fa12 : Standard.Fa2
    };
};

export const getTokenSlug = (token: TokenAddress) =>
    isExist(token.fa2TokenId) ? `${token.contractAddress}${SEPARATOR}${token.fa2TokenId}` : token.contractAddress;

export const isTezosToken = (token: TokenAddress) =>
    getTokenSlug(token).toLocaleLowerCase() === getTokenSlug(TEZOS_TOKEN).toLocaleLowerCase();

export const toReal = (atomic: BigNumber, decimalsOrToken: Optional<number | Token>) =>
    atomic.shiftedBy(
        -(typeof decimalsOrToken === 'number' ? decimalsOrToken : decimalsOrToken?.metadata.decimals ?? FALLBACK_DECIMALS)
    );

export const toAtomic = (real: BigNumber, decimalsOrToken: Optional<number | Token>): BigNumber =>
    real.shiftedBy(
        typeof decimalsOrToken === 'number' ? decimalsOrToken : decimalsOrToken?.metadata.decimals ?? FALLBACK_DECIMALS
    );


export const getFallbackTokens = (network: QSNetwork, addTokensFromLocalStorage?: boolean) => {
    let tokens: Array<TokenWithQSNetworkType> = [
        {
            ...TEZOS_TOKEN,
            network: network.id
        },
        networksQuipuTokens[network.id]
    ];

    if (addTokensFromLocalStorage) {
        tokens = tokens.concat(getSavedTokensApi(network.id));
    }

    return getUniqArray(tokens, getTokenSlug);
};

export const isTokenEqual = (a: TokenAddress, b: TokenAddress) =>
    a.contractAddress === b.contractAddress && a.fa2TokenId === b.fa2TokenId;

export const getTokens = (network: QSNetwork, addTokensFromLocalStorage?: boolean) => {
    let tokens = getFallbackTokens(network, addTokensFromLocalStorage);

    const _networkTokens = networkTokens(network.id);
    const arr: Token[] = _networkTokens?.tokens?.length ? _networkTokens.tokens.map(token => mapBackendToken(token)) : [];

    if (arr.length) {
        const Tokens: Token[] = arr.map(token => ({
            ...token,
            isWhitelisted: true
        }));

        tokens = tokens.filter(fallbackToken => !Tokens.some(token => isTokenEqual(fallbackToken, token))).concat(Tokens);
    } else {
        throw new InvalidTokensListError(networkTokens);
    }

    return getUniqArray(tokens, getTokenSlug);
};

export const mockTezosNow = () => {
    return Math.floor(Date.now() / 1000);
};

export const dateToSeconds = (date: Date) => {
    return Math.floor(date.getTime() / 1000);
};