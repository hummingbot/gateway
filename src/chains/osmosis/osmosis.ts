// @ts-nocheck
// OSMO message composer classes don't quite match up with what the RPC/Go backend actually accepts.

import { CosmosWallet, CosmosAsset, CosmosTokenValue, CosmosBase } from '../../chains/cosmos/cosmos-base'; 
import { OsmosisController } from './osmosis.controllers';
import BigNumber from 'bignumber.js';
import { logger } from '../../services/logger';
import { coins, coin, Coin } from '@cosmjs/amino';
import { FEES, } from 'osmojs/dist/utils/gas/values'
import { TokenInfo, } from '../../services/base'; 

import { osmosis, cosmos, getSigningOsmosisClient } from 'osmojs';
import {
  CoinGeckoToken,
  CoinDenom,
  Exponent,
  CoinSymbol,
  PriceHash,
  TransactionEvent,
  TransactionEventAttribute,
  OsmosisExpectedTrade, 
  ToLog_OsmosisExpectedTrade, 
  TransactionResponse, 
  OsmosisExpectedTradeRoute, 
  AddPositionTransactionResponse, 
  ReduceLiquidityTransactionResponse, 
  SerializableExtendedPool
} from './osmosis.types';

import { OsmosisConfig } from './osmosis.config'; 
import {
  getRoutesForTrade,
  calcAmountWithSlippage,
  calcPriceImpactGivenIn,
  calcPriceImpactGivenOut
} from './osmosis.swap';
import {
  convertDollarValueToCoins,
  convertDollarValueToShares,
  calcShareOutAmount,
  makePoolPairs,
} from '@osmonauts/math';
import type {
  PrettyPair,
} from "@osmonauts/math/dist/types";
import { TradeInfo } from './osmosis.controllers';
import { PoolAsset } from 'osmojs/dist/codegen/osmosis/gamm/pool-models/balancer/balancerPool';
import { HttpException, TRADE_FAILED_ERROR_CODE, TRADE_FAILED_ERROR_MESSAGE, INSUFFICIENT_FUNDS_ERROR_CODE, INSUFFICIENT_FUNDS_ERROR_MESSAGE } from '../../services/error-handler';
import { ExtendedPool, extendPool, filterPools as filterPoolsLP } from './osmosis.lp.utils';
import { fetchFees } from './osmosis.utils';
import { getImperatorPriceHash } from './osmosis.prices';
import { GasPrice, calculateFee, setupIbcExtension } from '@cosmjs/stargate';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { TokensRequest, TokensResponse } from '../../network/network.requests';
import { Cosmosish, TransferRequest } from '../../services/common-interfaces';

const { DirectSecp256k1Wallet } = require('@cosmjs/proto-signing');
const {
  joinPool,
  exitPool,
  joinSwapExternAmountIn,
  swapExactAmountIn,
} = osmosis.gamm.v1beta1.MessageComposer.withTypeUrl;
const {
send
} = cosmos.bank.v1beta1.MessageComposer.fromPartial;

export class Osmosis extends CosmosBase implements Cosmosish{ 
  public controller;
  private static _instances: { [name: string]: Osmosis };
  private _gasPrice: number;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  private signingClient?: any;
  public chainId: string;
  public gasLimitEstimate: string;
  public readonly feeTier: string; // FEE_VALUES.osmosis[_feeTier] low medium high osmojs/src/utils/gas/values.ts
  public manualGasPrice: string;
  public allowedSlippage: string;
  
  private constructor(network: string) {
    const config = OsmosisConfig.config;
    super(
      config.availableNetworks[0].chain,
      config.rpcURL(network).toString(),
      config.tokenListSource(network),
      config.tokenListType(network),
      config.gasAdjustment
    )
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this.manualGasPrice = config.manualGasPrice;
    this._gasPrice = Number(this.manualGasPrice.replace('uosmo',''))
    this.feeTier = config.feeTier;
    this.gasLimitEstimate = config.gasLimitTransaction
    this.allowedSlippage = config.allowedSlippage

    this.chainId = config.chainId(network);
    this.signingClient = undefined;
    this.controller = OsmosisController;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this._metricTimer = setInterval(
      this.metricLogger.bind(this),
      this.metricsLogInterval
    );
  }

  public static getInstance(network: string): Osmosis {
    if (Osmosis._instances === undefined) {
      Osmosis._instances = {};
    }
    if (!(network in Osmosis._instances)) {
      Osmosis._instances[network] = new Osmosis(network);
    }

    return Osmosis._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Osmosis } {
    return Osmosis._instances;
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(
      this.requestCount +
        ' request(s) sent in last ' +
        this.metricsLogInterval / 1000 +
        ' seconds.'
    );
    this._requestCount = 0; // reset
  }

