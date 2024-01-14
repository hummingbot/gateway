import { SDK } from "@nftperp/sdk";
import { NftPerpConfig } from "./nftperp.config";
import { NftPerpish } from "../../services/common-interfaces";
import { Wallet } from "ethers";
import { Amm, PositionResponse, Side, TriggerType } from "@nftperp/sdk/types";
import { Ethereum } from "../../chains/ethereum/ethereum";

export class NftPerp implements NftPerpish {
    private static _instances: { [name: string]: NftPerp };
    private _chain: Ethereum;
    private _ready: boolean = false;
    private _sdk: SDK;
    private _ttl: number;

    private constructor(chain: string, network: string) {
        if (chain === "ethereum") {
            this._chain = Ethereum.getInstance(network);
        } else throw Error("Chain not supported");
        const config = NftPerpConfig.config;
        this._sdk = new SDK();
        this._ttl = config.ttl;
        this._ready = true;
    }

    public static getInstance(chain: string, network: string): NftPerp {
        if (NftPerp._instances === undefined) {
            NftPerp._instances = {};
        }
        if (!(chain + network in NftPerp._instances)) {
            NftPerp._instances[chain + network] = new NftPerp(chain, network);
        }

        return NftPerp._instances[chain + network];
    }

    public get ttl(): number {
        return this._ttl;
    }

    public ready(): boolean {
        return this._ready;
    }

    public async init(): Promise<void> {
        // TODO: Add methods for an initial setup.
        this._ready = true;
    }

    public getSupportedAmms(): string[] {
        return this._sdk.getSupportedAmms();
    }

    public async getPosition(amm: Amm): Promise<PositionResponse> {
        return await this._sdk.getPosition(amm);
    }

    public async getMarkPrice(amm: Amm): Promise<string> {
        return await this._sdk.getMarkPrice(amm);
    }

    public async getIndexPrice(amm: Amm): Promise<string> {
        return await this._sdk.getIndexPrice(amm);
    }

    public async getFundingRate(amm: Amm): Promise<string> {
        return await this._sdk.getFundingRate(amm);
    }

    public async openMarketOrder(wallet: Wallet, amm: Amm, side: Side, margin: number, leverage: number, slippagePercent?: number): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.createMarketOrder({ amm, side, margin, leverage, slippagePercent });
        return tx.hash;
    }

    public async openLimitOrder(wallet: Wallet, amm: Amm, side: Side, price: number, margin: number, leverage: number, reduceOnly?: boolean): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.createLimitOrder({ amm, side, price, margin, leverage, reduceOnly });
        return tx.hash;
    }

    public async updateLimitOrder(wallet: Wallet, id: number, amm: Amm, side: Side, price: number, margin: number, leverage: number, reduceOnly?: boolean): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.updateLimitOrder(id, { amm, side, price, margin, leverage, reduceOnly });
        return tx.hash;
    }

    public async deleteLimitOrder(wallet: Wallet, id: number): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.deleteLimitOrder(id);
        return tx.hash;
    }

    public async openLimitOrderBatch(wallet: Wallet, params: { amm: Amm, side: Side, price: number, margin: number, leverage: number, reduceOnly?: boolean }[]): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.createLimitOrderBatch(params);
        return tx.hash;
    }

    public async updateLimitOrderBatch(wallet: Wallet, ids: number[], params: { amm: Amm, side: Side, price: number, margin: number, leverage: number, reduceOnly?: boolean }[]): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.updateLimitOrderBatch(ids, params);
        return tx.hash;
    }

    public async deleteLimitOrderBatch(wallet: Wallet, ids: number[]): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.deleteLimitOrderBatch(ids);
        return tx.hash;
    }

    public async openTriggerOrder(wallet: Wallet, amm: Amm, price: number, size: number, type: TriggerType): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.createTriggerOrder({ amm, price, size, type });
        return tx.hash;
    }

    public async deleteTriggerOrder(wallet: Wallet, id: number): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const tx = await sdk.deleteTriggerOrder(id);
        return tx.hash;
    }

    public async closePosition(wallet: Wallet, amm: Amm, closePercent?: number, slippagePercent?: number): Promise<string> {
        const sdk = new SDK({ rpcUrl: this._chain.rpcUrl, privateKey: wallet.privateKey });
        const closePositionTx = await sdk.closePosition({ amm, closePercent, slippagePercent });
        return closePositionTx.hash;

    }

}
