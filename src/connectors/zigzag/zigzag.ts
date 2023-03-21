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

export type ZZMarketInfo = {
  buyToken: string;
  sellToken: string;
  verified: boolean;
};

export type EIP712DomainInfo = {
  name: string;
  version: string;
  chainId: string;
  verifyingContract: string;
};

export type EIP712TypeInfo = {
  Order: { name: string; type: string }[];
};

export type ZZTokenInfo = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
};

export type ZZInfoMsg = {
  markets: ZZMarketInfo[];
  verifiedTokens: ZZTokenInfo[];
  exchange: {
    exchangeAddress: string;
    makerVolumeFee: number;
    takerVolumeFee: number;
    domain: EIP712DomainInfo;
    types: EIP712TypeInfo;
  };
};

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

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

export type ZZOrder = {
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

// const parsedMarkets = [
//   `${ethers.constants.AddressZero}-${network.wethContractAddress}`,
//   `${network.wethContractAddress}-${ethers.constants.AddressZero}`
// ]

// const response = await fetch(`${network.backendUrl}/v1/info`)
// if (response.status !== 200) {
//   console.error("fetchMarketsInfo: Failed to fetch market info.")
//   return
// }

// result = await response.json()
// result.markets.forEach(market => {
//   if (!market.verified) return

//   const parsedBuyToken = market.buyToken.toLowerCase()
//   const parsedSellToken = market.sellToken.toLowerCase()
//   parsedMarkets.push(`${parsedBuyToken}-${parsedSellToken}`)

//   // add ETH version of market
//   if (network.wethContractAddress === parsedBuyToken) {
//     parsedMarkets.push(`${ethers.constants.AddressZero}-${parsedSellToken}`)
//   } else if (network.wethContractAddress === parsedSellToken) {
//     parsedMarkets.push(`${parsedBuyToken}-${ethers.constants.AddressZero}`)
//   }
// })

// if (network.wethContractAddress) {
//   // add wrap/unwrap
//   parsedMarkets.push(`${ethers.constants.AddressZero}-${network.wethContractAddress}`)
//   parsedMarkets.push(`${network.wethContractAddress}-${ethers.constants.AddressZero}`)
// }

export class ZigZag {
  private static _instances: LRUCache<string, ZigZag>;
  private _ready = false;
  private _chain: Ethereum;
  private tokenList: Record<string, Token> = {};
  public config;
  public parsedMarkets: Record<string, Market> = {};
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

  public async loadMarkets() {
    this.parsedMarkets = await axios.get(
      'https://zigzag-exchange.herokuapp.com/api/v1/markets'
    );
  }

  public async init() {
    if (!this._chain.ready()) {
      await this._chain.init();
      const info = await axios.get(
        'https://api.arbitrum.zigzag.exchange/v1/info'
      );
      // ZZInfoMsg
      if (info.status === 200) {
        for (const token of info.data['verifiedTokens']) {
          this.tokenList[token.address] = token;
        }
        this.makerFee = info.data.exchange.makerVolumeFee;
        this.takerFee = info.data.exchange.takerVolumeFee;
      }

      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  public async getOrderBook(
    possibleRoutes: RouteMarket[][]
  ): Promise<{ [key: string]: ZZOrder[] }> {
    const minExpires = (Date.now() / 1000 + 11).toFixed(0);
    const minTimeStamp: number = Date.now() / 1000 + 10;
    let orders: { orders: ZZOrder[] };
    const newOrderBook: { [key: string]: ZZOrder[] } = {};

    const promise0 = possibleRoutes.map(async (routes: RouteMarket[]) => {
      const promise1 = routes.map(async (market: RouteMarket) => {
        const requestSellTokenAddress = market.sellTokenAddress;
        const requestBuyTokenAddress = market.buyTokenAddress;
        const response = await fetch(
          `https://zigzag-exchange.herokuapp.com/v1/orders?buyToken=${requestBuyTokenAddress}&sellToken=${requestSellTokenAddress}&minExpires=${minExpires}`
        );

        orders = await response.json();
        const goodOrders = orders.orders.filter(
          (o: ZZOrder) => minTimeStamp < Number(o.order.expirationTimeSeconds)
        );
        const key = `${requestBuyTokenAddress}-${requestSellTokenAddress}`;
        newOrderBook[key] = goodOrders;
      });
      await Promise.all(promise1);
    });
    await Promise.all(promise0);

    return newOrderBook;
  }

  public getPossibleRoutes(
    markets: Array<string>,
    sellToken: Token,
    buyToken: Token
  ): Array<Array<RouteMarket>> {
    let newRoute: Array<Array<RouteMarket>> = [];
    const tradeMarket = `${sellToken.address}-${buyToken.address}`;

    if (markets.includes(tradeMarket)) {
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
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // weth
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // usdc
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // usdt
      ];
      possibleRoutes.forEach((routeTokenAddress) => {
        const firstTradeMarket = `${sellToken.address}-${routeTokenAddress}`;
        const secondTradeMarket = `${routeTokenAddress}-${buyToken.address}`;
        if (
          markets.includes(firstTradeMarket) &&
          markets.includes(secondTradeMarket)
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

  public async estimate(
    markets: Array<string>,
    sellToken: Token,
    buyToken: Token,
    sellAmount: BigNumber,
    buyAmount: BigNumber,
    side: string
  ) {
    let newQuoteOrderArray: ZZOrder[] = [];
    let newSwapPrice: number = 0;
    let bestSwapRoute: RouteMarket[] = [];
    // const minTimeStamp: number = Date.now() / 1000 + 5;

    const possibleRoutes = this.getPossibleRoutes(markets, sellToken, buyToken);
    const orderBook = await this.getOrderBook(possibleRoutes);

    possibleRoutes.forEach((route: RouteMarket[]) => {
      let routeSwapPrice = 0;
      const routeQuoteOrderArray: ZZOrder[] = [];
      let stepBuyAmount = buyAmount;
      route.forEach((market: RouteMarket) => {
        let marketSwapPrice = 0;
        let marketQuoteOrder: ZZOrder | undefined;
        const key = `${market.buyTokenAddress}-${market.sellTokenAddress}`;
        const currentOrderBook = orderBook[key];
        // if (!currentOrderBook) return

        for (let i = 0; i < currentOrderBook.length; i++) {
          const { order } = currentOrderBook[i];
          // if (minTimeStamp > Number(order.expirationTimeSeconds)) return

          const quoteSellAmount = ethers.BigNumber.from(order.sellAmount);
          const quoteBuyAmount = ethers.BigNumber.from(order.buyAmount);
          // if (userInputSide === "buy" && quoteSellAmount.lt(stepBuyAmount)) return

          const quoteSellTokenInfo = this.tokenList[order.sellToken];
          const quoteBuyTokenInfo = this.tokenList[order.buyToken];
          // if (!quoteSellTokenInfo || !quoteBuyTokenInfo) return
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

      newQuoteOrderArray.forEach((quoteOrder: ZZOrder) => {
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
      newQuoteOrderArray.forEach((quoteOrder: ZZOrder) => {
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
