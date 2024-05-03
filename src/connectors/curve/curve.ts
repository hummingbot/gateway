import {
  ExpectedTrade,
  Tokenish,
  Uniswapish,
  UniswapishTrade,
} from '../../services/common-interfaces';
import {
  Pair,
  Route,
  Token,
  TokenAmount,
  Trade,
  TradeType,
} from '@uniswap/sdk';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { Polygon } from '../../chains/polygon/polygon';
import { CurveConfig } from './curve.config';
import { Avalanche } from '../../chains/avalanche/avalanche';
import tokens from './curve_tokens.json';
import oomukade, { Query, RouteOption } from 'oomukade';
import { BigNumber, ContractInterface, Transaction, Wallet } from 'ethers';
import { CurveTokenList } from './types';

export class CurveFi implements Uniswapish {
  private static _instances: { [name: string]: CurveFi };
  private chain: Ethereum | Polygon | Avalanche;
  private _gasLimitEstimate: number;
  private _maximumHops: number;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  private constructor(chain: string, network: string) {
    const config = CurveConfig.config;
    if (chain === 'ethereum') {
      this.chain = Ethereum.getInstance(network);
    } else if (chain === 'avalanche') {
      this.chain = Avalanche.getInstance(network);
    } else {
      this.chain = Polygon.getInstance(network);
    }
    this.chainId = this.chain.chainId;
    const curveList: CurveTokenList = tokens;
    const chainTokens = curveList[chain];
    for (const token of chainTokens.tokens) {
      if (token.chainId === this.chainId)
        this.tokenList[token.address] = new Token(
          this.chainId,
          token.address,
          token.decimals,
          token.symbol,
          token.name
        );
    }
    this._maximumHops = config.maximumHops;
    this._gasLimitEstimate = CurveConfig.config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): CurveFi {
    if (CurveFi._instances === undefined) {
      CurveFi._instances = {};
    }
    if (!(chain + network in CurveFi._instances)) {
      CurveFi._instances[chain + network] = new CurveFi(chain, network);
    }

    return CurveFi._instances[chain + network];
  }

  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    this._ready = true;
  }

  getTokenByAddress(address: string): Tokenish {
    return this.tokenList[address];
  }

  createRouteFromData(
    baseToken: Token,
    quoteToken: Token,
    amountIn: string,
    amountOut: string
  ): Route {
    const baseTokenAmount = new TokenAmount(baseToken, amountIn);
    const quoteTokenAmount = new TokenAmount(quoteToken, amountOut);
    const pair = new Pair(baseTokenAmount, quoteTokenAmount);
    const route = new Route([pair], baseToken, quoteToken);
    return route;
  }

  convertToUniswapTrade(
    baseToken: Token,
    quoteToken: Token,
    routeOption: RouteOption
  ): UniswapishTrade {
    const route = this.createRouteFromData(
      baseToken,
      quoteToken,
      routeOption.amountIn,
      routeOption.amountOut
    );
    const baseTokenAmount = new TokenAmount(baseToken, routeOption.amountIn);
    const trade = new Trade(route, baseTokenAmount, TradeType.EXACT_INPUT);
    return trade;
  }

  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    allowedSlippage?: string | undefined
  ): Promise<ExpectedTrade> {
    const query: Query = {
      params: {
        tokenIn: baseToken.address,
        chainIdIn: baseToken.chainId,
        tokenOut: quoteToken.address,
        chainIdOut: quoteToken.chainId,
        amountIn: amount.toString(),
      },
      slippage:
        allowedSlippage === undefined
          ? 0.5
          : Number.parseFloat(allowedSlippage),
    };

    const routes = await oomukade.scanRoute(query);
    const route = routes.pop();
    if (route != undefined) {
      const trade = this.convertToUniswapTrade(baseToken, quoteToken, route);
      return {
        trade: trade,
        expectedAmount: new TokenAmount(quoteToken, route.amountOut),
      };
    }
    throw new Error(`Can't find trade for ${baseToken}-${quoteToken}`);
  }

  estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    allowedSlippage?: string | undefined
  ): Promise<ExpectedTrade> {
    throw new Error('Method not implemented.');
  }

  executeTrade(
    wallet: Wallet,
    trade: UniswapishTrade,
    gasPrice: number,
    uniswapRouter: string,
    ttl: number,
    abi: ContractInterface,
    gasLimit: number,
    nonce?: number | undefined,
    maxFeePerGas?: BigNumber | undefined,
    maxPriorityFeePerGas?: BigNumber | undefined,
    allowedSlippage?: string | undefined
  ): Promise<Transaction> {
    throw new Error('Method not implemented.');
  }

  public ready(): boolean {
    return this._ready;
  }
}
