import {
  Balance,
  Balances,
  ConvertOrderType,
  IMap,
  KujiraEvent,
  KujiraOrderBook,
  KujiraTicker,
  KujiraWithdraw,
  Market,
  MarketName,
  Order,
  OrderAmount,
  OrderBook,
  OrderId,
  OrderPrice,
  OrderSide,
  OrderStatus,
  OrderType,
  Ticker,
  Token,
  TokenId,
  Transaction,
  TransactionHashes,
  Withdraw,
} from './kujira.types';
import { KujiraConfig } from './kujira.config';
import {
  Denom,
  fin,
  KUJI,
  MAINNET,
  NETWORKS,
  TESTNET,
  USK,
  USK_TESTNET,
} from 'kujira.js';
import { IndexedTx } from '@cosmjs/stargate/build/stargateclient';
import contracts from 'kujira.js/src/resources/contracts.json';
import { getNotNullOrThrowError } from './kujira.helpers';
import { BigNumber } from 'bignumber.js';
import { Coin } from '@cosmjs/proto-signing';
import { parseCoins } from '@cosmjs/stargate';
import { TokenInfo } from '../../services/base';
import { ClobDeleteOrderRequestExtract } from '../../clob/clob.requests';

export const convertToGetTokensResponse = (token: Token): TokenInfo => {
  return {
    chainId: token.id,
    address: undefined,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
  } as unknown as TokenInfo;
};

export const convertKujiraTokenToToken = (token: Denom): Token => {
  return {
    id: token.reference,
    name: token.symbol,
    symbol: token.symbol,
    decimals: token.decimals,
  };
};

export const convertHumingbotMarketNameToMarketName = (
  input: string
): MarketName => {
  return input.replace('-', '/');
};

export const convertMarketNameToHumingbotMarketName = (
  input: string
): string => {
  return input.replace('/', '-');
};

export const convertKujiraMarketToMarket = (market: fin.Pair): Market => {
  const baseToken = convertKujiraTokenToToken(market.denoms[0]);
  const quoteToken = convertKujiraTokenToToken(market.denoms[1]);

  const decimalPlaces =
    'decimal_places' in market.precision
      ? market.precision?.decimal_places
      : market.precision.significant_figures;

  const minimumPriceIncrement = BigNumber(Math.pow(10, -1 * decimalPlaces));

  return {
    id: market.address,
    name: `${baseToken.symbol}/${quoteToken.symbol}`,
    baseToken: baseToken,
    quoteToken: quoteToken,
    precision: decimalPlaces,
    minimumOrderSize: minimumPriceIncrement, // Considering the market precision as the minimum value
    minimumPriceIncrement: minimumPriceIncrement, // Considering the market precision as the minimum value
    minimumBaseAmountIncrement: minimumPriceIncrement, // Considering the market precision as the minimum value
    minimumQuoteAmountIncrement: minimumPriceIncrement, // Considering the market precision as the minimum value
    fees: {
      maker: KujiraConfig.config.fees.maker,
      taker: KujiraConfig.config.fees.taker,
      serviceProvider: KujiraConfig.config.fees.serviceProvider,
    },
    programId: undefined,
    deprecated: false,
    connectorMarket: market,
  } as Market;
};

