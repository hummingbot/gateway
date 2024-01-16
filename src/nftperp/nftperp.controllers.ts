
import { getConnector, getInitializedChain } from "../services/connection-manager";
import { NftPerp } from "../connectors/nftperp/nftperp";
import { Chain as Ethereumish, NetworkSelectionRequest } from '../services/common-interfaces';
import {
    ExecuteTxResponse, NftPerpCommonRequest, PositionResponse, PriceResponse, OpenMarketOrderRequest, OpenLimitOrderRequest, UpdateLimitOrderRequest, DeleteOrderRequest,
    OpenLimitOrderBatchRequest,
    UpdateLimitOrderBatchRequest,
    DeleteOrdersRequest,
    ClosePositionRequest,
    OpenTriggerOrderRequest,
    GetPositionRequest
} from "./nftperp.requests";
import { logger } from '../services/logger';
import { Wallet } from "ethers";
import { HttpException, LOAD_WALLET_ERROR_CODE, LOAD_WALLET_ERROR_MESSAGE } from "../services/error-handler";


export async function supportedAmms(req: NetworkSelectionRequest): Promise<{ amms: string[] }> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );

    const amms = connector.getSupportedAmms();
    return { amms };
}

export async function position(req: GetPositionRequest): Promise<PositionResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const positionInfo = await connector.getPosition(wallet, req.amm);
    return positionInfo;
}

export async function markPrice(req: NftPerpCommonRequest): Promise<PriceResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );

    const markPrice = await connector.getMarkPrice(req.amm);
    return { price: markPrice }
}

export async function indexPrice(req: NftPerpCommonRequest): Promise<PriceResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );

    const indexPrice = await connector.getIndexPrice(req.amm);
    return { price: indexPrice }
}

export async function fundingRate(req: NftPerpCommonRequest): Promise<PriceResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );

    const fundingRate = await connector.getFundingRate(req.amm);
    return { price: fundingRate }
}

export async function openMarketOrder(req: OpenMarketOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.openMarketOrder(wallet, req.amm, req.side, req.margin, req.leverage, req.slippagePercent);

    return { txhash }
}

export async function openLimitOrder(req: OpenLimitOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.openLimitOrder(wallet, req.amm, req.side, req.price, req.margin, req.leverage, req.reduceOnly);

    return { txhash }
}

export async function updateLimitOrder(req: UpdateLimitOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.updateLimitOrder(wallet, req.id, req.amm, req.side, req.price, req.margin, req.leverage, req.reduceOnly);

    return { txhash }
}

export async function deleteLimitOrder(req: DeleteOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.deleteLimitOrder(wallet, req.id);

    return { txhash }
}

export async function openLimitOrderBatch(req: OpenLimitOrderBatchRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.openLimitOrderBatch(wallet, req.params);

    return { txhash }
}

export async function updateLimitOrderBatch(req: UpdateLimitOrderBatchRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.updateLimitOrderBatch(wallet, req.ids, req.params);

    return { txhash }
}

export async function deleteLimitOrderBatch(req: DeleteOrdersRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.deleteLimitOrderBatch(wallet, req.ids);

    return { txhash }
}

export async function openTriggerOrder(req: OpenTriggerOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.openTriggerOrder(wallet, req.amm, req.price, req.size, req.type);

    return { txhash }
}

export async function deleteTriggerOrder(req: DeleteOrderRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.deleteTriggerOrder(wallet, req.id);

    return { txhash }
}

export async function closePosition(req: ClosePositionRequest): Promise<ExecuteTxResponse> {
    const connector: NftPerp = await getConnector<NftPerp>(
        req.chain,
        req.network,
        req.connector
    );
    const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
    let wallet: Wallet;
    try {
        wallet = await chain.getWallet(req.address);
    } catch (err) {
        logger.error(`Wallet ${req.address} not available.`);
        throw new HttpException(
            500,
            LOAD_WALLET_ERROR_MESSAGE + err,
            LOAD_WALLET_ERROR_CODE
        );
    }

    const txhash = await connector.closePosition(wallet, req.amm, req.closePercent, req.slippagePercent);

    return { txhash }
}