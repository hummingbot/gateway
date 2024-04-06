import { Big } from 'big.js';
import {
  Contract,
  Transaction,
  Wallet,
  ContractInterface,
  BigNumber,
  ethers,
} from 'ethers';
import {
  Contract as XdcContract,
  Transaction as XdcTransaction,
  Wallet as XdcWallet,
  providers as XdcProviders,
} from 'ethers-xdc';
import { EthereumBase } from '../chains/ethereum/ethereum-base';
import { CosmosAsset, CosmosBase } from '../chains/cosmos/cosmos-base';
import { Provider } from '@ethersproject/abstract-provider';
import { CurrencyAmount, Token, Trade as TradeUniswap } from '@uniswap/sdk';
import { Trade } from '@uniswap/router-sdk';
import { Trade as UniswapV3Trade } from '@uniswap/v3-sdk';
import {
  TradeType,
  Currency,
  CurrencyAmount as UniswapCoreCurrencyAmount,
  Token as UniswapCoreToken,
  Fraction as UniswapFraction,
} from '@uniswap/sdk-core';
import {
  Token as TokenPangolin,
  CurrencyAmount as CurrencyAmountPangolin,
  Trade as TradePangolin,
  Fraction as PangolinFraction,
} from '@pangolindex/sdk';
import {
  Token as TokenQuickswap,
  CurrencyAmount as CurrencyAmountQuickswap,
  Trade as TradeQuickswap,
  Fraction as QuickswapFraction,
} from 'quickswap-sdk';
import {
  Trade as SushiswapTrade,
  Token as SushiToken,
  CurrencyAmount as SushiCurrencyAmount,
  TradeType as SushiTradeType,
  Currency as SushiCurrency,
  Fraction as SushiFraction,
} from '@sushiswap/sdk';
import {
  Token as TokenTraderjoe,
  CurrencyAmount as CurrencyAmountTraderjoe,
  Trade as TradeTraderjoe,
  Fraction as TraderjoeFraction,
} from '@traderjoe-xyz/sdk';
import {
  Token as MMFToken,
  TokenAmount as MMFTokenAmount,
  Pair as MMFPair,
  CurrencyAmount as CurrencyAmountMMF,
  Trade as MMFTrade,
  Fraction as FractionMMF,
  Percent as MMFPercent,
  Currency as MMFCurrency,
  TradeOptions as MMFTradeOptions,
  TradeOptionsDeadline as MMFTradeOptionsDeadline,
  SwapParameters as MMFSwapParameters,
} from '@crocswap/sdk';
import {
  Token as VVSToken,
  TokenAmount as VVSTokenAmount,
  Pair as VVSPair,
  CurrencyAmount as CurrencyAmountVVS,
  Trade as VVSTrade,
  Fraction as FractionVVS,
  Percent as VVSPercent,
  Currency as VVSCurrency,
  TradeOptions as VVSTradeOptions,
  TradeOptionsDeadline as VVSTradeOptionsDeadline,
  SwapParameters as VVSSwapParameters,
} from 'vvs-sdk';
import {
  Token as PancakeSwapToken,
  CurrencyAmount as PancakeSwapCurrencyAmount,
  TradeType as PancakeSwapTradeType,
  Trade as PancakeSwapTrade,
  Fraction as PancakeSwapFraction,
  Currency as PancakeSwapCurrency,
  Price as PancakeSwapPrice,
} from '@pancakeswap/sdk';
import { SmartRouterTrade as PancakeSwapSmartRouterTrade } from '@pancakeswap/smart-router';
import {
  Token as TokenXsswap,
  CurrencyAmount as CurrencyAmountXsswap,
  Trade as TradeXsswap,
  Fraction as XsswapFraction,
} from 'xsswap-sdk';
import { PerpPosition } from '../connectors/perp/perp';
import { XdcBase } from '../chains/xdc/xdc.base';
import { NearBase } from '../chains/near/near.base';
import { TezosBase } from '../chains/tezos/tezos.base';
import { Account, Contract as NearContract } from 'near-api-js';
import { EstimateSwapView, TokenMetadata } from 'coinalpha-ref-sdk';
import { FinalExecutionOutcome } from 'near-api-js/lib/providers';
import {
  ClobDeleteOrderRequest,
  ClobGetOrderRequest,
  ClobGetOrderResponse,
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobPostOrderRequest,
  ClobTickerRequest,
} from '../clob/clob.requests';
import { BalanceRequest } from '../network/network.requests';
import { TradeV2 } from '@traderjoe-xyz/sdk-v2';
import { CurveTrade } from '../connectors/curve/curve';
import { SerializableExtendedPool as CosmosSerializableExtendedPool } from '../chains/osmosis/osmosis.types';
import { CarbonTrade } from '../connectors/carbon/carbonAMM';