export const convertKujiraOrderBookToOrderBook = (
  market: Market,
  kujiraOrderBook: KujiraOrderBook
): OrderBook => {
  const bids = IMap<OrderId, Order>().asMutable();
  const asks = IMap<OrderId, Order>().asMutable();
  let bestBid: Order | undefined;
  let bestAsk: Order | undefined;
  let bestBidPrice = BigNumber('-Infinity');
  let bestAskPrice = BigNumber('Infinity');

  let counter = 0;
  kujiraOrderBook.base.forEach((kujiraOrder) => {
    const order = {
      id: undefined,
      clientId: undefined,
      marketName: market.name,
      marketId: market.id,
      ownerAddress: undefined,
      payerAddress: undefined,
      price: BigNumber(kujiraOrder.quote_price),
      amount: BigNumber(kujiraOrder.total_offer_amount),
      side: OrderSide.SELL,
      status: OrderStatus.OPEN,
      type: OrderType.LIMIT,
      fee: undefined,
      fillingTimestamp: undefined,
      hashes: undefined,
      connectorOrder: undefined,
    } as Order;

    if (bestAsk) {
      if (order.price?.lt(bestAskPrice)) {
        bestAsk = order;
        bestAskPrice = getNotNullOrThrowError<OrderPrice>(order.price);
      }
    } else {
      bestAsk = order;
      bestAskPrice = getNotNullOrThrowError<OrderPrice>(order.price);
    }

    asks.set(`unknown_${counter++}`, order);
  });

  kujiraOrderBook.quote.forEach((kujiraOrder) => {
    const order = {
      id: undefined,
      clientId: undefined,
      marketName: market.name,
      marketId: market.id,
      ownerAddress: undefined,
      payerAddress: undefined,
      price: BigNumber(kujiraOrder.quote_price),
      amount: BigNumber(kujiraOrder.total_offer_amount),
      side: OrderSide.BUY,
      status: OrderStatus.OPEN,
      type: OrderType.LIMIT,
      fee: undefined,
      fillingTimestamp: undefined,
      hashes: undefined,
      connectorOrder: undefined,
    } as Order;

    if (bestBid) {
      if (order.price?.gt(bestBidPrice)) {
        bestBid = order;
        bestBidPrice = getNotNullOrThrowError<OrderPrice>(order.price);
      }
    } else {
      bestBid = order;
      bestBidPrice = getNotNullOrThrowError<OrderPrice>(order.price);
    }

    bids.set(`unknown_${counter++}`, order);
  });

  return {
    market: market,
    bids: bids,
    asks: asks,
    bestBid: bestBid,
    bestAsk: bestAsk,
    connectorOrderBook: kujiraOrderBook,
  } as OrderBook;
};

export const convertOfferDenomToOrderSide = (
  offer_denom: string,
  market: Market
): OrderSide => {
  const offerDenom = Denom.from(offer_denom);
  const baseTokenDenom = Denom.from(market.baseToken.id);
  const quoteTokenDenom = Denom.from(market.quoteToken.id);

  if (offerDenom.eq(baseTokenDenom)) {
    return OrderSide.SELL;
  } else if (offerDenom.eq(quoteTokenDenom)) {
    return OrderSide.BUY;
  } else {
    throw new Error('Order side from offer denom not recognized');
  }
};

export const convertKujiraOrderToStatus = (kujiraOrder: any): OrderStatus => {
  if (kujiraOrder['offer_amount'] == '0') {
    return OrderStatus.FILLED;
  } else if (
    kujiraOrder['offer_amount'] == kujiraOrder['original_offer_amount']
  ) {
    return OrderStatus.OPEN;
  } else {
    return OrderStatus.PARTIALLY_FILLED;
  }
};

export const convertKujiraFeeToFee = (kujiraFee: string) => {
  const fee = parseCoins(kujiraFee)[0];
  return BigNumber(fee.amount).multipliedBy(
    BigNumber('1e-' + KUJI.decimals.toString())
  );
};

