import { SwapInfo, SwapType } from "@balancer-labs/sdk";
import { Currency, Price } from "@sushiswap/sdk";

export class Trade {
  swapInfo: SwapInfo;
  executionPrice: Price<Currency, Currency>;
  swapType: SwapType;

  constructor(
    swapInfo: SwapInfo,
    executionPrice: Price<Currency, Currency>,
    swapType: SwapType
  ) {
    this.swapInfo = swapInfo;
    this.executionPrice = executionPrice;
    this.swapType = swapType;
  }
}
