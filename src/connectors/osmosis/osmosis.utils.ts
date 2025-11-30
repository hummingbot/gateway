import { BigNumber } from 'bignumber.js';

type PoolReward = {
  day_usd: number;
  month_usd: number;
  year_usd: number;
};

type Rewards = {
  pools: {
    [key: number]: PoolReward;
  };
  total_day_usd: number;
  total_month_usd: number;
  total_year_usd: number;
};

export const fetchRewards = async (address: string): Promise<Rewards> => {
  const url = `https://api-osmosis-chain.imperator.co/lp/v1/rewards/estimation/${address}`;
  return (
    fetch(url)
      // .then(handleError)
      .then((res) => res.json())
  );
};

export function calculatePriceToTick(
  desiredPriceString: string,
  exponentAtPriceOne: number,
  tickSpacing: number,
  is_lowerBound: boolean,
): string {
  console.log(
    `Inputs: desiredPriceString=${desiredPriceString}, exponentAtPriceOne=${exponentAtPriceOne}, tickSpacing=${tickSpacing}, is_lowerBound=${is_lowerBound}`,
  );

  const desiredPrice = new BigNumber(desiredPriceString);
  const exponent = new BigNumber(exponentAtPriceOne);
  const geometricExponentIncrementDistanceInTicks = new BigNumber(9).multipliedBy(
    new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1)),
  );

  console.log(
    `Initial calculations: desiredPrice=${desiredPrice}, exponent=${exponent}, geometricExponentIncrementDistanceInTicks=${geometricExponentIncrementDistanceInTicks}`,
  );

  let currentPrice = new BigNumber(1);
  let ticksPassed = new BigNumber(0);
  let exponentAtCurrentTick = exponent;
  let currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponent);

  if (desiredPrice.gt(new BigNumber(1))) {
    while (currentPrice.lt(desiredPrice)) {
      currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick);
      const maxPriceForCurrentAdditiveIncrementInTicks = geometricExponentIncrementDistanceInTicks.multipliedBy(
        currentAdditiveIncrementInTicks,
      );
      currentPrice = currentPrice.plus(maxPriceForCurrentAdditiveIncrementInTicks);
      exponentAtCurrentTick = exponentAtCurrentTick.plus(1);
      ticksPassed = ticksPassed.plus(geometricExponentIncrementDistanceInTicks);

      console.log(
        `Loop (desiredPrice > 1): currentPrice=${currentPrice}, exponentAtCurrentTick=${exponentAtCurrentTick}, ticksPassed=${ticksPassed}`,
      );
    }
  } else {
    exponentAtCurrentTick = exponent.minus(1);
    while (currentPrice.gt(desiredPrice)) {
      currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick);
      const maxPriceForCurrentAdditiveIncrementInTicks = geometricExponentIncrementDistanceInTicks.multipliedBy(
        currentAdditiveIncrementInTicks,
      );
      currentPrice = currentPrice.minus(maxPriceForCurrentAdditiveIncrementInTicks);
      exponentAtCurrentTick = exponentAtCurrentTick.minus(1);
      ticksPassed = ticksPassed.minus(geometricExponentIncrementDistanceInTicks);

      console.log(
        `Loop (desiredPrice <= 1): currentPrice=${currentPrice}, exponentAtCurrentTick=${exponentAtCurrentTick}, ticksPassed=${ticksPassed}`,
      );
    }
  }

  const ticksToBeFulfilledByExponentAtCurrentTick = desiredPrice
    .minus(currentPrice)
    .dividedBy(currentAdditiveIncrementInTicks);
  console.log(`Ticks to be fulfilled by current exponent: ${ticksToBeFulfilledByExponentAtCurrentTick}`);

  const tickIndex = ticksPassed.plus(ticksToBeFulfilledByExponentAtCurrentTick);
  console.log(`Tick index: ${tickIndex}`);

  let returnTick = new BigNumber(0);
  if (is_lowerBound) {
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_DOWN).multipliedBy(tickSpacing);
  } else {
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_CEIL).multipliedBy(tickSpacing);
  }

  console.log(`Final calculations: tickIndex=${tickIndex}, returnTick=${BigInt(returnTick.toNumber()).toString()}`);
  if (returnTick.isEqualTo(0)) {
    throw new Error('Osmosis: Failed to find tick within price bounds for CL Position Open.');
  }
  return BigInt(returnTick.toNumber()).toString();
}

export function tickToPrice(
  exponentToken0: number,
  exponentToken1: number,
  currentTickIn: string,
  exponentAtPriceOne: string,
): string {
  const currentTick = new BigNumber(currentTickIn);
  const exponent = new BigNumber(exponentAtPriceOne); // -6

  const geoExponentIncrementTicks = new BigNumber(9).multipliedBy(
    new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1)),
  ); // 9e6
  const geoExponentDelta = currentTick.dividedBy(geoExponentIncrementTicks).integerValue(BigNumber.ROUND_FLOOR);

  const exponentAtCurrentTick = new BigNumber(exponentAtPriceOne).plus(geoExponentDelta);
  const currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick); // 10e-6

  const numAdditiveTicks = currentTick.minus(geoExponentDelta.multipliedBy(geoExponentIncrementTicks));

  let price = new BigNumber(10)
    .exponentiatedBy(geoExponentDelta)
    .plus(numAdditiveTicks.multipliedBy(currentAddIncrementTicks));

  price = price.dividedBy(
    new BigNumber(10).exponentiatedBy(exponentToken1).dividedBy(new BigNumber(10).exponentiatedBy(exponentToken0)),
  );

  return price.toString();
}

export function findTickForPrice(
  desiredPriceString: string,
  exponentAtPriceOne: number,
  tickSpacing: number,
  is_lowerBound: boolean,
): string {
  const desiredPrice = new BigNumber(desiredPriceString);
  let exponent = new BigNumber(exponentAtPriceOne); // -6
  const geoExponentIncrementTicks = new BigNumber(9).multipliedBy(
    new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1)),
  ); // 9e6

  const currentPrice = new BigNumber(1);
  let ticksPassed = new BigNumber(0);
  let currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponent); // 10e-6
  let currentAddIncrementTicksPrice = currentAddIncrementTicks.multipliedBy(geoExponentIncrementTicks); // 9

  ticksPassed = ticksPassed.plus(geoExponentIncrementTicks); // 9e6
  let totalPrice = currentPrice.plus(currentAddIncrementTicksPrice); // 10

  while (totalPrice.isLessThan(desiredPrice)) {
    exponent = exponent.plus(1);
    currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponent);
    currentAddIncrementTicksPrice = currentAddIncrementTicks.multipliedBy(geoExponentIncrementTicks);
    ticksPassed = ticksPassed.plus(geoExponentIncrementTicks);
    totalPrice = totalPrice.plus(currentAddIncrementTicksPrice);
  }

  const ticksToBeFulfilledByExponentAtCurrentTick = desiredPrice.minus(totalPrice).dividedBy(currentAddIncrementTicks);
  const tickIndex = ticksPassed.plus(ticksToBeFulfilledByExponentAtCurrentTick);

  let returnTick;
  if (is_lowerBound) {
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_DOWN).multipliedBy(tickSpacing);
  } else {
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_CEIL).multipliedBy(tickSpacing);
  }
  return returnTick.toString();
}