// TODO Check the possibility to have clob/solana/serum equivalents here
//  Check this link https://hummingbot.org/developers/gateway/building-gateway-connectors/#5-add-sdk-classes-to-uniswapish-interface
export type Tokenish =
  | Token
  | TokenPangolin
  | UniswapCoreToken
  | TokenQuickswap
  | TokenTraderjoe
  | UniswapCoreToken
  | SushiToken
  | PancakeSwapToken
  | MMFToken
  | VVSToken
  | TokenXsswap
  | CosmosAsset;

export type TokenAmountish = MMFTokenAmount | VVSTokenAmount;

export type Pairish = MMFPair | VVSPair;

export type Percentish = MMFPercent | VVSPercent;

export type UniswapishCurrency = MMFCurrency | VVSCurrency;

export type UniswapishTrade =
  | Trade<Currency, Currency, TradeType>
  | TradePangolin
  | UniswapV3Trade<Currency, UniswapCoreToken, TradeType>
  | TradeQuickswap
  | TradeTraderjoe
  | SushiswapTrade<SushiToken, SushiToken, SushiTradeType>
  | TradeUniswap
  | PancakeSwapTrade<
      PancakeSwapCurrency,
      PancakeSwapCurrency,
      PancakeSwapTradeType
    >
  | (PancakeSwapSmartRouterTrade<PancakeSwapTradeType> & {
      executionPrice: PancakeSwapPrice<
        PancakeSwapCurrency,
        PancakeSwapCurrency
      >;
    })
  | MMFTrade
  | VVSTrade
  | TradeXsswap
  | TradeV2
  | CurveTrade
  | CarbonTrade;

export type UniswapishTradeOptions =
  | MMFTradeOptions
  | MMFTradeOptionsDeadline
  | VVSTradeOptions
  | VVSTradeOptionsDeadline;

export type UniswapishSwapParameters = MMFSwapParameters | VVSSwapParameters;

export type UniswapishAmount =
  | CurrencyAmount
  | CurrencyAmountPangolin
  | CurrencyAmountQuickswap
  | UniswapCoreCurrencyAmount<Currency>
  | CurrencyAmountTraderjoe
  | SushiCurrencyAmount<SushiCurrency | SushiToken>
  | PancakeSwapCurrencyAmount<PancakeSwapCurrency>
  | CurrencyAmountMMF
  | CurrencyAmountVVS
  | CurrencyAmountXsswap
  | UniswapFraction;

export type Fractionish =
  | UniswapFraction
  | PangolinFraction
  | QuickswapFraction
  | TraderjoeFraction
  | SushiFraction
  | PancakeSwapFraction
  | FractionMMF
  | FractionVVS
  | XsswapFraction;

export interface ExpectedTrade {
  trade: UniswapishTrade;
  expectedAmount: UniswapishAmount;
}

export interface PositionInfo {
  token0?: string | undefined;
  token1?: string | undefined;
  poolShares?: string; // COSMOS - GAMM pools only issue poolShares (no amount/unclaimedToken)
  fee?: string | undefined;
  lowerPrice?: string;
  upperPrice?: string;
  amount0?: string; // COSMOS - CL pools only
  amount1?: string; // COSMOS - CL pools only
  unclaimedToken0?: string; // COSMOS - CL pools only
  unclaimedToken1?: string; // COSMOS - CL pools only
  pools?: CosmosSerializableExtendedPool[];
}

