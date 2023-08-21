import BigNumber from "bignumber.js";
import { ICalculateTokenResponse, IConfigToken } from "../plenty.types";


export const calculateTokenOutputVolatile = (
  tokenInAmount: BigNumber,
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  exchangeFee: BigNumber,
  slippage: string = '1/100',
  tokenOut: IConfigToken,
): ICalculateTokenResponse => {
  try {
    tokenInAmount = new BigNumber(tokenInAmount);
    tokenInSupply = new BigNumber(tokenInSupply);
    tokenOutSupply = new BigNumber(tokenOutSupply);
    exchangeFee = new BigNumber(exchangeFee);

    const feePerc = exchangeFee.multipliedBy(100);
    let tokenOutAmount = new BigNumber(0);
    tokenOutAmount = new BigNumber(1)
      .minus(exchangeFee)
      .multipliedBy(tokenOutSupply)
      .multipliedBy(tokenInAmount);
    tokenOutAmount = tokenOutAmount.dividedBy(
      tokenInSupply.plus(
        new BigNumber(1).minus(exchangeFee).multipliedBy(tokenInAmount)
      )
    );

    tokenOutAmount = new BigNumber(
      tokenOutAmount.decimalPlaces(tokenOut.decimals, 1)
    );

    const fees = tokenInAmount.multipliedBy(exchangeFee);
    let slippageNumerator = new BigNumber(slippage.split("/")[0]);
    let slippageDenominator = new BigNumber(slippage.split("/")[1]);
    slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
    slippageDenominator = new BigNumber(100);
    let minimumOut = tokenOutAmount.minus(
      tokenOutAmount.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
    );

    minimumOut = new BigNumber(
      minimumOut.decimalPlaces(tokenOut.decimals, 1)
    );

    const updatedTokenInSupply = tokenInSupply.minus(tokenInAmount);
    const updatedTokenOutSupply = tokenOutSupply.minus(tokenOutAmount);
    let nextTokenOutAmount = new BigNumber(1)
      .minus(exchangeFee)
      .multipliedBy(updatedTokenOutSupply)
      .multipliedBy(tokenInAmount);
    nextTokenOutAmount = nextTokenOutAmount.dividedBy(
      updatedTokenInSupply.plus(
        new BigNumber(1).minus(exchangeFee).multipliedBy(tokenInAmount)
      )
    );
    let priceImpact = tokenOutAmount
      .minus(nextTokenOutAmount)
      .dividedBy(tokenOutAmount);
    priceImpact = priceImpact.multipliedBy(100);
    priceImpact = priceImpact.absoluteValue();
    priceImpact = priceImpact.multipliedBy(100);
    const exchangeRate = tokenOutAmount.dividedBy(tokenInAmount);

    return {
      tokenOutAmount,
      fees,
      feePerc,
      minimumOut,
      exchangeRate,
      priceImpact,
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error
    };
  }
};

