import { UniswapishPriceError } from '../../services/error-handler';
import { isFractionString } from '../../services/validators';
import { UniswapConfig } from './uniswap.config';
import routerAbi from './uniswap_v2_router_abi.json';
import {
  ContractInterface,
  ContractTransaction,
} from '@ethersproject/contracts';
import { AlphaRouter } from '@uniswap/smart-order-router';
import { Trade, SwapRouter } from '@uniswap/router-sdk';
import {
  FeeAmount,
  MethodParameters,
  Pool,
  SwapQuoter,
  Trade as UniswapV3Trade,
  Route
} from '@uniswap/v3-sdk';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { abi as IUniswapV3FactoryABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
  Currency,
} from '@uniswap/sdk-core';
import {
  BigNumber,
  Transaction,
  Wallet,
  Contract,
  utils,
  constants,
} from 'ethers';
import { logger } from '../../services/logger';
import { percentRegexp } from '../../services/config-manager-v2';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { Avalanche } from '../../chains/avalanche/avalanche';
import { Polygon } from '../../chains/polygon/polygon';
import { BinanceSmartChain } from "../../chains/binance-smart-chain/binance-smart-chain";
import { ExpectedTrade, Uniswapish, UniswapishTrade } from '../../services/common-interfaces';
import { getAddress } from 'ethers/lib/utils';
import { Celo } from '../../chains/celo/celo';

export class Uniswap implements Uniswapish {
  private static _instances: { [name: string]: Uniswap };
  private chain: Ethereum | Polygon | BinanceSmartChain | Avalanche | Celo;
  private _alphaRouter: AlphaRouter | null;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _maximumHops: number;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;
  private readonly _useRouter: boolean;
  private readonly _feeTier: FeeAmount;
  private readonly _quoterContractAddress: string;
  private readonly _factoryAddress: string;

  private constructor(chain: string, network: string) {
    const config = UniswapConfig.config;
    if (chain === 'ethereum') {
      this.chain = Ethereum.getInstance(network);
    } else if (chain === 'polygon') {
      this.chain = Polygon.getInstance(network);
    } else if (chain === 'binance-smart-chain') {
      this.chain = BinanceSmartChain.getInstance(network);
    } else if (chain === 'avalanche') { 
      this.chain = Avalanche.getInstance(network);
    } else if (chain === 'celo')  {
      this.chain = Celo.getInstance(network);
    } else {
      throw new Error('Unsupported chain');
    }
  
    this.chainId = this.chain.chainId;
    this._ttl = UniswapConfig.config.ttl;
    this._maximumHops = UniswapConfig.config.maximumHops;

      this._alphaRouter = new AlphaRouter({
      chainId: this.chainId,
      provider: this.chain.provider,
    });
    this._routerAbi = routerAbi.abi;
    this._gasLimitEstimate = UniswapConfig.config.gasLimitEstimate;
    this._router = config.uniswapV3SmartOrderRouterAddress(chain, network);

    if (config.useRouter === false && config.feeTier == null) {
      throw new Error('Must specify fee tier if not using router');
    }
    if (config.useRouter === false && config.quoterContractAddress == null) {
      throw new Error(
        'Must specify quoter contract address if not using router'
      );
    }
    this._useRouter = config.useRouter ?? true;
    this._feeTier = config.feeTier
      ? FeeAmount[config.feeTier as keyof typeof FeeAmount]
      : FeeAmount.MEDIUM;
    this._quoterContractAddress = config.quoterContractAddress(chain, network);
    this._factoryAddress = config.uniswapV3FactoryAddress(chain, network);
  }

  public static getInstance(chain: string, network: string): Uniswap {
    if (Uniswap._instances === undefined) {
      Uniswap._instances = {};
    }
    if (!(chain + network in Uniswap._instances)) {
      Uniswap._instances[chain + network] = new Uniswap(chain, network);
    }

    return Uniswap._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[getAddress(address)];
  }

