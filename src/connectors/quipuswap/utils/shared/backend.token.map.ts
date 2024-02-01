import { RawToken, Standard, Token } from './types';

export const mapBackendToken = (raw: RawToken, newSymbol?: string): Token => ({
    ...raw,
    fa2TokenId: raw.fa2TokenId === undefined ? undefined : Number(raw.fa2TokenId),
    type: raw.type as Standard,
    metadata: {
        ...raw.metadata,
        decimals: raw.metadata.decimals,
        symbol: newSymbol ?? raw.metadata.symbol
    }
});