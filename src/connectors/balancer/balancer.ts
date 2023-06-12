import {
  BalancerSDK,
  Network,
  parseFixed,
  SwapInfo,
  subSlippage,
  addSlippage,
  SwapType,
} from '@balancer-labs/sdk';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { Polygon } from '../../chains/polygon/polygon';
import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
import { BalancerConfig } from './balancer.config';
import routerAbi from './balancer_v2_vault_abi.json';
import { ContractInterface } from '@ethersproject/contracts';
import { BigNumber, Transaction, Wallet } from 'ethers';
import { UniswapishPriceError } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { CurrencyAmount, Token } from '@sushiswap/sdk';
import { Price } from '@sushiswap/sdk';
import { Trade } from './types';

export class Balancer implements Uniswapish {
  private static _instances: { [name: string]: Balancer };
  private chain: Ethereum | Polygon;
  private _balancerRouter: BalancerSDK;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _maximumHops: number;
  private _allowedSlippage: BigNumber;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private constructor(chain: string, network: string) {
    if (chain === 'ethereum') {
      this.chain = Ethereum.getInstance(network);
    } else if (chain === 'polygon') {
      this.chain = Polygon.getInstance(network);
    } else {
      throw new Error('unsupported chain');
    }
    this.chainId = this.chain.chainId;
    this._ttl = BalancerConfig.config.ttl;
    this._maximumHops = BalancerConfig.config.maximumHops;
    this._balancerRouter = new BalancerSDK({
      network: this.chainId as Network,
      rpcUrl: this.chain.rpcUrl,
    });
    this._routerAbi = routerAbi.abi;
    this._gasLimitEstimate = BalancerConfig.config.gasLimitEstimate;
    this._allowedSlippage = BigNumber.from(
      BalancerConfig.config.allowedSlippage
    );
    this._router = BalancerConfig.config.balancerV2VaultAddress(chain, network);
  }