  /**
   * Get a token by its symbol
   * This searches through the tokenList for a token with matching symbol
   * @param symbol The token symbol to search for
   * @returns The Token object or undefined if not found
   */
  public getTokenBySymbol(symbol: string): Token | undefined {
    // First check if we already have a token with this symbol in our internal tokenList
    for (const address in this.tokenList) {
      if (this.tokenList[address].symbol.toUpperCase() === symbol.toUpperCase()) {
        return this.tokenList[address];
      }
    }

    // If not found, try to get it from the chain implementation
    const tokenInfo = this.chain.getTokenBySymbol(symbol);
    if (tokenInfo) {
      // Create a new Token instance and cache it for future use
      const token = new Token(
        tokenInfo.chainId,
        tokenInfo.address,
        tokenInfo.decimals,
        tokenInfo.symbol,
        tokenInfo.name
      );
      
      // Add to our local cache
      this.tokenList[getAddress(tokenInfo.address)] = token;
      
      return token;
    }
    
    return undefined;
  }

  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    for (const token of this.chain.storedTokenList) {
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
   * AlphaRouter instance.
   */
  public get alphaRouter(): AlphaRouter {
    if (this._alphaRouter === null) {
      throw new Error('AlphaRouter is not initialized');
    }
    return this._alphaRouter;
  }

  /**
   * Router smart contract ABI.
   */
  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  /**
   * Default gas limit used to estimate gasCost for swap transactions.
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

    const allowedSlippage = UniswapConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
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
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    allowedSlippage?: string,
    poolId?: string
  ): Promise<ExpectedTrade> {
    const nativeTokenAmount: CurrencyAmount<Token> =
      CurrencyAmount.fromRawAmount(baseToken, amount.toString());

    logger.info(
      `Fetching trade data for ${baseToken.address}-${quoteToken.address}.`
    );

    if (this._useRouter) {
      if (this._alphaRouter === null) {
        throw new Error('AlphaRouter is not initialized');
      }
      const route = await this._alphaRouter.route(
        nativeTokenAmount,
        quoteToken,
        TradeType.EXACT_INPUT,
        undefined,
        {
          maxSwapsPerPath: this.maximumHops,
        }
      );

      if (!route) {
        throw new UniswapishPriceError(
          `priceSwapIn: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`
        );
      }
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${route.trade.executionPrice.toFixed(6)}` +
          `${baseToken.symbol}.`
      );
      const expectedAmount = route.trade.minimumAmountOut(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade: route.trade as unknown as UniswapishTrade, expectedAmount };
    } else {
      const pool = await this.getPool(baseToken, quoteToken, this._feeTier, poolId);
      if (!pool) {
        throw new UniswapishPriceError(
          `priceSwapIn: no trade pair found for ${baseToken.address} to ${quoteToken.address}.`
        );
      }
      const swapRoute = new Route([pool], baseToken, quoteToken);
      const quotedAmount = await this.getQuote(
        swapRoute,
        quoteToken,
        nativeTokenAmount,
        TradeType.EXACT_INPUT
      );
      const trade = UniswapV3Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: nativeTokenAmount,
        outputAmount: quotedAmount,
        tradeType: TradeType.EXACT_INPUT,
      });
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${trade.executionPrice.toFixed(6)}` +
          `${baseToken.symbol}.`
      );
      const expectedAmount = trade.minimumAmountOut(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade, expectedAmount };
    }
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
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    allowedSlippage?: string,
    poolId?: string
  ): Promise<ExpectedTrade> {
    const nativeTokenAmount: CurrencyAmount<Token> =
      CurrencyAmount.fromRawAmount(baseToken, amount.toString());
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );

    if (this._useRouter) {
      if (this._alphaRouter === null) {
        throw new Error('AlphaRouter is not initialized');
      }
      const route = await this._alphaRouter.route(
        nativeTokenAmount,
        quoteToken,
        TradeType.EXACT_OUTPUT,
        undefined,
        {
          maxSwapsPerPath: this.maximumHops,
        }
      );
      if (!route) {
        throw new UniswapishPriceError(
          `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
        );
      }
      logger.info(
        `Best trade for ${quoteToken.address}-${baseToken.address}: ` +
          `${route.trade.executionPrice.invert().toFixed(6)} ` +
          `${baseToken.symbol}.`
      );

      const expectedAmount = route.trade.maximumAmountIn(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade: route.trade as unknown as UniswapishTrade, expectedAmount };
    } else {
      const pool = await this.getPool(quoteToken, baseToken, this._feeTier, poolId);
      if (!pool) {
        throw new UniswapishPriceError(
          `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
        );
      }
      const swapRoute = new Route([pool], quoteToken, baseToken);
      const quotedAmount = await this.getQuote(
        swapRoute,
        quoteToken,
        nativeTokenAmount,
        TradeType.EXACT_OUTPUT
      );
      const trade = UniswapV3Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: quotedAmount,
        outputAmount: nativeTokenAmount,
        tradeType: TradeType.EXACT_OUTPUT,
      });
      logger.info(
        `Best trade for ${baseToken.address}-${quoteToken.address}: ` +
          `${trade.executionPrice.invert().toFixed(6)}` +
          `${baseToken.symbol}.`
      );
      const expectedAmount = trade.maximumAmountIn(
        this.getAllowedSlippage(allowedSlippage)
      );
      return { trade, expectedAmount };
    }
  }

  /**
   * Given a wallet and a Uniswap trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param uniswapRouter Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param _abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  async executeTrade(
    wallet: Wallet,
    trade: Trade<Currency, Currency, TradeType>,
    gasPrice: number,
    uniswapRouter: string,
    ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    const methodParameters: MethodParameters = SwapRouter.swapCallParameters(
      trade,
      {
        deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000 + ttl),
        recipient: wallet.address,
        slippageTolerance: this.getAllowedSlippage(allowedSlippage),
      }
    );

    return this.chain.nonceManager.provideNonce(
      nonce,
      wallet.address,
      async (nextNonce) => {
        let tx: ContractTransaction;
        if (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined) {
          tx = await wallet.sendTransaction({
            data: methodParameters.calldata,
            to: uniswapRouter,
            gasLimit: gasLimit.toFixed(0),
            value: methodParameters.value,
            nonce: nextNonce,
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
        } else {
          tx = await wallet.sendTransaction({
            data: methodParameters.calldata,
            to: uniswapRouter,
            gasPrice: (gasPrice * 1e9).toFixed(0),
            gasLimit: gasLimit.toFixed(0),
            value: methodParameters.value,
            nonce: nextNonce,
          });
        }
        logger.info(JSON.stringify(tx));
        return tx;
      }
    );
  }

  /**
   * Get a Uniswap V3 pool for a pair of tokens
   * This is a public wrapper around the private getPool method
   * 
   * @param tokenA First token
   * @param tokenB Second token
   * @param feeTier Fee tier for the pool
   * @param poolId Optional explicit pool address to use
   * @returns The V3 Pool or null if not found
   */
  public async getV3Pool(
    tokenA: Token,
    tokenB: Token,
    feeTier?: FeeAmount,
    poolId?: string
  ): Promise<Pool | null> {
    return this.getPool(tokenA, tokenB, feeTier || this._feeTier, poolId);
  }

  /**
   * Find the default pool for a token pair based on configuration
   * 
   * @param baseTokenSymbol Base token symbol
   * @param quoteTokenSymbol Quote token symbol
   * @param poolType 'amm' for V2 or 'clmm' for V3
   * @returns The pool address or null if not found
   */
  public async findDefaultPool(
    baseTokenSymbol: string,
    quoteTokenSymbol: string,
    poolType: 'amm' | 'clmm'
  ): Promise<string | null> {
    try {
      // Use network from the chain instance
      const network = this.chain.network;
      
      // Check if we have network-specific pools configuration in UniswapConfig
      const config = UniswapConfig.config;
      if (!config.networks || !config.networks[network]) {
        logger.error(`Network pools configuration not found for network: ${network}`);
        return null;
      }
      
      const networkConfig = config.networks[network];
      const poolKey = `${baseTokenSymbol}-${quoteTokenSymbol}`;
      const reversePoolKey = `${quoteTokenSymbol}-${baseTokenSymbol}`;
      
      if (poolType === 'amm') {
        // Check AMM pools for the given network
        return networkConfig.amm?.[poolKey] || networkConfig.amm?.[reversePoolKey] || null;
      } else {
        // Check CLMM pools for the given network
        return networkConfig.clmm?.[poolKey] || networkConfig.clmm?.[reversePoolKey] || null;
      }
    } catch (error) {
      logger.error(`Error finding default pool: ${error.message}`);
      return null;
    }
  }

  private async getPool(
    tokenA: Token,
    tokenB: Token,
    feeTier: FeeAmount,
    poolId?: string
  ): Promise<Pool | null> {
    const uniswapFactory = new Contract(
      this._factoryAddress,
      IUniswapV3FactoryABI,
      this.chain.provider
    );
    // Use Uniswap V3 factory to get pool address instead of `Pool.getAddress` to check if pool exists.
    const poolAddress = poolId || await uniswapFactory.getPool(
      tokenA.address,
      tokenB.address,
      feeTier
    );
    if (poolAddress === constants.AddressZero || poolAddress === undefined || poolAddress === '') {
      return null;
    }
    const poolContract = new Contract(
      poolAddress,
      IUniswapV3PoolABI,
      this.chain.provider
    );

    const [liquidity, slot0, fee] = await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
      poolContract.fee(),
    ]);
    const [sqrtPriceX96, tick] = slot0;

    const pool = new Pool(
      tokenA,
      tokenB,
      fee,
      sqrtPriceX96,
      liquidity,
      tick
    );

    return pool;
  }

  private async getQuote(
    swapRoute: Route<Token, Token>,
    quoteToken: Token,
    amount: CurrencyAmount<Token>,
    tradeType: TradeType
  ) {
    const { calldata } = await SwapQuoter.quoteCallParameters(
      swapRoute,
      amount,
      tradeType,
      { useQuoterV2: true }
    );
    const quoteCallReturnData = await this.chain.provider.call({
      to: this._quoterContractAddress,
      data: calldata,
    });
    const quoteTokenRawAmount = utils.defaultAbiCoder.decode(
      ['uint256'],
      quoteCallReturnData
    );
    const qouteTokenAmount = CurrencyAmount.fromRawAmount(
      quoteToken,
      quoteTokenRawAmount.toString()
    );
    return qouteTokenAmount;
  }
}
