import { BigNumber } from "bignumber.js";
import { RouteDirectionEnum, TradeOperation, getPairFeeRatio } from "swap-router-sdk";
import { calculateXToY, calculateYToX, ediv, makeSwapRequiredStorage, newton, performSwap, sumAllFees, util } from "./calculus";
import { SWAP_RATIO_DENOMINATOR, feeDenominator } from "./config/constants";
import { DexFeeOverflowError, assertNonNegative } from "./shared/errors";
import { Nat } from "quipuswap-v3-sdk/dist/types";


export const findFlatCfmmSwapOutput = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    let _pair$aTokenMultiplie, _pair$bTokenMultiplie;

    const feeRatio = getPairFeeRatio(pair);
    const aTokenMultiplier = (_pair$aTokenMultiplie = pair.aTokenMultiplier) != null ? _pair$aTokenMultiplie : new BigNumber(1);
    const bTokenMultiplier = (_pair$bTokenMultiplie = pair.bTokenMultiplier) != null ? _pair$bTokenMultiplie : new BigNumber(1);
    const x = pair.aTokenPool.multipliedBy(aTokenMultiplier);
    const y = pair.bTokenPool.multipliedBy(bTokenMultiplier);

    const _util2 = util(x, y), u = _util2[0];

    const p = {
        x: x,
        y: y,
        dx: aTokenAmount.multipliedBy(aTokenMultiplier),
        dy: new BigNumber(0),
        u: u,
        n: 5
    };
    return newton(p).multipliedBy(feeRatio).dividedToIntegerBy(bTokenMultiplier);
};


export const findQuipuCurveLikeSwapOutput = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    try {
        const tokensInfo = [{
            rate: pair.aTokenMultiplier,
            reserves: pair.aTokenPool
        }, {
            rate: pair.bTokenMultiplier,
            reserves: pair.bTokenPool
        }];

        if (pair.cTokenMultiplier) {
            tokensInfo.push({
                rate: pair.cTokenMultiplier,
                reserves: pair.cTokenPool!
            });
        }

        if (pair.dTokenMultiplier) {
            tokensInfo.push({
                rate: pair.dTokenMultiplier,
                reserves: pair.dTokenPool!
            });
        }

        const pool = {
            initialA: pair.initialA,
            initialATime: pair.initialATime,
            futureA: pair.futureA,
            futureATime: pair.futureATime,
            tokensInfo: tokensInfo,
            fee: pair.fees
        };
        const dy = performSwap(0, 1, aTokenAmount, pool);
        const fee = ediv(sumAllFees(pool.fee!).times(dy), feeDenominator);
        return assertNonNegative(dy.minus(fee), new DexFeeOverflowError(dy, fee));
    } catch (e) {
        console.error(e);
        return new BigNumber(0);
    }
};

export const findPlentyBridgeSwapOutput = (aTokenAmount: BigNumber) => {
    return aTokenAmount;
};

export const findSpicyWrapOutput = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    let _pair$aTokenMultiplie;

    const swapRatioNumerator = (_pair$aTokenMultiplie = pair.aTokenMultiplier) != null ? _pair$aTokenMultiplie : new BigNumber(0);
    const feeRatio = getPairFeeRatio(pair);

    if (pair.direction === RouteDirectionEnum.Direct) {
        const swapRatio = swapRatioNumerator.dividedBy(SWAP_RATIO_DENOMINATOR);
        return aTokenAmount.multipliedBy(swapRatio).dividedToIntegerBy(1);
    } else {
        const _swapRatio = SWAP_RATIO_DENOMINATOR.dividedBy(swapRatioNumerator).multipliedBy(feeRatio);

        return aTokenAmount.multipliedBy(_swapRatio).dividedToIntegerBy(1);
    }
};

export const findQuipuSwapV3Output = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    try {
        const direction = pair.direction;
        const calculationFunction = direction === RouteDirectionEnum.Direct ? calculateXToY : calculateYToX;

        const _calculationFunction = calculationFunction(makeSwapRequiredStorage(pair), new Nat(aTokenAmount.integerValue(Nat.ROUND_DOWN))),
            output = _calculationFunction.output;

        return output;
    } catch (e) {
        return new Nat(-1);
    }
};

export const findAmmSwapOutput = (aTokenAmount: BigNumber, pair: TradeOperation) => {
    const feeRatio = getPairFeeRatio(pair);
    const aTokenAmountWithFee = aTokenAmount.times(feeRatio);
    const numerator = aTokenAmountWithFee.times(pair.bTokenPool);
    const denominator = pair.aTokenPool.plus(aTokenAmountWithFee);
    return numerator.idiv(denominator);
};

export const findAmmSwapInput = (bTokenAmount: BigNumber, pair: TradeOperation) => {
    const feeRatio = getPairFeeRatio(pair);
    const numerator = pair.aTokenPool.times(bTokenAmount);
    const denominator = pair.bTokenPool.minus(bTokenAmount).times(feeRatio);
    const input = numerator.idiv(denominator).plus(1);
    return input.isGreaterThan(0) ? input : new BigNumber(Infinity);
};