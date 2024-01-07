import { SDK } from "@nftperp/sdk";
import { Arbitrum } from "../../chains/arbitrum/arbitrum";
import { NftPerpConfig } from "./nftperp.config";
import { NftPerpish } from "../../services/common-interfaces";
import { Wallet, Transaction } from "ethers";
import { Amm, PositionResponse, Side, TriggerType } from "@nftperp/sdk/types";

export class NftPerp implements NftPerpish {
    private static _instances: { [name: string]: NftPerp };
    private _chain: Arbitrum;
    private _config: typeof NftPerpConfig.config;
    private _ready: boolean = false;
    private _sdk: SDK;
    public ttl: any;

    private constructor(chain: string, network: string) {
        if (chain === "arbitrum") {
            this._chain = Arbitrum.getInstance(network);
        } else throw Error("Chain not supported");
        this._config = NftPerpConfig.config;
    }

    public async init(privateKey: string) {

        const provider = this._chain.provider;
        const wallet = new Wallet(privateKey, provider);
        this._sdk = new SDK({ wallet });

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

    public ready(): boolean {
        return this._ready;
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

    public async openMarketOrder(amm: Amm, side: Side, margin: number, leverage: number, slippagePercent?: number): Promise<Transaction> {
        const marketOrderTx = await this._sdk.createMarketOrder({ amm, side, margin, leverage, slippagePercent });

        // MUST convert ContractTransactionResponse to Transaction instance
        return marketOrderTx;
    }

    public async openLimitOrder(amm: Amm, side: Side, price: number, margin: number, leverage: number, reduceOnly?: boolean): Promise<Transaction> {
        const limitOrderTx = await this._sdk.createLimitOrder({ amm, side, price, margin, leverage, reduceOnly });

        // MUST convert ContractTransactionResponse to Transaction instance
        return limitOrderTx;
    }

    public async openTriggerOrder(amm: Amm, price: number, size: number, type: TriggerType): Promise<Transaction> {
        const triggerOrderTx = await this._sdk.createTriggerOrder({ amm, price, size, type });

        // MUST convert ContractTransactionResponse to Transaction instance
        return triggerOrderTx;
    }

    public async closePosition(amm: Amm, closePercent?: number, slippagePercent?: number): Promise<Transaction> {
        const closePositionTx = await this._sdk.closePosition({ amm, closePercent });

        // MUST convert ContractTransactionResponse to Transaction instance
        return closePositionTx;

    }

}
