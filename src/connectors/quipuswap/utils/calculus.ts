
import { BigNumber } from "bignumber.js";
import { DexFees } from "swap-router-sdk/dist/interface/dex-fees.interface";
import { aPrecision, calculateYCache, getDCache, precision } from "./config/constants";
import assert from "assert";
import { DexTimestampError, DexWrongIndexError, DexWrongPrecisionError, TooBigPriceChangeErr, assertNonNegative } from "./shared/errors";
import { dateToSeconds, mockTezosNow } from "./shared/helpers";
import { TradeOperation } from "swap-router-sdk";
import { sqrtPriceForTick, calcSwapFee, calcNewPriceX, shiftRight, shiftLeft, calcNewPriceY } from 'quipuswap-v3-sdk/dist/helpers/math'
import { Int, Nat, quipuswapV3Types } from "quipuswap-v3-sdk/dist/types";

type P = {
    x: BigNumber,
    y: BigNumber,
    dx: BigNumber,
    dy: BigNumber,
    u: BigNumber,
    n: number
};

type SwapRequiredTickState = {
    prev: BigNumber;
    next: BigNumber;
    sqrtPrice: BigNumber;
    tickCumulativeOutside: BigNumber;
    liquidityNet: BigNumber;
};

type SwapRequiredConstants = Pick<quipuswapV3Types.Constants, "feeBps">;

interface TickCumulative {
    sum: BigNumber;
    blockStartValue: BigNumber;
}

interface SwapRequiredCumulative {
    time: string;
    tick: TickCumulative;
}

interface SwapRequiredStorage {
    liquidity: Nat;
    sqrtPrice: Nat;
    curTickIndex: Nat;
    curTickWitness: Nat;
    ticks: Record<string, SwapRequiredTickState>;
    constants: SwapRequiredConstants;
    lastCumulative: SwapRequiredCumulative;
}

interface XToYRecParam {
    s: SwapRequiredStorage;
    dx: Nat;
    dy: Nat;
}

type YToXRecParam = XToYRecParam;

const HUNDRED_PERCENT_BPS = 10000;


export const util = (x: BigNumber, y: BigNumber) => {
    const plus = x.plus(y);
    const minus = x.minus(y);
    return [plus.exponentiatedBy(8).minus(minus.exponentiatedBy(8)), minus.exponentiatedBy(7).plus(plus.exponentiatedBy(7)).multipliedBy(8)];
};

export const newton = (p: P): BigNumber => {
    if (p.n === 0) return p.dy; else {
        const _util = util(p.x.plus(p.dx), p.y.minus(p.dy)),
            new_u = _util[0],
            new_du_dy = _util[1]; //  new_u - p.u > 0 because dy remains an underestimate
        // dy is an underestimate because we start at 0 and the utility curve is convex

        p.dy = p.dy.plus(new_u.minus(p.u).dividedBy(new_du_dy));
        p.n -= 1;
        return newton(p);
    }
};

type Pool = {
    initialA?: BigNumber,
    initialATime?: string,
    futureA?: BigNumber,
    futureATime?: string,
    tokensInfo: {
        rate?: BigNumber;
        reserves: BigNumber;
    }[],
    fee?: DexFees
};

export const ediv = (a: BigNumber, b: BigNumber) => {
    let _b$s;

    return a.div(b.abs()).integerValue(BigNumber.ROUND_FLOOR).times((_b$s = b.s) != null ? _b$s : 1);
};

const getXp = (_ref: Pool) => {
    const tokensInfo = _ref.tokensInfo;
    return tokensInfo.map((tokenInfo) => {
        return ediv(tokenInfo.rate!.times(tokenInfo.reserves), precision);
    });
};

