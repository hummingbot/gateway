import LRUCache from "lru-cache";
import { percentRegexp } from "../../services/config-manager-v2";
import { Ton } from "../../chains/ton/ton";
import { StonfiConfig } from "./ston_fi.config";
import { getTonConfig } from "../../chains/ton/ton.config";
import { TonAsset } from "../../chains/ton/ton.requests";
import { logger } from "../../services/logger";
import { PriceRequest } from "../../amm/amm.requests";
import { HttpException, TOKEN_NOT_SUPPORTED_ERROR_CODE, TOKEN_NOT_SUPPORTED_ERROR_MESSAGE } from "../../services/error-handler";
import { pow } from "mathjs";
import { StonApiClient } from "@ston-fi/api";


// RUM: npm run dev GATEWAY_PASSPHRASE=asdf

export class Stonfi {

    private static _instances: LRUCache<string, Stonfi>;
    private chain: Ton;
    private _ready: boolean = false;
    private _config: StonfiConfig.NetworkConfig;
    //private _swap;

    // public get swap() {
    //     return this._swap;
    // }

    private constructor(network: string) {
        this._config = StonfiConfig.config;
        this.chain = Ton.getInstance(network);
        //this._swap = Swap;
    }

    public static getInstance(network: string): Stonfi {
        const config = getTonConfig(network);
        if (Stonfi._instances === undefined) {
            Stonfi._instances = new LRUCache<string, Stonfi>({
                max: config.network.maxLRUCacheInstances,
            });
        }

        if (!Stonfi._instances.has(network)) {
            if (network !== null) {
                Stonfi._instances.set(network, new Stonfi(network));
            } else {
                throw new Error(
                    `Stonfi.getInstance received an unexpected network: ${network}.`
                );
            }
        }

        return Stonfi._instances.get(network) as Stonfi;
    }

    public async init() {
        if (!this.chain.ready()) {
            await this.chain.init();
        }
        this._ready = true;
    }

    public ready(): boolean {
        return this._ready;
    }

    /**
     * Gets the allowed slippage percent from configuration.
     */
    getSlippage(): number {
        const allowedSlippage = this._config.allowedSlippage;
        const nd = allowedSlippage.match(percentRegexp);
        let slippage = 0.0;
        if (nd) slippage = Number(nd[1]) / Number(nd[2]);
        return slippage;
    }

    /**
     * This is typically used for calculating token prices.
     *
     * @param req Price request object
     */

    async estimateTrade(req: PriceRequest) {
        const baseToken: TonAsset | null = this.chain.getAssetForSymbol(
            req.base
        );
        const quoteToken: TonAsset | null = this.chain.getAssetForSymbol(
            req.quote
        );

        if (baseToken === null || quoteToken === null)
            throw new HttpException(
                500,
                TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
                TOKEN_NOT_SUPPORTED_ERROR_CODE
            );

        const baseAsset = { id: baseToken.assetId, decimals: baseToken.decimals };

        const quoteAsset = {
            id: quoteToken.assetId,
            decimals: quoteToken.decimals,
        };

        const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);

        const isBuy: boolean = req.side === 'BUY';

        const client = new StonApiClient();

        const quote = await client.simulateSwap({
            askAddress: isBuy === true ? quoteAsset.id : baseAsset.id,
            offerUnits: amount.toString(),
            offerAddress: isBuy === true ? baseAsset.id : quoteAsset.id,
            slippageTolerance: "0.001"
        });

        const price = Number(quote.swapRate);

        logger.info(
            `Best quote for ${baseToken.symbol}-${quoteToken.symbol}: ` +
            `${price}` +
            `${baseToken.symbol}.`
        );
        const expectedPrice = isBuy === true ? 1 / price : price;
        const expectedAmount =
            req.side === 'BUY'
                ? Number(req.amount)
                : expectedPrice * Number(req.amount);

        return { trade: quote, expectedAmount, expectedPrice };
    }
}


// return: expectedAmount, expectedPrice