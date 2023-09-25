import { Denom, fin } from 'kujira.js';
import { ExecuteResult } from '@cosmjs/cosmwasm-stargate';

import { Map as ImmutableMap } from 'immutable';
import { BigNumber } from 'bignumber.js';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { AccountData } from '@cosmjs/proto-signing/build/signer';
import { SigningStargateClient } from '@cosmjs/stargate';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient';
import { DeliverTxResponse } from '@cosmjs/stargate/build/stargateclient';
import { Event } from '@cosmjs/stargate/build/events';

//
//  Types and Constants
//

export type KujiraOrder = DeliverTxResponse;
export type KujiraEvent = Event;

export type AsyncFunctionType<Arguments extends any[], Return> = (
  ...args: Arguments
) => Promise<Return>;

export type IMap<K, V> = ImmutableMap<K, V>;
export const IMap = ImmutableMap;

export type BasicKujiraToken = Denom;
export type BasicKujiraMarket = fin.Pair;

export type KujiraWithdraw = ExecuteResult;

export type Address = string;
export type OwnerAddress = Address;
export type PayerAddress = Address;
export type Price = BigNumber;
export type Amount = BigNumber;
export type Fee = BigNumber;
export type Timestamp = number;
export type Block = number;
export type EncryptedWallet = string;

export type ConnectorMarket = any;
export type ConnectorTicker = any;
export type ConnectorOrderBook = any;
export type ConnectorOrder = any;

export type TokenId = Address;
export type TokenName = string;
export type TokenSymbol = string;
export type TokenDecimals = number;

export type MarketName = string;
export type MarketId = Address;
export type MarketPrecision = number;
export type MarketProgramId = Address;
export type MarketDeprecation = boolean;
export type MarketMinimumOrderSize = BigNumber;
export type MarketMinimumPriceIncrement = BigNumber;
export type MarketMinimumBaseIncrement = BigNumber;
export type MarketMinimumQuoteIncrement = BigNumber;

export type TickerPrice = Price;
export type TickerTimestamp = Timestamp;

export type TransactionHash = string;

export type OrderId = string;
export type OrderClientId = string;
export type OrderMarketName = MarketName;
export type OrderMarketId = MarketId;
export type OrderMarket = Market;
export type OrderOwnerAddress = OwnerAddress;
export type OrderPayerAddress = PayerAddress;
export type OrderPrice = Price;
export type OrderAmount = Amount;
export type OrderFee = Fee;
export type OrderCreationTimestamp = Timestamp;
export type OrderFillingTimestamp = Timestamp;
export type OrderTransactionHashes = TransactionHashes;

export type Withdraw = {
  hash: TransactionHash;
};

export type FeeMaker = Fee;
export type FeeTaker = Fee;
export type FeeServiceProvider = Fee;

export type EstimatedFeesToken = string;
export type EstimatedFeesPrice = Price;
export type EstimateFeesLimit = BigNumber;
export type EstimateFeesCost = BigNumber;

export type Mnemonic = string;
export type AccountNumber = number;

export interface TokenInfo {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export type TokenListType = 'FILE' | 'URL';

//
//  Enums
//

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  CANCELLED = 'CANCELLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CREATION_PENDING = 'CREATION_PENDING',
  CANCELLATION_PENDING = 'CANCELLATION_PENDING',
  UNKNOWN = 'UNKNOWN',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  IOC = 'IOC', // Immediate or Cancel
}

export enum ConvertOrderType {
  GET_ORDERS = 'getOrders',
  PLACE_ORDERS = 'placeOrders',
  CANCELLED_ORDERS = 'cancelledOrders',
}

export enum RequestStrategy {
  RESTful = 'RESTful',
  Controller = 'Controller',
}