const getA = (t0: Date, a0: BigNumber, t1: Date, a1: BigNumber) => {
    const now = mockTezosNow();

    if (now >= dateToSeconds(t1)) {
        return a1;
    }

    const tNum = assertNonNegative(now - dateToSeconds(t0), new DexTimestampError("t0=" + t0.toISOString() + " is in the future"));
    const tDen = assertNonNegative(dateToSeconds(t1) - dateToSeconds(t0), new DexTimestampError("t1=" + t1.toISOString() + " is before t0=" + t0.toISOString()));
    const diff = a1.minus(a0).abs();
    const value = ediv(diff.times(tNum), tDen);
    return a1.gt(a0) ? a0.plus(value) : a0.minus(value).abs(); // always a0 > (a0-a1) * (now-t0)/(t1-t0) if t1 > now && a0 > a1
};

const getD = (xp: BigNumber[], ampF: BigNumber): BigNumber => {
    const cacheKey = xp.map((x) => {
        return x.toFixed();
    }).join(',') + "," + ampF.toFixed();

    if (getDCache.has(cacheKey)) {
        return getDCache.get(cacheKey);
    }

    const sumC = xp.reduce((acc, value) => {
        return acc.plus(value);
    }, new BigNumber(0));
    const tokensCount = xp.length;
    const aNnF = ampF.times(tokensCount);
    let d = sumC;
    let prevD = new BigNumber(0);

    const _loop = () => {
        const dConst = d;
        const counted = xp.reduce((accum, value) => {
            return [accum[0].times(dConst), accum[1].times(value.times(tokensCount))];
        }, [d, new BigNumber(1)]);
        const dP = ediv(counted[0], counted[1]);
        prevD = d;
        d = ediv(ediv(aNnF.times(sumC), aPrecision).plus(dP.times(tokensCount)).times(d), ediv(assertNonNegative(aNnF.minus(aPrecision), new DexWrongPrecisionError('One of tokens has a wrong precision')).times(d), aPrecision).plus(new BigNumber(tokensCount).plus(1).times(dP))); // Equality with the precision of 1
    };

    while (d.minus(prevD).abs().gt(1)) {
        _loop();
    }

    getDCache.set(cacheKey, d);
    return d;
};

const calculateY = (c: BigNumber, aNnF: BigNumber, s_: BigNumber, d: BigNumber, tokensCount: number) => {
    const cacheKey = "" + [c, aNnF, s_, d, tokensCount].map((x) => {
        return x.toFixed();
    }).join(',');

    if (calculateYCache.has(cacheKey)) {
        return calculateYCache.get(cacheKey);
    }

    c = c.times(d).times(aPrecision).div(aNnF.times(tokensCount)).integerValue(BigNumber.ROUND_CEIL);
    const b = s_.plus(ediv(d.times(aPrecision), aNnF));
    let y = d;
    let prevY = new BigNumber(0);

    while (y.minus(prevY).abs().gt(1)) {
        prevY = y;
        y = y.pow(2).plus(c).div(assertNonNegative(y.times(2).plus(b).minus(d))).integerValue(BigNumber.ROUND_CEIL);
    }

    calculateYCache.set(cacheKey, y);
    return y;
};

const getY = (i: number, j: number, x: BigNumber, xp: BigNumber[], s: Pool) => {
    const tokensCount = s.tokensInfo.length;
    assert(i !== j, 'Both tokens are same');
    const ampF = getA(new Date(s.initialATime!), s.initialA!, new Date(s.futureATime!), s.futureA!);
    const aNnF = ampF.times(tokensCount);
    const d = getD(xp, ampF);

    const prepareParams = (accum: { s_: BigNumber, c: BigNumber[] }, value: BigNumber, iter: number) => {
        if (iter !== j) {
            const _x = iter === i ? x : value;

            accum.s_ = accum.s_.plus(_x);
            accum.c[0] = accum.c[0].times(d);
            accum.c[1] = accum.c[1].times(_x.times(tokensCount));
        }

        return accum;
    };

    const res = xp.reduce(prepareParams, {
        s_: new BigNumber(0),
        c: [d, new BigNumber(1)]
    });
    const c = res.c[0].div(res.c[1]).integerValue(BigNumber.ROUND_CEIL);
    return calculateY(c, aNnF, res.s_, d, s.tokensInfo.length);
};

