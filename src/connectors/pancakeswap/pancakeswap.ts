/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  Currency,
  CurrencyAmount,
  Fetcher,
  Pair,
  Percent,
  Price,
  Router,
  SwapParameters,
  Token,
  Trade,
  TradeType,
} from '@pancakeswap/sdk';
import {
  BigNumber,
  Contract,
  ContractInterface,
  ContractTransaction,
  Transaction,
  Wallet,
} from 'ethers';
import { BinanceSmartChain } from '../../chains/binance-smart-chain/binance-smart-chain';
import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
import { percentRegexp } from '../../services/config-manager-v2';
import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
  UniswapishPriceError,
} from '../../services/error-handler';
import { logger } from '../../services/logger';
import { isFractionString } from '../../services/validators';
import { PancakeSwapConfig } from './pancakeswap.config';
import routerAbi from './pancakeswap_router_abi.json';
import { PublicClient, createPublicClient, http, getAddress } from 'viem';
import { GraphQLClient } from 'graphql-request';
import { Pool, SmartRouter } from '@pancakeswap/smart-router';
import { bsc, bscTestnet } from '@wagmi/chains';

export class PancakeSwap implements Uniswapish {
  private static _instances: { [name: string]: PancakeSwap };
  private bsc: BinanceSmartChain;
  private chainId;

  private _chain: string;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _maximumHops: number;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private readonly _useRouter: boolean;

  private constructor(chain: string, network: string) {
    const config = PancakeSwapConfig.config;
    this.bsc = BinanceSmartChain.getInstance(network);
    this.chainId = this.bsc.chainId;

    this._chain = chain;
    this._router = config.routerAddress(network);
    this._ttl = config.ttl;
    this._maximumHops = config.maximumHops ?? 1;
    this._routerAbi = routerAbi.abi;
    this._gasLimitEstimate = config.gasLimitEstimate;

    if (config.useRouter === false && config.feeTier == null) {
      throw new Error('Must specify fee tier if not using router');
    }

    this._useRouter = config.useRouter ?? true;
  }

  public static getInstance(chain: string, network: string): PancakeSwap {
    if (PancakeSwap._instances === undefined) {
      PancakeSwap._instances = {};
    }
    if (!(chain + network in PancakeSwap._instances)) {
      PancakeSwap._instances[chain + network] = new PancakeSwap(chain, network);
    }

    return PancakeSwap._instances[chain + network];
  }

