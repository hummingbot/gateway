import axios from 'axios';

// types found in the responses

export interface Account {
    address: string;
    alias?: string;
}

export interface Metadata {
    name: string;
    symbol: string;
    decimals: string;
}

export interface Token {
    id: number; // internal to tzkt
    contract: Account;
    tokenId: string; // FA1.2 = 0, FA2 is 0 or greater
    standard: string;
    metadata: Metadata;
}

// response types

export interface AccountStatusResponse {
    balance: number;
    counter: number;
}

export interface TokenResponse {
    id: number;
    account: Account;
    token: Token;
    balance: string;
}

export interface TransactionResponse {
    id: number;
    level: number;
    timestamp: string;
    block: string;
    hash: string;
    counter: number;
    sender: Account;
    gasLimit: number;
    gasUsed: number;
    storageLimit: number;
    storageUsed: number;
    bakerFee: number;
    storageFee: number;
    allocationFee: number;
    target: Account;
    amount: number;
    parameter: any;
    storage: any;
    status: string;
    hasInternals: boolean;
}

export interface BlockHeadResponse {
    chain?: string;
    chainId?: string;
    level: number;
}

export class TzktApiClient {
    private _tzktURL: string;

    constructor(tzktURL: string) {
        this._tzktURL = tzktURL;
    }

    public get tzktURL(): string {
        return this._tzktURL;
    }

    async getAccountStatus(address: string): Promise<AccountStatusResponse> {
        const res = await axios.get(`${this._tzktURL}/v1/accounts/${address}`);
        return res.data;
    }

    async getTokens(
        walletAddress: string,
        contractAddress: string,
        tokenId: number
    ): Promise<Array<TokenResponse>> {
        const res = await axios.get(
            `${this._tzktURL}/v1/tokens/balances?account=${walletAddress}&token.contract=${contractAddress}&token.tokenId=${tokenId}&select=id,account,token,balance`
        );
        return res.data;
    }

    async getTransaction(txHash: string): Promise<TransactionResponse[]> {
        const res = await axios.get(`${this._tzktURL}/v1/operations/transactions/${txHash}`);
        return res.data;
    }

    async getBlockHead(): Promise<BlockHeadResponse> {
        const res = await axios.get(`${this._tzktURL}/v1/head`);
        return res.data;
    }
}