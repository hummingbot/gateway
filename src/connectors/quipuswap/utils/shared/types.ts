import BigNumber from 'bignumber.js';
import { Trade } from 'swap-router-sdk';

export declare enum NetworkType {
    MAINNET = "mainnet",
    GHOSTNET = "ghostnet",
    MONDAYNET = "mondaynet",
    DAILYNET = "dailynet",
    DELPHINET = "delphinet",
    EDONET = "edonet",
    FLORENCENET = "florencenet",
    GRANADANET = "granadanet",
    HANGZHOUNET = "hangzhounet",
    ITHACANET = "ithacanet",
    JAKARTANET = "jakartanet",
    KATHMANDUNET = "kathmandunet",
    LIMANET = "limanet",
    MUMBAINET = "mumbainet",
    NAIROBINET = "nairobinet",
    OXFORDNET = "oxfordnet",
    CUSTOM = "custom"
}

export type Optional<T> = T | null | undefined;
export type Undefined<T> = T | undefined;
export type Nullable<T> = T | null;

export interface RawToken extends Omit<Token, 'type' | 'isWhitelisted'> {
    type: string;
    isWhitelisted?: boolean;
}

export type TokenId = Pick<Token, 'contractAddress' | 'fa2TokenId' | 'type'>;

export interface TokenAddress {
    contractAddress: string;
    fa2TokenId?: number;
}

export enum Standard {
    Null = 'Null',
    Fa12 = 'FA12',
    Fa2 = 'FA2'
}

export interface TokenMetadata {
    decimals: number;
    symbol: string;
    name: string;
    thumbnailUri: string;
    categories?: Array<string>;
}

export interface Token extends TokenAddress {
    type: Standard;
    isWhitelisted: Nullable<boolean>;
    metadata: TokenMetadata;
}

export type TokensMap = Map<string, Nullable<Token>>;

export type SupportedNetwork = NetworkType.MAINNET | NetworkType.GHOSTNET;

export enum ConnectType {
    DEFAULT = 'DEFAULT',
    CUSTOM = 'CUSTOM'
}

export enum QSNetworkType {
    MAIN = 'MAIN',
    TEST = 'TEST'
}

export interface QSNetwork {
    id: SupportedNetwork;
    connectType: ConnectType;
    name: string;
    type: QSNetworkType;
    disabled: boolean;
}

export interface TokenWithQSNetworkType extends Token {
    network?: SupportedNetwork;
}

export enum SwapField {
    INPUT_AMOUNT = 'inputAmount',
    OUTPUT_AMOUNT = 'outputAmount',
    INPUT_TOKEN = 'inputToken',
    OUTPUT_TOKEN = 'outputToken',
    RECIPIENT = 'recipient',
}

export interface SwapFormValues {
    [SwapField.INPUT_TOKEN]: Token;
    [SwapField.OUTPUT_TOKEN]: Token;
    [SwapField.INPUT_AMOUNT]: BigNumber;
    [SwapField.OUTPUT_AMOUNT]: BigNumber;
    [SwapField.RECIPIENT]: string;
}

export interface SwapPair {
    inputToken: Token;
    outputToken: Token;
}

export type TradeInfo = {
    trade: Trade,
    inputToken: Token,
    inputAmount: BigNumber,
    outputToken: Token,
    outputAmount: BigNumber,
    price: BigNumber,
};