import { GladiusOrder, GladiusOrderBuilder, NonceManager, PERMIT2_MAPPING } from '@rubicondefi/gladius-sdk';
import { Ethereum } from '../../chains/ethereum/ethereum';
import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderResponse,
} from '../../clob/clob.requests';
import {
  CLOBish,
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
  PriceLevel,
} from '../../services/common-interfaces';
import { Network, RubiconCLOBConfig, tokenList } from './rubicon.config';
import { BigNumber, providers } from 'ethers';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import axios, { AxiosError } from 'axios';
import { isFractionString } from '../../services/validators';
import { percentRegexp } from '../../services/config-manager-v2';

export enum ORDER_STATUS {
  OPEN = 'open',
  EXPIRED = 'expired',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  FILLED = 'filled',
  INSUFFICIENT_FUNDS = 'insufficient-funds',
}

export type OrderInput = {
  token: string;
  startAmount: string;
  endAmount: string;
};

export type OrderOutput = {
  token: string;
  startAmount: string;
  endAmount: string;
  recipient?: string;
};

export type SettledAmount = {
  tokenOut?: string;
  amountOut?: string;
  tokenIn?: string;
  amountIn?: string;
};

export enum OrderType {
  Dutch = "Dutch"
}

export type Fill = {
  outputToken: string;
  inputToken: string;
  outputAmount: string;
  inputAmount: string;
  timestamp: string;
}

export type OrderEntity = {
  type: OrderType;
  encodedOrder: string;
  signature: string;
  orderHash: string;
  orderStatus: ORDER_STATUS;
  chainId: number;
  deadline: number;
  input: OrderInput;
  outputs: OrderOutput[];
  createdAt: number;
  price: number;
  // Filler field is defined when the order has been filled and the status tracking function has recorded the filler address.
  filler?: string;
  // QuoteId field is defined when the order has a quote associated with it.
  quoteId?: string;
  // TxHash field is defined when the order has been filled and there is a txHash associated with the fill.
  txHash?: string;
  // SettledAmount field is defined when the order has been filled and the fill amounts have been recorded.
  settledAmounts?: SettledAmount[];
};

const NETWORK_INFO: Record<number, any> = {
  [Network.OPTIMISM_MAINNET]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Optimism_V2',
  [Network.ARBITRUM_MAINNET]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Arbitrum_V2',
  [Network.MAINNET]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Ethereum_V2',
  //Base Mainnet
  [Network.BASE_MAINNET]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Base_V2',
};

// const configManager = ConfigManagerV2.getInstance();

export class RubiconCLOB implements CLOBish {
  private _chain;
  private _ready: boolean = false;
  public parsedMarkets: MarketInfo = {};
  private static _instances: { [name: string]: RubiconCLOB };
  private provider: StaticJsonRpcProvider;

  private constructor(chain: string, network: string) {
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else throw Error('Chain not supported.');

    this.provider = new providers.StaticJsonRpcProvider(this._chain.rpcUrl, this._chain.chainId);
  }

  public async loadMarkets() {
    // TODO: get all tokens in the token list
    const tokens = tokenList.tokens.filter(t => t.chainId === this._chain.chainId);

    tokens.forEach(base => {
      const quotes = tokens.filter(t => t.address !== base.address)
      quotes.forEach(quote => {
        this.parsedMarkets[`${base.symbol.toUpperCase()}-${quote.symbol.toUpperCase()}`] = {
          baseSymbol: base.symbol.toUpperCase(),
          baseDecimals: base.decimals,
          baseAddress: base.address,
          quoteSymbol: quote.symbol.toUpperCase(),
          quoteDecimals: quote.decimals,
          quoteAddress: quote.address
        }
      })
    })
  }

  public static getInstance(chain: string, network: string): RubiconCLOB {
    if (RubiconCLOB._instances === undefined) {
      RubiconCLOB._instances = {};
    }

    const key = `${chain}:${network}`;

    if (!(key in RubiconCLOB._instances)) {
      RubiconCLOB._instances[key] = new RubiconCLOB(chain, network);
    }

    return RubiconCLOB._instances[key];
  }

