import BigNumber from "bignumber.js";

export class InvalidTokensListError extends Error {
    constructor(json: unknown) {
        super(`Invalid response for tokens list was received: ${JSON.stringify(json)}`);
    }
}

export class DexWrongIndexError extends Error {
    constructor(index: number) {
        super("There is no asset with index " + index + " in the pool");
    }
}

export class MathNatError extends Error {
    constructor(value: BigNumber) {
        super("A non-negative value was expected but actual one is " + value.toFixed());
    }

}

export class DexTimestampError extends Error { }

export class DexWrongPrecisionError extends Error { };

export class TooBigPriceChangeErr extends Error { };

export class DexFeeOverflowError extends Error {
    constructor(output: BigNumber, fee: BigNumber) {
        super("The possible output (" + output.toFixed() + ") is less than fee (" + fee.toFixed() + ")");
    }
}

export const assertNonNegative = (rawValue: number | BigNumber, error?: Error) => {
    const value = new BigNumber(rawValue);

    if (value.gte(0)) {
        return value;
    }

    throw error != null ? error : new MathNatError(value);
};