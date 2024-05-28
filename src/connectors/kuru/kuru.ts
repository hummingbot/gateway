import {
  ethers,
  Contract,
  utils,
  BigNumber,
  ContractTransaction,
} from 'ethers';
import { Ethereum } from '../../chains/ethereum/ethereum';

import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderResponse,
  ClobBatchUpdateRequest,
} from '../../clob/clob.requests';
import {
  CLOBish,
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
  PriceLevel,
} from '../../services/common-interfaces';
import { BalanceRequest } from '../../network/network.requests';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';
import { bigNumberWithDecimalToStr } from '../../services/base';

import { KuruConfig } from './kuru.config';
import { MarginAccount, Markets, Assets } from './kuru.constants';
import { GetOrderStatusKey } from './kuru.utils';
import orderbookAbi from './OrderBook.abi.json';
import marginAccountAbi from './MarginAccount.abi.json';

export class Kuru implements CLOBish {
  private static _instances: { [name: string]: Kuru };
  private _chain: Ethereum;
  private _conf: typeof KuruConfig.config;
  private _ready: boolean = false;
  private _marketContracts: { [key: string]: Contract } = {};
  private _marginAccountContract: Contract;
  public parsedMarkets: MarketInfo = [];
  public router: any;

  private constructor(network: string) {
    this._chain = Ethereum.getInstance(network);
    this._conf = KuruConfig.config;
    this._marginAccountContract = new Contract(
      MarginAccount,
      marginAccountAbi.abi,
      this._chain.provider,
    );
    this.router = this._conf.routerAddress(this._chain.chain);
  }

  /**
   * Get an instance of the Kuru class for a specific network.
   * @param network - The name of the network.
   * @returns An instance of the Kuru class.
   */
  public static getInstance(network: string): Kuru {
    if (Kuru._instances === undefined) {
      Kuru._instances = {};
    }
    if (!(network in Kuru._instances)) {
      Kuru._instances[network] = new Kuru(network);
    }

    return Kuru._instances[network];
  }

  /**
   * Load market data and initialize market contracts.
   */
  public async loadMarkets() {
    this.parsedMarkets = [];

    for (const [market, address] of Object.entries(Markets)) {
      const contractInstance = new Contract(
        address,
        orderbookAbi.abi,
        this._chain.provider,
      );
      this._marketContracts[market] = contractInstance;

      const marketParamsData = await contractInstance.getMarketParams();
      const marketParams = {
        pricePrecision: BigNumber.from(marketParamsData[0]),
        sizePrecision: BigNumber.from(marketParamsData[1]),
        baseAssetAddress: marketParamsData[2],
        baseAssetDecimals: BigNumber.from(marketParamsData[3]),
        quoteAssetAddress: marketParamsData[4],
        quoteAssetDecimals: BigNumber.from(marketParamsData[5]),
        minSize: BigNumber.from(marketParamsData[6]),
        takerFeeBps: BigNumber.from(marketParamsData[7]).toString(),
      };

      const minSizeStandardized = ethers.utils.formatUnits(
        marketParams.minSize,
        Math.log10(marketParams.sizePrecision.toNumber()),
      );
      const tickSize = ethers.utils.formatUnits(
        1,
        Math.log10(marketParams.pricePrecision.toNumber()),
      );
      const sizeIncrement = ethers.utils.formatUnits(
        1,
        Math.log10(marketParams.sizePrecision.toNumber()),
      );

      const marketInfo: MarketInfo = {
        market,
        ...marketParams,
        minSizeStandardized,
        tickSize,
        sizeIncrement,
      };
      this.parsedMarkets[market] = marketInfo;
    }
  }

  /**
   * Initialize the Kuru instance by initializing the chain and loading markets.
   */
  public async init() {
    if (!this._chain.ready() || Object.keys(this.parsedMarkets).length === 0) {
      await this._chain.init();
      await this.loadMarkets();
      this._ready = true;
    }
  }

