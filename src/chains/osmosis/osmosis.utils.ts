import BigNumber from 'bignumber.js';

export interface Fee {
  pool_id: string;
  volume_24h: number;
  volume_7d: number;
  fees_spent_24h: number;
  fees_spent_7d: number;
  fees_percentage: string;
}

export const fetchFees = async (): Promise<Fee[]> => {
  const url = 'https://api-osmosis.imperator.co/fees/v1/pools';
  return fetch(url)
    // .then(handleError)
    .then((res) => res.json())
    .then((res) => res.data);
};

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
  return fetch(url)
    // .then(handleError)
    .then((res) => res.json());
};

export function tickToPrice(exponentToken0: number, exponentToken1: number, currentTickIn: string, exponentAtPriceOne: string): string {
  const currentTick = new BigNumber(currentTickIn)
  var exponent = new BigNumber(exponentAtPriceOne); // -6

  var geoExponentIncrementTicks = new BigNumber(9).multipliedBy(new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1))) // 9e6
  var geoExponentDelta;
  geoExponentDelta = currentTick.dividedBy(geoExponentIncrementTicks).integerValue(BigNumber.ROUND_FLOOR)

  var exponentAtCurrentTick = new BigNumber(exponentAtPriceOne).plus(geoExponentDelta)
  var currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick) // 10e-6

  var numAdditiveTicks = currentTick.minus((geoExponentDelta.multipliedBy(geoExponentIncrementTicks)))

  var price = new BigNumber(10).exponentiatedBy(geoExponentDelta).plus((numAdditiveTicks.multipliedBy(currentAddIncrementTicks)))

  price = price.dividedBy((new BigNumber(10).exponentiatedBy(exponentToken1)).dividedBy((new BigNumber(10).exponentiatedBy(exponentToken0))))

  return price.toString()
}

export function findTickForPrice(desiredPriceString: string, exponentAtPriceOne: number, tickSpacing: number, is_lowerBound: boolean): string{
  var desiredPrice = new BigNumber(desiredPriceString)
  var exponent = new BigNumber(exponentAtPriceOne); // -6
  var geoExponentIncrementTicks = new BigNumber(9).multipliedBy(new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1))) // 9e6
  
  var currentPrice = new BigNumber(1)
  var ticksPassed = new BigNumber(0)
  var currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponent) // 10e-6
  var currentAddIncrementTicksPrice = currentAddIncrementTicks.multipliedBy(geoExponentIncrementTicks) // 9
  
  ticksPassed = ticksPassed.plus(geoExponentIncrementTicks) // 9e6
  var totalPrice = currentPrice.plus(currentAddIncrementTicksPrice) // 10
  
  while (totalPrice.isLessThan(desiredPrice)){
    exponent = exponent.plus(1)
    currentAddIncrementTicks = new BigNumber(10).exponentiatedBy(exponent)
    currentAddIncrementTicksPrice = currentAddIncrementTicks.multipliedBy(geoExponentIncrementTicks)
    ticksPassed = ticksPassed.plus(geoExponentIncrementTicks)
    totalPrice = totalPrice.plus(currentAddIncrementTicksPrice)
  }
  
  var ticksToBeFulfilledByExponentAtCurrentTick = (desiredPrice.minus(totalPrice)).dividedBy(currentAddIncrementTicks)
  var tickIndex = ticksPassed.plus(ticksToBeFulfilledByExponentAtCurrentTick)

  var returnTick
  if (is_lowerBound){
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_DOWN).multipliedBy(tickSpacing)
  }
  else{
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_CEIL).multipliedBy(tickSpacing)
  }
  return returnTick.toString()
}


export function calculatePriceToTick(desiredPriceString: string, exponentAtPriceOne: number, tickSpacing: number, is_lowerBound: boolean): string {
  console.log(`Inputs: desiredPriceString=${desiredPriceString}, exponentAtPriceOne=${exponentAtPriceOne}, tickSpacing=${tickSpacing}, is_lowerBound=${is_lowerBound}`);

  const desiredPrice = new BigNumber(desiredPriceString)
  const exponent = new BigNumber(exponentAtPriceOne);
  const geometricExponentIncrementDistanceInTicks = new BigNumber(9).multipliedBy(new BigNumber(10).exponentiatedBy(exponent.multipliedBy(-1)))

  console.log(`Initial calculations: desiredPrice=${desiredPrice}, exponent=${exponent}, geometricExponentIncrementDistanceInTicks=${geometricExponentIncrementDistanceInTicks}`);

  let currentPrice = new BigNumber(1);
  let ticksPassed = new BigNumber(0);
  let exponentAtCurrentTick = exponent;
  let currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponent)

  if (desiredPrice.gt(new BigNumber(1))) {
    while (currentPrice.lt(desiredPrice)) {
      currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick);
      const maxPriceForCurrentAdditiveIncrementInTicks = geometricExponentIncrementDistanceInTicks.multipliedBy(currentAdditiveIncrementInTicks);
      currentPrice = currentPrice.plus(maxPriceForCurrentAdditiveIncrementInTicks);
      exponentAtCurrentTick = exponentAtCurrentTick.plus(1);
      ticksPassed = ticksPassed.plus(geometricExponentIncrementDistanceInTicks);

      console.log(`Loop (desiredPrice > 1): currentPrice=${currentPrice}, exponentAtCurrentTick=${exponentAtCurrentTick}, ticksPassed=${ticksPassed}`);
    }
  } else {
    exponentAtCurrentTick = exponent.minus(1);
    while (currentPrice.gt(desiredPrice)) {
      currentAdditiveIncrementInTicks = new BigNumber(10).exponentiatedBy(exponentAtCurrentTick);
      const maxPriceForCurrentAdditiveIncrementInTicks = geometricExponentIncrementDistanceInTicks.multipliedBy(currentAdditiveIncrementInTicks);
      currentPrice = currentPrice.minus(maxPriceForCurrentAdditiveIncrementInTicks);
      exponentAtCurrentTick = exponentAtCurrentTick.minus(1);
      ticksPassed = ticksPassed.minus(geometricExponentIncrementDistanceInTicks);

      console.log(`Loop (desiredPrice <= 1): currentPrice=${currentPrice}, exponentAtCurrentTick=${exponentAtCurrentTick}, ticksPassed=${ticksPassed}`);
    }
  }

  const ticksToBeFulfilledByExponentAtCurrentTick = desiredPrice.minus(currentPrice).dividedBy(currentAdditiveIncrementInTicks);
  console.log(`Ticks to be fulfilled by current exponent: ${ticksToBeFulfilledByExponentAtCurrentTick}`);

  const tickIndex = ticksPassed.plus(ticksToBeFulfilledByExponentAtCurrentTick);
  console.log(`Tick index: ${tickIndex}`);

  let returnTick = new BigNumber(0);
  if (is_lowerBound){
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_DOWN).multipliedBy(tickSpacing)
  }
  else{
    returnTick = tickIndex.dividedBy(tickSpacing).integerValue(BigNumber.ROUND_CEIL).multipliedBy(tickSpacing)
  }

  console.log(`Final calculations: tickIndex=${tickIndex}, returnTick=${BigInt(returnTick.toNumber()).toString()}`);
  return BigInt(returnTick.toNumber()).toString();
}