export const convertKujiraOrdersToMapOfOrders = (options: {
  type: ConvertOrderType;
  bundles: IMap<string, any>;
}): IMap<OrderId, Order> => {
  const output = IMap<OrderId, Order>().asMutable();

  let unknownCounter = 1;
  if (ConvertOrderType.PLACE_ORDERS == options.type) {
    for (const bundle of options.bundles.get('orders').values()) {
      let orderId = bundle.getIn(['events', 'wasm', 'order_idx']);

      if (!orderId) {
        orderId = `unknown_${unknownCounter++}`;
      }

      const denom = Denom.from(bundle.getIn(['events', 'wasm', 'offer_denom']));

      const order = {
        id: orderId,
        clientId: bundle.getIn(['candidate']).clientId,
        marketName: bundle.getIn(['market']).name,
        marketId: bundle.getIn(['market']).id,
        market: bundle.getIn(['market']),
        ownerAddress:
          bundle.getIn(['candidate']).type == OrderType.MARKET
            ? bundle.getIn(['events', 'message', 'sender'])
            : bundle.getIn(['candidate']).type == OrderType.LIMIT
            ? bundle.getIn(['events', 'transfer', 'sender'])
            : undefined,
        payerAddress:
          bundle.getIn(['candidate']).type == OrderType.MARKET
            ? bundle.getIn(['events', 'message', 'sender'])
            : bundle.getIn(['candidate']).type == OrderType.LIMIT
            ? bundle.getIn(['events', 'transfer', 'sender'])
            : undefined,
        price: bundle.getIn(['events', 'wasm', 'quote_price'])
          ? BigNumber(bundle.getIn(['events', 'wasm', 'quote_price']))
          : BigNumber(bundle.getIn(['events', 'wasm-trade', 'quote_amount']))
              .div(
                BigNumber(bundle.getIn(['events', 'wasm-trade', 'base_amount']))
              )
              .decimalPlaces(bundle.getIn(['market', 'precision'])),
        amount: bundle.getIn(['events', 'wasm', 'offer_amount'])
          ? BigNumber(bundle.getIn(['events', 'wasm', 'offer_amount'])).div(
              BigNumber(10).pow(denom.decimals)
            )
          : undefined,
        side: convertOfferDenomToOrderSide(
          bundle.getIn(['events', 'wasm', 'offer_denom']),
          bundle.getIn(['market'])
        ),
        status: options.bundles.getIn(['common', 'status']),
        type: bundle.getIn(['candidate']).type || OrderType.LIMIT,
        fee: convertKujiraFeeToFee(
          options.bundles.getIn(['common', 'events', 'tx', 'fee']) as string
        ),
        creationTimestamp: undefined,
        fillingTimestamp: undefined,
        hashes: {
          creation: options.bundles.getIn([
            'common',
            'response',
            'transactionHash',
          ]),
        } as TransactionHashes,
        connectorOrder: bundle.getIn(['common', 'response']),
      } as Order;

      output.set(orderId, order);
    }
  } else if (ConvertOrderType.GET_ORDERS == options.type) {
    for (const bundle of options.bundles.get('orders')) {
      let orderId = bundle['idx'];

      if (!orderId) {
        orderId = `unknown_${unknownCounter++}`;
      }

      const market = options.bundles.getIn(['common', 'market']) as Market;

      const denom = Denom.from(bundle['offer_denom']['native']);

      const order = {
        id: orderId,
        clientId: undefined,
        marketName: market.name,
        marketId: market.id,
        market: market,
        ownerAddress: bundle['owner'],
        payerAddress: bundle['owner'],
        price: bundle['quote_price']
          ? BigNumber(bundle['quote_price'])
          : undefined,
        amount: bundle['original_offer_amount']
          ? BigNumber(bundle['original_offer_amount']).div(
              BigNumber(10).pow(denom.decimals)
            )
          : undefined,
        side: convertOfferDenomToOrderSide(
          bundle['offer_denom']['native'],
          market
        ),
        status: convertKujiraOrderToStatus(bundle),
        type: OrderType.LIMIT,
        fee: undefined,
        fillingTimestamp: undefined,
        creationTimestamp: Number(bundle['created_at']),
        hashes: undefined,
        connectorOrder: bundle,
      } as Order;

      output.set(orderId, order);
    }
  } else if (ConvertOrderType.CANCELLED_ORDERS == options.type) {
    for (const bundle of options.bundles.get('orders').values()) {
      let orderId = bundle.getIn(['id']);

      if (!orderId) {
        orderId = `unknown_${unknownCounter++}`;
      }

      const order = {
        id: orderId,
        clientId: undefined,
        marketName: bundle.getIn(['market']).name,
        marketId: bundle.getIn(['market']).id,
        market: bundle.getIn(['market']),
        ownerAddress: options.bundles.getIn([
          'common',
          'events',
          'transfer',
          'sender',
        ]),
        payerAddress: options.bundles.getIn([
          'common',
          'events',
          'transfer',
          'sender',
        ]),
        price: undefined as unknown as OrderPrice,
        amount: undefined as unknown as OrderAmount,
        side: undefined as unknown as OrderSide,
        status: OrderStatus.CANCELLED,
        type: OrderType.LIMIT,
        fee: convertKujiraFeeToFee(
          options.bundles.getIn(['common', 'events', 'tx', 'fee']) as string
        ),
        creationTimestamp: undefined,
        fillingTimestamp: undefined,
        hashes: {
          cancellation: options.bundles.getIn([
            'common',
            'response',
            'transactionHash',
          ]),
        } as TransactionHashes,
        connectorOrder: bundle.getIn(['common', 'response']),
      } as Order;

      output.set(orderId, order);
    }
  }

  return output;
};