export const performSwap = (i: number, j: number, dx: BigNumber, pool: Pool) => {
    const xp = getXp(pool);
    const xpI = xp[i];
    const xpJ = xp[j];
    const tI = pool.tokensInfo[i];
    const tJ = pool.tokensInfo[j];
    assert(xpI && tI, new DexWrongIndexError(i));
    assert(xpJ && tJ, new DexWrongIndexError(j));
    const rateIF = tI.rate!;
    const rateJF = tJ.rate!;
    const x = xpI.plus(ediv(dx.times(rateIF), precision));
    const y = getY(i, j, x, xp, pool);
    const dy = assertNonNegative(xpJ.minus(y));
    return ediv(dy.times(precision), rateJF);
};

export const sumAllFees = (fees: DexFees) => {
    return Object.values(fees).reduce((sum, value) => {
        return sum.plus(value != null ? value : 0);
    }, new Nat(0));
};

export const makeSwapRequiredStorage = (pair: TradeOperation) => {
    const liquidity = new Nat(pair.liquidity!.toString()),
        sqrtPrice = new Nat(pair.sqrtPrice!.toString()),
        curTickIndex = new Nat(pair.curTickIndex!.toString()),
        curTickWitness = new Nat(pair.curTickWitness!.toString()),
        ticks = pair.ticks,
        lastCumulative = pair.lastCumulative as SwapRequiredCumulative,
        fees = pair.fees;
    return {
        liquidity: liquidity,
        sqrtPrice: sqrtPrice,
        curTickIndex: curTickIndex,
        curTickWitness: curTickWitness,
        lastCumulative: lastCumulative,
        ticks: ticks!,
        constants: {
            feeBps: fees == null ? new Nat(0) : new Nat(fees.liquidityProvidersFee!.toString())
        },
    };
};

const floorLogHalfBps = (x: Nat, y: Nat, outOfBoundsError: Error) => {
    const tenx = x.multipliedBy(10);

    if (tenx.isLessThan(y.multipliedBy(7)) || tenx.isGreaterThan(y.multipliedBy(15))) {
        throw outOfBoundsError;
    }

    const xPlusY = x.plus(y);
    const num = x.toBignumber().minus(y).multipliedBy(60003).multipliedBy(xPlusY);
    const denom = xPlusY.multipliedBy(xPlusY).plus(x.multipliedBy(2).multipliedBy(y));
    return num.dividedToIntegerBy(denom);
}

const fixCurTickIndexRec = (
    curTickIndexNew: Int,
    curIndexSqrtPrice: Nat,
    sqrtPriceNew: Nat
): Int => {
    if (sqrtPriceNew.isLessThan(curIndexSqrtPrice)) {
        const prevTickIndex = curTickIndexNew.minus(1);
        const prevIndexSqrtPrice = sqrtPriceForTick(prevTickIndex);

        return fixCurTickIndexRec(prevTickIndex, prevIndexSqrtPrice, sqrtPriceNew);
    } else {
        const nextTickIndex = curTickIndexNew.plus(1);
        const nextIndexSqrtPrice = sqrtPriceForTick(nextTickIndex);

        if (nextIndexSqrtPrice.isLessThanOrEqualTo(sqrtPriceNew)) {
            return fixCurTickIndexRec(nextTickIndex, nextIndexSqrtPrice, sqrtPriceNew);
        } else {
            return curTickIndexNew;
        }
    }
}

const fixCurTickIndex = (curTickIndex: Int, sqrtPriceNew: Nat) => {
    return fixCurTickIndexRec(curTickIndex, sqrtPriceForTick(curTickIndex), sqrtPriceNew);
}

