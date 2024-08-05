import { GladiusOrderBuilder, NonceManager, PERMIT2_MAPPING } from '@rubicondefi/gladius-sdk';
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
} from '../../services/common-interfaces';
import { RubiconCLOBConfig, tokenList } from './rubicon.config';
import { BigNumber, providers, Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import axios from 'axios';

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

export class RubiconCLOB implements CLOBish {
  private _chain;
  private _ready: boolean = false;
  public parsedMarkets: MarketInfo = [];
  private static _instances: { [name: string]: RubiconCLOB };
  private wallet: Wallet;
  private provider: StaticJsonRpcProvider;


  private constructor(chain: string, network: string) {
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else throw Error('Chain not supported.');

    this.provider = new providers.StaticJsonRpcProvider(this._chain.rpcUrl, this._chain.chainId);
    this.wallet = new Wallet(RubiconCLOBConfig.config.pk).connect(this.provider)
  }

  public async loadMarkets() {
    // TODO: get all tokens in the token list
    const tokens = tokenList.tokens.filter(t => t.chainId === this._chain.chainId);
    const USDC = tokens.find(t => t.symbol.toUpperCase() === "USDC");
    const WETH = tokens.find(t => t.symbol.toUpperCase() === "WETH");
    const TEST = tokens.find(t => t.symbol.toUpperCase() === "TEST");

    this.parsedMarkets["WETH-USDC"] = { baseSymbol: "WETH", baseDecimals: WETH?.decimals, baseAddress: WETH?.address, quoteSymbol: "USDC", quoteDecimals: USDC?.decimals, quoteAddress: USDC?.address }
    this.parsedMarkets["TEST-USDC"] = { baseSymbol: "TEST", baseDecimals: TEST?.decimals, baseAddress: TEST?.address, quoteSymbol: "USDC", quoteDecimals: USDC?.decimals, quoteAddress: USDC?.address }
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
    const asksUrl = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?chainId=${this._chain.chainId}&orderStatus=${ORDER_STATUS.OPEN}&buyToken=${marketInfo.quoteAddress}&sellToken=${marketInfo.baseAddress}&limit=50`;
    const bidsUrl = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?chainId=${this._chain.chainId}&orderStatus=${ORDER_STATUS.OPEN}&buyToken=${marketInfo.baseAddress}&sellToken=${marketInfo.quoteAddress}&limit=50&desc=true&sortKey=price`;

    const [asksResp, bidsResp] = await Promise.all([fetch(asksUrl), fetch(bidsUrl)]);

    const { orders: asks } = (await asksResp.json()) as { cursor?: string; orders: OrderEntity[] };
    const { orders: bids } = (await bidsResp.json()) as { cursor?: string; orders: OrderEntity[] };

    return {
      buys: bids.map(b => ({ price: b.price.toString(), quantity: b.outputs[0].startAmount, timestamp: b.createdAt })),
      sells: asks.map(a => ({ price: a.price.toString(), quantity: a.input.startAmount, timestamp: a.createdAt }))
    }

    // return this if gladius order book is empty and hummingbot is using pmm strategy without external price feed
    // return {
    //   buys: [{ price: "0.01", quantity: "5", timestamp: Math.floor(Date.now() / 1000)  }],
    //   sells: [{ price: "0.01", quantity: "5", timestamp: Math.floor(Date.now() / 1000)  }]
    // }
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {
    return await this.markets(req);
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {

    if (!req.orderId) return { orders: [] }

    const url = `${RubiconCLOBConfig.config.url}/dutch-auction/orders?orderHash=${req.orderId}`;
    const { orders } = (await (await fetch(url)).json()) as { cursor?: string; orders: OrderEntity[] };

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

    const { domain, types, values } = order.permitData();
    const signature = await this.wallet._signTypedData(domain, types, values);
    const serializedOrder = order.serialize();

    const payload = {
      encodedOrder: serializedOrder,
      signature,
      chain: this._chain.chainId,
    };

    const postResponse = await axios({
      method: 'post',
      url: `${RubiconCLOBConfig.config.url}/dutch-auction/order`,
      data: payload,
    })

    return { txHash: "", id: postResponse.data.hash };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string, id: string }> {

    axios({
      url: `${RubiconCLOBConfig.config.url}/dutch-auction/cancel`,
      method: 'post',
      data: {
        signature: await this.wallet.signMessage(req.orderId),
        hash: req.orderId,
        swapper: this.wallet.address
      }
    })

    return { txHash: "", id: req.orderId };
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
}