export const convertKujiraTickerToTicker = (
  input: KujiraTicker,
  market: Market
): Ticker => {
  const price = BigNumber(input.price);
  const timestamp = Date.now();

  return {
    market: market,
    price: price,
    timestamp: timestamp,
    ticker: input,
  };
};

export const convertKujiraBalancesToBalances = (
  network: string,
  balances: readonly Coin[],
  orders: IMap<OrderId, Order>,
  tickers: IMap<TokenId, Ticker>
): Balances => {
  const uskToken =
    network.toLowerCase() == NETWORKS[MAINNET].toLowerCase()
      ? convertKujiraTokenToToken(USK)
      : convertKujiraTokenToToken(USK_TESTNET);

  const output: Balances = {
    tokens: IMap<TokenId, Balance>().asMutable(),
    total: {
      token: uskToken,
      free: BigNumber(0),
      lockedInOrders: BigNumber(0),
      unsettled: BigNumber(0),
    },
  };

  for (const balance of balances) {
    const token = convertKujiraTokenToToken(Denom.from(balance.denom));
    const ticker = tickers
      .valueSeq()
      .filter(
        (ticker) =>
          ticker.market.baseToken.id == token.id &&
          ticker.market.quoteToken.id == uskToken.id
      )
      .first();
    const amount = BigNumber(balance.amount).div(
      BigNumber(10).pow(token.decimals)
    );
    const price = token.id == uskToken.id ? 1 : ticker?.price || 0;
    output.tokens.set(token.id, {
      token: token,
      ticker: ticker,
      free: amount,
      lockedInOrders: BigNumber(0),
      unsettled: BigNumber(0),
    });

    output.total.free = output.total.free.plus(amount.multipliedBy(price));
  }

  for (const order of orders.values()) {
    const token =
      order.side == OrderSide.BUY
        ? order.market.quoteToken
        : order.market.baseToken;

    const ticker = tickers
      .valueSeq()
      .filter(
        (ticker) =>
          ticker.market.baseToken.id == token.id &&
          ticker.market.quoteToken.id == uskToken.id
      )
      .first();

    const amount = order.amount;
    const price = token.id == uskToken.id ? 1 : ticker?.price || 0;

    if (!output.tokens.has(token.id)) {
      output.tokens.set(token.id, {
        token: token,
        ticker: ticker,
        free: BigNumber(0),
        lockedInOrders: BigNumber(0),
        unsettled: BigNumber(0),
      });
    }

    const tokenBalance = getNotNullOrThrowError<Balance>(
      output.tokens.get(token.id)
    );

    if (order.status == OrderStatus.OPEN) {
      tokenBalance.lockedInOrders = tokenBalance.lockedInOrders.plus(amount);
      output.total.lockedInOrders = output.total.lockedInOrders.plus(
        amount.multipliedBy(price)
      );
    } else if (order.status == OrderStatus.FILLED) {
      tokenBalance.unsettled = tokenBalance.unsettled.plus(amount);
      output.total.unsettled = output.total.unsettled.plus(
        amount.multipliedBy(price)
      );
    }
  }

  return output;
};

export const convertKujiraTransactionToTransaction = (
  input: IndexedTx
): Transaction => {
  return {
    hash: input.hash,
    blockNumber: input.height,
    gasUsed: input.gasUsed,
    gasWanted: input.gasWanted,
    code: input.code,
    data: new TextDecoder('utf-8').decode(input.tx),
  };
};

