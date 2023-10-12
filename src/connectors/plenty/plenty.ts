import BigNumber from "bignumber.js";
import { isFractionString } from '../../services/validators';
import { PlentyConfig } from './plenty.config';
import { ExecutedTrade, ExpectedTrade, IConfigPool, IConfigToken, PlentyTrade } from './plenty.types';
import { UniswapishPriceError } from '../../services/error-handler';
import { computeAllPathsWrapper, computeReverseCalculationWrapper } from './utils/wrappers';
import { allPaths } from './utils/paths';
import { routerSwap } from './utils/router';
import { Tezosish } from '../../services/common-interfaces';
import { logger } from "../../services/logger";


export class Plenty {
  private static _instances: { [name: string]: Plenty };
  private _router: string;
  private _poolsApi: string;
  private _analyticsApi: string;
  private _gasLimitEstimate: number;
  private _tokenList: Record<string, IConfigToken> = {};
  private _pools: Record<string, IConfigPool> = {};
  private _ready: boolean = false;
  private _skipTokens: string[] = ['SEB', 'PEPE', 'TKEY-X'];
  public isPlenty = true;

  constructor(network: string) {
    const config = PlentyConfig.config;
    this._router = config.routerAddress(network);
    this._poolsApi = config.poolsApi(network);
    this._analyticsApi = config.analyticsApi(network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(network: string): Plenty {
    if (Plenty._instances === undefined) {
      Plenty._instances = {};
    }
    if (!(network in Plenty._instances)) {
      Plenty._instances[network] = new Plenty(network);
    }

    return Plenty._instances[network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenBySymbol(symbol: string): IConfigToken {
    return this._tokenList[symbol.toLocaleUpperCase()];
  }

  public async init() {
    if (!this.ready()) {
      const apiResponse = await fetch(this._poolsApi);
      const apiJson: Record<string, IConfigPool> = await apiResponse.json();
      for (const poolAddress in apiJson) {
        const pool = apiJson[poolAddress];
        pool.token1.symbol = pool.token1.symbol.toUpperCase();
        pool.token2.symbol = pool.token2.symbol.toUpperCase();
        pool.token1.pairs = pool.token1.pairs.map((pair) => pair.toUpperCase());
        pool.token2.pairs = pool.token2.pairs.map((pair) => pair.toUpperCase());
        if (this._skipTokens.includes(pool.token1.symbol) || this._skipTokens.includes(pool.token2.symbol))
          continue;

        let tokensKey = pool.token1.symbol + '-' + pool.token2.symbol;
        if (pool.token1.symbol > pool.token2.symbol) {
          tokensKey = pool.token2.symbol + '-' + pool.token1.symbol;
        }
        this._pools[tokensKey] = pool;
        if (!(pool.token1.symbol in this._tokenList)) {
          this._tokenList[pool.token1.symbol] = pool.token1;
        }
        if (!(pool.token2.symbol in this._tokenList)) {
          this._tokenList[pool.token2.symbol] = pool.token2;
        }
      }
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  public getPool(token1: string, token2: string): IConfigPool {
    let tokensKey = token1 + '-' + token2;
    if (token1 > token2) {
      tokensKey = token2 + '-' + token1;
    }
    const pool = this._pools[tokensKey];
    if (!pool) {
      throw new UniswapishPriceError(
        `Plenty priceSwap: no trade pair found for ${token1} to ${token2}.`
      );
    }
    return pool;
  }

  public async getAnalytics(): Promise<any> {
    const apiResponse = await fetch(this._analyticsApi);
    return await apiResponse.json();
  }

  public get tokenList(): Record<string, IConfigToken> {
    return this._tokenList;
  }

  /**
   * Router address.
   */
  public get router(): string {
    return this._router;
  }

  /**
   * Default gas limit used to estimate gasCost for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): string {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      if (fractionSplit[0] !== '0')
        return allowedSlippageStr;
      else
        return PlentyConfig.config.allowedSlippage;
    } else
      return PlentyConfig.config.allowedSlippage;
  }

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param tezos Instance of Tezos class
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   * @param allowedSlippage (Optional) should be of the form '1/10'.
   */
  async estimateSellTrade(
    tezos: Tezosish,
    baseToken: IConfigToken,
    quoteToken: IConfigToken,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    process.env.LOG_PLENTY && logger.info('\t\tallPaths');
    const paths = await allPaths(
      tezos,
      this,
      baseToken.symbol,
      quoteToken.symbol,
      true
    );

    const swapAmount = amount.dividedBy(new BigNumber(10).pow(baseToken.decimals));
    const path = computeAllPathsWrapper(
      this,
      paths.paths,
      swapAmount,
      this.getAllowedSlippage(allowedSlippage),
      paths.swapData,
    );

    return {
      expectedAmount: path.tokenOutAmount,
      trade: {
        executionPrice: path.exchangeRate,
        routeParams: path,
        amountIn: amount,
      }
    };
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param tezos Instance of Tezos class
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   * @param allowedSlippage (Optional) should be of the form '1/10'.
   */
  async estimateBuyTrade(
    tezos: Tezosish,
    quoteToken: IConfigToken,
    baseToken: IConfigToken,
    amount: BigNumber,
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    process.env.LOG_PLENTY && logger.info('\t\tallPaths')
    const paths = allPaths(
      tezos,
      this,
      quoteToken.symbol,
      baseToken.symbol,
      true
    );
    process.env.LOG_PLENTY && logger.info('\t\tallPathsRev')
    const pathsRev = allPaths(
      tezos,
      this,
      baseToken.symbol,
      quoteToken.symbol,
      true
    );

    const bothPaths = await Promise.all([paths, pathsRev]);
    const pathsResolved = bothPaths[0];
    const pathsRevResolved = bothPaths[1];

    const swapAmount = amount.dividedBy(new BigNumber(10).pow(baseToken.decimals));
    const path = computeReverseCalculationWrapper(
      this,
      pathsRevResolved.paths,
      swapAmount,
      this.getAllowedSlippage(allowedSlippage),
      pathsRevResolved.swapData,
      pathsResolved.paths,
      pathsResolved.swapData,
    );

    return {
      expectedAmount: path.tokenOutAmount,
      trade: {
        executionPrice: BigNumber(1).dividedBy(path.exchangeRate),
        routeParams: path,
        amountIn: path.tokenOutAmount.multipliedBy(10 ** quoteToken.decimals),
      }
    };
  }

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet TezosToolkit instance
   * @param expectedTrade Expected trade
   */
  async executeTrade(
    tezos: Tezosish,
    expectedTrade: PlentyTrade,
  ): Promise<ExecutedTrade> {

    const address = await tezos.provider.signer.publicKeyHash();
    process.env.LOG_PLENTY && logger.info('\t\trouterSwap')
    const swapParams = await routerSwap(
      tezos,
      this,
      expectedTrade.routeParams.path,
      expectedTrade.routeParams.minimumTokenOut,
      address,
      address,
      expectedTrade.amountIn
    )

    const batch = tezos.provider.contract.batch(swapParams);
    process.env.LOG_PLENTY && logger.info('\t\tbatchSend')
    const batchOp = await batch.send();
    const status = batchOp.status;
    if (status === "applied") {
      return {
        hash: batchOp.hash,
        operations: batchOp.results
      };
    } else {
      throw new UniswapishPriceError('Plenty: trade failed' + status);
    }
  }
}