const calcNewCurTickIndex = (curTickIndex: Int, sqrtPriceOld: Nat, sqrtPriceNew: Nat) => {
    const curTickIndexDelta = floorLogHalfBps(
        sqrtPriceNew,
        sqrtPriceOld,
        new TooBigPriceChangeErr()
    );

    const curTickIndexNew = curTickIndex.plus(curTickIndexDelta);

    return fixCurTickIndex(curTickIndexNew, sqrtPriceNew);
}

const oneMinusFeeBps = (feeBps: Nat) => {
    return new Nat(HUNDRED_PERCENT_BPS).minus(feeBps);
}

const xToYRec = (p: XToYRecParam): XToYRecParam => {
    if (p.s.liquidity.isZero()) {
        return p;
    }

    let totalFee = calcSwapFee(p.s.constants.feeBps, p.dx.toBignumber());
    let sqrtPriceNew = calcNewPriceX(p.s.sqrtPrice as quipuswapV3Types.x80n, p.s.liquidity, p.dx.minus(totalFee));
    const curTickIndexNew = calcNewCurTickIndex(p.s.curTickIndex as Int, p.s.sqrtPrice, sqrtPriceNew);
    if (curTickIndexNew.gte(p.s.curTickWitness)) {
        const dy = shiftRight(
            p.s.sqrtPrice.toBignumber().minus(sqrtPriceNew).multipliedBy(p.s.liquidity),
            new BigNumber(80)
        ).integerValue(BigNumber.ROUND_FLOOR);
        const newStorage = {
            ...p.s,
            sqrtPrice: sqrtPriceNew,
            curTickIndex: curTickIndexNew
        };

        return {
            s: newStorage,
            dx: new Nat(0),
            dy: p.dy.plus(dy)
        };
    }
    const tick = p.s.ticks[p.s.curTickWitness.toFixed()];
    const loNew = tick.prev;
    sqrtPriceNew = new quipuswapV3Types.x80n(tick.sqrtPrice.minus(1));
    const dy = shiftRight(
        p.s.sqrtPrice.minus(sqrtPriceNew).multipliedBy(p.s.liquidity),
        new BigNumber(80)
    ).integerValue(BigNumber.ROUND_FLOOR);
    const dxForDy = shiftLeft(dy, new BigNumber(160))
        .dividedBy(p.s.sqrtPrice.multipliedBy(sqrtPriceNew))
        .integerValue(BigNumber.ROUND_CEIL);
    const dxConsumed = dxForDy
        .multipliedBy(HUNDRED_PERCENT_BPS)
        .dividedBy(oneMinusFeeBps(p.s.constants.feeBps))
        .integerValue(BigNumber.ROUND_CEIL);
    totalFee = dxConsumed.minus(dxForDy);
    const sums = p.s.lastCumulative;
    const tickCumulativeOutsideNew = sums.tick.sum.minus(tick.tickCumulativeOutside);
    const tickNew = {
        ...tick,
        tickCumulativeOutside: tickCumulativeOutsideNew
    };
    const ticksNew: Record<string, SwapRequiredTickState> = {
        ...p.s.ticks,
        [p.s.curTickWitness.toFixed()]: tickNew
    };
    const storageNew = {
        ...p.s,
        curTickWitness: new Nat(loNew.toString()),
        sqrtPrice: sqrtPriceNew,
        curTickIndex: curTickIndexNew.minus(1),
        ticks: ticksNew,
        liquidity: p.s.liquidity.minus(tick.liquidityNet)
    };
    const paramNew = {
        s: storageNew,
        dx: p.dx.minus(dxConsumed),
        dy: p.dy.plus(dy)
    };

    return xToYRec(paramNew);
}

export const calculateXToY = (s: SwapRequiredStorage, dx: Nat) => {
    const r = xToYRec({ s, dx, dy: new Nat(0) });

    return {
        output: r.dy,
        inputLeft: r.dx,
        newStoragePart: r.s
    };
}

