import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderResponse,
  ClobBatchUpdateRequest,
  CreateOrderParam,
  ClobDeleteOrderRequestExtract,
} from '../../clob/clob.requests';
import {
  CLOBish,
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
} from '../../services/common-interfaces';
import { BigNumber, Contract, PopulatedTransaction, utils } from 'ethers';
import { DexalotCLOBConfig } from './dexalot.clob.config';
import LRUCache from 'lru-cache';
import {
  bigNumberWithDecimalToStr,
  floatStringWithDecimalToFixed,
} from '../../services/base';
import { logger } from '../../services/logger';
import { Avalanche } from '../../chains/avalanche/avalanche';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';
import {
  createBook,
  fromUtf8,
  OrderSide,
  OrderType1,
  OrderType2,
  parseMarkerInfo,
  parseOrderInfo,
} from './dexalot.constants';
import { BalanceRequest } from '../../network/network.requests';
import { indexOf } from 'lodash';
import path from 'path';
import { rootPath } from '../../paths';

export class DexalotCLOB implements CLOBish {
  private static _instances: LRUCache<string, DexalotCLOB>;
  private _chain;
  private _ready: boolean = false;
  public parsedMarkets: MarketInfo = [];
  // private _exchangeContract: Contract;
  private _portfolioContract: Contract;
  // private _orderBooksContract: Contract;
  private _tradePairsContract: Contract;
  // private _gasStationContract: Contract;
  private _resources: any;
  private _conf: DexalotCLOBConfig.NetworkConfig;
  public abiDecoder: any = require('abi-decoder');

  private constructor(network: string) {
    this._chain = Avalanche.getInstance(network);
    this._conf = DexalotCLOBConfig.config;
    this._resources = require(path.join(
      rootPath(),
      'src/connectors/dexalot/dexalot_mainnet.json'
    ));
    // this._exchangeContract = this.getContract('ExchangeSub', this._resources);
    this._portfolioContract = this.getContract('PortfolioSub', this._resources);
    // this._orderBooksContract = this.getContract('OrderBooks', this._resources);
    this._tradePairsContract = this.getContract('TradePairs', this._resources);
    // this._gasStationContract = this.getContract('GasStation', this._resources);
  }

  public get tradePairsContract(): Contract {
    return this._tradePairsContract;
  }
  public set tradePairsContract(value: Contract) {
    this._tradePairsContract = value;
  }

  public getContract(name: string, data: any[]): Contract {
    const validContractNames = [
      'ExchangeSub',
      'PortfolioSub',
      'OrderBooks',
      'TradePairs',
      'GasStation',
    ];
    if (!validContractNames.includes(name)) {
      logger.error(`${name} has to be one of ${validContractNames.join(',')}`);
      throw Error('Invalid contract name.');
    }

    const info = data.filter((entry) => entry.contract_name === name)[0];
    this.abiDecoder.addABI(info.abi.abi);
    return new Contract(info.address, info.abi.abi, this._chain.provider);
  }

  public static getInstance(network: string): DexalotCLOB {
    if (DexalotCLOB._instances === undefined) {
      DexalotCLOB._instances = new LRUCache<string, DexalotCLOB>({
        max: DexalotCLOBConfig.config.maxLRUCacheInstances,
      });
    }
    if (!DexalotCLOB._instances.has(network)) {
      DexalotCLOB._instances.set(network, new DexalotCLOB(network));
    }

    return DexalotCLOB._instances.get(network) as DexalotCLOB;
  }

