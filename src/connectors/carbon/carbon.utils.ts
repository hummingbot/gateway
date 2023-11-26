import Decimal from 'decimal.js-light';
import { TokenInfo } from '../../chains/ethereum/ethereum-base';

export type OrderRow = {
  rate: string;
  total: string;
  amount: string;
  originalTotal?: string;
};

export const emptyToken: TokenInfo = {
  chainId: 1,
  address: '',
  name: '',
  symbol: '',
  decimals: 18,
};

const subtractPrevAmount = (
  data: OrderRow[],
  amount: string,
  rate: string,
  i: number
) => {
  const prevAmount = data[i - 1]?.amount || '0';
  const newAmount = new Decimal(amount).minus(prevAmount);
  const newTotal = new Decimal(rate).times(newAmount);

  return {
    rate,
    amount: newAmount.toString(),
    total: newTotal.toString(),
  };
};

export const buildOrders = (
  data: OrderRow[],
  baseDecimals: number,
  quoteDecimals: number
): OrderRow[] => {
  const ROW_AMOUNT_MIN_THRESHOLD = 0.0001;
  const buckets = 14;

  return data
    .map(({ amount, rate }, i) => subtractPrevAmount(data, amount, rate, i))
    .filter(({ amount }) => new Decimal(amount).gte(ROW_AMOUNT_MIN_THRESHOLD))
    .splice(0, buckets)
    .map(({ amount, rate, total }) => ({
      rate: new Decimal(rate).toFixed(quoteDecimals, 1),
      amount: new Decimal(amount).toFixed(baseDecimals, 1),
      total: new Decimal(total).toFixed(quoteDecimals, 1),
    }));
};

export const getMiddleRate = (maxBuy: Decimal, maxSell: Decimal): Decimal => {
  const ONE = new Decimal(1);
  const isFinite = (number: Decimal) =>
    !['NaN', 'Infinity', '-Infinity'].some((x) => x === number.toString());

  if (isFinite(maxBuy) && maxBuy.gt(0) && isFinite(maxSell) && maxSell.gt(0)) {
    return maxBuy.plus(ONE.div(maxSell)).div(2);
  }
  if (isFinite(maxBuy) && maxBuy.gt(0)) {
    return maxBuy;
  }
  if (isFinite(maxSell) && maxSell.gt(0)) {
    return ONE.div(maxSell);
  }
  return new Decimal(0);
};

export const getStep = (
  stepBuy: Decimal,
  stepSell: Decimal,
  minBuy: Decimal,
  maxBuy: Decimal,
  steps: number,
  minSell: Decimal,
  maxSell: Decimal
): Decimal => {
  const ONE = new Decimal(1);
  const isFinite = (number: Decimal) =>
    !['NaN', 'Infinity', '-Infinity'].some((x) => x === number.toString());

  if (isFinite(stepBuy) && stepBuy.gt(0)) {
    if (isFinite(stepSell) && stepSell.gt(0)) {
      return stepBuy.lte(stepSell) ? stepBuy : stepSell;
    } else {
      return stepBuy;
    }
  } else if (isFinite(stepSell) && stepSell.gt(0)) {
    return stepSell;
  } else {
    if (minBuy.gt(0) && minBuy.eq(maxBuy)) {
      return minBuy.div(steps + 2);
    }
    if (minSell.gt(0) && minSell.eq(maxSell)) {
      return minSell.div(steps + 2);
    }
    return ONE.div(10000);
  }
};

export const decodeStrategyId = (strategyIdRaw: string): string[] => {
  const strategyId = BigInt(strategyIdRaw);
  const pairId = (strategyId >> BigInt(128)).toString();

  const strategyIndex = (
    strategyId & BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
  ).toString(10);

  return [pairId, strategyIndex];
};
