import {
    NetworkSelectionRequest,
} from '../services/common-interfaces';
import { Amm, Side, TriggerType } from "@nftperp/sdk/types";


export interface SupportedAmmResponse {
    amms: string[];
}

export interface NftPerpCommonRequest extends NetworkSelectionRequest {
    amm: Amm
}

export interface GetPositionRequest extends NftPerpCommonRequest {
    address: string;
}

export interface PositionResponse {
    amm: Amm;
    trader: string;
    size: string;
    side?: Side;
    notional?: string;
    margin?: string;
    leverage?: string;
    entryPrice?: string;
    markPrice?: string;
    liquidationPrice?: string;
    unrealizedPnl?: string;
    fundingPayment?: string;
    lastPremiumFraction?: string;
};

export interface PriceResponse {
    price: string;
}

export interface OpenMarketOrderRequest extends NetworkSelectionRequest {
    address: string,
    amm: Amm,
    side: Side,
    margin: number,
    leverage: number,
    slippagePercent?: number
}

export interface ExecuteTxResponse {
    txhash: string;
}

export interface LimitOrderRequestBase {
    amm: Amm,
    side: Side,
    price: number,
    margin: number,
    leverage: number,
    reduceOnly?: boolean
}
export interface OpenLimitOrderRequest extends LimitOrderRequestBase, NetworkSelectionRequest {
    address: string,
}

export interface OpenLimitOrderBatchRequest extends NetworkSelectionRequest {
    address: string,
    params: LimitOrderRequestBase[]
}

export interface UpdateLimitOrderRequest extends OpenLimitOrderRequest {
    id: number
}

export interface UpdateLimitOrderBatchRequest extends OpenLimitOrderBatchRequest {
    ids: number[],
}

export interface DeleteOrderRequest extends NetworkSelectionRequest {
    address: string,
    id: number
}

export interface DeleteOrdersRequest extends NetworkSelectionRequest {
    address: string,
    ids: number[]
}

export interface TriggerOrderRequestBase {
    amm: Amm,
    price: number,
    size: number,
    type: TriggerType
}

export interface OpenTriggerOrderRequest extends NetworkSelectionRequest, TriggerOrderRequestBase {
    address: string,
}

export interface ClosePositionRequest extends NetworkSelectionRequest {
    address: string,
    amm: Amm,
    closePercent?: number,
    slippagePercent?: number
}