  public static getInstance(chain: string, network: string): Balancer {
    if (Balancer._instances === undefined) {
      Balancer._instances = {};
    }
    if (!(chain + network in Balancer._instances)) {
      Balancer._instances[chain + network] = new Balancer(chain, network);
    }

    return Balancer._instances[chain + network];
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
   * BalancerRouter instance.
   */
  public get balancerRouter(): BalancerSDK {
    return this._balancerRouter;
  }

  /**
   * Router smart contract ABI.
   */
  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  /**
   * Allow slippage in basis point
   */
  public get allowedSlippage(): BigNumber {
    return this._allowedSlippage;
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
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[address];
  }

  async fetchData() {
    const result = await this._balancerRouter.swaps.fetchPools();
    if (!result) {
      throw new UniswapishPriceError(`fetchData: Couldn't update vault data`);
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
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    _allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    if (amount.isZero()) {
      throw new UniswapishPriceError(
        `estimateSellTrade: Can't process ${baseToken} to ${quoteToken} with amount 0.`
      );
    }

    await this.fetchData();

    const swapInfo: SwapInfo =
      await this._balancerRouter.swaps.findRouteGivenIn({
        tokenIn: baseToken.address,
        tokenOut: quoteToken.address,
        amount: parseFixed(`${amount}`, 18),
        gasPrice: parseFixed('1', 18),
        maxPools: this._maximumHops,
      });

    if (swapInfo.swaps.length === 0 || swapInfo.returnAmount.isZero()) {
      throw new UniswapishPriceError(
        `findRouteGivenIn: No route found for ${baseToken} to ${quoteToken}.`
      );
    }

    const inputCurrencyAmount = CurrencyAmount.fromRawAmount(
      baseToken,
      amount.toString()
    );
    const outputCurrentAmount = CurrencyAmount.fromRawAmount(
      quoteToken,
      swapInfo.returnAmount.toString()
    );

    const executionPrice = new Price({
      baseAmount: inputCurrencyAmount,
      quoteAmount: outputCurrentAmount,
    });

    logger.info(
      `Best sell price for ${baseToken.address}-${quoteToken.address}: ` +
        `${executionPrice.quote}` +
        `${quoteToken.symbol}.`
    );

    const expectedAmount = CurrencyAmount.fromRawAmount(
      quoteToken,
      subSlippage(swapInfo.returnAmount, this._allowedSlippage).toString()
    );

    return {
      trade: new Trade(swapInfo, executionPrice, SwapType.SwapExactIn),
      expectedAmount,
    };

    // const pairs = await Promise.all(
    //   swapInfo.swaps.map(async (pair: SwapV2): Promise<Pair> => {
    //     const pool = await this._balancerRouter.pools.find(pair.poolId);
    //     if (!pool)
    //       throw new UniswapishPriceError(
    //         `BalancerPool: can't find pool for id ${pair.poolId}`
    //       );

    //     const swapInToken: Token = new Token(
    //       this.chainId,
    //       pool.tokens[pair.assetInIndex].address,
    //       pool.tokens[pair.assetInIndex].decimals ?? 18,
    //       pool.tokens[pair.assetInIndex].symbol,
    //       pool.tokens[pair.assetInIndex].symbol
    //     );

    //     const swapOutToken: Token = new Token(
    //       this.chainId,
    //       pool.tokens[pair.assetOutIndex].address,
    //       pool.tokens[pair.assetOutIndex].decimals ?? 18,
    //       pool.tokens[pair.assetOutIndex].symbol,
    //       pool.tokens[pair.assetOutIndex].symbol
    //     );

    //     return new Pair(
    //       CurrencyAmount.fromRawAmount(
    //         swapInToken,
    //         pool.tokens[pair.assetInIndex].balance
    //       ),
    //       CurrencyAmount.fromRawAmount(
    //         swapOutToken,
    //         pool.tokens[pair.assetOutIndex].balance
    //       )
    //     );
    //   })
    // );

    // const route: Route<Token, Token> = new Route(pairs, baseToken, quoteToken);

    // const trade: Trade<Token, Token, TradeType.EXACT_INPUT> = Trade.exactIn(
    //   route,
    //   CurrencyAmount.fromRawAmount(baseToken, amount.toString())
    // );

    // const expectedAmount = CurrencyAmount.fromRawAmount(
    //   quoteToken,
    //   subSlippage(swapInfo.returnAmount, this._allowedSlippage).toString()
    // );

    // return { trade, expectedAmount };
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
    _allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    if (amount.isZero()) {
      throw new UniswapishPriceError(
        `estimateSellTrade: Can't process ${baseToken} to ${quoteToken} with amount 0.`
      );
    }
    await this.fetchData();

    const swapInfo: SwapInfo =
      await this._balancerRouter.swaps.findRouteGivenOut({
        tokenIn: quoteToken.address,
        tokenOut: baseToken.address,
        amount: parseFixed(`${amount}`, 18),
        gasPrice: parseFixed('1', 18),
        maxPools: this._maximumHops,
      });

    if (swapInfo.swaps.length === 0 || swapInfo.swapAmount.isZero()) {
      throw new UniswapishPriceError(
        `findRouteGivenIn: No route found for ${quoteToken} to ${baseToken}.`
      );
    }

    const inputCurrencyAmount = CurrencyAmount.fromRawAmount(
      baseToken,
      swapInfo.returnAmount.toString()
    );
    const outputCurrentAmount = CurrencyAmount.fromRawAmount(
      quoteToken,
      amount.toString()
    );

    const executionPrice = new Price({
      baseAmount: inputCurrencyAmount,
      quoteAmount: outputCurrentAmount,
    });

    logger.info(
      `Best buy price for ${baseToken.address}-${quoteToken.address}: ` +
        `${executionPrice.quote}` +
        `${quoteToken.symbol}.`
    );

    const expectedAmount = CurrencyAmount.fromRawAmount(
      quoteToken,
      addSlippage(swapInfo.returnAmount, this._allowedSlippage).toString()
    );

    return {
      trade: new Trade(swapInfo, executionPrice, SwapType.SwapExactOut),
      expectedAmount,
    };

    // const executionPrice = swapInfo.swapAmount.div(swapInfo.returnAmount);

    // logger.info(
    //   `Best buy price for ${quoteToken.address}-${baseToken.address}: ` +
    //     `${formatFixed(executionPrice, 18)}` +
    //     `${baseToken.symbol}.`
    // );
    // const pairs = await Promise.all(
    //   swapInfo.swaps.map(async (pair: SwapV2): Promise<Pair> => {
    //     const pool = await this._balancerRouter.pools.find(pair.poolId);
    //     if (!pool)
    //       throw new UniswapishPriceError(
    //         `BalancerPool: can't find pool for id ${pair.poolId}`
    //       );

    //     const swapInToken: Token = new Token(
    //       this.chainId,
    //       pool.tokens[pair.assetInIndex].address,
    //       pool.tokens[pair.assetInIndex].decimals ?? 18,
    //       pool.tokens[pair.assetInIndex].symbol,
    //       pool.tokens[pair.assetInIndex].symbol
    //     );

    //     const swapOutToken: Token = new Token(
    //       this.chainId,
    //       pool.tokens[pair.assetOutIndex].address,
    //       pool.tokens[pair.assetOutIndex].decimals ?? 18,
    //       pool.tokens[pair.assetOutIndex].symbol,
    //       pool.tokens[pair.assetOutIndex].symbol
    //     );

    //     return new Pair(
    //       CurrencyAmount.fromRawAmount(
    //         swapInToken,
    //         pool.tokens[pair.assetInIndex].balance
    //       ),
    //       CurrencyAmount.fromRawAmount(
    //         swapOutToken,
    //         pool.tokens[pair.assetOutIndex].balance
    //       )
    //     );
    //   })
    // );

    // const route: Route<Token, Token> = new Route(pairs, quoteToken, baseToken);

    // const trade: Trade<Token, Token, TradeType.EXACT_OUTPUT> = Trade.exactOut(
    //   route,
    //   CurrencyAmount.fromRawAmount(baseToken, amount.toString())
    // );

    // const expectedAmount = CurrencyAmount.fromRawAmount(
    //   quoteToken,
    //   addSlippage(swapInfo.swapAmount, this._allowedSlippage).toString()
    // );

    // return { trade, expectedAmount };
  }

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
  async executeTrade(
    wallet: Wallet,
    trade: Trade,
    gasPrice: number,
    _balancerRouter: string,
    ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    _allowedSlippage?: string
  ): Promise<Transaction> {
    const swap = this._balancerRouter.swaps.buildSwap({
      userAddress: wallet.address, // user address
      swapInfo: trade.swapInfo, // result from the previous step
      kind: trade.swapType, // or SwapExactOut
      deadline: BigNumber.from(Math.ceil(Date.now() / 1000) + ttl), // BigNumber block timestamp
      maxSlippage: this._allowedSlippage.toNumber(), // [bps], eg: 1 == 0.01%, 100 == 1%
    });

    return this.chain.nonceManager.provideNonce(
      nonce,
      wallet.address,
      async (nextNonce) => {
        let attr;
        if (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined) {
          attr = {
            gasLimit: gasLimit.toFixed(0),
            maxFeePerGas,
            maxPriorityFeePerGas,
          };
        } else {
          attr = {
            gasPrice: (gasPrice * 1e9).toFixed(0),
            gasLimit: gasLimit.toFixed(0),
          };
        }
        const signer = this._balancerRouter.provider.getSigner();
        const tx = await signer.sendTransaction({
          to: swap.to,
          data: swap.data,
          value: swap.value,
          nonce: nextNonce,
          ...attr,
        });

        logger.info(JSON.stringify(tx));
        return tx;
      }
    );
  }
}