export enum RESTfulMethod {
  // noinspection JSUnusedGlobalSymbols
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

//
//  Interfaces
//

export interface KujiraTicker {
  price: Price;
}

export interface KujiraOrderBookItem {
  quote_price: string;
  offer_denom: {
    native: string;
  };
  total_offer_amount: string;
}

export interface KujiraOrderBook {
  base: KujiraOrderBookItem[];
  quote: KujiraOrderBookItem[];
}

export interface Token {
  id: TokenId;
  name: TokenName;
  symbol: TokenSymbol;

  decimals: TokenDecimals;
}

export interface Market {
  id: MarketId;
  name: MarketName;
  baseToken: Token;
  quoteToken: Token;
  precision: MarketPrecision;
  minimumOrderSize: MarketMinimumOrderSize;
  minimumPriceIncrement: MarketMinimumPriceIncrement; // Also called tickSize
  minimumBaseAmountIncrement: MarketMinimumBaseIncrement;
  minimumQuoteAmountIncrement: MarketMinimumQuoteIncrement;
  fees: MarketFee;
  programId?: MarketProgramId;
  deprecated?: MarketDeprecation;
  connectorMarket: ConnectorMarket;
}

export interface OrderBook {
  market: Market;
  bids: IMap<OrderId, Order>;
  asks: IMap<OrderId, Order>;
  bestBid?: Order;
  bestAsk?: Order;
  connectorOrderBook: ConnectorOrderBook;
}

export interface Ticker {
  market: Market;
  price: TickerPrice;
  timestamp: TickerTimestamp;
  ticker: ConnectorTicker;
}

export interface Balance {
  token: Token | 'total';
  ticker?: Ticker;
  free: Amount;
  lockedInOrders: Amount;
  unsettled: Amount;
}

export interface Balances {
  tokens: IMap<TokenId, Balance>;
  total: Balance;
}

export interface Order {
  id?: OrderId;
  clientId?: OrderClientId; // Client custom id
  marketName: OrderMarketName;
  marketId: OrderMarketId;
  market: OrderMarket;
  ownerAddress?: OrderOwnerAddress;
  payerAddress?: OrderPayerAddress;
  price?: OrderPrice;
  amount: OrderAmount;
  side: OrderSide;
  status?: OrderStatus;
  type?: OrderType;
  fee?: OrderFee;
  creationTimestamp?: OrderCreationTimestamp;
  fillingTimestamp?: OrderFillingTimestamp;
  hashes?: OrderTransactionHashes;
  connectorOrder?: ConnectorOrder;
}

export interface TransactionHashes {
  creation?: TransactionHash;
  cancellation?: TransactionHash;
  withdraw?: TransactionHash;
  creations?: TransactionHash[];
  cancellations?: TransactionHash[];
  withdraws?: TransactionHash[];
}

export interface MarketFee {
  maker: FeeMaker;
  taker: FeeTaker;
  serviceProvider: FeeServiceProvider;
}

export interface EstimatedFees {
  token: EstimatedFeesToken;
  price: EstimatedFeesPrice;
  limit: EstimateFeesLimit;
  cost: EstimateFeesCost;
}

export interface Transaction {
  hash: TransactionHash;
  blockNumber: number;
  gasUsed: number;
  gasWanted: number;
  code: number;
  data: any;
}

export interface BasicWallet {
  mnemonic: Mnemonic;

  accountNumber: AccountNumber;

  publicKey: Address;
}

export interface KujiraWalletArtifacts {
  publicKey: Address;

  accountData: AccountData;

  accountNumber: AccountNumber;

  directSecp256k1HdWallet: DirectSecp256k1HdWallet;

  signingStargateClient: SigningStargateClient;

  signingCosmWasmClient: SigningCosmWasmClient;

