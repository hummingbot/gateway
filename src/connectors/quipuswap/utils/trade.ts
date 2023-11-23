import BigNumber from "bignumber.js";
import { DexTypeEnum, Trade, TradeOperation } from "swap-router-sdk";
import { findAmmSwapOutput, findFlatCfmmSwapOutput, findPlentyBridgeSwapOutput, findQuipuCurveLikeSwapOutput, findQuipuSwapV3Output, findSpicyWrapOutput } from "./swap.outputs";


const findSwapOutput = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    switch (pair.dexType) {
        case DexTypeEnum.Youves:
        case DexTypeEnum.PlentyStableSwap:
        case DexTypeEnum.PlentyCtez:
            return findFlatCfmmSwapOutput(aTokenAmount, pair);

        case DexTypeEnum.QuipuSwapCurveLike:
            return findQuipuCurveLikeSwapOutput(aTokenAmount, pair);

        case DexTypeEnum.PlentyBridge:
            return findPlentyBridgeSwapOutput(aTokenAmount);

        case DexTypeEnum.SpicyWrap:
            return findSpicyWrapOutput(aTokenAmount, pair);

        case DexTypeEnum.QuipuSwapV3:
            return findQuipuSwapV3Output(aTokenAmount, pair);

        case DexTypeEnum.YupanaWtez:
            return aTokenAmount;

        default:
            return findAmmSwapOutput(aTokenAmount, pair);
    }
};

const getTradeOperationExactInput = (aTokenAmount: BigNumber, pair: TradeOperation, slippageToleranceRatio: number) => ({
    ...pair,
    aTokenAmount: aTokenAmount.integerValue(BigNumber.ROUND_DOWN),
    bTokenAmount: findSwapOutput(BigNumber(aTokenAmount).multipliedBy(slippageToleranceRatio), pair)
});

export const calculateTradeExactInput = (inputAssetAmount: BigNumber, routePairs: Trade, slippageTolerancePercent: number) => {
    if (slippageTolerancePercent === void 0) {
        slippageTolerancePercent = 0;
    }

    if (routePairs.length === 0) {
        return [];
    }

    const trade = [];
    const slippageToleranceRatio = (100 - slippageTolerancePercent) / 100;
    const tradeOperationSlippageToleranceRatio = Math.pow(slippageToleranceRatio, 1 / routePairs.length);
    let currentInput = inputAssetAmount;

    for (let i = 0; i < routePairs.length; i++) {
        const tradeOperation = getTradeOperationExactInput(currentInput, routePairs[i], tradeOperationSlippageToleranceRatio);

        if (tradeOperation.bTokenAmount.isNegative()) {
            return [];
        }

        trade.push(tradeOperation);
        currentInput = tradeOperation.bTokenAmount;
    }

    return trade;
};