  public get provider() {
    return this._provider;
  }
  
  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get chain(): string {
    return this._chain;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  async getDenomMetadata(provider: any, denom: string): Promise<any> {
    return await provider.cosmos.bank.denomMetadata(denom);
  }

  async close() {
    clearInterval(this._metricTimer);
    if (this._chain in Osmosis._instances) {
      delete Osmosis._instances[this._chain];
    }
  }

  public ready(): boolean {
    return this._ready
  }

  public getTokenByAddress(address: string): CosmosAsset {
    const token = this.tokenList.find((token: CosmosAsset) => token.address === address);
    if (!token){
      throw new Error('Osmosis token not found for address: ' + address);
    }
    return token; 
  }
  public getDenomForCoinGeckoId = (
    coinGeckoId: CoinGeckoToken
  ): CoinDenom => {
    var asset_found = this.tokenList.find((asset) => asset.coingecko_id === coinGeckoId);
    if (asset_found) {
      return asset_found.base
    } else {
      return '';
    }
  };
  public osmoDenomToSymbol = (denom: CoinDenom): CoinSymbol => {
    const asset = this.getTokenByBase(denom);
    const symbol = asset?.symbol;
    if (!symbol) {
      return denom;
    }
    return symbol;
  };
  public symbolToOsmoDenom = (token: CoinSymbol): CoinDenom => {
    const asset = this.tokenList.find(({ symbol }) => symbol === token);
    const base = asset?.base;
    if (!base) {
      console.log(`cannot find base for token ${token}`);
      return '';
    }
    return base;
  };

  // technically by base
  public getExponentByBase = (denom: CoinDenom): Exponent => {
    const asset = this.getTokenByBase(denom);
    if (asset && asset.denom_units){
      const unit = asset.denom_units.find(({ denom }) => denom === asset.display);
      if (unit){
        return unit.exponent;
      } 
    }
    return 0
  };
  public noDecimals = (num: number | string) => {
    return new BigNumber(num).decimalPlaces(0, BigNumber.ROUND_DOWN).toString();
  };
  public baseUnitsToDollarValue = (
    prices: PriceHash,
    symbol: string,
    amount: string | number
  ) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(amount)
      .shiftedBy(-this.getExponentByBase(denom))
      .multipliedBy(prices[denom])
      .toString();
  };
  public dollarValueToDenomUnits = (
    prices: PriceHash,
    symbol: string,
    value: string | number
  ) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(value)
      .dividedBy(prices[denom])
      .shiftedBy(this.getExponentByBase(denom))
      .toString();
  };
  public baseUnitsToDisplayUnits = (
    symbol: string,
    amount: string | number
  ) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(amount).shiftedBy(-this.getExponentByBase(denom)).toString();
  };

  public isEmptyArray = (arr: any[]) => arr.length === 0;
 
  async getBalances(wallet: CosmosWallet): Promise<Record<string, CosmosTokenValue>> {
    const balances: Record<string, CosmosTokenValue> = {};

    const accounts = await wallet.getAccounts();

    var { address } = accounts[0];

    var balancesContainer;
    balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
      address: address,
      pagination: {
        key: new Uint8Array(),
        offset: BigInt(0),
        limit: BigInt(10000),
        countTotal: false,
        reverse: false,
      },
    })

    const allTokens = balancesContainer.balances

    await Promise.all(
      allTokens.map(async (t: { denom: string; amount: string }) => {
        let token = this.getTokenByBase(t.denom);

        try{
          if (!token && t.denom.startsWith('ibc/')) {
            const ibcHash: string = t.denom.replace('ibc/', '');

            // Get base denom by IBC hash
            if (ibcHash) {
              const { denomTrace } = await setupIbcExtension(this._provider).ibc.transfer.denomTrace(ibcHash);
              if (denomTrace) {
                const { baseDenom } = denomTrace;
                token = this.getTokenByBase(baseDenom);
              }
            }
          }
        } catch (err) {
          //can skip this - will be added by raw denom
        }

        // Not all tokens are added in the registry so we use the denom if the token doesn't exist
        balances[token ? token.symbol : t.denom] = {
          value: new BigNumber(t.amount),
          decimals: this.getTokenDecimals(token),
        };
      })
    );

    return balances;
  }
  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token buy/sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   * @param tradeType "BUY" or "SELL"
   * @param allowedSlippage? Allowed slippage eg "1%"
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
   */
  async estimateTrade(
    baseToken: CosmosAsset,
    quoteToken: CosmosAsset,
    amount: BigNumber,
    tradeType: string,
    allowedSlippage?: string,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<OsmosisExpectedTrade>{

    var slippage = 0;
    if (allowedSlippage){
      slippage = Number(allowedSlippage.split('%')[0]);
    }else{
      slippage = Number(this.allowedSlippage.split('%')[0]);
    }
    var feeTier = this.feeTier;
    if (feeTier_input){
      feeTier = feeTier_input;
    }
    var gasAdjustment = this.gasPriceConstant;
    if (gasAdjustment_input){
      gasAdjustment = gasAdjustment_input;
    }

    if (tradeType == "BUY"){
      //swap base and quotetokens
      const realBaseToken = quoteToken;
      quoteToken = baseToken;
      baseToken = realBaseToken;
    }

    logger.info(
      `Fetching pair data for ${quoteToken.symbol}-${baseToken.symbol}.`
    );

    var callImperatorWithTokens = undefined
    if (this.chain == 'testnet'){
      callImperatorWithTokens = this.tokenList;
    }
    const [prices, { pools: poolsData }] = await Promise.all([
      getImperatorPriceHash(callImperatorWithTokens),
      this._provider.osmosis.gamm.v1beta1.pools({
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(2000),
          countTotal: false,
          reverse: false,
        },
      }) as Promise<{ pools: ExtendedPool[] }>, // ExtendedBalancerPool
    ]);

    // filterPoolsSWAP
    var pools: ExtendedPool[] = poolsData  // ExtendedBalancerPool
    .filter(({ $typeUrl }) => !$typeUrl?.includes('stableswap'))
    .filter(({ poolAssets }) =>
      poolAssets.every(
        ({ token }) =>
          prices[token!.denom] &&
          this.getTokenByBase(token!.denom)
      )
    );
    

    var pairs: PrettyPair[] = [];
    if (!this.isEmptyArray(pools) && !this.isEmptyArray(Object.keys(prices))){
      pairs = makePoolPairs(this.tokenList, pools, prices);
    }
    
    // eg. token=OSMO, token.base=uOSMO, so swap calcs are done in uosmo is 
    const tokenInAmount = new BigNumber(amount)
      .shiftedBy(baseToken.decimals)
      .toString();

    const tokenInDollarValue = new BigNumber(amount || '0').multipliedBy(
      prices[baseToken.base]
    );
  
    const toTokenDollarPrice = prices[quoteToken.base]
    var toTokenAmount;
    if (toTokenDollarPrice){
      toTokenAmount = tokenInDollarValue.div(toTokenDollarPrice);
    }else{
      // no price found for quote token - maybe should throw here but let's see if there's a pool route[] for it
      toTokenAmount = 0;
    }

    const tokenOutAmount = new BigNumber(toTokenAmount)
      .shiftedBy(quoteToken.decimals)
      // tokenOut defined by .base (eg. uION)
      .toString();

    var tokenOutAmountAfterSlippage;
    if (slippage == 100){
      tokenOutAmountAfterSlippage = '1';
    }else{
      tokenOutAmountAfterSlippage = calcAmountWithSlippage(
      tokenOutAmount,
      slippage
      );
    }


    const tokenIn = {
      denom: baseToken.base,
      amount: tokenInAmount,
    };
    const tokenOut = {
      denom: quoteToken.base,
      amount: tokenOutAmountAfterSlippage,
    };

    const routes = getRoutesForTrade(this.tokenList, { // SwapAmountInRoute[] = (poolId, tokenOutDenom)[]
      trade: {
        sell: {
          denom: tokenIn.denom,
          amount: tokenIn.amount,
        },
        buy: {
          denom: tokenOut.denom,
          amount: tokenOut.amount,
        },
      },
      pairs,
    });

    if (!routes | routes.length === 0 | routes.length > 2) {
      logger.info(
        `No trade routes found for ${quoteToken.symbol}-${
          baseToken.symbol} ${quoteToken.symbol}-${
            baseToken.symbol}`
      );  
      throw new Error(`No trade routes found for ${quoteToken.symbol}-${
        baseToken.symbol} ${quoteToken.symbol}-${
          baseToken.symbol}`); 
    }

    // so far we have pools, routes, and token info...
    let route_length_1_pool_swapFee = '';
    // leaving some unreads in here in case they want to be delivered later
    let priceImpact = '';

    if (new BigNumber(tokenIn.amount).isEqualTo(0)) {
      priceImpact = '0';
    } 
    else if (routes.length === 1) 
    {
      const route_length_1_pool = pools.find((pool) => pool.id === routes[0].poolId)!;
      priceImpact = calcPriceImpactGivenIn(tokenIn, tokenOut.denom, route_length_1_pool);
      route_length_1_pool_swapFee = new BigNumber(route_length_1_pool.poolParams?.swapFee || 0).shiftedBy(-16).toString();  // shift used in CCA
    } 
    else {
      // THIS ASSUMES length == 2 - per CCA/osmosis guys..
      const tokenInRoute = routes.find(
        (route) => route.tokenOutDenom !== tokenOut.denom
      )!;
      const tokenOutRoute = routes.find(
        (route) => route.tokenOutDenom === tokenOut.denom
      )!;

      const tokenInPool = pools.find(
        (pool) => pool.id === tokenInRoute.poolId
      )!;
      const tokenOutPool = pools.find(
        (pool) => pool.id === tokenOutRoute.poolId
      )!;

      const priceImpactIn = calcPriceImpactGivenIn(
        tokenIn,
        tokenInRoute.tokenOutDenom,
        tokenInPool
      );
      const priceImpactOut = calcPriceImpactGivenOut(
        tokenOut,
        tokenOutRoute.tokenOutDenom,
        tokenOutPool
      );
      priceImpact = new BigNumber(priceImpactIn)
        .plus(priceImpactOut)
        .toString();
    }

// routes.length=1 mean there's just 1 hop - we're always just given one potentially route[] for a trade route request
    let swapRoutes: OsmosisExpectedTradeRoute[] = []

    if (routes.length === 1) {
      swapRoutes = routes.map((route) => {
        return {
          poolId: route.poolId.toString(),
          swapFee: route_length_1_pool_swapFee,
          baseLogo: baseToken.logo_URIs,
          baseSymbol: baseToken.symbol,
          quoteLogo: quoteToken.logo_URIs,
          quoteSymbol: quoteToken.symbol,
          tokenOutDenom: tokenOut.denom,
        };
      });
    } else {
      let swapFees: BigNumber[] = [];
      swapRoutes = routes
        .map((route) => {
          const pool = pools.find((pool) => pool.id === route.poolId);
          let baseAsset: CosmosAsset;
          let quoteAsset: CosmosAsset;
          if (route.tokenOutDenom !== tokenOut.denom) {
            baseAsset = baseToken;
            quoteAsset = this.getTokenByBase(route.tokenOutDenom)!;
          } else {
            const tokenInDenom = pool?.poolAssets.find(
              ({ token }) => token!.denom !== tokenOut.denom
            )?.token?.denom!;
            baseAsset = this.getTokenByBase(tokenInDenom)!;
            quoteAsset = quoteToken;
          }
          const fee = new BigNumber(pool?.poolParams?.swapFee || 0).shiftedBy(-16);  // shift used in CCA
          swapFees.push(fee);
          return {
            poolId: route.poolId.toString(),
            swapFee: fee,
            baseLogo: baseAsset.logo_URIs,
            baseSymbol: baseAsset.symbol,
            quoteLogo: quoteAsset.logo_URIs,
            quoteSymbol: quoteAsset.symbol,
            tokenOutDenom: route.tokenOutDenom,
          };
        })
        .map((route) => {
          const totalFee = swapFees.reduce(
            (total, cur) => total.plus(cur),
            new BigNumber(0)
          );
          const highestFee = swapFees.sort((a, b) => (a.lt(b) ? 1 : -1))[0];
          const feeRatio = highestFee.div(totalFee);
          return {
            ...route,
            swapFee: route.swapFee.multipliedBy(feeRatio).toString() + '%',
          };
        });
    }

    let expectedOutput = tokenOutAmountAfterSlippage;
    let feeObject = FEES.osmosis.swapExactAmountIn(feeTier)

    const gasLimitEstimate = new BigNumber(feeObject.gas).multipliedBy(gasAdjustment)

    const expectedAmountNum = new BigNumber(expectedOutput)
    const tokenInAmountNum = new BigNumber(amount).shiftedBy(baseToken.decimals)
    const executionPrice = expectedAmountNum.div(tokenInAmountNum)

    logger.info(
      `Best trade for ${quoteToken.address}-${
        baseToken.address
      }: ${ToLog_OsmosisExpectedTrade({ gasUsed: '', gasWanted: '', routes: swapRoutes, expectedAmount: expectedOutput, executionPrice: executionPrice, gasLimitEstimate: gasLimitEstimate, tokenInDenom:tokenIn.denom, tokenInAmount: tokenInAmount, tokenOutDenom:tokenOut.denom,  })}`
    );  
    return { gasUsed: '', gasWanted: '', routes: swapRoutes, expectedAmount: expectedOutput, executionPrice: executionPrice, gasLimitEstimate: gasLimitEstimate, tokenInDenom:tokenIn.denom, tokenInAmount: tokenInAmount, tokenOutDenom:tokenOut.denom }; // == OsmosisExpectedTrade
  }



  /**
   * Given a wallet and a Cosmosish trade, try to execute it on blockchain.
   *
   * @param wallet CosmosWallet
   * @param trade Expected trade
   * @param allowedSlippage? Allowed slippage eg "1%"
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
  */
  async executeTrade(
    wallet: CosmosWallet,
    trade: TradeInfo,   
    address: string,
    allowedSlippage?: string,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<TransactionResponse> { 
    var slippage = 0;
    if (allowedSlippage){
      slippage = Number(allowedSlippage.split('%')[0]);
    }else{
      slippage = Number(this.allowedSlippage.split('%')[0]);
    }
    var feeTier = this.feeTier;
    if (feeTier_input){
      feeTier = feeTier_input;
    }
    var gasAdjustment = this.gasPriceConstant;
    if (gasAdjustment_input){
      gasAdjustment = gasAdjustment_input;
    }

    const keyWallet = await DirectSecp256k1Wallet.fromKey(wallet.privkey, 'osmo')
    this.signingClient = await getSigningOsmosisClient({
      rpcEndpoint: this.rpcUrl,
      signer: keyWallet
    });
    const routes = trade.expectedTrade.routes;

    var tokenOutMinAmount;
    if (slippage == 100){
      tokenOutMinAmount = 1;
    }else{
      tokenOutMinAmount = this.noDecimals((Number(trade.expectedTrade.expectedAmount) * (100-slippage))/100)
    }
    const msg = swapExactAmountIn({
      'sender': address,
      'routes': routes,
      'tokenIn': coin(trade.expectedTrade.tokenInAmount, trade.expectedTrade.tokenInDenom),
      'tokenOutMinAmount': tokenOutMinAmount.toString(),
    });

    const fee = FEES.osmosis.swapExactAmountIn(feeTier);

    const gasEstimation = await this.signingClient.simulate(
      address,
      [msg],
    );
    if (!gasEstimation) {
      throw new Error('estimate gas error');
    }

    const calcedFee = calculateFee(
      Math.round(gasEstimation * (gasAdjustment || 1.5)),
      GasPrice.fromString(this.manualGasPrice)
    );
    if (calcedFee){}

    try {
      const res = await this.signingClient.signAndBroadcast(address, [msg], fee);
      return res;
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }

    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }

  /**
   * Given a 2 token symbols and 1-2 amounts, exchange amounts for pool liquidity shares
   *
   * @param wallet CosmosWallet
   * @param address Wallet address
   * @param token0 
   * @param token1 
   * @param amount0 
   * @param amount1 
   * @param poolId? Optional string specify poolId instead of search by tokens
   * @param allowedSlippage? Allowed slippage eg "1%"
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
  */
  async addPosition(
    wallet: CosmosWallet,
    address: string,
    token0: CosmosAsset,
    token1: CosmosAsset,
    amount0: string,
    amount1: string,
    poolId?: string, 
    allowedSlippage?: string,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<AddPositionTransactionResponse> {

    var slippage = 0;
    if (allowedSlippage){
      slippage = Number(allowedSlippage.split('%')[0]);
    }else{
      slippage = Number(this.allowedSlippage.split('%')[0]);
    }
    var feeTier = this.feeTier;
    if (feeTier_input){
      feeTier = feeTier_input;
    }
    var gasAdjustment = this.gasPriceConstant;
    if (gasAdjustment_input){
      gasAdjustment = gasAdjustment_input;
    }

    try {
      const keyWallet = await DirectSecp256k1Wallet.fromKey(wallet.privkey, 'osmo')
      this.signingClient = await getSigningOsmosisClient({
        rpcEndpoint: this.rpcUrl,
        signer: keyWallet
      });
      
      if (!this.signingClient || !address) {
        console.error('stargateClient undefined or address undefined.');
        throw new HttpException(
          500,
          "addPosition failed: Can't instantiate signing client.",
          TRADE_FAILED_ERROR_CODE
        );
      }

      const poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      const pools: ExtendedPool[] = poolsContainer.pools;
      
      var callImperatorWithTokens = undefined
      if (this.chain == 'testnet'){
        callImperatorWithTokens = this.tokenList;
      }
      const prices = await getImperatorPriceHash(callImperatorWithTokens);

      if (!amount0 && !amount1){
        throw new HttpException(
          500,
          "addPosition failed: Both token amounts equal to 0.",
          TRADE_FAILED_ERROR_CODE
        );
      }

      var amount0_bignumber = new BigNumber(0);
      var amount1_bignumber = new BigNumber(0);
      if (amount0){
        amount0_bignumber = new BigNumber(amount0);
      }
      if (amount1){
        amount1_bignumber = new BigNumber(amount1);
      }
      if (amount0_bignumber.isEqualTo(0) && amount1_bignumber.isEqualTo(0)){
        throw new HttpException(
          500,
          "addPosition failed: Both token amounts equal to 0.",
          TRADE_FAILED_ERROR_CODE
        );
      }
      
      var singleToken_UseWhich: string | null = null;
      if (!amount0_bignumber.isEqualTo(0) && amount1_bignumber.isEqualTo(0)){ // only token0
        singleToken_UseWhich = '0';
      }        
      if (amount0_bignumber.isEqualTo(0) && !amount1_bignumber.isEqualTo(0)){ // only token1
        singleToken_UseWhich = '1';
      }
      // NOT CHECKING (local wallet) BALANCES HERE it will bounce back either way

      // now find the poolid for this pair
      var foundPools: ExtendedPool[] = [];
      pools.forEach(function (cPool: ExtendedPool) {
        var foundToken0 = false;
        var foundToken1 = false;
        if (cPool.poolAssets){
          for (var poolAsset_idx=0; poolAsset_idx<cPool.poolAssets.length; poolAsset_idx++){
            var poolAsset: PoolAsset = cPool.poolAssets[poolAsset_idx];
            if (poolAsset!.token! && poolAsset!.token!.denom){
              if (poolAsset!.token!.denom == token0.base){
                foundToken0 = true;
              }
              if (poolAsset!.token!.denom == token1.base){
                foundToken1 = true;
              }
            }
          }
        }
        if (foundToken0 && foundToken1){
          foundPools.push(cPool);
        }
      });

      var pool;
      if (poolId){
        pool = pools.find(({id}) => id.toString() == poolId);
      }else if (foundPools){
        pool = foundPools.pop(); // this is not selective without poolid input (can be multiple pools per token pair).. though order should cause pool with greatest liquidity to be used
      }

      if (pool){
        var fee = {
          amount: coins(0, 'uosmo'),
          gas: '240000',
        }; // default, going to overwrite below

        let msg = [];
        if (singleToken_UseWhich) { // in case 1 of the amounts == 0 
          var singleToken_amount = new BigNumber(0);
          var singleToken: CosmosAsset | undefined = undefined;
          if (singleToken_UseWhich == '0'){
            singleToken_amount = amount0_bignumber;
            singleToken = token0;
          }else{
            singleToken_amount = amount1_bignumber;
            singleToken = token1;
          }
          const inputCoin = {'denom':singleToken.base, 'amount':singleToken_amount.shiftedBy(this.getExponentByBase(singleToken.base)).toString()};

          const coinSymbol = singleToken.symbol;
          const inputValue = this.baseUnitsToDollarValue(
            prices,
            coinSymbol,
            singleToken_amount.toNumber()
          );

          const coinsNeeded = convertDollarValueToCoins(this.tokenList, inputValue, pool, prices);
          const shareOutAmount = calcShareOutAmount(pool, coinsNeeded);

          var finalShareOutAmount;
          if (slippage == 100){
            finalShareOutAmount = (new BigNumber(1).integerValue(BigNumber.ROUND_CEIL));
          }else{
            finalShareOutAmount = (new BigNumber(calcAmountWithSlippage(shareOutAmount, slippage)).integerValue(BigNumber.ROUND_CEIL))
          }

          const joinSwapExternAmountInMsg = joinSwapExternAmountIn({
            poolId: pool.id.toString(),
            sender: address,
            tokenIn: inputCoin,
            shareOutMinAmount: finalShareOutAmount.toString(),
          });
          msg.push(joinSwapExternAmountInMsg);
          fee = FEES.osmosis.joinSwapExternAmountIn(feeTier);
        } 
        else {
          var allCoins = [];
          allCoins.push({'denom':token0.base, 'amount':new BigNumber(amount0)
          .shiftedBy(this.getExponentByBase(token0.base))
          .toString()});
          allCoins.push({'denom':token1.base, 'amount':new BigNumber(amount1)
          .shiftedBy(this.getExponentByBase(token1.base))
          .toString()});

          const shareOutAmount = calcShareOutAmount(pool, allCoins);
          const tokenInMaxs = allCoins.map((c: Coin) => {
            return coin(c.amount, c.denom);
          });
          
          var finalShareOutAmount;
          if (slippage == 100){
            finalShareOutAmount = (new BigNumber(1).integerValue(BigNumber.ROUND_CEIL));
          }else{
            finalShareOutAmount = (new BigNumber(calcAmountWithSlippage(shareOutAmount, slippage)).integerValue(BigNumber.ROUND_CEIL))
          }

          const joinPoolMsg = joinPool({
            poolId: pool.id.toString(),
            sender: address,
            shareOutAmount: finalShareOutAmount.toString(),
            tokenInMaxs,
          });
          msg.push(joinPoolMsg);
          fee = FEES.osmosis.joinPool(feeTier);
        }

        const successfulTransaction = 0;
        const insufficientFunds = 5;
        const res: AddPositionTransactionResponse = await this.signingClient.signAndBroadcast(address, msg, fee);
        if (res?.code == insufficientFunds) throw new HttpException(
          500,
          INSUFFICIENT_FUNDS_ERROR_MESSAGE + " : " + res.rawLog,
          INSUFFICIENT_FUNDS_ERROR_CODE
        );

        if (res?.code !== successfulTransaction) throw res;

        // RETURNED VALUE DISSECTION
        //  osmo doesnt send back a clear value, we need to discern it from the event logs >.>
        var outbound_coins_string = '' // 990uion,98159uosmo
        var outbound_shares_string = '' // 57568515255656500gamm/pool/62
        var token0_finalamount = '0'
        var token1_finalamount = '0'
        var poolshares = '0'
        try {
          for (var event_idx=0; event_idx<res.events.length; event_idx++){
            var event = res.events[event_idx];
            if (event.type == 'coin_received'){
              
              for (var attribute_idx=0; attribute_idx<event.attributes.length; attribute_idx++){
                var attribute = event.attributes[attribute_idx];
                if (attribute.key == 'receiver' && attribute.value && attribute.value == pool.address){
                  if (event.attributes.length > attribute_idx){
                    outbound_coins_string = event.attributes[attribute_idx+1].value
                  }
                }
                else if (attribute.key == 'amount'){
                  if (pool.totalShares && pool.totalShares.denom && attribute.value.includes(pool.totalShares.denom)){
                    outbound_shares_string = attribute.value;
                  }
                }
              }
            }
          }
          if (outbound_coins_string != ''){
            if (outbound_coins_string.includes(',')){
              var coins_string_list = outbound_coins_string.split(',');
              for (var coin_string_idx=0; coin_string_idx<coins_string_list.length; coin_string_idx++){
                var coin_string = coins_string_list[coin_string_idx];
                if (coin_string.includes(token0.base)){
                  token0_finalamount = coin_string.replace(token0.base,'');
                } else if (coin_string.includes(token1.base)){
                  token1_finalamount = coin_string.replace(token1.base,'');
                }
              }
            }else{
              if (outbound_coins_string.includes(token0.base)){
                token0_finalamount = outbound_coins_string.replace(token0.base,'');
              } else if (outbound_coins_string.includes(token1.base)){
                token1_finalamount = outbound_coins_string.replace(token1.base,'');
              }
            }
          }
          
          if (outbound_shares_string != ''){
            poolshares = outbound_shares_string.replace(pool.totalShares.denom,'');
          }
        } catch (error) {
          console.debug(error);
        }

        res.token0_finalamount = token0_finalamount
        res.token1_finalamount = token1_finalamount
        res.poolshares = poolshares
        res.poolId = pool.id.toString()
        res.poolAddress = pool.address
        this.signingClient.disconnect();
        return res; 
      }

    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }


  /**
   * Given a 2 token symbols and 1-2 amounts, exchange amounts for pool liquidity shares
   *
   * @param wallet CosmosWallet
   * @param decreasePercent 
   * @param address Wallet address
   * @param poolId? Optional string specify poolId instead of search by tokens
   * @param allowedSlippage? Allowed slippage eg "1%"
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
  */
  async reducePosition(
    wallet: CosmosWallet,
    decreasePercent: number = 100,
    address: string,
    poolId: string, 
    allowedSlippage?: string,
    feeTier_input?: string,
    gasAdjustment_input?: number,
    ): Promise<ReduceLiquidityTransactionResponse> {

    var slippage = Number(this.allowedSlippage.split('%')[0]);
    if (allowedSlippage){
      slippage = Number(allowedSlippage.split('%')[0]);
    }
    var feeTier = this.feeTier;
    if (feeTier_input){
      feeTier = feeTier_input;
    }
    var gasAdjustment = this.gasPriceConstant;
    if (gasAdjustment_input){
      gasAdjustment = gasAdjustment_input;
    }

    try {
      const keyWallet = await DirectSecp256k1Wallet.fromKey(wallet.privkey, 'osmo')
      this.signingClient = await getSigningOsmosisClient({
        rpcEndpoint: this.rpcUrl,
        signer: keyWallet
      });
      
      const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
        address: address,
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(10000),
          countTotal: false,
          reverse: false,
        },
      })
      const balances = balancesContainer.balances
      const lockedCoinsContainer = await this._provider.osmosis.lockup.accountLockedCoins({
        owner: address,
      });
      const lockedCoins: Coin[] = lockedCoinsContainer.lockedCoins ? lockedCoinsContainer.lockedCoins : []

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      const poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      const pools: ExtendedPool[] = poolsContainer.pools;

      const fees = await fetchFees();
      var callImperatorWithTokens = undefined
      if (this.chain == 'testnet'){
        callImperatorWithTokens = this.tokenList;
      }
      const prices = await getImperatorPriceHash(callImperatorWithTokens); // need to compare these two.. i think formatting is the same?

      // filter for CL
      const filteredPools = filterPoolsLP(this.tokenList, pools, prices); // removes stableswap, !token.denom.startsWith('gamm/pool'), has price, has osmosisAsset

      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.tokenList, { pool, fees, balances, lockedCoins, prices:prices })
      );

      const currentPool = extendedPools.filter((pl) => pl.id.toString() == poolId)[0];
      const percent = decreasePercent; // total percent of pool shares

      const myLiquidity = new BigNumber(currentPool.myLiquidity || 0)
      .multipliedBy(percent)
      .div(100)
      .toString();

      const unbondedShares = convertDollarValueToShares(
        this.tokenList, 
        myLiquidity || 0,
        currentPool,
        prices
      );
    
      const myCoins = convertDollarValueToCoins(
        this.tokenList, 
        myLiquidity || 0,
        currentPool,
        prices
      );

      const coinsNeeded = myCoins.map(({ denom, amount }) => {
      
        var amountWithSlippage;
        amountWithSlippage = new BigNumber(amount)
        .multipliedBy(new BigNumber(100).minus(slippage))
        .div(100)
        .toString();
  
        return {
          denom,
          amount: this.noDecimals(0),
        };
      });
  
      const shareInAmount = new BigNumber(unbondedShares)
        .shiftedBy(18)
        .decimalPlaces(0)
        .toString();
  
      var tokenOutMins = coinsNeeded.map((c: Coin) => {
        return coin(c.amount, c.denom);
      });

      if (slippage == 100){
        tokenOutMins = []
      }

      var msgs = []
      const msg = exitPool({
        poolId: currentPool.id.toString(),
        sender: address,
        shareInAmount,
        tokenOutMins: tokenOutMins,
      });
      msgs.push(msg)
  
      const fee = FEES.osmosis.exitPool(feeTier);

      const gasEstimation = await this.signingClient.simulate(
        address,
        msgs,
      );
      if (!gasEstimation) {
        throw new Error('estimate gas error');
      }
  
      const calcedFee = calculateFee(
        Math.round(gasEstimation * (gasAdjustment || 1.5)),
        GasPrice.fromString(this.manualGasPrice)
      );
      if (calcedFee){}



      const successfulTransaction = 0;
      const res: ReduceLiquidityTransactionResponse = await this.signingClient.signAndBroadcast(address, msgs, fee);

      if (res?.code !== successfulTransaction) throw res;
      this.signingClient.disconnect();

      
      var finalAmountReceived_string = '';
      var token0_denom = currentPool.poolAssets[0].token.denom
      var token1_denom = currentPool.poolAssets[1].token.denom
      var token0 = this.getTokenByBase(token0_denom)
      var token1 = this.getTokenByBase(token1_denom)
      var amount0_base = ''
      var amount1_base = ''
      var amount0 = ''
      var amount1 = ''

      try {
        for (var txEvent_idx=0; txEvent_idx<res.events.length; txEvent_idx++){
          var txEvent: TransactionEvent = res.events[txEvent_idx];
          if (txEvent.type == 'coin_received'){
            for (var txEventAttribute_idx=0; txEventAttribute_idx<txEvent.attributes.length; txEventAttribute_idx++){
              var txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx];
              if (txEventAttribute.key == 'receiver'){
                if (txEventAttribute.value == address){
                    var next_txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx+1];
                    if (next_txEventAttribute.key == 'amount' && next_txEventAttribute.value){
                      finalAmountReceived_string = next_txEventAttribute.value;
                    }
                } 
              }
            }
          }
        }

        if (finalAmountReceived_string != ''){
          if (finalAmountReceived_string.includes(',')){
            var coins_string_list = finalAmountReceived_string.split(',');
            for (var coin_string_idx=0; coin_string_idx<coins_string_list.length; coin_string_idx++){
              var coin_string = coins_string_list[coin_string_idx];
              if (coin_string.includes(token0!.base)){
                amount0_base = coin_string.replace(token0!.base,'');
              } else if (coin_string.includes(token1!.base)){
                amount1_base = coin_string.replace(token1!.base,'');
              }
            }
          }else{
            if (finalAmountReceived_string.includes(token0!.base)){
              amount0_base = finalAmountReceived_string.replace(token0!.base,'');
            } else if (finalAmountReceived_string.includes(token1!.base)){
              amount1_base = finalAmountReceived_string.replace(token1!.base,'');
            }
          }
        }

        if (amount0_base != ''){
          amount0 = (new BigNumber(amount0_base)).shiftedBy(token0!.decimals * -1).decimalPlaces(token0!.decimals).toString();
        }
        if (amount1_base != ''){
          amount1 = (new BigNumber(amount1_base)).shiftedBy(token1!.decimals * -1).decimalPlaces(token1!.decimals).toString();
        }
      } catch (error) {
        console.debug(error);
      } 

      res.amount0 = amount0
      res.amount1 = amount1
      res.token0 = token0!.symbol
      res.token1 = token1!.symbol
      return res;

    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }

  /**
   * Returns all pools and their prices for 2 tokens. Address used for balance query.
   *
   * @param token0 
   * @param token1 
   * @param address Wallet address
  */
  async findPoolsPrices(
    token0: CosmosAsset,
    token1: CosmosAsset,
    address: string,
  ): Promise<SerializableExtendedPool[]> {

    try {
      const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
        address: address,
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(10000),
          countTotal: false,
          reverse: false,
        },
      })
      const balances = balancesContainer.balances
      const lockedCoinsContainer = await this._provider.osmosis.lockup.accountLockedCoins({
        owner: address,
      });
      const lockedCoins: Coin[] = lockedCoinsContainer.lockedCoins ? lockedCoinsContainer.lockedCoins : []

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      const poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      const pools: ExtendedPool[] = poolsContainer.pools;
      const fees = await fetchFees();
      var callImperatorWithTokens = undefined
      if (this.chain == 'testnet'){
        callImperatorWithTokens = this.tokenList;
      }
      const prices = await getImperatorPriceHash(callImperatorWithTokens);

      // filter for CL
      const filteredPools = filterPoolsLP(this.tokenList, pools, prices); // removes stableswap, !token.denom.startsWith('gamm/pool'), has price, has osmosisAsset

      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.tokenList, { pool, fees, balances, lockedCoins, prices:prices })
      );

      var returnPools: SerializableExtendedPool[] = [];
      extendedPools.forEach(function (cPool) {
        var foundToken0 = false;
        var foundToken1 = false;

        if (cPool.poolAssets){
          for (var poolAsset_idx=0; poolAsset_idx<cPool.poolAssets.length; poolAsset_idx++){
            var poolAsset: PoolAsset = cPool.poolAssets[poolAsset_idx];
            if (poolAsset!.token! && poolAsset!.token!.denom){
              if (poolAsset!.token!.denom == token0.base){
                foundToken0 = true;
              }
              if (poolAsset!.token!.denom == token1.base){
                foundToken1 = true;
              }
            }
          }
        }

        if (foundToken0 && foundToken1){
          returnPools.push(new SerializableExtendedPool(cPool));
        }
      });

      return returnPools;

    } catch (error) {
      console.debug(error);
    } finally {

    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }

  /**
   * Returns all pool positions data including number of user's shares, or for single specified poolId
   *
   * @param token0 
   * @param token1 
   * @param address Wallet address
  */
  async findPoolsPositions(
    address: string,
    poolId?: string,
  ): Promise<SerializableExtendedPool[]> {

    try {
      const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
        address: address,
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(10000),
          countTotal: false,
          reverse: false,
        },
      })
      const balances = balancesContainer.balances
      const lockedCoinsContainer = await this._provider.osmosis.lockup.accountLockedCoins({
        owner: address,
      });
      const lockedCoins: Coin[] = lockedCoinsContainer.lockedCoins ? lockedCoinsContainer.lockedCoins : []

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      const poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      const pools: ExtendedPool[] = poolsContainer.pools;

      const fees = await fetchFees();
      var callImperatorWithTokens = undefined
      if (this.chain == 'testnet'){
        callImperatorWithTokens = this.tokenList;
      }
      const prices = await getImperatorPriceHash(callImperatorWithTokens); 

      // filter for CL
      const filteredPools = filterPoolsLP(this.tokenList, pools, prices); // removes stableswap, !token.denom.startsWith('gamm/pool'), has price, has osmosisAsset

      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.tokenList, { pool, fees, balances, lockedCoins, prices:prices })
      );

      var returnPools: SerializableExtendedPool[] = [];
      extendedPools.forEach(function (cPool) {
        if (poolId){
          if (cPool.id.toString() == poolId){
            returnPools.push(new SerializableExtendedPool(cPool));
          }
        }else{

          if ((cPool.myLiquidity && cPool.myLiquidity != '0') || (cPool.bonded && cPool.bonded != '0'))
          {
            returnPools.push(new SerializableExtendedPool(cPool));
          }
        }

      });

      return returnPools;

    } catch (error) {
      console.debug(error);
    } finally {

    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }

  
  async getCurrentBlockNumber(): Promise<number>{
    const client = await CosmWasmClient
    .connect(this.rpcUrl);
    const getHeight = await client.getHeight()
    return getHeight;
  }

  /**
   * Transfer tokens
   *
   * @param wallet 
   * @param token 
   * @param req TransferRequest
  */
  async transfer(
    wallet: CosmosWallet,
    token: CosmosAsset,
    req: TransferRequest
  ): Promise<TransactionResponse> {

    const keyWallet = await DirectSecp256k1Wallet.fromKey(wallet.privkey, 'osmo')
    this.signingClient = await getSigningOsmosisClient({
      rpcEndpoint: this.rpcUrl,
      signer: keyWallet
    });

    const tokenInAmount = new BigNumber(req.amount)
    .shiftedBy(token.decimals)
    .toString();

    const coinIn = {
      denom: token.base,
      amount: tokenInAmount,
    };

    var coinsList = []
    coinsList.push(coinIn)
    const msg = send({
      fromAddress: req.from,
      toAddress: req.to,
      amount: coinsList
    });

    const fee = FEES.osmosis.swapExactAmountIn(this.feeTier);

    const res = await this.signingClient.signAndBroadcast(req.from, [msg], fee);
    this.signingClient.disconnect();
    return res;
  }

  async getTokens(req?: TokensRequest): Promise<TokensResponse> {
    var responseTokens: TokenInfo[] = [];
    this.tokenList.forEach(element => {
      // FILTER IF req.tokenSymbols != []
      var addToken = true;
      if (req && req.tokenSymbols && req.tokenSymbols.length > 0){
        addToken = false;
        for (var idx=0; idx<req.tokenSymbols.length; idx++){
          if (req.tokenSymbols[idx] == element.symbol){
            addToken = true;
            break;
          }
        }
      }
      if (addToken){
        responseTokens.push({chainId:0, address:element.address, name:element.name, symbol:element.symbol, decimals:element.decimals})
      }
    });

    return {tokens:responseTokens};
  }
}
