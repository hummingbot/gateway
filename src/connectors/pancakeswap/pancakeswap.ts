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
import { mainnet, bsc, bscTestnet } from '@wagmi/chains';
import { MethodParameters } from '@pancakeswap/v3-sdk';

export class PancakeSwap implements Uniswapish {
  private static _instances: { [name: string]: PancakeSwap };
  private bsc: BinanceSmartChain;
  private eth: Ethereum;
  private chainId;

  private _chain: string;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _maximumHops: number;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private constructor(chain: string, network: string) {
    const config = PancakeSwapConfig.config;
    this.bsc = BinanceSmartChain.getInstance(network);
    this.eth = Ethereum.getInstance(network);

    this._chain = chain;
    this.chainId = this.getChainId(chain);
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

  public getChainId(chain: string): number {
    if (chain === 'binance-smart-chain') {
      return this.bsc.chainId;
    } else return this.eth.chainId;
  }

  public async init() {
    if (this._chain == 'binance-smart-chain' && !this.bsc.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('BinanceSmartChain'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    else if (this._chain == 'ethereum' && !this.eth.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('Ethereum'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    if (this._chain === 'ethereum') {
      for (const token of this.eth.storedTokenList ?? []) {
        this.tokenList[token.address] = new Token(
          this.chainId,
          token.address,
          token.decimals,
          token.symbol,
          token.name,
        );
      }
    } else if (this._chain === 'binance-smart-chain') {
      for (const token of this.bsc.storedTokenList ?? []) {
        this.tokenList[token.address] = new Token(
          this.chainId,
          token.address,
          token.decimals,
          token.symbol,
          token.name,
        );
      }
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

    if (nonce === undefined) {
      if (this._chain === 'ethereum') {
        nonce = await this.eth.nonceManager.getNextNonce(wallet.address);
      } else nonce = await this.bsc.nonceManager.getNextNonce(wallet.address);
    }

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
    if (this._chain === 'ethereum') {
      await this.eth.nonceManager.commitNonce(wallet.address, nonce);
    } else await this.bsc.nonceManager.commitNonce(wallet.address, nonce);
    return tx;
  }

  async getPools(currencyA: Currency, currencyB: Currency): Promise<Pool[]> {
    const v3Bscurl: string =
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc';
    const v2Bscurl: string =
      'https://proxy-worker-api.pancakeswap.com/bsc-exchange';
    const v3Ethurl: string =
      'https://thegraph.com/hosted-service/subgraph/pancakeswap/exchange-v3-eth';
    const v2Ethurl: string =
      'https://api.thegraph.com/subgraphs/name/pancakeswap/exhange-eth';

    const v3BscSubgraphClient = new GraphQLClient(v3Bscurl);
    const v2BscSubgraphClient = new GraphQLClient(v2Bscurl);
    const v3EthSubgraphClient = new GraphQLClient(v3Ethurl);
    const v2EthSubgraphClient = new GraphQLClient(v2Ethurl);

    let v3SubgraphClient: GraphQLClient;
    let v2SubgraphClient: GraphQLClient;

    if (this._chain == 'ethereum') {
      v3SubgraphClient = v3EthSubgraphClient;
      v2SubgraphClient = v2EthSubgraphClient;
    } else {
      v3SubgraphClient = v3BscSubgraphClient;
      v2SubgraphClient = v2BscSubgraphClient;
    }

    const pairs = SmartRouter.getPairCombinations(currencyA, currencyB);

    const getV2CandidatePools = SmartRouter.createGetV2CandidatePools(
      SmartRouter.createV2PoolsProviderByCommonTokenPrices(
        SmartRouter.getCommonTokenPricesBySubgraph,
      ),
    );

    const getV3CandidatePools = SmartRouter.createGetV3CandidatePools(
      SmartRouter.getV3PoolsWithTvlFromOnChain,
      {
        fallbacks: [],
        fallbackTimeout: 1500,
      },
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

    const trade = await SmartRouter.getBestTrade(
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
    let transportUrl: string;

    if (this._chain == 'ethereum') {
      transportUrl = this.eth.rpcUrl;
    } else {
      transportUrl = this.bsc.rpcUrl;
    }

    return createPublicClient({
      chain:
        this.chainId === 56 ? bsc : this.chainId === 1 ? mainnet : bscTestnet,
      transport: http(transportUrl),
      batch: {
        multicall: {
          batchSize: 1024 * 200,
        },
      },
    });
  }
}