  public async init() {
    if (this._chain == 'binance-smart-chain' && !this.bsc.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('BinanceSmartChain'),
        SERVICE_UNITIALIZED_ERROR_CODE
      );
    for (const token of this.bsc.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name
      );
    }
    this._ready = true;
  }

  /*
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[getAddress(address)];
  }

  /**
   * Determines if the connector is ready.
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Router address.
   */
  public get router(): string {
    return this._router;
  }

  /**
   * Router smart contract ABI.
   */
  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  /**
   * Default gas limit for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  public get ttl(): number {
    return this._ttl;
  }

  /**
   * Default maximum number of hops for to go through for a swap transactions.
   */
  public get maximumHops(): number {
    return this._maximumHops;
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): Percent {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return new Percent(fractionSplit[0], fractionSplit[1]);
    }

    const allowedSlippage = PancakeSwapConfig.config.allowedSlippage;
    const matches = allowedSlippage.match(percentRegexp);
    if (matches) return new Percent(matches[1], matches[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const nativeTokenAmount: CurrencyAmount<Token> =
      CurrencyAmount.fromRawAmount(baseToken, amount.toString());

    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );

    if (this._useRouter) {
      const quoteProvider = SmartRouter.createQuoteProvider({
        // @ts-ignore
        onChainProvider: () => this.createPublicClient(),
      });
      const pools = await this.getPools(baseToken, quoteToken);

      const trade = await SmartRouter.getBestTrade(
        nativeTokenAmount,
        quoteToken,
        TradeType.EXACT_OUTPUT,
        {
          gasPriceWei: () => this.createPublicClient().getGasPrice(),
          maxHops: this._maximumHops,
          maxSplits: 1,
          poolProvider: SmartRouter.createStaticPoolProvider(pools),
          quoteProvider,
          quoterOptimization: true,
        }
      );

      if (!trade) {
        throw new UniswapishPriceError(
          `priceSwapOut: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`
        );
      }
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${trade.inputAmount.toExact()}` +
          `${baseToken.symbol}.`
      );

      return {
        trade: {
          ...trade,
          executionPrice: new Price(
            trade.inputAmount.currency,
            trade.outputAmount.currency,
            trade.inputAmount.quotient,
            trade.outputAmount.quotient
          ),
        },
        expectedAmount: trade.inputAmount,
      };
    } else {
      const pair: Pair = await Fetcher.fetchPairData(
        quoteToken,
        baseToken,
        this.bsc.provider
      );
      const trades: Trade<Currency, Currency, TradeType>[] =
        Trade.bestTradeExactOut([pair], quoteToken, nativeTokenAmount, {
          maxHops: this._maximumHops,
        });
      if (!trades || trades.length === 0) {
        throw new UniswapishPriceError(
          `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
        );
      }
      logger.info(
        `Best trade for ${quoteToken.address}-${baseToken.address}: ` +
          `${trades[0].executionPrice.invert().toFixed(6)} ` +
          `${baseToken.name}.`
      );

      const expectedAmount = trades[0].maximumAmountIn(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade: trades[0], expectedAmount };
    }
  }

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const nativeTokenAmount: CurrencyAmount<Token> =
      CurrencyAmount.fromRawAmount(baseToken, amount.toString());

    logger.info(
      `Fetching pair data for ${baseToken.address}-${quoteToken.address}.`
    );

    if (this._useRouter) {
      const quoteProvider = SmartRouter.createQuoteProvider({
        // @ts-ignore
        onChainProvider: () => this.createPublicClient(),
      });
      const pools = await this.getPools(baseToken, quoteToken);

      const trade = await SmartRouter.getBestTrade(
        nativeTokenAmount,
        quoteToken,
        TradeType.EXACT_INPUT,
        {
          gasPriceWei: () => this.createPublicClient().getGasPrice(),
          maxHops: this._maximumHops,
          maxSplits: 1,
          poolProvider: SmartRouter.createStaticPoolProvider(pools),
          quoteProvider,
          quoterOptimization: true,
        }
      );

      if (!trade) {
        throw new UniswapishPriceError(
          `priceSwapIn: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`
        );
      }
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${trade.outputAmount.toExact()}` +
          `${baseToken.symbol}.`
      );

      return {
        trade: {
          ...trade,
          executionPrice: new Price(
            trade.inputAmount.currency,
            trade.outputAmount.currency,
            trade.inputAmount.quotient,
            trade.outputAmount.quotient
          ),
        },
        expectedAmount: trade.outputAmount,
      };
    } else {
      const pair: Pair = await Fetcher.fetchPairData(
        baseToken,
        quoteToken,
        this.bsc.provider
      );
      const trades: Trade<Currency, Currency, TradeType>[] =
        Trade.bestTradeExactIn([pair], nativeTokenAmount, quoteToken, {
          maxHops: this._maximumHops,
        });
      if (!trades || trades.length === 0) {
        throw new UniswapishPriceError(
          `priceSwapIn: no trade pair found for ${baseToken} to ${quoteToken}.`
        );
      }
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${trades[0].executionPrice.toFixed(6)}` +
          `${baseToken.name}.`
      );
      const expectedAmount = trades[0].minimumAmountOut(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade: trades[0], expectedAmount };
    }
  }

  /**
   * Given a wallet and a Uniswap trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param pancakeswapRouter Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async executeTrade(
    wallet: Wallet,
    trade: Trade<Currency, Currency, TradeType>,
    gasPrice: number,
    pancakeswapRouter: string,
    ttl: number,
    abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    const result: SwapParameters = Router.swapCallParameters(trade, {
      ttl,
      recipient: wallet.address,
      allowedSlippage: this.getAllowedSlippage(allowedSlippage),
    });

    const contract: Contract = new Contract(pancakeswapRouter, abi, wallet);
    if (nonce === undefined) {
      nonce = await this.bsc.nonceManager.getNextNonce(wallet.address);
    }
    let tx: ContractTransaction;
    if (maxFeePerGas || maxPriorityFeePerGas) {
      tx = await contract[result.methodName](...result.args, {
        gasLimit: gasLimit,
        value: result.value,
        nonce: nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else {
      tx = await contract[result.methodName](...result.args, {
        gasPrice: (gasPrice * 1e9).toFixed(0),
        gasLimit: gasLimit.toFixed(0),
        value: result.value,
        nonce: nonce,
      });
    }

    logger.info(`Transaction Details: ${JSON.stringify(tx)}`);
    await this.bsc.nonceManager.commitNonce(wallet.address, nonce);
    return tx;
  }

  async getPools(currencyA: Currency, currencyB: Currency): Promise<Pool[]> {
    const v3SubgraphClient = new GraphQLClient(
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc'
    );
    const v2SubgraphClient = new GraphQLClient(
      'https://proxy-worker-api.pancakeswap.com/bsc-exchange'
    );

    const pairs = SmartRouter.getPairCombinations(currencyA, currencyB);

    // Create v2 candidate pool fetcher with your own on-chain fetcher
    const getV2PoolsByCommonTokenPrices =
      SmartRouter.createV2PoolsProviderByCommonTokenPrices(
        SmartRouter.getCommonTokenPricesBySubgraph
      );
    const getV2CandidatePools = SmartRouter.createGetV2CandidatePools(
      getV2PoolsByCommonTokenPrices
    );

    // Define v3 pool on-chain fetcher with customized tvl references
    const getV3CandidatePools = SmartRouter.createGetV3CandidatePools(
      // Use your customized v3 pool fetcher by default
      SmartRouter.getV3PoolsWithTvlFromOnChain,
      {
        fallbacks: [],
        // In millisecond
        // Will try fallback fetcher if the default doesn't respond in 2s
        fallbackTimeout: 1500,
      }
    );

    const allPools = await Promise.allSettled([
      // @ts-ignore
      SmartRouter.getStablePoolsOnChain(pairs, () => this.createPublicClient()),
      getV2CandidatePools({
        // @ts-ignore
        onChainProvider: () => this.createPublicClient(),
        // @ts-ignore
        v2SubgraphProvider: () => v2SubgraphClient,
        // @ts-ignore
        v3SubgraphProvider: () => v3SubgraphClient,
        currencyA,
        currencyB,
      }),
      getV3CandidatePools({
        // @ts-ignore
        onChainProvider: () => this.createPublicClient(),
        // @ts-ignore
        subgraphProvider: () => v3SubgraphClient,
        currencyA,
        currencyB,
        subgraphCacheFallback: true,
      }),
    ]);

    const fulfilledPools = allPools.reduce((acc, pool) => {
      if (pool.status === 'fulfilled') {
        return [...acc, ...pool.value];
      }
      return acc;
    }, [] as Pool[]);

    return fulfilledPools.flat();
  }

  private createPublicClient(): PublicClient {
    const transportUrl = this.bsc.rpcUrl;

    return createPublicClient({
      chain: this.chainId === 56 ? bsc : bscTestnet,
      transport: http(transportUrl),
      batch: {
        multicall: {
          batchSize: 1024 * 200,
        },
      },
    });
  }
}
