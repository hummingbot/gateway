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

// export interface Market {
//   market: string;
//   baseSymbol: string;
//   quoteSymbol: string;
//   lastPrice: number;
//   lowestAsk: number;
//   highestBid: number;
//   baseVolume: number;
//   quoteVolume: number;
//   priceChange: number;
//   priceChangePercent_24h: number;
//   highestPrice_24h: number;
//   lowestPrice_24h: number;
//   numberOfTrades_24h: number;
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
      'https://zigzag-exchange.herokuapp.com/api/v1/markets/1'
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

  public getTokenByAddress(address: string): Token {
    return this.tokenList[address];
  }
  
  public getTokenInfo(tokenSymbol: string) {

    // https://api.zksync.io/api/v0.2/tokens/USDC
    // https://api.zksync.io/api/v0.2/tokens/WETH
    
    const tokenInfo = await axios.get(`https://api.zksync.io/api/v0.2/tokens/${token}`);
    const priceInfo = await axios.get(
            `https://api.zksync.io/api/v0.2/tokens/${token}/priceIn/usd`
    );

    0xf4037f59c92c9893c43c2372286699430310cfe7

    console.log(tokenInfo);
    console.log(priceInfo);
  }

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