  finClients: IMap<MarketId, fin.FinClient>;
}

//
//  Errors
//

export class CLOBishError extends Error {}

export class TokenNotFoundError extends CLOBishError {}

export class MarketNotFoundError extends CLOBishError {}

export class BalanceNotFoundError extends CLOBishError {}

export class OrderBookNotFoundError extends CLOBishError {}

export class TickerNotFoundError extends CLOBishError {}

export class OrderNotFoundError extends CLOBishError {}

export class TransactionNotFoundError extends CLOBishError {}

export class WalletPublicKeyNotFoundError extends CLOBishError {}

//
//  Main methods options
//

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetRootRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetRootResponse {
  chain: string;
  network: string;
  connector: string;
  connection: boolean;
  timestamp: number;
}

export interface GetTokenRequest {
  id?: TokenId;
  name?: TokenName;
  symbol?: TokenSymbol;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTokenResponse extends Token {}

export interface GetTokensRequest {
  ids?: TokenId[];
  names?: TokenName[];
  symbols?: TokenSymbol[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTokensResponse extends IMap<TokenId, Token> {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllTokensRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllTokensResponse extends IMap<TokenId, Token> {}

export interface GetTokenSymbolsToTokenIdsMapRequest {
  symbols?: TokenSymbol[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTokenSymbolsToTokenIdsMapResponse
  extends IMap<TokenSymbol, TokenId> {}

export interface GetMarketRequest {
  id?: MarketId;
  name?: MarketName;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetMarketResponse extends Market {}

export interface GetMarketsRequest {
  ids?: MarketId[];
  names?: MarketName[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetMarketsResponse extends IMap<MarketId, Market> {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllMarketsRequest extends GetMarketsRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllMarketsResponse extends IMap<MarketId, Market> {}

export interface GetOrderBookRequest {
  marketId?: MarketId;
  marketName?: MarketName;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetOrderBookResponse extends OrderBook {}

export interface GetOrderBooksRequest {
  marketIds?: MarketId[];
  marketNames?: MarketName[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetOrderBooksResponse extends IMap<MarketId, OrderBook> {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllOrderBooksRequest extends GetOrderBooksRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllOrderBooksResponse extends IMap<MarketId, OrderBook> {}

export interface GetTickerRequest {
  marketId?: MarketId;
  marketName?: MarketName;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTickerResponse extends Ticker {}

export interface GetTickersRequest {
  marketIds?: MarketId[];
  marketNames?: MarketName[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTickersResponse extends IMap<MarketId, Ticker> {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllTickersRequest extends GetTickersRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllTickersResponse extends IMap<MarketId, Ticker> {}

export interface GetWalletArtifactsRequest {
  ownerAddress: OwnerAddress;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetBalanceRequest {
  tokenId: TokenId;
  tokenSymbol: TokenSymbol;
  ownerAddress: OwnerAddress;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetBalanceResponse extends Balance {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetBalancesRequest {
  tokenIds?: TokenId[];
  tokenSymbols?: TokenSymbol[];
  ownerAddress: OwnerAddress;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetBalancesResponse extends Balances {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllBalancesRequest {
  ownerAddress: OwnerAddress;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetAllBalancesResponse extends Balances {}

export interface GetOrderRequest {
  id: OrderId;
  marketId?: MarketId;
  marketName?: MarketName;
  marketIds?: MarketId[];
  marketNames?: MarketName[];
  ownerAddress: OrderOwnerAddress;
  status?: OrderStatus;
  statuses?: OrderStatus[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetOrderResponse extends Order {}

export interface GetOrdersRequest {
  ids?: OrderId[];
  marketId?: MarketId;
  marketName?: MarketName;
  marketIds?: MarketId[];
  marketNames?: MarketName[];
  ownerAddress?: OrderOwnerAddress;
  ownerAddresses?: OrderOwnerAddress[];
  status?: OrderStatus;
  statuses?: OrderStatus[];
}

export type GetOrdersResponse =
  | IMap<OrderId, Order>
  | IMap<OwnerAddress, IMap<OrderId, Order>>;

export interface PlaceOrderRequest {
  clientId?: OrderClientId;
  marketId?: MarketId;
  marketName?: MarketName;
  ownerAddress?: OrderOwnerAddress;
  side: OrderSide;
  price: OrderPrice;
  amount: OrderAmount;
  type: OrderType;
  payerAddress?: OrderPayerAddress;
  replaceIfExists?: boolean;
  waitUntilIncludedInBlock?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PlaceOrderResponse extends Order {}

export interface PlaceOrdersRequest {
  ownerAddress?: OrderOwnerAddress;
  orders: PlaceOrderRequest[];
  waitUntilIncludedInBlock?: boolean;
  replaceIfExists?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PlaceOrdersResponse extends IMap<OrderId, Order> {}

export interface CancelOrderRequest {
  id: OrderId;
  clientId?: OrderClientId;
  ownerAddress: OrderOwnerAddress;
  marketId?: MarketId;
  marketName?: MarketName;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CancelOrderResponse extends Order {}

export interface CancelOrdersRequest {
  ids: OrderId[];
  clientIds?: OrderClientId[];
  marketId?: MarketId;
  marketIds?: MarketId[];
  marketName?: MarketName;
  marketNames?: MarketName[];
  ownerAddress?: OrderOwnerAddress;
  ownerAddresses?: OrderOwnerAddress[];
}

export type CancelOrdersResponse =
  | IMap<OrderId, Order>
  | IMap<OwnerAddress, IMap<OrderId, Order>>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CancelAllOrdersRequest {
  marketId?: MarketId;
  marketName?: MarketName;
  marketIds?: MarketId[];
  marketNames?: MarketName[];
  ownerAddress?: OrderOwnerAddress;
  ownerAddresses?: OrderOwnerAddress[];
}

export type CancelAllOrdersResponse = CancelOrdersResponse;

export interface TransferFromToRequest {
  from: OwnerAddress;
  to: OwnerAddress;
  amount: OrderAmount;
  tokenId?: TokenId;
  tokenSymbol?: TokenSymbol;
}

export type TransferFromToResponse = TransactionHash;

export interface MarketWithdrawRequest {
  marketId?: MarketId;
  marketName?: MarketName;
  ownerAddress?: OrderOwnerAddress;
  ownerAddresses?: OrderOwnerAddress[];
}

export type MarketWithdrawResponse = Withdraw | IMap<OwnerAddress, Withdraw>;

export interface MarketsWithdrawsRequest {
  marketIds?: MarketId[];
  marketNames?: MarketName[];
  ownerAddress?: OrderOwnerAddress;
  ownerAddresses?: OrderOwnerAddress[];
}

export type MarketsWithdrawsFundsResponse =
  | IMap<MarketId, Withdraw>
  | IMap<OwnerAddress, IMap<MarketId, Withdraw>>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AllMarketsWithdrawsRequest extends MarketsWithdrawsRequest {}

export type AllMarketsWithdrawsResponse = MarketsWithdrawsFundsResponse;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetCurrentBlockRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type GetCurrentBlockResponse = Block;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTransactionRequest {
  hash: TransactionHash;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTransactionResponse extends Transaction {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTransactionsRequest {
  hashes: TransactionHash[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetTransactionsResponse
  extends IMap<TransactionHash, Transaction> {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetEstimatedFeesRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetEstimatedFeesResponse extends EstimatedFees {}

export interface GetWalletPublicKeyRequest {
  mnemonic: Mnemonic;
  accountNumber: AccountNumber;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type GetWalletPublicKeyResponse = Address;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetWalletsPublicKeysRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type GetWalletsPublicKeysResponse = Address[];

export interface EncryptWalletRequest {
  wallet: BasicWallet;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type EncryptWalletResponse = EncryptedWallet;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DecryptWalletRequest {
  accountAddress: OwnerAddress;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type DecryptWalletResponse = BasicWallet;

//
// Extensions
//

export interface LatencyData {
  endpoint: string;
  latency: number;
  latestBlockTime: Date;
}
