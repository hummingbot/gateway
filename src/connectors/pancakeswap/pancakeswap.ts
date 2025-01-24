/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  Currency,
  CurrencyAmount,
  Percent,
  Token,
  TradeType,
} from '@pancakeswap/sdk';
import {
  BigNumber,
  ContractInterface,
  ContractTransaction,
  Transaction,
  Wallet,
} from 'ethers';
import { BinanceSmartChain } from '../../chains/binance-smart-chain/binance-smart-chain';
import { Ethereum } from '../../chains/ethereum/ethereum';
import {
  ExpectedTrade,
  Uniswapish,
  UniswapishTrade,
} from '../../services/common-interfaces';
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
import {
  Pool,
  PoolType,
  SmartRouter,
  SmartRouterTrade,
  SwapRouter,
} from '@pancakeswap/smart-router';
import { mainnet, arbitrum, zkSync, bsc, bscTestnet } from '@wagmi/chains';
import { MethodParameters } from '@pancakeswap/v3-sdk';

export class PancakeSwap implements Uniswapish {
  private static _instances: { [name: string]: PancakeSwap };
  private chainId;
  private _chain: string;
  private chain: Ethereum | BinanceSmartChain;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _maximumHops: number;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private constructor(chain: string, network: string) {
    const config = PancakeSwapConfig.config;
    if (chain === 'ethereum') {
      this.chain = Ethereum.getInstance(network);
    } else {
      this.chain = BinanceSmartChain.getInstance(network);
    }

    this._chain = chain;
    this.chainId = this.getChainId(chain, network);
    this._router = config.routerAddress(network);
    this._ttl = config.ttl;
    this._maximumHops = config.maximumHops ?? 1;
    this._routerAbi = routerAbi.abi;
    this._gasLimitEstimate = config.gasLimitEstimate;
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

  public getChainId(chain: string, network: string): number {
    if (chain === 'binance-smart-chain') {
      return BinanceSmartChain.getInstance(network).chainId;
    } else return Ethereum.getInstance(network).chainId;
  }

  public async init() {
    const chainName = this.chain.toString();
    if (!this.chain.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE(chainName),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    for (const token of this.chain.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name,
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
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.',
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
   * @param _allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    _allowedSlippage?: string,
  ): Promise<ExpectedTrade> {
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`,
    );

    const trade = await this.getBestTrade(
      baseToken,
      quoteToken,
      amount,
      TradeType.EXACT_OUTPUT,
    );

    if (!trade) {
      throw new UniswapishPriceError(
        `priceSwapOut: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`,
      );
    }
    logger.info(
      `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
        `${trade.inputAmount.toExact()}` +
        `${baseToken.symbol}.`,
    );

    return {
      trade: {
        ...trade,
        //@ts-ignore
        executionPrice: SmartRouter.getExecutionPrice(trade)!,
      },
      expectedAmount: trade.inputAmount,
    };
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
   * @param _allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    _allowedSlippage?: string,
  ): Promise<ExpectedTrade> {
    logger.info(
      `Fetching pair data for ${baseToken.address}-${quoteToken.address}.`,
    );

    const trade = await this.getBestTrade(
      baseToken,
      quoteToken,
      amount,
      TradeType.EXACT_INPUT,
    );

    if (!trade) {
      throw new UniswapishPriceError(
        `priceSwapIn: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`,
      );
    }
    logger.info(
      `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
        `${trade.outputAmount.toExact()}` +
        `${baseToken.symbol}.`,
    );

    return {
      trade: {
        ...trade,
        //@ts-ignore
        executionPrice: SmartRouter.getExecutionPrice(trade)!,
      },
      expectedAmount: trade.outputAmount,
    };
  }

  /**
   * Given a wallet and a Uniswap trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param pancakeswapRouter Smart Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param _abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async executeTrade(
    wallet: Wallet,
    trade: UniswapishTrade,
    gasPrice: number,
    pancakeswapRouter: string,
    ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string,
  ): Promise<Transaction> {
    const methodParameters: MethodParameters = SwapRouter.swapCallParameters(
      trade as SmartRouterTrade<TradeType>,
      {
        deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000 + ttl),
        recipient: getAddress(wallet.address),
        slippageTolerance: this.getAllowedSlippage(allowedSlippage),
      },
    );

    nonce = await this.chain.nonceManager.getNextNonce(wallet.address);

    let tx: ContractTransaction;
    if (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined) {
      tx = await wallet.sendTransaction({
        data: methodParameters.calldata,
        to: pancakeswapRouter,
        gasLimit: gasLimit.toFixed(0),
        value: methodParameters.value,
        nonce: nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else {
      tx = await wallet.sendTransaction({
        data: methodParameters.calldata,
        to: pancakeswapRouter,
        gasPrice: (gasPrice * 1e9).toFixed(0),
        gasLimit: gasLimit.toFixed(0),
        value: methodParameters.value,
        nonce: nonce,
      });
    }

    logger.info(`Transaction Details: ${JSON.stringify(tx)}`);
    nonce = await this.chain.nonceManager.getNextNonce(wallet.address);
    return tx;
  }

  async getPools(currencyA: Currency, currencyB: Currency): Promise<Pool[]> {
    let v3SubgraphClient: GraphQLClient;
    let v2SubgraphClient: GraphQLClient;

    const v3Bscurl: string =
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc';
    const v2Bscurl: string =
      'https://proxy-worker-api.pancakeswap.com/bsc-exchange';
    const v3Ethurl: string =
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-eth';
    const v2Ethurl: string =
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exhange-eth';
    const v3Zksurl: string =
      'https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest';
    const v2Zksurl: string =
      'https://api.thegraph.com/subgraphs/name/freakyfractal/uniswap-v3-zksync-era';
    const v3Arburl: string =
      'https://api.studio.thegraph.com/query/45376/exchange-v3-arbitrum/version/latest';
    const v2Arburl: string =
      'https://api.studio.thegraph.com/query/45376/exchange-v2-arbitrum/version/latest';

    if (this._chain === 'ethereum' && this.chainId === 324) {
      v3SubgraphClient = new GraphQLClient(v3Zksurl);
      v2SubgraphClient = new GraphQLClient(v2Zksurl);
    } else if (this._chain === 'ethereum' && this.chainId === 42161) {
      v3SubgraphClient = new GraphQLClient(v3Arburl);
      v2SubgraphClient = new GraphQLClient(v2Arburl);
    } else if (this._chain === 'binance-smart-chain') {
      v3SubgraphClient = new GraphQLClient(v3Bscurl);
      v2SubgraphClient = new GraphQLClient(v2Bscurl);
    } else {
      v3SubgraphClient = new GraphQLClient(v3Ethurl);
      v2SubgraphClient = new GraphQLClient(v2Ethurl);
    }

    // Define v3 pool on-chain fetcher with customized tvl references
    const getV3CandidatePools = SmartRouter.createGetV3CandidatePools(
      // Use your customized v3 pool fetcher by default
      SmartRouter.getV3PoolsWithTvlFromOnChain,
      {
        fallbacks: [],
        // In millisecond
        // Will try fallback fetcher if the default doesn't respond in 2s
        fallbackTimeout: 1500,
      },
    );

    const allPools = await Promise.allSettled([
      // @ts-ignore
      SmartRouter.getV2CandidatePools({
        // @ts-ignore
        onChainProvider: () => this.createPublicClient(),
        // @ts-ignore
        v2SubgraphProvider: () => v2SubgraphClient,
        // @ts-ignore
        v3SubgraphProvider: () => v3SubgraphClient,
        // @ts-ignore
        currencyA,
        // @ts-ignore
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
  async getBestTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    tradeType: TradeType,
  ): Promise<SmartRouterTrade<TradeType> | null> {
    const baseTokenAmount: CurrencyAmount<Token> = CurrencyAmount.fromRawAmount(
      baseToken,
      amount.toString(),
    );

    const quoteProvider = SmartRouter.createQuoteProvider({
      // @ts-ignore
      onChainProvider: () => this.createPublicClient(),
    });

    const pools = await this.getPools(baseToken, quoteToken);
    logger.info(`Found ${pools.length} pools for ${baseToken.symbol}-${quoteToken.symbol}`);

    const trade = await SmartRouter.getBestTrade(
      // @ts-ignore
      baseTokenAmount,
      quoteToken,
      tradeType,
      {
        gasPriceWei: () => this.createPublicClient().getGasPrice(),
        maxHops: this._maximumHops,
        maxSplits: 1,
        poolProvider: SmartRouter.createStaticPoolProvider(pools),
        quoteProvider,
        quoterOptimization: true,
        allowedPoolTypes: [PoolType.V2, PoolType.V3, PoolType.STABLE],
      },
    );

    return trade;
  }

  private createPublicClient(): PublicClient {
    const transportUrl: string = this.chain.rpcUrl;
    const chainConfig = this.chainId === 56
      ? bsc
      : this.chainId === 1
        ? mainnet
        : this.chainId === 42161
          ? arbitrum
          : this.chainId === 324
            ? zkSync
            : bscTestnet;

    return createPublicClient({
      chain: chainConfig as any,  // Type assertion to bypass strict checking
      transport: http(transportUrl),
      batch: {
        multicall: {
          batchSize: 1024 * 200,
        },
      },
    });
  }
}