export const calculateTokensOutTezCtez = (
  tezSupply: BigNumber,
  ctezSupply: BigNumber,
  tokenInAmount: BigNumber,
  pairFeeDenom: BigNumber,
  slippage: string = '1/100',
  target: BigNumber,
  tokenIn: string
): ICalculateTokenResponse => {

  tezSupply = new BigNumber(tezSupply);
  ctezSupply = new BigNumber(ctezSupply);
  tokenInAmount = new BigNumber(tokenInAmount);
  pairFeeDenom = new BigNumber(pairFeeDenom);
  target = new BigNumber(target);

  const feePerc = new BigNumber(100).dividedBy(pairFeeDenom);
  tokenInAmount = tokenInAmount.multipliedBy(new BigNumber(10).pow(6));
  tezSupply = tezSupply.multipliedBy(new BigNumber(10).pow(6));
  ctezSupply = ctezSupply.multipliedBy(new BigNumber(10).pow(6));
  try {
    if (tokenIn === 'CTez') {
      const dy = newton_dx_to_dy(
        target.multipliedBy(ctezSupply),
        tezSupply.multipliedBy(new BigNumber(2).pow(48)),
        tokenInAmount.multipliedBy(target),
        5
      ).dividedBy(new BigNumber(2).pow(48));
      let fee = dy.dividedBy(pairFeeDenom);
      let tokenOut = dy.minus(fee);


      let slippageNumerator = new BigNumber(slippage.split("/")[0]);
      let slippageDenominator = new BigNumber(slippage.split("/")[1]);
      slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
      slippageDenominator = new BigNumber(100);
      let minOut = tokenOut.minus(
        tokenOut.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
      );
      minOut = minOut.dividedBy(new BigNumber(10).pow(6));
      const exchangeRate = tokenOut.dividedBy(tokenInAmount);

      const updatedCtezSupply = ctezSupply.plus(tokenInAmount);
      const updatedTezSupply = tezSupply.minus(tokenOut);

      const nextDy = newton_dx_to_dy(
        target.multipliedBy(updatedCtezSupply),
        updatedTezSupply.multipliedBy(new BigNumber(2).pow(48)),
        tokenInAmount.multipliedBy(target),
        5
      ).dividedBy(new BigNumber(2).pow(48));

      const nextFee = nextDy.dividedBy(pairFeeDenom);
      const nextTokenOut = nextDy.minus(nextFee);
      let priceImpact = tokenOut.minus(nextTokenOut).dividedBy(tokenOut);
      priceImpact = priceImpact.multipliedBy(100);
      priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
      const tokenOutAmount = new BigNumber(tokenOut.dividedBy(new BigNumber(10).pow(6)).decimalPlaces(6, 1));
      const fees = fee.dividedBy(new BigNumber(10).pow(6));
      const minimumOut = new BigNumber(minOut.decimalPlaces(6, 1));

      return {
        tokenOutAmount,
        fees,
        feePerc,
        minimumOut,
        exchangeRate,
        priceImpact,
      };
    } else if (tokenIn === 'XTZ') {
      const dy = newton_dx_to_dy(
        tezSupply.multipliedBy(new BigNumber(2).pow(48)),
        target.multipliedBy(ctezSupply),
        tokenInAmount.multipliedBy(new BigNumber(2).pow(48)),
        5
      ).dividedBy(target);
      let fee = dy.dividedBy(pairFeeDenom);
      let tokenOut = dy.minus(fee);

      let slippageNumerator = new BigNumber(slippage.split("/")[0]);
      let slippageDenominator = new BigNumber(slippage.split("/")[1]);
      slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
      slippageDenominator = new BigNumber(100);
      let minOut = tokenOut.minus(
        tokenOut.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
      );
      minOut = minOut.dividedBy(new BigNumber(10).pow(6));
      const exchangeRate = tokenOut.dividedBy(tokenInAmount);

      const updatedCtezSupply = ctezSupply.minus(tokenOut);
      const updatedTezSupply = tezSupply.plus(tokenInAmount);

      const nextDy = newton_dx_to_dy(
        updatedTezSupply.multipliedBy(new BigNumber(2).pow(48)),
        target.multipliedBy(updatedCtezSupply),
        tokenInAmount.multipliedBy(new BigNumber(2).pow(48)),
        5
      ).dividedBy(target);
      const nextFee = nextDy.dividedBy(pairFeeDenom);
      const nextTokenOut = nextDy.minus(nextFee);
      let priceImpact = tokenOut.minus(nextTokenOut).dividedBy(tokenOut);
      priceImpact = priceImpact.multipliedBy(100);
      priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
      const tokenOutAmount = new BigNumber(tokenOut.dividedBy(new BigNumber(10).pow(6)).decimalPlaces(6, 1));
      const fees = fee.dividedBy(new BigNumber(10).pow(6));
      const minimumOut = new BigNumber(minOut.decimalPlaces(6, 1));
      return {
        tokenOutAmount,
        fees,
        feePerc,
        minimumOut,
        exchangeRate,
        priceImpact,
      };
    }
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};

export const calculateTokensOutGeneralStable = (
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  tokenInAmount: BigNumber,
  Exchangefee: BigNumber,
  slippage: string = "1/100",
  tokenIn: IConfigToken,
  tokenOut: IConfigToken,
  tokenInPrecision: BigNumber,
  tokenOutPrecision: BigNumber
): ICalculateTokenResponse => {
  const feePerc = new BigNumber(100).dividedBy(Exchangefee);
  tokenInSupply = new BigNumber(tokenInSupply);
  tokenOutSupply = new BigNumber(tokenOutSupply);
  tokenInAmount = new BigNumber(tokenInAmount);
  Exchangefee = new BigNumber(Exchangefee);

  tokenInAmount = tokenInAmount.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
  tokenInSupply = tokenInSupply.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
  tokenOutSupply = tokenOutSupply.multipliedBy(new BigNumber(10).pow(tokenOut.decimals));

  try {
    tokenInSupply = tokenInSupply.multipliedBy(tokenInPrecision);
    tokenOutSupply = tokenOutSupply.multipliedBy(tokenOutPrecision);

    const dy = newton_dx_to_dy(
      tokenInSupply,
      tokenOutSupply,
      tokenInAmount.multipliedBy(tokenInPrecision),
      5
    );

    let fee = dy.dividedBy(Exchangefee);
    let tokenOutAmt = dy.minus(fee).dividedBy(tokenOutPrecision);

    let slippageNumerator = new BigNumber(slippage.split("/")[0]);
    let slippageDenominator = new BigNumber(slippage.split("/")[1]);
    slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
    slippageDenominator = new BigNumber(100);
    let minOut = tokenOutAmt.minus(
      tokenOutAmt.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
    );
    minOut = minOut.dividedBy(new BigNumber(10).pow(tokenOut.decimals));

    const updatedTokenInPool = tokenInSupply.plus(tokenInAmount);
    const updatedTokenOutPool = tokenOutSupply.minus(tokenOutAmt);

    const nextDy = newton_dx_to_dy(
      updatedTokenInPool,
      updatedTokenOutPool,
      tokenInAmount.multipliedBy(tokenInPrecision),
      5
    );
    const nextFee = nextDy.dividedBy(Exchangefee);
    const nextTokenOut = nextDy.minus(nextFee).dividedBy(tokenOutPrecision);
    let priceImpact = tokenOutAmt.minus(nextTokenOut).dividedBy(tokenOutAmt);
    priceImpact = priceImpact.multipliedBy(100);
    priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
    tokenOutAmt = tokenOutAmt.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    fee = fee.dividedBy(tokenOutPrecision);
    fee = fee.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    const tokenOutAmount = new BigNumber(tokenOutAmt.decimalPlaces(tokenOut.decimals, 1));
    const minimumOut = new BigNumber(minOut.decimalPlaces(tokenOut.decimals, 1));
    const fees = fee;
    const exchangeRate = tokenOutAmount.dividedBy(
      tokenInAmount.dividedBy(new BigNumber(10).pow(tokenIn.decimals))
    );
    return {
      tokenOutAmount,
      fees,
      feePerc,
      minimumOut,
      exchangeRate,
      priceImpact,
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};


export const calculateTokenInputVolatile = (
  tokenInAmount: BigNumber,
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  exchangeFee: BigNumber,
  slippage: string = '1/100',
  tokenIn: IConfigToken,
  tokenOut: IConfigToken
): ICalculateTokenResponse => {
  try {
    const feePerc = exchangeFee.multipliedBy(100);
    let tokenOutAmount = new BigNumber(0);

    tokenInAmount = tokenInAmount.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenInSupply = tokenInSupply.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.multipliedBy(new BigNumber(10).pow(tokenOut.decimals));

    let fee = tokenInAmount.multipliedBy(exchangeFee);
    tokenInAmount = tokenInAmount.plus(fee);

    let invariant = tokenInSupply.multipliedBy(tokenOutSupply);
    tokenOutAmount = (invariant.dividedBy(tokenInSupply.minus(tokenInAmount))).minus(tokenOutSupply);

    tokenInAmount = tokenInAmount.dividedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenInSupply = tokenInSupply.dividedBy(new BigNumber(10).pow(tokenIn.decimals));
    tokenOutSupply = tokenOutSupply.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    tokenOutAmount = tokenOutAmount.dividedBy(new BigNumber(10).pow(tokenOut.decimals));

    tokenOutAmount = new BigNumber(
      tokenOutAmount.decimalPlaces(tokenOut.decimals, 1)
    );

    const fees = tokenInAmount.multipliedBy(exchangeFee);
    let slippageNumerator = new BigNumber(slippage.split("/")[0]);
    let slippageDenominator = new BigNumber(slippage.split("/")[1]);
    slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
    slippageDenominator = new BigNumber(100);
    let minimumOut = tokenOutAmount.minus(
      tokenOutAmount.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
    );

    minimumOut = new BigNumber(
      minimumOut.decimalPlaces(tokenOut.decimals, 1)
    );

    const updatedTokenInSupply = tokenInSupply.minus(tokenInAmount);
    const updatedTokenOutSupply = tokenOutSupply.minus(tokenOutAmount);
    let nextTokenOutAmount = new BigNumber(1)
      .minus(exchangeFee)
      .multipliedBy(updatedTokenOutSupply)
      .multipliedBy(tokenInAmount);
    nextTokenOutAmount = nextTokenOutAmount.dividedBy(
      updatedTokenInSupply.plus(
        new BigNumber(1).minus(exchangeFee).multipliedBy(tokenInAmount)
      )
    );
    let priceImpact = tokenOutAmount
      .minus(nextTokenOutAmount)
      .dividedBy(tokenOutAmount);
    priceImpact = priceImpact.multipliedBy(100);
    priceImpact = priceImpact.absoluteValue();
    priceImpact = priceImpact.multipliedBy(100);
    const exchangeRate = tokenOutAmount.dividedBy(tokenInAmount);

    return {
      tokenOutAmount,
      fees,
      feePerc,
      minimumOut,
      exchangeRate,
      priceImpact,
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error
    };
  }
};

export const calculateTokensInTezCtez = (
  tezSupply: BigNumber,
  ctezSupply: BigNumber,
  tokenInAmount: BigNumber,
  pairFeeDenom: BigNumber,
  slippage: string = '1/100',
  target: BigNumber,
  tokenIn: string
): ICalculateTokenResponse => {

  const feePerc = new BigNumber(100).dividedBy(pairFeeDenom);
  tokenInAmount = tokenInAmount.multipliedBy(new BigNumber(10).pow(6));
  tezSupply = tezSupply.multipliedBy(new BigNumber(10).pow(6));
  ctezSupply = ctezSupply.multipliedBy(new BigNumber(10).pow(6));
  try {
    if (tokenIn === 'CTez') {
      const dy = newton_dx_to_dy(
        target.multipliedBy(ctezSupply),
        tezSupply.multipliedBy(new BigNumber(2).pow(48)),
        tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(target),
        5
      ).dividedBy(new BigNumber(2).pow(48));
      let fee = dy.dividedBy(pairFeeDenom);
      let tokenOut = dy;
      let slippageNumerator = new BigNumber(slippage.split("/")[0]);
      let slippageDenominator = new BigNumber(slippage.split("/")[1]);
      slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
      slippageDenominator = new BigNumber(100);
      let minOut = tokenOut.minus(
        tokenOut.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
      );
      minOut = minOut.dividedBy(new BigNumber(10).pow(6));
      const exchangeRate = tokenOut.dividedBy(tokenInAmount);

      const updatedCtezSupply = ctezSupply.plus(tokenInAmount);
      const updatedTezSupply = tezSupply.minus(tokenOut);

      const nextDy = newton_dx_to_dy(
        target.multipliedBy(updatedCtezSupply),
        updatedTezSupply.multipliedBy(new BigNumber(2).pow(48)),
        tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(target),
        5
      ).dividedBy(new BigNumber(2).pow(48));

      const nextFee = nextDy.dividedBy(pairFeeDenom);
      const nextTokenOut = nextDy.minus(nextFee);
      let priceImpact = tokenOut.minus(nextTokenOut).dividedBy(tokenOut);
      priceImpact = priceImpact.multipliedBy(100);
      priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
      const tokenOutAmount = new BigNumber(tokenOut.dividedBy(new BigNumber(10).pow(6)).decimalPlaces(6, 1));
      const fees = fee.dividedBy(new BigNumber(10).pow(6));
      const minimumOut = new BigNumber(minOut.decimalPlaces(6, 1));

      return {
        tokenOutAmount,
        fees,
        feePerc,
        minimumOut,
        exchangeRate,
        priceImpact,
      };
    } else if (tokenIn === 'XTZ') {
      const dy = newton_dx_to_dy(
        tezSupply.multipliedBy(new BigNumber(2).pow(48)),
        target.multipliedBy(ctezSupply),
        tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(new BigNumber(2).pow(48)),
        5
      ).dividedBy(target);
      let fee = dy.dividedBy(pairFeeDenom);
      let tokenOut = dy;
      let slippageNumerator = new BigNumber(slippage.split("/")[0]);
      let slippageDenominator = new BigNumber(slippage.split("/")[1]);
      slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
      slippageDenominator = new BigNumber(100);
      let minOut = tokenOut.minus(
        tokenOut.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
      );
      minOut = minOut.dividedBy(new BigNumber(10).pow(6));
      const exchangeRate = tokenOut.dividedBy(tokenInAmount);

      const updatedCtezSupply = ctezSupply.minus(tokenOut);
      const updatedTezSupply = tezSupply.plus(tokenInAmount);

      const nextDy = newton_dx_to_dy(
        updatedTezSupply.multipliedBy(new BigNumber(2).pow(48)),
        target.multipliedBy(updatedCtezSupply),
        tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(new BigNumber(2).pow(48)),
        5
      ).dividedBy(target);
      const nextFee = nextDy.dividedBy(pairFeeDenom);
      const nextTokenOut = nextDy.minus(nextFee);
      let priceImpact = tokenOut.minus(nextTokenOut).dividedBy(tokenOut);
      priceImpact = priceImpact.multipliedBy(100);
      priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
      const tokenOutAmount = new BigNumber(tokenOut.dividedBy(new BigNumber(10).pow(6)).decimalPlaces(6, 1));
      const fees = fee.dividedBy(new BigNumber(10).pow(6));
      const minimumOut = new BigNumber(minOut.decimalPlaces(6, 1));
      return {
        tokenOutAmount,
        fees,
        feePerc,
        minimumOut,
        exchangeRate,
        priceImpact,
      };
    }
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};

export const calculateTokensInGeneralStable = (
  tokenInSupply: BigNumber,
  tokenOutSupply: BigNumber,
  tokenInAmount: BigNumber,
  Exchangefee: BigNumber,
  slippage: string = "1/100",
  tokenIn: IConfigToken,
  tokenOut: IConfigToken,
  tokenInPrecision: BigNumber,
  tokenOutPrecision: BigNumber
): ICalculateTokenResponse => {
  const feePerc = new BigNumber(100).dividedBy(Exchangefee);

  tokenInAmount = tokenInAmount.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
  tokenInSupply = tokenInSupply.multipliedBy(new BigNumber(10).pow(tokenIn.decimals));
  tokenOutSupply = tokenOutSupply.multipliedBy(new BigNumber(10).pow(tokenOut.decimals));

  try {
    tokenInSupply = tokenInSupply.multipliedBy(tokenInPrecision);
    tokenOutSupply = tokenOutSupply.multipliedBy(tokenOutPrecision);

    const dy = newton_dx_to_dy(
      tokenInSupply,
      tokenOutSupply,
      tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(tokenInPrecision),
      5
    );

    let fee = dy.dividedBy(Exchangefee);
    let tokenOutAmt = dy.dividedBy(tokenOutPrecision);

    let slippageNumerator = new BigNumber(slippage.split("/")[0]);
    let slippageDenominator = new BigNumber(slippage.split("/")[1]);
    slippageNumerator = slippageNumerator.multipliedBy(100).dividedBy(slippageDenominator);
    slippageDenominator = new BigNumber(100);
    let minOut = tokenOutAmt.minus(
      tokenOutAmt.multipliedBy(slippageNumerator).dividedBy(slippageDenominator)
    );
    minOut = minOut.dividedBy(new BigNumber(10).pow(tokenOut.decimals));

    const updatedTokenInPool = tokenInSupply.plus(tokenInAmount);
    const updatedTokenOutPool = tokenOutSupply.minus(tokenOutAmt);

    const nextDy = newton_dx_to_dy(
      updatedTokenInPool,
      updatedTokenOutPool,
      tokenInAmount.multipliedBy(new BigNumber(1000).dividedBy(999)).multipliedBy(tokenInPrecision),
      5
    );
    const nextFee = nextDy.dividedBy(Exchangefee);
    const nextTokenOut = nextDy.minus(nextFee).dividedBy(tokenOutPrecision);
    let priceImpact = tokenOutAmt.minus(nextTokenOut).dividedBy(tokenOutAmt);
    priceImpact = priceImpact.multipliedBy(100);
    priceImpact = new BigNumber(Math.abs(Number(priceImpact)));
    tokenOutAmt = tokenOutAmt.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    fee = fee.dividedBy(tokenOutPrecision);
    fee = fee.dividedBy(new BigNumber(10).pow(tokenOut.decimals));
    const tokenOutAmount = new BigNumber(tokenOutAmt.decimalPlaces(tokenOut.decimals, 1));
    const minimumOut = new BigNumber(minOut.decimalPlaces(tokenOut.decimals, 1));
    const fees = fee;
    const exchangeRate = tokenOutAmount.dividedBy(
      tokenInAmount.dividedBy(new BigNumber(10).pow(tokenIn.decimals))
    );

    return {
      tokenOutAmount,
      fees,
      feePerc,
      minimumOut,
      exchangeRate,
      priceImpact,
    };
  } catch (error) {
    return {
      tokenOutAmount: new BigNumber(0),
      fees: new BigNumber(0),
      feePerc: new BigNumber(0),
      minimumOut: new BigNumber(0),
      exchangeRate: new BigNumber(0),
      priceImpact: new BigNumber(0),
      error,
    };
  }
};


const newton_dx_to_dy = (
  x: BigNumber,
  y: BigNumber,
  dx: BigNumber,
  rounds: number
): BigNumber => {
  const utility = util(x, y);
  const u = utility.first;
  const dy = newton(x, y, dx, new BigNumber(0), u, rounds);
  return dy;
};

const util = (
  x: BigNumber,
  y: BigNumber
): { first: BigNumber; second: BigNumber } => {
  const plus = x.plus(y);
  const minus = x.minus(y);
  const plus2 = plus.multipliedBy(plus);
  const plus4 = plus2.multipliedBy(plus2);
  const plus8 = plus4.multipliedBy(plus4);
  const plus7 = plus4.multipliedBy(plus2).multipliedBy(plus);
  const minus2 = minus.multipliedBy(minus);
  const minus4 = minus2.multipliedBy(minus2);
  const minus8 = minus4.multipliedBy(minus4);
  const minus7 = minus4.multipliedBy(minus2).multipliedBy(minus);
  return {
    first: plus8.minus(minus8),
    second: new BigNumber(8).multipliedBy(minus7.plus(plus7)),
  };
};

const newton = (
  x: BigNumber,
  y: BigNumber,
  dx: BigNumber,
  dy: BigNumber,
  u: BigNumber,
  n: number
): BigNumber => {
  let dy1 = dy;
  let newUtil = util(x.plus(dx), y.minus(dy));
  let newU = newUtil.first;
  let newDuDy = newUtil.second;
  while (n !== 0) {
    newUtil = util(x.plus(dx), y.minus(dy1));
    newU = newUtil.first;
    newDuDy = newUtil.second;
    dy1 = dy1.plus(newU.minus(u).dividedBy(newDuDy));
    n = n - 1;
  }
  return dy1;
};