export interface Uniswapish {
  /**
   * Router address.
   */
  router: string;

  /**
   * Router smart contract ABI.
   */
  routerAbi: ContractInterface;

  /**
   * Interface for decoding transaction logs
   */
  abiDecoder?: any;

  /**
   * Default gas estiamte for swap transactions.
   */
  gasLimitEstimate: number;

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  ttl: number;

  init(): Promise<void>;

  ready(): boolean;

  balances?(req: BalanceRequest): Promise<Record<string, string>>;

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  getTokenByAddress(address: string): Tokenish;

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   */
  estimateSellTrade(
    baseToken: Tokenish,
    quoteToken: Tokenish,
    amount: BigNumber,
    allowedSlippage?: string,
    poolId?: string,
  ): Promise<ExpectedTrade>;

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  estimateBuyTrade(
    quoteToken: Tokenish,
    baseToken: Tokenish,
    amount: BigNumber,
    allowedSlippage?: string,
    poolId?: string,
  ): Promise<ExpectedTrade>;

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param uniswapRouter Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  executeTrade(
    wallet: Wallet,
    trade: UniswapishTrade,
    gasPrice: number,
    uniswapRouter: string,
    ttl: number,
    abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string,
    poolId?: string,
  ): Promise<Transaction>;
}

export interface RefAMMish {
  /**
   * Router address.
   */
  router: string;

  /**
   * Default gas estiamte for swap transactions.
   */
  gasLimitEstimate: number;

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  ttl: number;

  init(): Promise<void>;

  ready(): boolean;

  balances?(req: BalanceRequest): Promise<Record<string, string>>;

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  getTokenByAddress(address: string): TokenMetadata;

  /**
   * Calculated expected execution price and expected amount in after a swap/trade
   * @param trades The trade path object
   */
  parseTrade(
    trades: EstimateSwapView[],
    side: string
  ): {
    estimatedPrice: string;
    expectedAmount: string;
  };

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   */
  estimateSellTrade(
    baseToken: TokenMetadata,
    quoteToken: TokenMetadata,
    amount: string,
    allowedSlippage?: string
  ): Promise<{ trade: EstimateSwapView[]; expectedAmount: string }>;

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  estimateBuyTrade(
    quoteToken: TokenMetadata,
    baseToken: TokenMetadata,
    amount: string,
    allowedSlippage?: string
  ): Promise<{ trade: EstimateSwapView[]; expectedAmount: string }>;

  /**
   * Given an Account and a Ref trade, try to execute it on blockchain.
   *
   * @param account Account
   * @param trade Expected trade
   * @param amountIn Amount to swap in
   * @param tokenIn Token to be sent
   * @param tokenOut Token to be received
   * @param allowedSlippage Maximum allowable slippage
   */
  executeTrade(
    account: Account,
    trade: EstimateSwapView[],
    amountIn: string,
    tokenIn: TokenMetadata,
    tokenOut: TokenMetadata,
    allowedSlippage?: string
  ): Promise<FinalExecutionOutcome>;
}

export interface UniswapLPish {
  /**
   * Router address.
   */
  router: string;

  /**
   * Router smart contract ABI.
   */
  routerAbi: ContractInterface;

  /**
   * NTF manager address.
   */
  nftManager: string;

  /**
   * NTF manager smart contract ABI.
   */
  nftAbi: ContractInterface;

  /**
   * Pool smart contract ABI.
   */
  poolAbi: ContractInterface;

  /**
   * Interface for decoding transaction logs
   */
  abiDecoder: any;

  /**
   * Default gas limit used to estimate gasCost for swap transactions.
   */
  gasLimitEstimate: number;

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  ttl: number;

  init(): Promise<void>;

  ready(): boolean;

  balances?(req: BalanceRequest): Promise<Record<string, string>>;

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  getTokenByAddress(address: string): Tokenish;