export const convertKujiraSettlementToSettlement = (
  input: KujiraWithdraw
): Withdraw => {
  return {
    hash: input.transactionHash,
  };
};

export const convertNetworkToKujiraNetwork = (
  input: string
): keyof typeof contracts => {
  input = input.toLowerCase();
  let output: keyof typeof contracts;

  if (input.toLowerCase() == 'mainnet') {
    output = MAINNET;
  } else if (input.toLowerCase() == 'testnet') {
    output = TESTNET;
  } else {
    throw new Error(`Unrecognized network: ${input}`);
  }

  return output;
};

export const convertKujiraEventsToMapOfEvents = (
  events: readonly KujiraEvent[]
): IMap<string, any> => {
  const output = IMap<string, any>().asMutable();

  for (const event of events) {
    for (const attribute of event.attributes) {
      if (!output.getIn([event.type, attribute.key])) {
        output.setIn([event.type, attribute.key], attribute.value);
      }
    }
  }

  return output;
};

export const convertKujiraRawLogEventsToMapOfEvents = (
  eventsLog: Array<any>,
  cancelManyOrderNumber?: number
): IMap<string, any> => {
  if (cancelManyOrderNumber) {
    let msgIndex = (eventsLog[0]['msg_index'] as number) + 1;
    for (let i = 0; i < cancelManyOrderNumber - 1; i++) {
      const newEventLog = { ...eventsLog[0] };
      newEventLog['msg_index'] = msgIndex;
      eventsLog.push(newEventLog);
      msgIndex = msgIndex + 1;
    }
  }
  const output = IMap<string, any>().asMutable();
  for (const eventLog of eventsLog) {
    const bundleIndex = eventLog['msg_index'];
    const events = eventLog['events'];
    for (const event of events) {
      for (const attribute of event.attributes) {
        output.setIn([bundleIndex, event.type, attribute.key], attribute.value);
      }
    }
  }

  return output;
};

export const convertToResponseBody = (input: any): any => {
  let output = input;

  if (IMap.isMap(input)) output = input.toJS();
  for (const key in output) {
    if (IMap.isMap(output[key])) {
      output[key] = output[key].toJS();
    }
  }

  return output;
};

export function convertNonStandardKujiraTokenIds(
  tokensIds: TokenId[]
): TokenId[] {
  const output: TokenId[] = [];

  for (const tokenId of tokensIds) {
    if (tokenId.startsWith('ibc')) {
      const denom = Denom.from(tokenId);

      if (denom.trace && denom.trace.base_denom) {
        output.push(
          getNotNullOrThrowError<string>(denom.trace?.base_denom).replace(
            ':',
            '/'
          )
        );
      }
    }
  }

  return output;
}

export function convertClobBatchOrdersRequestToKujiraPlaceOrdersRequest(
  obj: any
): any {
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      convertClobBatchOrdersRequestToKujiraPlaceOrdersRequest(item)
    );
  } else if (typeof obj === 'object' && obj !== null) {
    const updatedObj: any = {};
    for (const key in obj) {
      let newKey = key;
      let value = obj[key];
      if (key === 'orderType') {
        newKey = 'type';
      } else if (key === 'market') {
        value = value.replace('-', '/');
        newKey = 'marketId';
      }
      updatedObj[newKey] =
        convertClobBatchOrdersRequestToKujiraPlaceOrdersRequest(value);
    }
    return updatedObj;
  } else {
    return obj;
  }
}

export function convertClobBatchOrdersRequestToKujiraCancelOrdersRequest(
  obj: any
): any {
  const { cancelOrderParams, address, ...rest } = obj;
  const ids = [];
  const idsFromCancelOrderParams: ClobDeleteOrderRequestExtract[] =
    cancelOrderParams;
  for (const key of idsFromCancelOrderParams) {
    ids.push(key.orderId);
  }
  const marketId = cancelOrderParams[0].market;

  return {
    ...rest,
    ids: ids,
    marketId: marketId,
    ownerAddress: address,
  };
}
