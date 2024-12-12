import {
    HttpException,
    PRICE_FAILED_ERROR_CODE,
    PRICE_FAILED_ERROR_MESSAGE,
    UNKNOWN_ERROR_ERROR_CODE,
    UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
import {
    EstimateGasResponse,
    PriceRequest,
    PriceResponse,
} from '../../amm/amm.requests';
import { Stonfi } from './ston_fi';
import { Ton } from '../../chains/ton/ton';


export const price = async (
    ton: Ton,
    stonfi: Stonfi,
    req: PriceRequest
): Promise<PriceResponse> => {
    const startTimestamp: number = Date.now();
    let trade;
    try {
        trade = await stonfi.estimateTrade(req);
    } catch (e) {
        if (e instanceof Error) {
            throw new HttpException(
                500,
                PRICE_FAILED_ERROR_MESSAGE + e.message,
                PRICE_FAILED_ERROR_CODE
            );
        } else {
            throw new HttpException(
                500,
                UNKNOWN_ERROR_MESSAGE,
                UNKNOWN_ERROR_ERROR_CODE
            );
        }
    }

    return {
        network: ton.network,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        base: req.base,
        quote: req.quote,
        amount: req.amount,
        rawAmount: req.amount,
        expectedAmount: String(trade.expectedAmount),
        price: String(trade.expectedPrice),
        gasPrice: ton.gasPrice,
        gasPriceToken: ton.nativeTokenSymbol,
        gasLimit: ton.gasLimit,
        gasCost: String(ton.gasCost),
    };
}



export async function estimateGas(
    ton: Ton,
    _stonfi: Stonfi
): Promise<EstimateGasResponse> {
    return {
        network: ton.network,
        timestamp: Date.now(),
        gasPrice: ton.gasPrice,
        gasPriceToken: ton.nativeTokenSymbol,
        gasLimit: ton.gasLimit,
        gasCost: String(ton.gasCost),
    };
}



