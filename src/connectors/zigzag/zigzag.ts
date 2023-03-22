import { BigNumber } from 'ethers';
import { ethers } from 'ethers';
import LRUCache from 'lru-cache';
import { ZigZagConfig } from './zigzag.config';
import axios from 'axios';
import { Ethereum } from '../../chains/ethereum/ethereum';

// https://api.arbitrum.zigzag.exchange/v1/info

// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/pairs/42161
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/tickers/42161
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/orderbook/42161/?ticker_id=eth-ust
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/historical_trades/42161?ticker_id=eth-ust&type=b

export type ZigZagMarket = {
  buyToken: string;
  sellToken: string;
  verified: boolean;
};

// export type EIP712DomainInfo = {
//   name: string;
//   version: string;
//   chainId: string;
//   verifyingContract: string;
// };

// export type EIP712TypeInfo = {
//   Order: { name: string; type: string }[];
// };

export type ZigZagToken = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
};

export type ZigZagInfo = {
  markets: Array<ZigZagMarket>;
  verifiedTokens: Array<ZigZagToken>;
  exchange: {
    exchangeAddress: string;
    makerVolumeFee: number;
    takerVolumeFee: number;
    // domain: EIP712DomainInfo;
    // types: EIP712TypeInfo;
  };
};

export interface Market {
  market: string;
  baseSymbol: string;
  quoteSymbol: string;
  lastPrice: number;
  lowestAsk: number;
  highestBid: number;
  baseVolume: number;
  quoteVolume: number;
  priceChange: number;
  priceChangePercent_24h: number;
  highestPrice_24h: number;
  lowestPrice_24h: number;
  numberOfTrades_24h: number;
}

export type RouteMarket = {
  buyTokenAddress: string;
  sellTokenAddress: string;
};

export type ZigZagOrder = {
  order: {
    user: string;
    buyToken: string;
    sellToken: string;
    buyAmount: string;
    sellAmount: string;
    expirationTimeSeconds: string;
  };
  signature: string;
};

export class ZigZag {
  private static _instances: LRUCache<string, ZigZag>;
  private _ready = false;
  private _chain: Ethereum;
  private tokenList: Record<string, ZigZagToken> = {}; // keep track of tokens that are in a ZigZag market
  // public markets: Array<string> = []; // keep track of ZigZag markets, ZZ-USDT
  public markets: Array<string> = []; // keep track of ZigZag markets, 0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9-0xf4037f59c92c9893c43c2372286699430310cfe7
  public config;

  public makerFee = 0.0;
  public takerFee = 0.0;

  private constructor(_chain: string, network: string) {
    this._chain = Ethereum.getInstance(network);
    this.config = ZigZagConfig.config;
  }

  public static getInstance(chain: string, network: string): ZigZag {
    if (ZigZag._instances === undefined) {
      ZigZag._instances = new LRUCache<string, ZigZag>({
        max: 2,
      });
    }
    const instanceKey = chain + network;
    if (!ZigZag._instances.has(instanceKey)) {
      ZigZag._instances.set(instanceKey, new ZigZag(chain, network));
    }

    return ZigZag._instances.get(instanceKey) as ZigZag;
  }

  // public async loadMarkets() {
  //   this.parsedMarkets = await axios.get(
  //     'https://zigzag-exchange.herokuapp.com/api/v1/markets'
  //   );
  // }