  /**
   * Check if the Kuru instance is ready.
   * @returns A boolean indicating if the instance is ready.
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Fetch balances for the given address and token symbols.
   * @param req - The balance request containing the address and token symbols.
   * @returns A record of token symbols and their respective balances.
   */
  public async balances(req: BalanceRequest): Promise<Record<string, string>> {
    const formattedBalances: Record<string, string> = {};

    try {
      const balances = await Promise.all(
        req.tokenSymbols.map(async (symbol) => {
          try {
            const asset = Assets[symbol as keyof typeof Assets];
            if (!asset) {
              return null;
            }
            const balance = await this._marginAccountContract.getBalance(
              req.address,
              asset.address,
            );
            return balance;
          } catch (error) {
            return null;
          }
        }),
      );

      for (const [index, symbol] of req.tokenSymbols.entries()) {
        if (balances[index] !== null) {
          const asset = Assets[symbol as keyof typeof Assets];
          const availableBalance = bigNumberWithDecimalToStr(
            balances[index] as ethers.BigNumber,
            asset.decimals,
          );
          formattedBalances[symbol] = availableBalance;
        }
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
    }

    return formattedBalances;
  }

  /**
   * Get market information.
   * @param req - The request containing market details.
   * @returns An object containing market information.
   */
  public async markets(
    req: ClobMarketsRequest,
  ): Promise<{ markets: MarketInfo }> {
    if (req.market && req.market in this.parsedMarkets)
      return { markets: this.parsedMarkets[req.market] };
    return { markets: Object.values(this.parsedMarkets) };
  }

  /**
   * Get the order book for a specific market.
   * @param req - The request containing market details.
   * @returns An order book object containing buys and sells.
   */
  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    const marketInfo = this.parsedMarkets[req.market];
    const marketContract = this._marketContracts[req.market];
    if (!marketContract) {
      throw new Error(`Market contract for ${req.market} not found`);
    }

    const data = await marketContract.getL2Book();
    let offset = 66; // Start reading after the block number
    const blockNumber = parseInt(data.slice(2, 66), 16); // The block number is stored in the first 64 bytes after '0x'

    let bids: Record<string, string> = {};
    let asks: Record<string, string> = {};

    // Decode bids
    while (offset < data.length) {
      const priceHex = data.slice(offset, offset + 64);
      const price = BigNumber.from(parseInt(priceHex, 16));
      offset += 64; // Skip over padding
      if (price.isZero()) {
        break; // Stop reading if price is zero
      }
      const sizeHex = data.slice(offset, offset + 64);
      const size = BigNumber.from(parseInt(sizeHex, 16));
      offset += 64; // Skip over padding
      bids[price.toString()] = size.toString();
    }

    // Decode asks
    while (offset < data.length) {
      const priceHex = data.slice(offset, offset + 64);
      const price = BigNumber.from(parseInt(priceHex, 16));
      offset += 64; // Skip over padding
      const sizeHex = data.slice(offset, offset + 64);
      const size = BigNumber.from(parseInt(sizeHex, 16));
      offset += 64; // Skip over padding
      asks[price.toString()] = size.toString();
    }

    const pricePrecision = Math.log10(marketInfo.pricePrecision.toNumber());
    const sizePrecision = Math.log10(marketInfo.sizePrecision.toNumber());

    const buys: PriceLevel[] = Object.entries(bids).map(
      ([price, quantity]) => ({
        price: ethers.utils.formatUnits(BigNumber.from(price), pricePrecision),
        quantity: ethers.utils.formatUnits(
          BigNumber.from(quantity),
          sizePrecision,
        ),
        timestamp: blockNumber,
      }),
    );

    const sells: PriceLevel[] = Object.entries(asks).map(
      ([price, quantity]) => ({
        price: ethers.utils.formatUnits(BigNumber.from(price), pricePrecision),
        quantity: ethers.utils.formatUnits(
          BigNumber.from(quantity),
          sizePrecision,
        ),
        timestamp: blockNumber,
      }),
    );

    return { buys, sells };
  }

