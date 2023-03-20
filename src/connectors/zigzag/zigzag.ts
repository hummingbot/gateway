// import {BigNumber} from 'ethers';
import LRUCache from 'lru-cache';
import { ZigZagConfig } from './zigzag.config';
import axios from 'axios';
import { Ethereum } from '../../chains/ethereum/ethereum';

// https://api.arbitrum.zigzag.exchange/v1/info

// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/pairs/42161
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/tickers/42161
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/orderbook/42161/?ticker_id=eth-ust
// https://zigzag-exchange.herokuapp.com/api/coingecko/v1/historical_trades/42161?ticker_id=eth-ust&type=b
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

export async function getOrderBook(
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

export function getPossibleRoutes(
  markets: Array<string>,
  sellToken: Token,
  buyToken: Token
): RouteMarket[][] {
  let newRoute: RouteMarket[][] = [];
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

// function estimate(sellAmount: BigNumber, buyAmount: BigNumber) {
//   let newQuoteOrderArray: ZZOrder[] = [];
//   let newSwapPrice: number = 0;
//   let bestSwapRoute: RouteMarket[] = [];
// }

export class ZigZag {
  private static _instances: LRUCache<string, ZigZag>;
  private _ready = false;
  private _chain: Ethereum;
  private tokenList: Record<string, Token> = {};
  public config;
  public parsedMarkets: Record<string, Market> = {};

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
      if (info.status === 200) {
        for (const token of info.data['verifiedTokens']) {
          this.tokenList[token.address] = token;
        }
      }

      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  // public getTokenByAddress(address: string): Token {
  //   return this.tokenList[address];
  // }

  // public getTokenInfo(token: string) {

  //   // https://api.zksync.io/api/v0.2/tokens/USDC
  //   // https://api.zksync.io/api/v0.2/tokens/WETH

  //   // const tokenInfo = await axios.get(`https://api.zksync.io/api/v0.2/tokens/${token}`);
  //   // // id, address, symbol, decimals
  //   // const priceInfo = await axios.get(
  //   //         `https://api.zksync.io/api/v0.2/tokens/${token}/priceIn/usd`
  //   // );

  //   // // 0xf4037f59c92c9893c43c2372286699430310cfe7

  //   // console.log(tokenInfo);
  //   // console.log(priceInfo);
  // }

  // async estimateSellTrade(
  //   baseToken: string,
  //   quoteToken: string,
  //   amount: BigNumber,
  //   allowedSlippage?: string
  // ) {

  //   // check if market is active

  // }

  // public async markets(
  //   req
  // ) {
  //   if (req.market && req.market.split('-').length === 2) {
  //     return { markets: this.markets[req.market] };
  //   }
  //   return { markets: this.markets };
  // }
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