  public async init() {
    if (!this._chain.ready()) {
      await this._chain.init();
      const response = await axios.get(
        'https://api.arbitrum.zigzag.exchange/v1/info'
      );
      if (response.status === 200) {
        const zigZagData: ZigZagInfo = response.data;
        for (const token of zigZagData.verifiedTokens) {
          this.tokenList[token.address] = token;
        }
        for (const market of zigZagData.markets) {
          const base = this.tokenList[market.buyToken];
          const quote = this.tokenList[market.sellToken];
          // this.markets.push(base.symbol + '-' + quote.symbol);
          this.markets.push(base.address + '-' + quote.address);
        }
        this.makerFee = zigZagData.exchange.makerVolumeFee;
        this.takerFee = zigZagData.exchange.takerVolumeFee;
      }

      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  public async getMarketOrders(
    buyTokenAddress: string,
    sellTokenAddress: string,
    minExpires: string
  ): Promise<Array<ZigZagOrder>> {
    const response = await axios.get(
      `https://api.arbitrum.zigzag.exchange/v1/orders?buyToken=${buyTokenAddress}&sellToken=${sellTokenAddress}&minExpires=${minExpires}`
    );

    return response.data.orders;
  }

  // For an array of possible routes, get recent orders for the corresponding markets
  public async getOrderBook(
    possibleRoutes: Array<Array<RouteMarket>>
  ): Promise<{ [key: string]: Array<ZigZagOrder> }> {
    const minExpires = (Date.now() / 1000 + 11).toFixed(0);
    const minTimeStamp: number = Date.now() / 1000 + 10;
    const newOrderBook: { [key: string]: Array<ZigZagOrder> } = {};

    const promise0 = possibleRoutes.map(async (routes: Array<RouteMarket>) => {
      const promise1 = routes.map(async (market: RouteMarket) => {
        const requestSellTokenAddress = market.sellTokenAddress;
        const requestBuyTokenAddress = market.buyTokenAddress;
        const orders = await this.getMarketOrders(
          requestBuyTokenAddress,
          requestSellTokenAddress,
          minExpires
        );
        const goodOrders = orders.filter(
          (order: ZigZagOrder) =>
            minTimeStamp < Number(order.order.expirationTimeSeconds)
        );
        const key = `${requestBuyTokenAddress}-${requestSellTokenAddress}`;
        newOrderBook[key] = goodOrders;
      });
      await Promise.all(promise1);
    });
    await Promise.all(promise0);

    return newOrderBook;
  }

  // if a direct market between two pairs exists, use it. Otherwise generate
  // routes using stable coins.
  public getPossibleRoutes(
    sellToken: ZigZagToken,
    buyToken: ZigZagToken
  ): Array<Array<RouteMarket>> {
    let newRoute: Array<Array<RouteMarket>> = [];
    const tradeMarket = `${sellToken.address}-${buyToken.address}`;

    // check for a direct route between pairs, if this exists, use it.
    if (this.markets.includes(tradeMarket)) {
      newRoute.push([
        {
          buyTokenAddress: sellToken.address,
          sellTokenAddress: buyToken.address,
        },
      ]);
    }

    // check routes via other tokens
    if (newRoute.length === 0) {
      const possibleRoutes = [
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
      ];
      possibleRoutes.forEach((routeTokenAddress) => {
        const firstTradeMarket = `${sellToken.address}-${routeTokenAddress}`;
        const secondTradeMarket = `${routeTokenAddress}-${buyToken.address}`;
        if (
          this.markets.includes(firstTradeMarket) &&
          this.markets.includes(secondTradeMarket)
        ) {
          newRoute.push([
            {
              buyTokenAddress: sellToken.address,
              sellTokenAddress: routeTokenAddress,
            },
            {
              buyTokenAddress: routeTokenAddress,
              sellTokenAddress: buyToken.address,
            },
          ]);
        }
      });
    }

    return newRoute;
  }

  // estimate trade details between two tokens
  public async estimate(
    sellToken: ZigZagToken,
    buyToken: ZigZagToken,
    sellAmount: BigNumber,
    buyAmount: BigNumber,
    side: string
  ) {
    let newQuoteOrderArray: Array<ZigZagOrder> = [];
    let newSwapPrice: number = 0;
    let bestSwapRoute: Array<RouteMarket> = [];

    const possibleRoutes = this.getPossibleRoutes(sellToken, buyToken);
    const orderBook = await this.getOrderBook(possibleRoutes);

    possibleRoutes.forEach((route: Array<RouteMarket>) => {
      let routeSwapPrice = 0;
      const routeQuoteOrderArray: Array<ZigZagOrder> = [];
      let stepBuyAmount = buyAmount;
      route.forEach((market: RouteMarket) => {
        let marketSwapPrice = 0;
        let marketQuoteOrder: ZigZagOrder | undefined;
        const key = `${market.buyTokenAddress}-${market.sellTokenAddress}`;
        const currentOrderBook = orderBook[key];

        for (let i = 0; i < currentOrderBook.length; i++) {
          const { order } = currentOrderBook[i];

          const quoteSellAmount = ethers.BigNumber.from(order.sellAmount);
          const quoteBuyAmount = ethers.BigNumber.from(order.buyAmount);
          // if (userInputSide === "buy" && quoteSellAmount.lt(stepBuyAmount)) return

          const quoteSellTokenInfo = this.tokenList[order.sellToken];
          const quoteBuyTokenInfo = this.tokenList[order.buyToken];

          const quoteSellAmountFormated = Number(
            ethers.utils.formatUnits(
              quoteSellAmount,
              quoteSellTokenInfo.decimals
            )
          );
          const quoteBuyAmountFormated = Number(
            ethers.utils.formatUnits(quoteBuyAmount, quoteBuyTokenInfo.decimals)
          );

          // setMakerFee(result.exchange.makerVolumeFee)
          // setTakerFee(result.exchange.takerVolumeFee)

          const thisPrice =
            (quoteSellAmountFormated * (1 - this.takerFee)) /
            (quoteBuyAmountFormated * (1 - this.makerFee));
          if (thisPrice > marketSwapPrice) {
            marketSwapPrice = thisPrice;
            marketQuoteOrder = currentOrderBook[i];
          }
        }
        routeSwapPrice = routeSwapPrice
          ? routeSwapPrice * marketSwapPrice
          : marketSwapPrice;
        if (marketQuoteOrder) {
          routeQuoteOrderArray.push(marketQuoteOrder);
          stepBuyAmount
            .mul(marketQuoteOrder.order.buyAmount)
            .div(marketQuoteOrder.order.sellAmount);
        }
      });

      if (routeSwapPrice > newSwapPrice) {
        newSwapPrice = routeSwapPrice;
        newQuoteOrderArray = routeQuoteOrderArray;
        bestSwapRoute = route;
      }
    });

    let newBuyAmount: BigNumber;
    let newSellAmount: BigNumber;
    if (side === 'buy') {
      newBuyAmount = buyAmount;
      newSellAmount = newBuyAmount;

      newQuoteOrderArray.forEach((quoteOrder: ZigZagOrder) => {
        const quoteSellAmount = ethers.BigNumber.from(
          quoteOrder.order.sellAmount
        );
        const quoteBuyAmount = ethers.BigNumber.from(
          quoteOrder.order.buyAmount
        );

        newSellAmount = newSellAmount.mul(quoteBuyAmount).div(quoteSellAmount);
      });

      // if (newSellAmount.eq(0)) {
      //   setSellInput("")
      // } else {
      //   const newSellAmountFormated = ethers.utils.formatUnits(newSellAmount, sellTokenInfo.decimals)
      //   setSellInput(prettyBalance(newSellAmountFormated))
      // }
    } else {
      newSellAmount = sellAmount;
      newBuyAmount = newSellAmount;
      newQuoteOrderArray.forEach((quoteOrder: ZigZagOrder) => {
        const quoteSellAmount = ethers.BigNumber.from(
          quoteOrder.order.sellAmount
        );
        const quoteBuyAmount = ethers.BigNumber.from(
          quoteOrder.order.buyAmount
        );

        newBuyAmount = newBuyAmount.mul(quoteSellAmount).div(quoteBuyAmount);
      });

      // if (newBuyAmount.eq(0)) {
      //   setBuyInput("")
      // } else {
      //   const newBuyAmountFormated = ethers.utils.formatUnits(newBuyAmount, buyTokenInfo.decimals)
      //   setBuyInput(prettyBalance(newBuyAmountFormated))
      // }
    }

    return {
      bestSwapRoute,
      newSwapPrice,
      newQuoteOrderArray,
      buyAmount: newBuyAmount,
      sellAmount: newSellAmount,
    };
  }
}
// https://github.com/ZigZagExchange/backend/blob/master/README.md
// All messages the Zigzag Websocket API have the following structure
// https://github.com/ZigZagExchange/backend/blob/master/README.md#zigzag-endpoints
// { "op": "operation", "args": ["list", "of", "args"] }
// submitorder3, requestquote, orderreceiptreq, refreshliquidity, dailyvolumereq, marketsreq
// curl -X POST "https://zigzag-exchange.herokuapp.com/" --header "Content-Type: application/json" -d '{"op":"requestquote", "args": [1, "ETH-USDT", "b", "0.232"]}'

// curl -X POST "https://zigzag-exchange.herokuapp.com/" --header "Content-Type: application/json" -d '{"op":"requestquote", "args": [42161, "ETH-USDT", "b", "0.232"]}'

// curl -X POST "https://zigzag-exchange.herokuapp.com/" --header "Content-Type: application/json" -d '{"op":"requestquote", "args": [1002, "ETH-USDT", "b", "0.232"]}'

// curl -X GET "https://zigzag-exchange.herokuapp.com/api/v1/markets/1" --header "Content-Type: application/json"

//  /api/v1/ticker/:chainId?
//  /api/v1/orderbook/:market/:chainId?

// submit order

// https://github.com/ZigZagExchange/frontend/blob/67cbf733af636dda81a37a3f3db3ae84aa2e3cbb/src/lib/api/providers/APIStarknetProvider.js#L25

/*

        const { symbol } = (
          await axios.get(`https://api.zksync.io/api/v0.2/tokens/${assetId}`)
        ).data.result;
        const { price: apiPrice } = (
          await axios.get(
            `https://api.zksync.io/api/v0.2/tokens/${assetId}/priceIn/usd`
          )
        ).data.result;


                      zigZagChainId === 1
                        ? "https://zkscan.io/explorer/tokens"
                        : "https://rinkeby.zkscan.io/explorer/tokens"

https://swap.zigzag.exchange/

GET
	https://api.arbitrum.zigzag.exchange/v1/info


*/

/*

  changePubKeyFee = async (currency = "USDC") => {
    const { data } = await axios.post(
      this.getZkSyncBaseUrl(this.network) + "/fee",
      {
        txType: { ChangePubKey: "ECDSA" },
        address: "0x5364ff0cecb1d44efd9e4c7e4fe16bf5774530e3",
        tokenLike: currency,
      },
      { headers: { "Content-Type": "application/json" } }
    );
    // somehow the fee is ~50% too low
    if (currency === "USDC") return (data.result.totalFee / 10 ** 6) * 2;
    else return (data.result.totalFee / 10 ** 18) * 2;
  };

*/