  /**
   * Get the ticker for a specific market.
   * @param req - The request containing market details.
   * @returns An object containing market information and the current price.
   */
  public async ticker(
    req: ClobTickerRequest,
  ): Promise<{ markets: MarketInfo }> {
    const ob = await this.orderBook(req as ClobOrderbookRequest);
    let price = BigNumber.from(0);
    if (ob.buys.length !== 0) {
      price = ob.buys.reduce((max, order) => {
        const price = BigNumber.from(order.price);
        return price.gt(max) ? price : max;
      }, BigNumber.from(0));
    }
    return await { ...this.markets(req), price: price.toString() };
  }

  /**
   * Get orders for a specific market.
   * @param req - The request containing order details.
   * @returns An object containing the requested orders.
   */
  public async orders(
    req: ClobGetOrderRequest,
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    const marketContract = this._marketContracts[req.market];

    if (!marketContract) {
      throw new Error(`Market contract for ${req.market} not found`);
    }

    const marketInfo: MarketInfo = this.parsedMarkets[req.market];
    if (marketInfo === undefined) throw Error('Invalid market');

    if (!marketInfo) {
      throw new Error(`Market info for ${req.market} not found`);
    }

    const data = await marketContract.getOrderDetails(req.orderId);
    const size: ethers.BigNumber = data[0][1];
    const price: ethers.BigNumber = BigNumber.from(data[0][4]);
    const isBuy: ethers.BigNumber = data[0][5];
    const status: BigNumber = data[1];

    const pricePrecision = Math.log10(marketInfo.pricePrecision.toNumber());
    const sizePrecision = Math.log10(marketInfo.sizePrecision.toNumber());

    const order = {
      price: ethers.utils.formatUnits(price, pricePrecision),
      quantity: ethers.utils.formatUnits(size, sizePrecision),
      isBuy: isBuy.toString(),
      orderId: req.orderId,
      market: req.market,
      state: GetOrderStatusKey(status.toNumber()),
    };

    return {
      orders: [order],
    };
  }

  /**
   * Post a new order to the market.
   * @param req - The request containing order details.
   * @returns An object containing the transaction hash and order ID.
   */
  public async postOrder(
    req: ClobPostOrderRequest,
  ): Promise<{ txHash: string; id: string }> {
    const marketInfo: MarketInfo = this.parsedMarkets[req.market];
    if (marketInfo === undefined) throw Error('Invalid market');

    const marketContract = this._marketContracts[req.market];
    const price = ethers.utils.parseUnits(
      req.price,
      Math.log10(marketInfo.pricePrecision),
    );
    const size = ethers.utils.parseUnits(
      req.amount,
      Math.log10(marketInfo.sizePrecision),
    );

    let tx;
    if (req.side === 'BUY') {
      tx = await marketContract.populateTransaction.addBuyOrder(
        price,
        size,
        req.orderType === 'LIMIT_MAKER',
      );
    } else {
      tx = await marketContract.populateTransaction.addSellOrder(
        price,
        size,
        req.orderType === 'LIMIT_MAKER',
      );
    }

    const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address,
    ).broadcast(tx);

    const receipt = await txResponse.wait();

    // Create a contract interface to parse the logs
    const iface = new ethers.utils.Interface(orderbookAbi.abi);

    // Find and parse the OrderCreated event log
    const log = receipt.logs.find((log) => {
      try {
        const parsedLog = iface.parseLog(log);
        return parsedLog.name === 'OrderCreated';
      } catch (e) {
        return false;
      }
    });

    if (!log) {
      return { txHash: txResponse.hash, id: "0" };
    }

    const parsedLog = iface.parseLog(log);
    const orderId = parsedLog.args.orderId.toString();

