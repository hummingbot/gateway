import LRUCache from 'lru-cache';
import { percentRegexp } from '../../services/config-manager-v2';
import { Ton } from '../../chains/ton/ton';
import { StonfiConfig } from './ston_fi.config';
import { getTonConfig } from '../../chains/ton/ton.config';
import { TonAsset } from '../../chains/ton/ton.requests';
import { logger } from '../../services/logger';
import { PriceRequest } from '../../amm/amm.requests';
import {
    HttpException,
    TOKEN_NOT_SUPPORTED_ERROR_CODE,
    TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { pow } from 'mathjs';
import { StonApiClient } from '@ston-fi/api';
import { internal, SenderArguments, toNano, WalletContractV3R2 } from '@ton/ton';
import { DEX, pTON } from '@ston-fi/sdk';

export class Stonfi {
    private static _instances: LRUCache<string, Stonfi>;
    private chain: Ton;
    private _ready: boolean = false;
    private _config: StonfiConfig.NetworkConfig;
    private stonfi: StonApiClient;

    private constructor(network: string) {
        this._config = StonfiConfig.config;
        this.chain = Ton.getInstance(network);
        this.stonfi = new StonApiClient();
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
                    `Stonfi.getInstance received an unexpected network: ${network}.`,
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
        const baseToken: TonAsset | null = this.chain.getAssetForSymbol(req.base);
        const quoteToken: TonAsset | null = this.chain.getAssetForSymbol(req.quote);

        if (baseToken === null || quoteToken === null)
            throw new HttpException(
                500,
                TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
                TOKEN_NOT_SUPPORTED_ERROR_CODE,
            );

        const baseAsset = {
            id: baseToken.assetId,
            decimals: baseToken.decimals,
        } as any;

        const quoteAsset = {
            id: quoteToken.assetId,
            decimals: quoteToken.decimals,
        } as any;

        const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);

        const isBuy: boolean = req.side === 'BUY';

        const quote = await this.stonfi.simulateSwap({
            askAddress: isBuy === true ? quoteAsset.id.address : baseAsset.id.address,
            offerUnits: amount.toString(),
            offerAddress:
                isBuy === true ? baseAsset.id.address : quoteAsset.id.address,
            slippageTolerance: '0.01', // TODO add this value to the config!!!
        });

        const price = Number(quote.swapRate);

        logger.info(
            `Best quote for ${baseToken.symbol}-${quoteToken.symbol}: ` +
            `${price}` +
            `${baseToken.symbol}.`,
        );

        const expectedPrice = isBuy === true ? 1 / price : price;

        const expectedAmount =
            req.side === 'BUY'
                ? Number(req.amount)
                : expectedPrice * Number(req.amount);

        return { trade: quote, expectedAmount, expectedPrice };
    }

    /**
     * Given an account and a tinyman trade, try to execute it on blockchain.
     *
     * @param account Algorand account
     * @param quote Expected trade
     * @param isBuy Used to indicate buy or sell swap
     */

    async executeTrade(
        account: string,
        quote: StonfiConfig.StonfiQuoteRes,
        baseName: string,
        quoteName: string,
        isBuy: boolean,
    ): Promise<any> {
        const keyPair = await this.chain.getAccountFromAddress(account);
        const wallet = await this.chain.getWallet(keyPair.publicKey) as WalletContractV3R2;

        const contract = this.chain.tonClient.open(wallet);
        const dex = this.chain.tonClient.open(new DEX.v1.Router());


        let txParams: SenderArguments;

        if (baseName === "TON") {
            txParams = await dex.getSwapTonToJettonTxParams({
                userWalletAddress: wallet.address.toString(),
                proxyTon: new pTON.v1(),
                offerAmount: toNano("1"),
                askJettonAddress: quote.askAddress,
                minAskAmount: toNano('0.1'),
            });
        } else if (quoteName === "TON") {
            txParams = await dex.getSwapJettonToTonTxParams({
                userWalletAddress: wallet.address.toString(),
                proxyTon: new pTON.v1(),
                offerAmount: toNano("1"),
                offerJettonAddress: quote.offerAddress,
                minAskAmount: toNano('0.1'),
            });
        } else {
            txParams = await dex.getSwapJettonToJettonTxParams({
                userWalletAddress: wallet.address.toString(),
                offerJettonAddress: quote.offerAddress,
                askJettonAddress: quote.askAddress,
                offerAmount: toNano("1"),
                minAskAmount: toNano('0.1'),
            });
        }

        await contract.sendTransfer({
            seqno: await contract.getSeqno(),
            secretKey: Buffer.from(keyPair.secretKey, "utf-8"),
            messages: [internal(txParams)],
        });

        logger.info(`Swap transaction ${isBuy} Id: ${quote}`);

        return txParams;
    }
}