  /**
   * Given a wallet and tokenId, fetch info about position.
   *
   * @param tokenId: id of exiting position to fetch liquidity data
   */
  getPosition(tokenId: number): Promise<PositionInfo>;

  /**
   * Given a wallet, add/increase liquidity for a position.
   *
   * @param wallet Wallet for the transaction
   * @param token0 Token 1 for position
   * @param token1 Token 0 for position
   * @param amount0 Amount of `token0` to put into the position
   * @param amount1 Amount of `token1` to put into the position
   * @param fee Fee tier of position,
   * @param lowerPrice lower price bound of the position
   * @param upperPrice upper price bound for the position
   * @param tokenId id of exiting position to increase liquidity
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  addPosition(
    wallet: Wallet,
    token0: UniswapCoreToken,
    token1: UniswapCoreToken,
    amount0: string,
    amount1: string,
    fee: string,
    lowerPrice: number,
    upperPrice: number,
    tokenId: number,
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    poolId?: string,
  ): Promise<Transaction>;

  /**
   * Given a wallet, reduce/remove liquidity for a position.
   *
   * @param wallet Wallet for the transaction
   * @param tokenId id of exiting position to decrease liquidity
   * @param decreasePercent: percentage of liquidity to remove
   * @param getFee used to estimate the gas cost of closing position
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  reducePosition(
    wallet: Wallet,
    tokenId: number,
    decreasePercent: number,
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction>;

  /**
   * Given a wallet and tokenId, collect earned fees on position.
   *
   * @param wallet Wallet for the transaction
   * @param tokenId id of exiting position to collet earned fees
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  collectFees(
    wallet: Wallet,
    tokenId: number,
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction | { amount0: BigNumber; amount1: BigNumber }>;

  /**
   * Given a fee tier, tokens and time parameters, fetch historical pool prices.
   *
   * @param token0 Token in pool
   * @param token1 Token in pool
   * @param fee fee tier
   * @param period total period of time to fetch pool prices in seconds
   * @param interval interval within period to fetch pool prices
   */
  poolPrice(
    token0: UniswapCoreToken,
    token1: UniswapCoreToken,
    fee: string,
    period: number,
    interval: number,
    poolId?: string,
  ): Promise<string[]>;
}

export interface Perpish {
  gasLimit: number;

  init(): Promise<void>;

  ready(): boolean;

  balances?(req: BalanceRequest): Promise<Record<string, string>>;

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  getTokenByAddress(address: string): Tokenish;

  /**
   * Function for retrieving token list.
   * @returns a list of available marker pairs.
   */
  availablePairs(): string[];

  /**
   * Give a market, queries for market, index and indexTwap prices.
   * @param tickerSymbol Market pair
   */
  prices(tickerSymbol: string): Promise<{
    markPrice: Big;
    indexPrice: Big;
    indexTwapPrice: Big;
  }>;

  /**
   * Used to know if a market is active/tradable.
   * @param tickerSymbol Market pair
   * @returns true | false
   */
  isMarketActive(tickerSymbol: string): Promise<boolean>;

  /**
   * Gets available Positions/Position.
   * @param tickerSymbol An optional parameter to get specific position.
   * @returns Return all Positions or specific position.
   */
  getPositions(tickerSymbol: string): Promise<PerpPosition | undefined>;

  /**
   * Attempts to return balance of a connected acct
   */
  getAccountValue(): Promise<Big>;

  /**
   * Given the necessary parameters, open a position.
   * @param isLong Will create a long position if true, else a short pos will be created.
   * @param tickerSymbol the market to create position on.
   * @param minBaseAmount the min amount for the position to be opened.
   * @returns An ethers transaction object.
   */
  openPosition(
    isLong: boolean,
    tickerSymbol: string,
    minBaseAmount: string,
    allowedSlippage?: string
  ): Promise<Transaction>;

  /**
   * Closes an open position on the specified market.
   * @param tickerSymbol The market on which we want to close position.
   * @returns An ethers transaction object.
   */
  closePosition(
    tickerSymbol: string,
    allowedSlippage?: string
  ): Promise<Transaction>;
}

