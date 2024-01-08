import { NetworkType, Standard, SupportedNetwork, Token } from "../shared/types";

export const TEZOS_TOKEN: Token = {
    type: Standard.Fa12,
    contractAddress: 'tez',
    metadata: {
        decimals: 6,
        name: 'Tezos',
        symbol: 'XTZ',
    }
};

export const MAINNET_QUIPU_TOKEN: Token = {
    type: Standard.Fa2,
    contractAddress: 'KT193D4vozYnhGJQVtw7CoxxqphqUEEwK6Vb',
    fa2TokenId: 0,
    metadata: {
        decimals: 6,
        symbol: 'QUIPU',
        name: 'Quipuswap Governance Token',
    }
};

const GHOSTNET_QUIPU_TOKEN: Token = {
    ...MAINNET_QUIPU_TOKEN,
    contractAddress: 'KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c'
};

export const networksQuipuTokens = {
    [NetworkType.MAINNET]: MAINNET_QUIPU_TOKEN,
    [NetworkType.GHOSTNET]: GHOSTNET_QUIPU_TOKEN
};

export const MAINNET_WTEZ_TOKEN: Token = {
    type: Standard.Fa2,
    contractAddress: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
    fa2TokenId: 0,
    metadata: {
        decimals: 6,
        symbol: 'wTEZ',
        name: 'Wrapped Tezos FA2 token',
    }
};

export const GHOSTNET_WTEZ_TOKEN: Token = {
    ...MAINNET_WTEZ_TOKEN,
    contractAddress: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK'
};

export const networksWtezTokens = {
    [NetworkType.MAINNET]: MAINNET_WTEZ_TOKEN,
    [NetworkType.GHOSTNET]: GHOSTNET_WTEZ_TOKEN
};

export const QUIPU_TOKEN = (network: SupportedNetwork) => networksQuipuTokens[network];

export const WTEZ_TOKEN = (network: SupportedNetwork) => networksWtezTokens[network];