  public async loadMarkets() {
    const rawMarkets = (
      await Promise.all(
        (
          await this.tradePairsContract.getTradePairs()
        ).map(async (marketId: string) => {
          return this.tradePairsContract.getTradePair(marketId);
        })
      )
    ).map(parseMarkerInfo);
    for (const market of rawMarkets) {
      this.parsedMarkets[market.baseSymbol + '-' + market.quoteSymbol] = market;
    }
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

  public async balances(req: BalanceRequest): Promise<Record<string, any>> {
    const tokens = req.tokenSymbols.map((symbol) => {
      return this._chain.getTokenBySymbol(symbol);
    });
    const balances = await Promise.all(
      req.tokenSymbols.map((symbol) => {
        return this._portfolioContract.getBalance(
          req.address,
          fromUtf8(symbol)
        );
      })
    );
    const formattedBalances: Record<string, any> = { available: {}, total: {} };
    for (const token of tokens) {
      const index = indexOf(tokens, token);
      if (token) {
        formattedBalances.available[req.tokenSymbols[index]] =
          bigNumberWithDecimalToStr(balances[index].available, token.decimals);
        formattedBalances.total[req.tokenSymbols[index]] =
          bigNumberWithDecimalToStr(balances[index].total, token.decimals);
      }
    }
    return formattedBalances;
  }

  public async markets(
    req: ClobMarketsRequest
  ): Promise<{ markets: MarketInfo }> {
    if (req.market && req.market in this.parsedMarkets)
      return { markets: this.parsedMarkets[req.market] };
    return { markets: Object.values(this.parsedMarkets) };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    const markerId = fromUtf8(req.market.replace('-', '/'));
    const books = await Promise.all([
      this.tradePairsContract.getNBook(
        markerId,
        OrderSide.BUY,
        50,
        50,
        0,
        fromUtf8('')
      ),
      this.tradePairsContract.getNBook(
        markerId,
        OrderSide.SELL,
        50,
        50,
        0,
        fromUtf8('')
      ),
    ]);

    const buys: string[][] = [
      books[0][0].map((value: { toString: () => string }) => {
        return value.toString();
      }),
      books[0][1].map((value: { toString: () => string }) => {
        return value.toString();
      }),
    ];
    const sells: string[][] = [
      books[1][0].map((value: { toString: () => string }) => {
        return value.toString();
      }),
      books[1][1].map((value: { toString: () => string }) => {
        return value.toString();
      }),
    ];

    const timestamps = [...buys[0]].fill(Date.now().toString());

    return {
      buys: createBook(buys, timestamps, this.parsedMarkets[req.market]),
      sells: createBook(sells, timestamps, this.parsedMarkets[req.market]),
    };
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {
    return await this.markets(req);
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    let order;
    const marketInfo = this.parsedMarkets[req.market];
    if (req.address) {
      order = [
        await this.tradePairsContract.getOrderByClientOrderId(
          req.address,
          req.orderId
        ),
      ].map(parseOrderInfo)[0];
    } else {
      order = [await this.tradePairsContract.getOrder(req.orderId)].map(
        parseOrderInfo
      )[0];
    }

    order.price = utils.formatUnits(order.price, marketInfo.quoteDecimals);
    order.totalAmount = utils.formatUnits(
      order.totalAmount,
      marketInfo.baseDecimals
    );
    order.quantity = utils.formatUnits(order.quantity, marketInfo.baseDecimals);
    order.quantityFilled = utils.formatUnits(
      order.quantityFilled,
      marketInfo.baseDecimals
    );
    order.totalFee = utils.formatUnits(order.totalFee, marketInfo.baseDecimals);
    return {
      orders: [order],
    };
  }

  public async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string; clientOrderID: string }> {
    const market: MarketInfo = this.parsedMarkets[req.market];
    if (market === undefined) throw Error('Invalid market');

    const clientOrderID =
      req.clientOrderID || (await this.getClientOrderId(req.address));

    const txData = await this.tradePairsContract.populateTransaction.addOrder(
      req.address,
      clientOrderID,
      fromUtf8(req.market.replace('-', '/')), // market id
      utils.parseUnits(
        floatStringWithDecimalToFixed(req.price, market.quoteDisplayDecimals) ||
          req.price,
        market.quoteDecimals
      ),
      utils.parseUnits(
        floatStringWithDecimalToFixed(req.amount, market.baseDisplayDecimals) ||
          req.price,
        market.baseDecimals
      ),
      OrderSide[req.side.toUpperCase()],
      req.orderType.startsWith('LIMIT') ? OrderType1.LIMIT : OrderType1.MARKET,
      req.orderType === 'LIMIT_MAKER' ? OrderType2.PO : OrderType2.GTC
    );
    txData.gasLimit = BigNumber.from(String(this._conf.gasLimitEstimate));
    const txResponse = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address
    ).broadcast(txData);
    return { txHash: txResponse.hash, clientOrderID };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    const txData =
      await this.tradePairsContract.populateTransaction.cancelOrder(
        req.orderId
      );
    txData.gasLimit = BigNumber.from(String(this._conf.gasLimitEstimate));
    const txResponse = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address
    ).broadcast(txData);
    return { txHash: txResponse.hash };
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return {
      gasPrice: this._chain.gasPrice,
      gasPriceToken: this._chain.nativeTokenSymbol,
      gasLimit: this._conf.gasLimitEstimate,
      gasCost: this._chain.gasPrice * this._conf.gasLimitEstimate,
    };
  }

  public async batchOrders(
    req: ClobBatchUpdateRequest
  ): Promise<{ txHash: string }> {
    return this.orderUpdate(req);
  }

  public async orderUpdate(
    req: ClobBatchUpdateRequest
  ): Promise<{ txHash: string; clientOrderID?: string[] }> {
    let txData: PopulatedTransaction = {};
    let data: { txData: PopulatedTransaction; clientOrderID: string[] } = {
      txData: {},
      clientOrderID: [],
    };
    if (req.createOrderParams) {
      data = await this.buildPostOrder(req.createOrderParams, req.address);
      txData = data.txData;
    } else if (req.cancelOrderParams)
      txData = await this.buildDeleteOrder(req.cancelOrderParams);

    txData.gasLimit = BigNumber.from(String(this._conf.gasLimitEstimate));
    const txResponse = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address
    ).broadcast(txData);
    return { txHash: txResponse.hash, clientOrderID: data.clientOrderID };
  }

  public async buildPostOrder(
    orderParams: CreateOrderParam[],
    address: string
  ): Promise<{ txData: PopulatedTransaction; clientOrderID: string[] }> {
    const clientOrderID = [];
    const prices = [];
    const amounts = [];
    const sides = [];
    const types = [];
    const market: string = orderParams[0].market; // assumes batch orders to one market as limited by contract abi
    const marketInfo: MarketInfo = this.parsedMarkets[market];
    if (marketInfo === undefined)
      throw Error(`Invalid market ${orderParams[0].market}`);

    for (const order of orderParams) {
      clientOrderID.push(
        order.clientOrderID || (await this.getClientOrderId(address))
      );
      prices.push(
        utils.parseUnits(
          floatStringWithDecimalToFixed(
            order.price,
            marketInfo.quoteDisplayDecimals
          ) || order.price,
          marketInfo.quoteDecimals
        )
      );
      amounts.push(
        utils.parseUnits(
          floatStringWithDecimalToFixed(
            order.amount,
            marketInfo.baseDisplayDecimals
          ) || order.price,
          marketInfo.baseDecimals
        )
      );
      sides.push(OrderSide[order.side.toUpperCase()]);
      types.push(
        order.orderType === 'LIMIT_MAKER' ? OrderType2.PO : OrderType2.GTC
      );
    }
    return {
      txData:
        await this.tradePairsContract.populateTransaction.addLimitOrderList(
          fromUtf8(market.replace('-', '/')), // market id
          clientOrderID,
          prices,
          amounts,
          sides,
          types
        ),
      clientOrderID,
    };
  }

  public async buildDeleteOrder(
    orders: ClobDeleteOrderRequestExtract[]
  ): Promise<PopulatedTransaction> {
    const spotOrdersToCancel = [];
    for (const order of orders) {
      spotOrdersToCancel.push(order.orderId);
    }

    return await this.tradePairsContract.populateTransaction.cancelOrderList(
      spotOrdersToCancel
    );
  }

  async getClientOrderId(address: string): Promise<string> {
    const blocknumber: number =
      (await this._chain.getCurrentBlockNumber()) || 0;
    const timestamp = new Date().toISOString();
    const id = utils.toUtf8Bytes(`${address}${blocknumber}${timestamp}`);
    return utils.keccak256(id);
  }
}