export interface BasicChainMethods {
  getSpender(reqSpender: string): string;
  gasPrice: number;
  nativeTokenSymbol: string;
  chain: string;
}

export interface Chain extends BasicChainMethods, EthereumBase {
  controller: any;
  cancelTx(wallet: Wallet, nonce: number): Promise<Transaction>;
  getContract(
    tokenAddress: string,
    signerOrProvider?: Wallet | Provider
  ): Contract;
}

export type Ethereumish = Chain;

export interface Xdcish extends BasicChainMethods, XdcBase {
  cancelTx(wallet: XdcWallet, nonce: number): Promise<XdcTransaction>;
  getContract(
    tokenAddress: string,
    signerOrProvider?: XdcWallet | XdcProviders.Provider
  ): XdcContract;
}

export interface PriceLevel {
  price: string;
  quantity: string;
  timestamp: number;
}
export interface Orderbook {
  buys: PriceLevel[];
  sells: PriceLevel[];
}

export interface MarketInfo {
  [key: string]: any;
}

export interface CLOBish {
  parsedMarkets: MarketInfo;

  abiDecoder?: any;

  loadMarkets(): Promise<void>;

  init(): Promise<void>;

  ready(): boolean;

  markets(req: ClobMarketsRequest): Promise<{ markets: MarketInfo }>;

  orderBook(req: ClobOrderbookRequest): Promise<Orderbook>;

  ticker(req: ClobTickerRequest): Promise<{ markets: MarketInfo }>;

  orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }>;

  postOrder(req: ClobPostOrderRequest): Promise<{ txHash: string }>;

  deleteOrder(req: ClobDeleteOrderRequest): Promise<{ txHash: string }>;

  balances?(req: BalanceRequest): Promise<Record<string, string>>;

  estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  };
}

export interface Nearish extends BasicChainMethods, NearBase {
  cancelTx(account: Account, nonce: number): Promise<string>;
  getContract(tokenAddress: string, account: Account): NearContract;
}

export interface Cosmosish extends CosmosBase {
  gasPrice: number;
  nativeTokenSymbol: string;
  chain: string;
}

export interface Tezosish extends TezosBase {
  gasPrice: number;
  gasLimitTransaction: number;
  nativeTokenSymbol: string;
  chain: string;
}

export interface NetworkSelectionRequest {
  chain: string; //the target chain (e.g. ethereum, avalanche, or harmony)
  network: string; // the target network of the chain (e.g. mainnet)
  connector?: string; //the target connector (e.g. uniswap or pangolin)
}

export class ResponseWrapper<T> {
  get status(): number {
    return this._status || -1;
  }
  set status(value: number) {
    this._status = value;
  }
  private _status: number | undefined;

  title?: string;
  message?: string;
  body?: T;
}

export interface CustomTransactionReceipt
  extends Omit<
    ethers.providers.TransactionReceipt,
    'gasUsed' | 'cumulativeGasUsed' | 'effectiveGasPrice'
  > {
  gasUsed: string;
  cumulativeGasUsed: string;
  effectiveGasPrice: string | null;
}

export interface CustomTransaction
  extends Omit<
    Transaction,
    'maxPriorityFeePerGas' | 'maxFeePerGas' | 'gasLimit' | 'value' | 'chainId'
  > {
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  gasLimit: string | null;
  chainId: number | string;
  value: string;
}

export interface CustomTransactionResponse
  extends Omit<
    ethers.providers.TransactionResponse,
    'gasPrice' | 'gasLimit' | 'value'
  > {
  gasPrice: string | null;
  gasLimit: string;
  value: string;
}

export interface TransferRequest extends NetworkSelectionRequest {
  to: string;
  from: string;
  amount: string;
  token: string;
}

export type TransferResponse = string | FullTransferResponse;

export interface FullTransferResponse {
  network: string;
  timestamp: number;
  latency: number;
  amount: string;
  gasPrice: string;
  gasLimit: string;
  gasUsed: string;
  gasWanted: string;
  txHash: string;
}