export const yToXRec = (p: YToXRecParam): YToXRecParam => {
    if (p.s.liquidity.isZero()) {
        return p;
    }

    let totalFee = calcSwapFee(p.s.constants.feeBps.toBignumber(), p.dy.toBignumber());
    let dyMinusFee = p.dy.minus(totalFee);
    let sqrtPriceNew = calcNewPriceY(p.s.sqrtPrice, p.s.liquidity, dyMinusFee);
    const curTickIndexNew = calcNewCurTickIndex(p.s.curTickIndex, p.s.sqrtPrice, sqrtPriceNew);
    const tick = p.s.ticks[p.s.curTickWitness.toFixed()];
    const nextTickIndex = tick.next;
    if (curTickIndexNew.lt(nextTickIndex)) {
        const dx = p.s.liquidity
            .toBignumber()
            .multipliedBy(shiftLeft(sqrtPriceNew.toBignumber().minus(p.s.sqrtPrice), new BigNumber(80)))
            .dividedBy(sqrtPriceNew.multipliedBy(p.s.sqrtPrice))
            .integerValue(BigNumber.ROUND_FLOOR);
        const sNew = {
            ...p.s,
            sqrtPrice: new quipuswapV3Types.x80n(sqrtPriceNew),
            curTickIndex: curTickIndexNew
        };

        return { s: sNew, dy: new Nat(0), dx: p.dx.plus(dx) };
    }

    const nextTick = p.s.ticks[nextTickIndex.toFixed()];
    sqrtPriceNew = new Nat(nextTick.sqrtPrice.toString());

    const dx = new Nat(
        p.s.liquidity
            .toBignumber()
            .multipliedBy(shiftLeft(sqrtPriceNew.toBignumber().minus(p.s.sqrtPrice), new BigNumber(80)))
            .dividedBy(sqrtPriceNew.multipliedBy(p.s.sqrtPrice))
            .integerValue(BigNumber.ROUND_FLOOR)
    );
    const _280 = new BigNumber(2).pow(80);
    const dyForDx = new Nat(
        p.s.liquidity
            .toBignumber()
            .multipliedBy(sqrtPriceNew.toBignumber().minus(p.s.sqrtPrice))
            .dividedBy(_280)
            .integerValue(BigNumber.ROUND_CEIL)
    );
    dyMinusFee = dyForDx;
    const dyConsumed = dyMinusFee
        .toBignumber()
        .multipliedBy(HUNDRED_PERCENT_BPS)
        .dividedBy(oneMinusFeeBps(p.s.constants.feeBps))
        .integerValue(BigNumber.ROUND_CEIL);
    totalFee = dyConsumed.minus(dyForDx);
    const sums = p.s.lastCumulative;
    const tickCumulativeOutsideNew = sums.tick.sum.minus(nextTick.tickCumulativeOutside);
    const nextTickNew = {
        ...nextTick,
        tickCumulativeOutside: tickCumulativeOutsideNew
    };
    const ticksNew: Record<string, SwapRequiredTickState> = {
        ...p.s.ticks,
        [nextTickIndex.toFixed()]: nextTickNew
    };
    const storageNew = {
        ...p.s,
        sqrtPrice: new quipuswapV3Types.x80n(sqrtPriceNew),
        curTickWitness: new Nat(nextTickIndex.toString()),
        curTickIndex: new Nat(nextTickIndex.toString()),
        ticks: ticksNew,
        liquidity: new Nat(p.s.liquidity.plus(nextTick.liquidityNet))
    };
    const paramNew = {
        s: storageNew,
        dy: p.dy.minus(dyConsumed),
        dx: p.dx.plus(dx)
    };

    return yToXRec(paramNew);
}


export const calculateYToX = (s: SwapRequiredStorage, dy: Nat) => {
    const r = yToXRec({ s, dy, dx: new Nat(0) });

    return {
        output: r.dx,
        inputLeft: r.dy,
        newStoragePart: r.s
    };
}
