import { percentRegexp } from '../../services/config-manager-v2';
import { UniswapishPriceError } from '../../services/error-handler';
import {
  BigNumber,
  Contract,
  ContractInterface,
  Transaction,
  Wallet,
} from 'ethers';
import { isFractionString } from '../../services/validators';
import { TraderjoeConfig } from './traderjoe.config';
import { logger } from '../../services/logger';
import { Avalanche } from '../../chains/avalanche/avalanche';
import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
import { Token, TokenAmount, JSBI, Percent } from '@traderjoe-xyz/sdk';
import {
  LBRouterV21ABI,
  PairV2,
  RouteV2,
  TradeV2,
} from '@traderjoe-xyz/sdk-v2';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';
import { createPublicClient, http } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';

const MAX_HOPS = 2;
const BASES = ['USDT', 'USDC', 'WAVAX'];

export class Traderjoe implements Uniswapish {
  private static _instances: { [name: string]: Traderjoe };
  private avalanche: Avalanche;
  private _router: string;
  private _routerAbi: ContractInterface;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private bases: Token[] = [];
  private _ready: boolean = false;
  private _client;

  private constructor(network: string) {
    const config = TraderjoeConfig.config;
    this.avalanche = Avalanche.getInstance(network);
    this.chainId = this.avalanche.chainId;
    this._router = config.routerAddress(network);
    this._ttl = config.ttl;
    this._routerAbi = LBRouterV21ABI;
    this._gasLimitEstimate = config.gasLimitEstimate;
    this._client = createPublicClient({
      chain: network === 'avalanche' ? avalanche : avalancheFuji,
      transport: http(),
    });
  }

  public static getInstance(chain: string, network: string): Traderjoe {
    if (Traderjoe._instances === undefined) {
      Traderjoe._instances = {};
    }
    if (!(chain + network in Traderjoe._instances)) {
      Traderjoe._instances[chain + network] = new Traderjoe(network);
    }

    return Traderjoe._instances[chain + network];
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

  public async init() {
    if (!this.avalanche.ready()) {
      await this.avalanche.init();
    }

    this.bases = [];

    for (const token of this.avalanche.storedTokenList) {
      const tokenObj = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name
      );
      this.tokenList[token.address] = tokenObj;
      if (BASES.includes(token.symbol)) this.bases.push(tokenObj);
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
   * Router smart contract ABI.
   */
  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  /**
   * Default gas limit estimate for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  public get ttl(): number {
    return Math.floor(new Date().getTime() / 1000) + this._ttl;
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
      return new Percent(
        JSBI.BigInt(fractionSplit[0]),
        JSBI.BigInt(fractionSplit[1])
      );
    }

    const allowedSlippage = TraderjoeConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
  }

  getRoutes(inputToken: Token, outputToken: Token): RouteV2[] {
    // get all [Token, Token] combinations
    const allTokenPairs = PairV2.createAllTokenPairs(
      inputToken,
      outputToken,
      this.bases
    );

    const allPairs = PairV2.initPairs(allTokenPairs);

    // generates all possible routes to consider
    return RouteV2.createAllRoutes(allPairs, inputToken, outputToken, MAX_HOPS);
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
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const amountIn: TokenAmount = new TokenAmount(baseToken, amount.toString());
    logger.info(
      `Fetching pair data for ${baseToken.address}-${quoteToken.address}.`
    );
    const allRoutes = this.getRoutes(baseToken, quoteToken);

    // generates all possible TradeV2 instances
    const trades = await TradeV2.getTradesExactIn(
      allRoutes,
      amountIn,
      quoteToken,
      false,
      false,
      this._client,
      this.avalanche.chainId
    );

    if (!trades || trades.length === 0) {
      throw new UniswapishPriceError(
        `priceSwapIn: no trade pair found for ${baseToken} to ${quoteToken}.`
      );
    }
    const bestTrade: TradeV2 = <TradeV2>(
      TradeV2.chooseBestTrade(<TradeV2[]>trades, true)
    );
    logger.info(
      `Best trade for ${baseToken.address}-${
        quoteToken.address
      }: ${bestTrade.toLog()}`
    );
    const expectedAmount = bestTrade.minimumAmountOut(
      this.getAllowedSlippage(allowedSlippage)
    );
    return { trade: bestTrade, expectedAmount };
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
    allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    const amountIn: TokenAmount = new TokenAmount(baseToken, amount.toString());
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );
    const allRoutes = this.getRoutes(baseToken, quoteToken);

    // generates all possible TradeV2 instances
    const trades = await TradeV2.getTradesExactOut(
      allRoutes,
      amountIn,
      quoteToken,
      false,
      false,
      this._client,
      this.avalanche.chainId
    );
    if (!trades || trades.length === 0) {
      throw new UniswapishPriceError(
        `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
      );
    }
    const bestTrade: TradeV2 = <TradeV2>(
      TradeV2.chooseBestTrade(<TradeV2[]>trades, false)
    );
    logger.info(
      `Best trade for ${quoteToken.address}-${
        baseToken.address
      }: ${bestTrade.toLog()}`
    );

    const expectedAmount = bestTrade.maximumAmountIn(
      this.getAllowedSlippage(allowedSlippage)
    );
    return { trade: bestTrade, expectedAmount };
  }

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param traderjoeRouter smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  async executeTrade(
    wallet: Wallet,
    trade: TradeV2,
    gasPrice: number,
    traderjoeRouter: string,
    ttl: number,
    abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    const result = trade.swapCallParameters({
      deadline: ttl,
      recipient: wallet.address,
      allowedSlippage: this.getAllowedSlippage(allowedSlippage),
    });

    const contract = new Contract(traderjoeRouter, abi, wallet);
    let txData;
    if (maxFeePerGas || maxPriorityFeePerGas) {
      txData = await contract.populateTransaction[result.methodName](
        ...result.args,
        {
          gasLimit: gasLimit,
          value: result.value,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }
      );
    } else {
      txData = await contract.populateTransaction[result.methodName](
        ...result.args,
        {
          gasPrice: (gasPrice * 1e9).toFixed(0),
          gasLimit: gasLimit.toFixed(0),
          value: result.value,
        }
      );
    }
    const tx = await EVMTxBroadcaster.getInstance(
      this.avalanche,
      wallet.address
    ).broadcast(txData, nonce);
    logger.info(JSON.stringify(tx));

    return tx;
  }
}