    return { txHash: txResponse.hash, id: orderId };
  }

  /**
   * Delete an order from the market.
   * @param req - The request containing order details.
   * @returns An object containing the transaction hash.
   */
  public async deleteOrder(
    req: ClobDeleteOrderRequest,
  ): Promise<{ txHash: string }> {
    const marketContract = this._marketContracts[req.market];

    const tx = await marketContract.populateTransaction.batchCancelOrders([req.orderId]);
    const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address,
    ).broadcast(tx);

    await txResponse.wait();
    
    return { txHash: txResponse.hash };
  }

  /**
   * Perform a batch update of orders.
   * @param req - The request containing order details for creation and cancellation.
   * @returns An object containing the transaction hash and a list of order IDs.
   */
  public async batchOrders(
    req: ClobBatchUpdateRequest,
  ): Promise<{ txHash: string; ids: string[] }> {
    let marketId;
    if (req.createOrderParams) {
      marketId = req.createOrderParams[0].market;
    } else if (req.cancelOrderParams) {
      marketId = req.cancelOrderParams[0].market;
    } else {
      throw new Error('Bad request: No params to create or cancel orders');
    }

    const marketContract = this._marketContracts[marketId];
    const buyPrices: BigNumber[] = [];
    const buySizes: BigNumber[] = [];
    const sellPrices: BigNumber[] = [];
    const sellSizes: BigNumber[] = [];
    const cancelOrderIds: BigNumber[] = [];
    const postOnlyFlag: boolean =
      req.createOrderParams?.[0].orderType === 'LIMIT_MAKER' || false;

    for (const createOrder of req.createOrderParams || []) {
      const marketInfo: MarketInfo = this.parsedMarkets[createOrder.market];
      if (marketInfo === undefined) {
        throw new Error(`Invalid market: ${createOrder.market}`);
      }

      const price = ethers.utils.parseUnits(
        createOrder.price,
        Math.log10(marketInfo.pricePrecision),
      );
      const size = ethers.utils.parseUnits(
        createOrder.amount,
        Math.log10(marketInfo.sizePrecision),
      );

      if (createOrder.side === 'BUY') {
        buyPrices.push(price);
        buySizes.push(size);
      } else {
        sellPrices.push(price);
        sellSizes.push(size);
      }
    }

    for (const cancelOrder of req.cancelOrderParams || []) {
      const marketInfo: MarketInfo = this.parsedMarkets[cancelOrder.market];
      if (marketInfo === undefined) {
        throw new Error(`Invalid market: ${cancelOrder.market}`);
      }

      cancelOrderIds.push(BigNumber.from(cancelOrder.orderId));
    }

    const tx = await marketContract.populateTransaction.batchUpdate(
      buyPrices,
      buySizes,
      sellPrices,
      sellSizes,
      cancelOrderIds,
      postOnlyFlag,
    );

    const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
      this._chain,
      req.address,
    ).broadcast(tx);

    const receipt = await txResponse.wait();

    // Create a contract interface to parse the logs
    const iface = new ethers.utils.Interface(orderbookAbi.abi);

    // Collect all order IDs from the OrderCreated events
    const orderIds: string[] = receipt.logs
      .filter((log) => log.address === marketContract.address)
      .map((log) => {
        try {
          const parsedLog = iface.parseLog(log);
          if (parsedLog.name === 'OrderCreated') {
            return parsedLog.args.orderId.toString();
          }
        } catch (e) {
          return null;
        }
      })
      .filter((orderId) => orderId !== null) as string[];

    return { txHash: txResponse.hash, ids: orderIds };
  }

  /**
   * Generate a unique client order ID based on the address, block number, and timestamp.
   * @param address - The address to generate the client order ID for.
   * @returns A unique client order ID.
   */
  async getClientOrderId(address: string): Promise<string> {
    const blocknumber: number =
      (await this._chain.getCurrentBlockNumber()) || 0;
    const timestamp = new Date().toISOString();
    const id = utils.toUtf8Bytes(`${address}${blocknumber}${timestamp}`);
    return utils.keccak256(id);
  }

  /**
   * Estimate gas costs for a network request.
   * @param _req - The network request.
   * @returns An object containing gas price, gas price token, gas limit, and gas cost.
   */
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
}