  public async init() {
    if (!this._chain.ready() || Object.keys(this.parsedMarkets).length === 0) {
      await this._chain.init();
      await this.loadMarkets();
      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  public async markets(
    req: ClobMarketsRequest
  ): Promise<{ markets: MarketInfo }> {
    if (req.market && req.market in this.parsedMarkets)
      return { markets: this.parsedMarkets[req.market] };
    return { markets: Object.values(this.parsedMarkets) };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    const marketInfo = this.parsedMarkets[req.market];

    const [bids, asks] = await this.getOrderBook(this._chain.chainId, marketInfo);

    const data = {
      buys: bids
        .map((element) => {
          const parsedOrder = GladiusOrder.parse(element.encodedOrder, this._chain.chainId);

          const now = Math.floor(new Date().getTime() / 1000);
          if (parsedOrder.info.deadline <= now) {
            return;
          }

          const pay = parsedOrder.info.input.endAmount;
          const buy = parsedOrder.info.outputs[0].endAmount;
          const formattedBuy = formatUnits(buy, marketInfo.baseDecimals);
          const formattedPay = formatUnits(pay, marketInfo.quoteDecimals);

          if (pay == undefined || formattedPay == '0.0' || formattedBuy == '0.0') {
            return undefined;
          }

          const price = parseFloat(formattedPay) / parseFloat(formattedBuy);

          const startingOutputAmount = parsedOrder.info.outputs[0].startAmount;
          const endingOutputAmount = parsedOrder.info.outputs[0].endAmount;
          const startTime = parsedOrder.info.decayStartTime;
          const endTime = parsedOrder.info.decayEndTime;
          const rawInputAmount = pay;

          let out: PriceLevel = { 
            price: price.toString(),
            quantity: formattedBuy,
            timestamp: element.createdAt
          };

          if (startingOutputAmount && endingOutputAmount && startTime && endTime && rawInputAmount) {
            out = {
              ...out,
              price: this.getOrderPrice(
                price,
                false,
                rawInputAmount,
                startTime,
                endTime,
                startingOutputAmount,
                endingOutputAmount,
                Date.now() / 1000,
                marketInfo.quoteDecimals,
                marketInfo.baseDecimals,
              ).toString(),
            };
          }
          return out;
        })
        .filter(o => !!o) as PriceLevel[],
      sells: asks
        .map((element) => {

          const parsedOrder = GladiusOrder.parse(element.encodedOrder, this._chain.chainId);

          const now = Math.floor(new Date().getTime() / 1000);
          if (parsedOrder.info.deadline <= now) {
            return;
          }

          const pay = parsedOrder.info.input.endAmount;
          const buy = parsedOrder.info.outputs[0].endAmount;
          const formattedBuy = formatUnits(buy, marketInfo.quoteDecimals);
          const formattedPay = formatUnits(pay, marketInfo.baseDecimals);
          const rawInputAmount = pay;

          if (pay == undefined || formattedPay == '0.0' || formattedBuy == '0.0') {
            return undefined;
          }

          const startingOutputAmount = parsedOrder.info.outputs[0].startAmount;
          const endingOutputAmount = parsedOrder.info.outputs[0].endAmount;
          const startTime = parsedOrder.info.decayStartTime;
          const endTime = parsedOrder.info.decayEndTime;

          const price = parseFloat(formattedBuy) / parseFloat(formattedPay);
          let out: PriceLevel = {
            // quantity: pay,
            price: price.toString(),
            quantity: formattedPay,
            timestamp: element.createdAt
          };

          if (startingOutputAmount && endingOutputAmount && startTime && endTime && rawInputAmount) {
            out = {
              ...out,
              price: this.getOrderPrice(
                price,
                true,
                rawInputAmount,
                startTime,
                endTime,
                startingOutputAmount,
                endingOutputAmount,
                Date.now() / 1000,
                marketInfo.quoteDecimals,
                marketInfo.baseDecimals,
              ).toString(),
            };
          }
          return out;
        })
        .filter(o => !!o) as PriceLevel[]
    }

    return { ...data }
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {

    const marketInfo = this.parsedMarkets[req.market!]

    if (!marketInfo || !NETWORK_INFO[this._chain.chainId]) return { markets: {} }

    const json = await this.getTrades(marketInfo);

    const trades = [
      json.data.sells.map(element => { 
        const pay = BigNumber.from(element.inputAmount);
        const buy = BigNumber.from(element.outputAmount);
        const formattedPay = formatUnits(pay, marketInfo.baseDecimals);
        const formattedBuy = formatUnits(buy, marketInfo.quoteDecimals);

        if (pay == undefined || formattedPay == '0.0' || formattedBuy == '0.0') {
          return undefined;
        }

        const price = parseFloat(formattedBuy) / parseFloat(formattedPay);
        return { price, timestamp: element.timestamp }

      })[0], 
      json.data.buys.map(element => { 
        const pay = BigNumber.from(element.inputAmount);
        const buy = BigNumber.from(element.outputAmount);
        const formattedPay = formatUnits(pay, marketInfo.quoteDecimals);
        const formattedBuy = formatUnits(buy, marketInfo.baseDecimals);

        if (pay == undefined || formattedPay == '0.0' || formattedBuy == '0.0') {
          return undefined;
        }

        const price = parseFloat(formattedPay) / parseFloat(formattedBuy);
        return { price, timestamp: element.timestamp }
      })[0]
    ];

    const lastTrade = trades.sort((a,b) => {
      if (!b) return -1;
      if (!a) return 1;
      return parseInt(a.timestamp) - parseInt(b.timestamp)
    })[0]

    return { markets: { price: lastTrade?.price || 0 } };
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {

    if (!req.orderId) return { orders: [] }

    const { orders } = await this.getOrders(req.orderId)

    return { 
      orders: orders.map(o => { 
        return { 
          status: o.orderStatus,
          id: o.orderHash,
          clientId: o.orderHash,
          orderHash: o.orderHash,
        }
      }) as ClobGetOrderResponse['orders']
    }
  }

  public async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string; id: string }> {

    const marketInfo = this.parsedMarkets[req.market]
    const tokens = tokenList.tokens.filter(t => t.chainId === this._chain.chainId);
    const quote = tokens.find(t => t.address === marketInfo.quoteAddress)!;
    const token = tokens.find(t => t.address === marketInfo.baseAddress)!;
    const isBuy = req.side === 'BUY'

    const [inputToken, outputToken] = isBuy ? [quote, token] : [token, quote];
    const _deadline = Math.floor(Date.now() / 1000) + 60; // orderDuration seconds in the future...

    const nonceMgr = new NonceManager(this.provider, this._chain.chainId, PERMIT2_MAPPING[this._chain.chainId]);
    const nonce = await nonceMgr.useNonce(req.address);

    const inputAmount: BigNumber = isBuy
      ? parseUnits((parseFloat(req.amount) * parseFloat(req.price)).toFixed(quote.decimals), quote.decimals)
      : parseUnits(parseFloat(req.amount).toFixed(token.decimals), token.decimals);
    const outputAmount: BigNumber = isBuy
      ? parseUnits(parseFloat(req.amount).toFixed(token.decimals), token.decimals)
      : parseUnits((parseFloat(req.amount) * parseFloat(req.price)).toFixed(quote.decimals), quote.decimals);

    const orderBuilder = new GladiusOrderBuilder(this._chain.chainId);

    const order = orderBuilder
      .deadline(_deadline)
      .nonce(nonce)
      .swapper(req.address)
      .decayEndTime(_deadline - 1)
      .decayStartTime(Math.floor(Date.now() / 1000))
      .input({
        token: inputToken.address,
        startAmount: inputAmount,
        endAmount: inputAmount,
      })
      .output({
        token: outputToken.address,
        startAmount: outputAmount,
        endAmount: outputAmount,
        recipient: req.address,
      })
      .fillThreshold(inputAmount)
      .build()

    const serializedOrder = order.serialize();
    const signature = await this.signOrder(order, req.address)

    const payload = {
      encodedOrder: serializedOrder,
      signature,
      chainId: this._chain.chainId,
    };

    try {
      const postResponse = await this.post(payload);
      return { txHash: "", id: postResponse.data.hash };
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(error.response?.data ? error.response.data.detail : 'Trade failed: Unknown error');
      } else {
        throw error;
      }
    }
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string, id: string }> {
    try {
      await this.delete(req.address, req.orderId)
      return { txHash: "", id: req.orderId };
    } catch(error) {
      if (error instanceof AxiosError) {
        throw new Error(error.response?.data ? error.response.data.detail : 'Trade failed: Unknown error');
      } else {
        throw error;
      }
    }
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return {
      gasPrice: 0,
      gasPriceToken: "eth",
      gasLimit: 0,
      gasCost: 0,
    };
  }

  private getOrderPrice(
    givenReferencePrice: number,
    isAsk: boolean,
    inputAmount: BigNumber | undefined,
    startTime?: number,
    endTime?: number,
    startingOutputAmount?: BigNumber,
    endingOutputAmount?: BigNumber,
    currentTimestamp = Date.now() / 1000,
    quoteDecimals?: number,
    tokenDecimals?: number,
  ): number {
    if (
      !startTime ||
      !endTime ||
      !startingOutputAmount ||
      !endingOutputAmount ||
      !quoteDecimals ||
      !tokenDecimals ||
      !inputAmount
    ) {
      return givenReferencePrice;
    }
  
    if (startingOutputAmount.eq(endingOutputAmount)) return givenReferencePrice;
  
    // TODO: handle case where currentTimestamp is before startTime
    if (currentTimestamp <= startTime) {
      return !isAsk
        ? parseFloat(formatUnits(inputAmount, quoteDecimals)) /
            parseFloat(formatUnits(startingOutputAmount, tokenDecimals))
        : parseFloat(formatUnits(startingOutputAmount, tokenDecimals)) /
            parseFloat(formatUnits(inputAmount, quoteDecimals));
    }
    if (currentTimestamp >= endTime) return givenReferencePrice;
  
    const totalDuration = endTime - startTime;
    const elapsedTime = currentTimestamp - startTime;
  
    try {
      const priceChange = endingOutputAmount.sub(startingOutputAmount);
      const scaleFactor = BigNumber.from('1000000000000000000'); // 1e18 for ether scaling
      const scaledPriceChange = priceChange.mul(scaleFactor);
      const currentChange = scaledPriceChange
        .mul(BigNumber.from(Math.floor(elapsedTime)))
        .div(BigNumber.from(totalDuration))
        .div(scaleFactor);
  
      const currentOutputAmount = startingOutputAmount.add(currentChange);
      // return parseFloat(formatUnits(currentPrice, tokenDecimals));
  
      return !isAsk
        ? parseFloat(formatUnits(inputAmount, quoteDecimals)) /
            parseFloat(formatUnits(currentOutputAmount, tokenDecimals))
        : parseFloat(formatUnits(currentOutputAmount, quoteDecimals)) /
            parseFloat(formatUnits(inputAmount, tokenDecimals));
    } catch (error) {
      console.log('error in order book dutch math', error);
      return givenReferencePrice;
    }
  }

  public getAllowedSlippage(allowedSlippageStr?: string): number {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return Number((Number(fractionSplit[0]) / Number(fractionSplit[1]) * 100).toFixed(0));
    }

    const allowedSlippage = RubiconCLOBConfig.config.allowedSlippage;
    const matches = allowedSlippage.match(percentRegexp);
    if (matches) return Number((Number(matches[1]) / Number(matches[2]) * 100).toFixed(0));
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
  }

  private async getTrades(marketInfo: any) {
    const query = `{
      sells: fills(
        first: 1,
        orderBy: timestamp,
        orderDirection: desc,
        where: { inputToken: "${marketInfo.baseAddress}", outputToken: "${marketInfo.quoteAddress}"}
      ){
        inputToken
        inputAmount
        outputToken
        outputAmount
        timestamp
      }
      buys: fills(
        first: 1,
        orderBy: timestamp,
        orderDirection: desc,
        where: { inputToken: "${marketInfo.quoteAddress}", outputToken: "${marketInfo.baseAddress}"}
      ){
        inputToken
        inputAmount
        outputToken
        outputAmount
        timestamp
      }
    }`

    const response = await fetch(NETWORK_INFO[this._chain.chainId], {
      method: 'POST',

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({ query })
    })

    return await response.json() as { data: { sells: Fill[], buys: Fill[] } };
  }

  private async getOrderBook(chainId: number, marketInfo: any) {
    const asksUrl = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?chainId=${chainId}&orderStatus=${ORDER_STATUS.OPEN}&buyToken=${marketInfo.quoteAddress}&sellToken=${marketInfo.baseAddress}&limit=50`;
    const bidsUrl = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?chainId=${chainId}&orderStatus=${ORDER_STATUS.OPEN}&buyToken=${marketInfo.baseAddress}&sellToken=${marketInfo.quoteAddress}&limit=50&desc=true&sortKey=price`;

    const [asksResp, bidsResp] = await Promise.all([fetch(asksUrl), fetch(bidsUrl)]);

    const { orders: asks } = (await asksResp.json()) as { cursor?: string; orders: OrderEntity[] };
    const { orders: bids } = (await bidsResp.json()) as { cursor?: string; orders: OrderEntity[] };

    return [bids, asks];
  }

  private async signOrder(order: GladiusOrder, address: string) {
    const wallet = await this._chain.getWallet(address)
    const { domain, types, values } = order.permitData();
    return await wallet._signTypedData(domain, types, values);
  }

  private async post(payload: any) {
    return await axios({
      method: 'post',
      url: `${RubiconCLOBConfig.config.url}/dutch-auction/order`,
      data: payload,
    })
  }

  private async delete(address: string, orderId: string) {
    const wallet = await this._chain.getWallet(address)
    return await axios({
      url: `${RubiconCLOBConfig.config.url}/dutch-auction/cancel`,
      method: 'post',
      data: {
        signature: await wallet.signMessage(orderId),
        hash: orderId,
        swapper: wallet.address
      }
    })
  }

  private async getOrders(orderId: string) {
    const url = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?orderHash=${orderId}`;
    return (await (await fetch(url)).json()) as { cursor?: string; orders: OrderEntity[] };
  }
}
