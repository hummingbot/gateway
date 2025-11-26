// ts-expect-error cases:
//Case 1 - Asset.traces?: (IbcTransition | IbcCw20Transition | IbcBridgeTransition | NonIbcTransition)[];
//    it's mad about these not being cross-compatible between old asset and new asset (and thus my universal asset)
//    not presently using traces, will ignore unless needed later (would be a lot of work though for something not in use)
//        happens around tokenList

//Case 2 - CosmosAsset.typeAsset = "str" | "str"
//    new model added more values to this string enum, but
//    these two are compatible (as constructor works in one direction)
//        happens around assetList

// const { coin, Coin } = await import('@cosmjs/amino');
import { coin, Coin } from '@cosmjs/amino';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GeneratedType, Registry } from '@cosmjs/proto-signing';
import { AminoTypes, SigningStargateClient, setupIbcExtension, GasPrice, calculateFee } from '@cosmjs/stargate';
import { Tendermint37Client, HttpBatchClient } from '@cosmjs/tendermint-rpc';
import {
  convertDollarValueToCoins,
  convertDollarValueToShares,
  calcShareOutAmount,
  makePoolPairs,
} from '@osmonauts/math';
import type { PrettyPair } from '@osmonauts/math/esm/types';
import { FEES } from '@osmonauts/utils';
import { BigNumber } from 'bignumber.js';
import fse from 'fs-extra';
import {
  cosmosAminoConverters,
  cosmosProtoRegistry,
  cosmwasmAminoConverters,
  cosmwasmProtoRegistry,
  ibcProtoRegistry,
  ibcAminoConverters,
  osmosisAminoConverters,
  osmosisProtoRegistry,
  osmosis, // OSMO message composer classes don't quite match up with what the RPC/Go backend actually accepts.
  cosmos,
} from 'osmojs';
import { PoolAsset } from 'osmojs/esm/osmosis/gamm/v1beta1/balancerPool';

import { CosmosWallet, cWalletMaker, CosmosTokenValue, CosmosBase } from '../../chains/cosmos/cosmos-base';
import { getCoinGeckoPrices } from '../../chains/cosmos/cosmos.prices';
import { CosmosAsset } from '../../chains/cosmos/cosmos.universaltypes';
import { isValidCosmosAddress } from '../../chains/cosmos/cosmos.validators';
import {
  PositionInfo as AMMPositionInfo,
  GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
  AddLiquidityRequestType as AMMAddLiquidityRequestType,
  AddLiquidityResponseType as AMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
} from '../../schemas/amm-schema';
import { TokensRequestType, TokensResponseType } from '../../schemas/chain-schema';
import {
  CollectFeesRequestType as CLMMCollectFeesRequestType,
  CollectFeesResponseType as CLMMCollectFeesResponseType,
  OpenPositionRequestType as CLMMOpenPositionRequestType,
  OpenPositionResponseType as CLMMOpenPositionResponseType,
  PositionInfo as CLMMPositionInfo,
  GetPositionInfoRequestType as CLMMGetPositionInfoRequestType,
  AddLiquidityRequestType as CLMMAddLiquidityRequestType,
  AddLiquidityResponseType as CLMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as CLMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as CLMMRemoveLiquidityResponseType,
  QuotePositionResponseType,
  ExecuteSwapRequestType,
} from '../../schemas/clmm-schema';
import { TokenInfo } from '../../services/base';
import { percentRegexp } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';
import { isFractionString } from '../../services/string-utils';
import { walletPath } from '../../wallet/utils';

import { OsmosisConfig } from './osmosis.config';
import { OsmosisController } from './osmosis.controllers';
import {
  parseFees,
  extendPool,
  getPoolByIdAndFilter,
  getPoolByAddressAndFilter,
  filterPoolsStableSwap,
  filterPoolsCLMM,
  filterPoolsGAMM,
  CLMMMakePoolPairs,
} from './osmosis.pools.utils';
import {
  getRoutesForTrade,
  calcAmountWithSlippage,
  calcPriceImpactGivenIn,
  calcPriceImpactGivenOut,
} from './osmosis.swap';
import {
  CoinGeckoToken,
  CoinDenom,
  Exponent,
  CoinSymbol,
  PriceHash,
  OsmosisExpectedTrade,
  ToLog_OsmosisExpectedTrade,
  TransactionResponse,
  OsmosisExpectedTradeRoute,
  AddPositionTransactionResponse,
  ReduceLiquidityTransactionResponse,
  SerializableExtendedPool,
  PriceAndSerializableExtendedPools,
  ExtendedPool,
  AnyPoolType,
  TransferRequest,
  TradeInfo,
} from './osmosis.types';
import { findTickForPrice, tickToPrice, calculatePriceToTick } from './osmosis.utils';

export interface TokensRequest {
  chain?: string; //the target chain (e.g. ethereum, avalanche, or harmony)
  network?: string; // the target network of the chain (e.g. mainnet)
  tokenSymbols?: string[];
}

export interface TokensResponse {
  tokens: TokenInfo[];
}

const { joinPool, exitPool, joinSwapExternAmountIn, swapExactAmountIn } =
  osmosis.gamm.v1beta1.MessageComposer.withTypeUrl;
const { createPosition, addToPosition, withdrawPosition, collectSpreadRewards, collectIncentives } =
  osmosis.concentratedliquidity.v1beta1.MessageComposer.withTypeUrl;
const { send } = cosmos.bank.v1beta1.MessageComposer.fromPartial;

const protoRegistry = [
  ...cosmosProtoRegistry,
  ...cosmwasmProtoRegistry,
  ...ibcProtoRegistry,
  ...osmosisProtoRegistry,
] as unknown as ReadonlyArray<[string, GeneratedType]>; // differing versions of proto-signing.cosmojs

const aminoConverters = {
  ...cosmosAminoConverters,
  ...cosmwasmAminoConverters,
  ...ibcAminoConverters,
  ...osmosisAminoConverters,
};

const registry = new Registry(protoRegistry);
const aminoTypes = new AminoTypes(aminoConverters);
const successfulTransaction = 0;
const exampleOsmosisPublicKey = 'osmo000000000000000000000000000000000000000';

export class Osmosis extends CosmosBase {
  // Configuration
  public config: OsmosisConfig.NetworkConfig;

  public controller;
  private static _instances: { [name: string]: Osmosis };
  private _gasPrice: number;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _network: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  public _walletAddressExample: string;
  private signingClient?: any;
  private lastCoinGeckoCallTime?: number; // ton of errors from coingecko from calling too often, especially during testing
  private lastCoinGeckoPrices?: Record<string, number>;
  public gasLimitEstimate: number;
  public readonly feeTier: string = 'medium'; // FEE_VALUES.osmosis[_feeTier] low medium high osmojs/src/utils/gas/values.ts
  public allowedSlippage: string = '0/100';
  public manualGasPriceToken: string = 'uosmo';
  private tendermint37Client?: Tendermint37Client;
  private httpBatchClient?: HttpBatchClient;
  private constructor(network: string) {
    const config = OsmosisConfig.config;
    super(
      network,
      config.chainName(network), // osmo-test-5 or osmosis-1
      config.nodeURL(network).toString(),
      config.gasAdjustment,
      config.feeTier,
      config.manualGasPriceToken,
      config.gasLimitTransaction,
      config.allowedSlippage,
      'osmosis', // rpc provider
      config.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice,
      config.rpcAddressDynamicBaseFee,
      config.manualGasPrice,
    );
    this._network = network;
    this._chain = 'cosmos';
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this._walletAddressExample = exampleOsmosisPublicKey;
    this.manualGasPriceToken = config.manualGasPriceToken;

    this._gasPrice = Number(this.manualGasPrice);
    this.feeTier = config.feeTier;
    this.gasLimitEstimate = config.gasLimitTransaction;
    this.allowedSlippage = config.allowedSlippage;

    this.chainName = config.chainName(network);
    this.signingClient = undefined;
    this.controller = OsmosisController;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this._metricTimer = setInterval(this.metricLogger.bind(this), this.metricsLogInterval);
    logger.info(`Initialized Osmosis connector for network: ${network}, nodeURL: ${this.nodeURL}`);
  }

  public static getInstance(network?: string): Osmosis {
    if (!network) network = 'mainnet';
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
    logger.info(this.requestCount + ' request(s) sent in last ' + this.metricsLogInterval / 1000 + ' seconds.');
    this._requestCount = 0; // reset
  }
  /**
   * Validate Cosmos address format
   * @param address The address to validate
   * @returns The address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      // Attempt to validate the address
      if (isValidCosmosAddress(address)) {
        return address;
      }
    } catch (e) {
      logger.warn(`Invalid Cosmos/Osmosis address found in wallet directory: ${address}`);
      return null;
    }
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
    return this._ready;
  }

  private async osmosisGetSigningStargateClient(rpcEndpoint: string, signer: any) {
    this.osmosisGetHttpBatchClient(rpcEndpoint);
    await this.osmosisGetTendermint37Client();

    const signingStargateClient = await SigningStargateClient.createWithSigner(this.tendermint37Client!, signer, {
      //@ts-expect-error differing versions of proto-signing.cosmojs
      registry: registry,
      aminoTypes: aminoTypes,
    });

    return signingStargateClient;
  }

  private async osmosisGetTendermint37Client() {
    this.tendermint37Client = await Tendermint37Client.create(this.httpBatchClient!);
  }

  private osmosisGetHttpBatchClient(rpcEndpoint: string) {
    this.httpBatchClient = new HttpBatchClient(rpcEndpoint, {
      dispatchInterval: 2000,
    });
  }

  private async getCoinGeckPricesStored() {
    if (
      !this.lastCoinGeckoPrices ||
      !this.lastCoinGeckoCallTime ||
      this.lastCoinGeckoCallTime + 60 * 1000 * 3 < Date.now()
    ) {
      // 3 minutes
      this.lastCoinGeckoCallTime = Date.now();
      this.lastCoinGeckoPrices = await getCoinGeckoPrices(this.tokenList);
    }
    return this.lastCoinGeckoPrices;
  }

  public getTokenByAddress(address: string): CosmosAsset {
    const token = this.tokenList.find((token: CosmosAsset) => token.address === address);
    if (!token) {
      throw new Error('Osmosis token not found for address: ' + address);
    }
    return token;
  }
  public getDenomForCoinGeckoId = (coinGeckoId: CoinGeckoToken): CoinDenom => {
    const asset_found = this.tokenList.find((asset) => asset.coingeckoId === coinGeckoId);
    if (asset_found) {
      return asset_found.base;
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
    if (asset && asset.denomUnits) {
      const unit = asset.denomUnits.find(({ denom }) => denom === asset.display);
      if (unit) {
        return unit.exponent;
      }
    }
    return 0;
  };
  public noDecimals = (num: number | string) => {
    return new BigNumber(num).decimalPlaces(0, BigNumber.ROUND_DOWN).toString();
  };
  public baseUnitsToDollarValue = (prices: PriceHash, symbol: string, amount: string | number) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(amount).shiftedBy(-this.getExponentByBase(denom)).multipliedBy(prices[denom]).toString();
  };
  public dollarValueToDenomUnits = (prices: PriceHash, symbol: string, value: string | number) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(value).dividedBy(prices[denom]).shiftedBy(this.getExponentByBase(denom)).toString();
  };
  public baseUnitsToDisplayUnits = (symbol: string, amount: string | number) => {
    const denom = this.symbolToOsmoDenom(symbol);
    return new BigNumber(amount).shiftedBy(-this.getExponentByBase(denom)).toString();
  };

  public isEmptyArray = (arr: any[]) => arr.length === 0;

  // Add new method to get first wallet address
  public static async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/cosmos`;
    try {
      // Create directory if it doesn't exist
      await fse.ensureDir(path);

      // Get all .json files in the directory
      const files = await fse.readdir(path);
      const walletFiles = files.filter((f) => f.endsWith('.json'));

      if (walletFiles.length === 0) {
        return null;
      }

      // Get the first wallet address (without .json extension)
      const walletAddress = walletFiles[0].slice(0, -5);

      try {
        // Attempt to validate the address
        if (isValidCosmosAddress(walletAddress)) {
          return walletAddress;
        }
      } catch (e) {
        logger.warn(`Invalid Cosmos/Osmosis address found in wallet directory: ${walletAddress}`);
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  /**
   * Get a wallet address example for schema documentation
   */
  public static async getWalletAddressExample(): Promise<string> {
    const defaultAddress = exampleOsmosisPublicKey;
    try {
      const foundWallet = await this.getFirstWalletAddress();
      if (foundWallet) {
        return foundWallet;
      }
      logger.debug('No wallets found for examples in schema, using default.');
      return defaultAddress;
    } catch (error) {
      logger.error(`Error getting Cosmos/Osmosis wallet address for example: ${error.message}`);
      return defaultAddress;
    }
  }

  async getBalances(wallet: CosmosWallet): Promise<Record<string, CosmosTokenValue>> {
    const balances: Record<string, CosmosTokenValue> = {};
    const accounts = await wallet.member.getAccounts();
    const { address } = accounts[0];

    const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
      address: address,
      pagination: {
        key: new Uint8Array(),
        offset: BigInt(0),
        limit: BigInt(10000),
        countTotal: false,
        reverse: false,
      },
    });

    const allTokens = balancesContainer.balances;

    await Promise.all(
      allTokens.map(async (t: { denom: string; amount: string }) => {
        let token = this.getTokenByBase(t.denom);

        try {
          if (!token && t.denom.startsWith('ibc/')) {
            const ibcHash: string = t.denom.replace('ibc/', '');

            // Get base denom by IBC hash
            if (ibcHash) {
              const { denomTrace } = await setupIbcExtension(this._provider).ibc.transfer.denomTrace(ibcHash);
              // tried calling with cosmos provider/versions. QueryDenomTraces failing: "base.queryAbci is not a function"
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
          decimals: token && token.decimals ? token.decimals : token ? this.getTokenDecimals(token) : 6,
        };
      }),
    );

    return balances;
  }

  // used with signingResponse or via getTransaction
  async dissectTransactionResponse(address: string, signingResponse = undefined, getTxInput = undefined) {
    if (signingResponse == undefined) {
      signingResponse = getTxInput.txResponse;
    }
    const tokenBalanceChangesDenoms: Record<string, number> = {};
    const tokenBalanceChanges: Record<string, number> = {};
    const coin_spents: string[] = [];
    const coin_receiveds: string[] = [];
    let new_position_id = '';
    let position_id = '';
    // dissect final balance changes
    try {
      const denom_list = [];
      if (address) {
        signingResponse.events.forEach((event) => {
          if (event.attributes[0].value == address) {
            if (event.type == 'coin_spent') {
              event.attributes[1].value.split(',').forEach((e) => {
                coin_spents.push(e);
              });
            } else if (event.type == 'coin_received') {
              event.attributes[1].value.split(',').forEach((e) => {
                coin_receiveds.push(e);
              });
            }
          }
        });
        coin_receiveds.forEach((coin_spent) => {
          //eg. 100199uosmo '12uion,16017uosmo'
          let amount = '';
          let denom = '';
          let reading_amount = true;
          [...coin_spent].forEach((c) => {
            if (reading_amount && c >= '0' && c <= '9') {
              amount += c;
            } else {
              reading_amount = false;
              denom += c;
            }
          });
          if (amount != '' && denom != '') {
            tokenBalanceChangesDenoms[denom] = tokenBalanceChangesDenoms[denom]
              ? tokenBalanceChangesDenoms[denom] + Number(amount)
              : Number(amount);
            if (!denom_list.includes(denom)) {
              denom_list.push(denom);
            }
          }
        });

        coin_spents.forEach((coins) => {
          let amount = '';
          let denom = '';
          let reading_amount = true;
          [...coins].forEach((c) => {
            if (reading_amount && c >= '0' && c <= '9') {
              amount += c;
            } else {
              reading_amount = false;
              denom += c;
            }
          });

          if (amount != '' && denom != '') {
            if (!denom_list.includes(denom)) {
              denom_list.push(denom);
            }
            tokenBalanceChangesDenoms[denom] = tokenBalanceChangesDenoms[denom]
              ? tokenBalanceChangesDenoms[denom] - Number(amount)
              : Number(amount) * -1;
          }
        });

        denom_list.forEach((denom) => {
          const decimals = this.getExponentByBase(denom);
          tokenBalanceChanges[this.osmoDenomToSymbol(denom)] = new BigNumber(tokenBalanceChangesDenoms[denom])
            .shiftedBy(decimals * -1)
            .decimalPlaces(decimals)
            .toNumber();
        });
      }
    } catch (error) {
      console.debug(error);
    }

    // find new_position_id for addLiquidityCLMM (we use this instead of position address)
    try {
      signingResponse.events.forEach((event) => {
        event.attributes.forEach((attr) => {
          if (attr.key == 'new_position_id') {
            new_position_id = attr.value;
          } else if (attr.key == 'position_id') {
            position_id = attr.value;
          }
        });
      });
    } catch (error) {
      console.debug(error);
    }
    const return_position_id = new_position_id != '' ? new_position_id : position_id;
    return [tokenBalanceChangesDenoms, tokenBalanceChanges, return_position_id];
  }

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token buy/sell prices.
   *
   * @param network testnet/mainnet
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   * @param tradeType "BUY" or "SELL"
   * @param poolType amm/clmm
   * @param poolAddress? Specific pool address to use for the trade
   * @param allowedSlippagePercent? Allowed slippage eg "1%"
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
   */
  async estimateTrade(
    network: string,
    baseToken: CosmosAsset,
    quoteToken: CosmosAsset,
    amount: BigNumber,
    tradeType: string,
    poolType: string,
    poolAddress?: string,
    allowedSlippagePercent?: number,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<OsmosisExpectedTrade> {
    let slippage_percent = 0;
    if (allowedSlippagePercent) {
      slippage_percent = allowedSlippagePercent;
    }

    let feeTier = this.feeTier;
    if (feeTier_input) {
      feeTier = feeTier_input;
    }
    let gasAdjustment = this.gasAdjustment;
    if (gasAdjustment_input) {
      gasAdjustment = gasAdjustment_input;
    }

    if (tradeType == 'BUY') {
      // change to SELL?
      //swap base and quotetokens
      const realBaseToken = quoteToken;
      quoteToken = baseToken;
      baseToken = realBaseToken;
    }

    logger.info(`Fetching pair data for ${quoteToken.symbol}-${baseToken.symbol}.`);

    const prices = await this.getCoinGeckPricesStored();
    if (this.isEmptyArray(Object.keys(prices))) {
      throw new Error(`Osmosis:   Failed to retrieve prices for tokens given.`);
    }

    let poolsContainer;
    try {
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    }
    const poolsDataAll: ExtendedPool[] = poolsContainer.pools;
    let pools: ExtendedPool[] = [];
    // make sure we actually have prices and tokens for the pool you're looking for
    if (poolAddress) {
      const verifyAssets = true;
      // @ts-expect-error: Case 1
      pools = getPoolByAddressAndFilter(this.tokenList, poolsDataAll, prices, poolAddress, verifyAssets);
    } else {
      switch (poolType.toLowerCase()) {
        case 'router':
          // @ts-expect-error: Case 1
          pools = filterPoolsStableSwap(this.tokenList, poolsDataAll, prices);
          break;
        case 'clmm':
          // @ts-expect-error: Case 1
          pools = filterPoolsCLMM(this.tokenList, poolsDataAll, prices);
          break;
        case 'amm':
          // @ts-expect-error: Case 1
          pools = filterPoolsGAMM(this.tokenList, poolsDataAll, prices);
          break;
        default:
          throw new Error(`Osmosis:   poolType was not provided. How did you get here?`);
      }
    }
    if (this.isEmptyArray(pools)) {
      throw new Error(`Osmosis:   Failed to retrieve pools for tokens and pooltype given.`);
    }

    let pairs: PrettyPair[] = [];
    if (!this.isEmptyArray(pools) && !this.isEmptyArray(Object.keys(prices))) {
      if (poolType.toLocaleLowerCase() == 'clmm') {
        pairs = CLMMMakePoolPairs(this.tokenList, pools);
      } else {
        // @ts-expect-error: Osmosis Case 2
        pairs = makePoolPairs(this.assetList, pools, prices);
      }
    }

    // eg. token=OSMO, token.base=uOSMO, so swap calcs are done in uosmo is
    const tokenInAmount = new BigNumber(amount).shiftedBy(baseToken.decimals).toString();

    const tokenInDollarValue = new BigNumber(amount || '0').multipliedBy(prices[baseToken.base]);

    const toTokenDollarPrice = prices[quoteToken.base];
    let toTokenAmount;
    if (toTokenDollarPrice) {
      toTokenAmount = tokenInDollarValue.div(toTokenDollarPrice);
    } else {
      // no price found for quote token - maybe should throw here but let's see if there's a pool route[] for it
      toTokenAmount = 0;
    }

    const tokenOutAmount = new BigNumber(toTokenAmount)
      .shiftedBy(quoteToken.decimals)
      // tokenOut defined by .base (eg. uION)
      .toString();

    let tokenOutAmountAfterSlippage;
    if (slippage_percent == 100 && network != 'testnet') {
      tokenOutAmountAfterSlippage = '1'; // just in case someone tries to scew themselves
    } else {
      tokenOutAmountAfterSlippage = calcAmountWithSlippage(tokenOutAmount, slippage_percent);
    }

    const tokenIn = {
      denom: baseToken.base,
      amount: tokenInAmount,
    };
    const tokenOut = {
      denom: quoteToken.base,
      amount: tokenOutAmountAfterSlippage,
    };
    const routes = getRoutesForTrade(this.assetList, {
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

    if (!routes || routes.length === 0 || routes.length > 2) {
      logger.info(
        `No trade routes found for ${quoteToken.symbol}-${baseToken.symbol} ${quoteToken.symbol}-${baseToken.symbol}`,
      );
      throw new Error(
        `No trade routes found for ${quoteToken.symbol}-${baseToken.symbol} ${quoteToken.symbol}-${baseToken.symbol}`,
      );
    }

    // so far we have pools, routes, and token info...
    let route_length_1_pool_swapFee = '';
    let priceImpact = '0';
    if (new BigNumber(tokenIn.amount).isEqualTo(0)) {
      priceImpact = '0';
    } else if (routes.length === 1) {
      const route_length_1_pool = pools.find((pool) => pool.id === routes[0].poolId)!; // take first route - these are sorted by liquidity already
      if (poolType.toLowerCase() != 'clmm') {
        priceImpact = calcPriceImpactGivenIn(tokenIn, tokenOut.denom, route_length_1_pool);
      }
      route_length_1_pool_swapFee = new BigNumber(route_length_1_pool.poolParams?.swapFee || 0).toString(); // .shiftedBy(-16) shift used in CCA
    } else {
      // THIS ASSUMES length == 2 - per CCA/osmosis guys..
      const tokenInRoute = routes.find((route) => route.tokenOutDenom !== tokenOut.denom)!;
      const tokenOutRoute = routes.find((route) => route.tokenOutDenom === tokenOut.denom)!;

      const tokenInPool = pools.find((pool) => pool.id === tokenInRoute.poolId)!;
      const tokenOutPool = pools.find((pool) => pool.id === tokenOutRoute.poolId)!;
      let priceImpactIn = '0';
      let priceImpactOut = '0';
      if (poolType.toLowerCase() != 'clmm') {
        priceImpactIn = calcPriceImpactGivenIn(tokenIn, tokenInRoute.tokenOutDenom, tokenInPool);
        priceImpactOut = calcPriceImpactGivenOut(tokenOut, tokenOutRoute.tokenOutDenom, tokenOutPool);
      }

      priceImpact = new BigNumber(priceImpactIn).plus(priceImpactOut).toString();
    }

    // routes.length=1 mean there's just 1 hop - we're always just given one potentially route[] for a trade route request
    let swapRoutes: OsmosisExpectedTradeRoute[] = [];

    if (routes.length === 1) {
      swapRoutes = routes.map((route) => {
        return {
          poolId: route.poolId.toString(),
          swapFee: route_length_1_pool_swapFee,
          baseLogo: baseToken.logoURIs,
          baseSymbol: baseToken.symbol,
          quoteLogo: quoteToken.logoURIs,
          quoteSymbol: quoteToken.symbol,
          tokenOutDenom: tokenOut.denom,
        };
      });
    } else {
      const swapFees: BigNumber[] = [];
      swapRoutes = routes
        .map((route) => {
          const pool = pools.find((pool) => pool.id === route.poolId);
          let baseAsset: CosmosAsset;
          let quoteAsset: CosmosAsset;
          if (route.tokenOutDenom !== tokenOut.denom) {
            baseAsset = baseToken;
            quoteAsset = this.getTokenByBase(route.tokenOutDenom)!;
          } else {
            const tokenInDenom = pool.poolAssets.find(({ token }) => token.denom !== tokenOut.denom).token.denom!;
            baseAsset = this.getTokenByBase(tokenInDenom)!;
            quoteAsset = quoteToken;
          }
          let fee = new BigNumber(0);
          if (pool.poolParams && pool.poolParams.swapFee) {
            fee = new BigNumber(pool.poolParams.swapFee);
          } // .shiftedBy(-16) shift used in CCA

          swapFees.push(fee);
          return {
            poolId: route.poolId.toString(),
            swapFee: fee,
            baseLogo: baseAsset.logoURIs,
            baseSymbol: baseAsset.symbol,
            quoteLogo: quoteAsset.logoURIs,
            quoteSymbol: quoteAsset.symbol,
            tokenOutDenom: route.tokenOutDenom,
          };
        })
        .map((route) => {
          const totalFee = swapFees.reduce((total, cur) => total.plus(cur), new BigNumber(0));
          const highestFee = swapFees.sort((a, b) => (a.lt(b) ? 1 : -1))[0];
          const feeRatio = highestFee.div(totalFee);
          return {
            ...route,
            swapFee: route.swapFee.multipliedBy(feeRatio).toString() + '%',
          };
        });
    }

    const expectedOutputAfterSlippage = tokenOutAmountAfterSlippage;

    // can't simulate here without address/signingclient
    const feeObject = FEES.osmosis.swapExactAmountIn(feeTier);
    const gasLimitEstimate = new BigNumber(feeObject.gas).multipliedBy(gasAdjustment);

    if (gasLimitEstimate.gt(new BigNumber(this.gasLimitEstimate))) {
      logger.error(
        `Osmosis:   Gas limit exceeded ${gasLimitEstimate.toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
      );
      throw new Error(
        `Osmosis:   Gas limit exceeded ${gasLimitEstimate.toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
      );
    }

    const expectedAmountNum = new BigNumber(expectedOutputAfterSlippage);
    const tokenInAmountNum = new BigNumber(amount).shiftedBy(baseToken.decimals);
    const executionPrice = expectedAmountNum.div(tokenInAmountNum);

    logger.info(
      `Best trade for ${quoteToken.address}-${baseToken.address}: ${ToLog_OsmosisExpectedTrade({
        gasUsed: '',
        gasWanted: '',
        routes: swapRoutes,
        tokenOutAmount: tokenOutAmount,
        tokenOutAmountAfterSlippage: expectedOutputAfterSlippage,
        executionPrice: executionPrice,
        gasLimitEstimate: new BigNumber(gasLimitEstimate),
        tokenInDenom: tokenIn.denom,
        tokenInAmount: tokenInAmount,
        tokenInAmountAfterSlippage: tokenInAmount, // this shouldn't change (unless we like, super hammer every pool I guess), not sure what uniswap guys are doing with it
        tokenOutDenom: tokenOut.denom,
        priceImpact: Number(priceImpact),
      })}`,
    );

    return {
      gasUsed: '',
      gasWanted: '',
      routes: swapRoutes,
      tokenOutAmount: tokenOutAmount,
      tokenOutAmountAfterSlippage: expectedOutputAfterSlippage,
      executionPrice: executionPrice,
      gasLimitEstimate: new BigNumber(gasLimitEstimate),
      tokenInDenom: tokenIn.denom,
      tokenInAmount: tokenInAmount,
      tokenInAmountAfterSlippage: tokenInAmount, // this shouldn't change (unless we like, super hammer every pool I guess), not sure what uniswap guys are doing with it
      tokenOutDenom: tokenOut.denom,
      priceImpact: Number(priceImpact),
    }; // == OsmosisExpectedTrade
  }

  /**
   * Given a wallet and a Cosmosish trade, try to execute it on blockchain.
   *
   * @param network testnet/mainnet
   * @param wallet CosmosWallet
   * @param trade Expected trade
   * @param req ExecuteSwapRequestType
   * @param trade Osmosis TradeInfo type
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
   */
  async executeTrade(
    network: string,
    wallet: CosmosWallet,
    req: ExecuteSwapRequestType,
    trade: TradeInfo,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<TransactionResponse> {
    let slippage_percent = 0;
    if (req.slippagePct) {
      slippage_percent = req.slippagePct;
    } else {
      slippage_percent = this.getAllowedSlippage(this.allowedSlippage);
    }
    let feeTier = this.feeTier;
    if (feeTier_input) {
      feeTier = feeTier_input;
    }
    let gasAdjustment = this.gasAdjustment;
    if (gasAdjustment_input) {
      gasAdjustment = gasAdjustment_input;
    }

    const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
    this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

    const routes = trade.expectedTrade.routes;

    let tokenOutMinAmount;
    if (slippage_percent == 100 || network == 'testnet') {
      tokenOutMinAmount = 1;
    } else {
      tokenOutMinAmount = this.noDecimals(
        (Number(trade.expectedTrade.tokenOutAmount) * (100 - slippage_percent)) / 100,
      );
    }

    const msg = swapExactAmountIn({
      sender: req.walletAddress,
      // @ts-expect-error: bad osmojs models
      routes: routes,
      tokenIn: coin(trade.expectedTrade.tokenInAmount, trade.expectedTrade.tokenInDenom),
      tokenOutMinAmount: tokenOutMinAmount.toString(),
    });

    const enumFee = FEES.osmosis.swapExactAmountIn(feeTier);
    let gasToUse = enumFee.gas;
    try {
      const gasEstimation = await this.signingClient.simulate(req.walletAddress, [msg]);
      gasToUse = gasEstimation;
    } catch (error1) {
      const error = error1 as Error;
      if (error.message.includes('token is lesser than min amount')) {
        logger.error(
          `Osmosis:   Amount less than min amount error. tokenOutMinAmount: ${tokenOutMinAmount.toString()}.`,
        );
        throw new Error(
          `Osmosis:   Amount less than min amount error. tokenOutMinAmount: ${tokenOutMinAmount.toString()}.`,
        );
      } else {
        logger.error(`Osmosis:   Simulate failed.`);
        logger.error(error);
        throw error;
      }
    }

    const gasPrice = await this.getLatestBasePrice();
    const calcedFee = calculateFee(
      Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
      GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
    );

    if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
      logger.error(
        `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
      );
      throw new Error(
        `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
      );
    }

    try {
      const res: TransactionResponse = await this.signingClient.signAndBroadcast(req.walletAddress, [msg], calcedFee);
      res.gasPrice = gasPrice;
      res.gasWanted = new BigNumber(calcedFee.gas).toString();
      res.gasUsed = new BigNumber(calcedFee.gas).toString();
      res.feeAmount = calcedFee.amount[0]['amount'];

      return res;
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }

    logger.error('Osmosis:   Trade execution failed, reason unknown.');
    throw new Error('Osmosis:   Trade execution failed, reason unknown.');
  }

  /**
   * Given a 2 token symbols and 1-2 amounts, exchange amounts for pool liquidity shares
   *
   * @param wallet CosmosWallet
   * @param req AMM - AddLiquidityRequestType
   * @param feeTier_input? low/medium/high, overwrites feeTier specified in .yml
   * @param gasAdjustment_input? Gas offered multiplier, overwrites gasAdjustment specified in .yml
   */
  async addLiquidityAMM(
    wallet: CosmosWallet,
    req: AMMAddLiquidityRequestType, // (poolAddress and baseTokenAmount and quoteTokenAmount) OR (baseToken and quoteToken and baseTokenAmount and quoteTokenAmount)
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<[AddPositionTransactionResponse, AMMAddLiquidityResponseType]> {
    if (!req.poolAddress) {
      throw new Error('Osmosis:   addLiquidityAMM Request is missing required fields.');
    }
    if (!req.baseTokenAmount && !req.quoteTokenAmount) {
      throw new Error('Osmosis:   addLiquidityAMM Request is missing required fields.');
    }

    const poolAddress = req.poolAddress;
    let baseToken: CosmosAsset;
    let quoteToken: CosmosAsset;
    const amount0 = req.baseTokenAmount ? req.baseTokenAmount : 0;
    const amount1 = req.quoteTokenAmount ? req.quoteTokenAmount : 0;

    let signature: string = '';
    let fee: number = 0;

    const slippage_percent = req.slippagePct ? req.slippagePct : this.getAllowedSlippage(this.allowedSlippage);
    let feeTier = this.feeTier;
    if (feeTier_input) {
      feeTier = feeTier_input;
    }
    let gasAdjustment = this.gasAdjustment;
    if (gasAdjustment_input) {
      gasAdjustment = gasAdjustment_input;
    }

    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      if (!this.signingClient || !req.walletAddress) {
        logger.error(
          "Osmosis:   addPositionAMM failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
        throw new Error(
          "Osmosis:   addPositionAMM failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
      }

      const prices = {}; //await this.getCoinGeckPricesStored();
      const poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      const poolsDataAll: ExtendedPool[] = poolsContainer.pools;
      let pools: ExtendedPool[] = [];
      const verifyAssets = false;
      if (poolAddress) {
        // @ts-expect-error: Case 1
        pools = getPoolByAddressAndFilter(this.tokenList, poolsDataAll, prices, poolAddress, verifyAssets);
      } else {
        // @ts-expect-error: Case 1
        pools = filterPoolsGAMM(this.tokenList, poolsDataAll, prices, verifyAssets);
      }

      if (this.isEmptyArray(pools)) {
        logger.error(`Osmosis:   addPositionAMM Failed to retrieve pools for tokens and/or ID given.`);
        throw new Error(`Osmosis:   addPositionAMM Failed to retrieve pools for tokens and/or ID given.`);
      }

      let amount0_bignumber = new BigNumber(0);
      let amount1_bignumber = new BigNumber(0);
      if (amount0) {
        amount0_bignumber = new BigNumber(amount0);
      }
      if (amount1) {
        amount1_bignumber = new BigNumber(amount1);
      }
      if (amount0_bignumber.isEqualTo(0) && amount1_bignumber.isEqualTo(0)) {
        logger.error('Osmosis:   addPositionAMM failed: Both token amounts equal to 0.');
        throw new Error('Osmosis:   addPositionAMM failed: Both token amounts equal to 0.');
      }

      let singleToken_UseWhich: string | null = null;
      if (!amount0_bignumber.isEqualTo(0) && amount1_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '0';
      }
      if (amount0_bignumber.isEqualTo(0) && !amount1_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '1';
      }
      // NOT CHECKING (local wallet) BALANCES HERE it will bounce back either way

      // now find the poolAddress for this pair
      // const foundPools: any[] = [];
      // not using filter here for price/etc
      const pool: ExtendedPool = pools.find(({ address }) => address == poolAddress);
      if (!baseToken || !quoteToken) {
        if (pool.poolAssets) {
          if (!baseToken) {
            baseToken = this.getTokenByBase(pool.poolAssets[0].token.denom)!;
          }
          if (!quoteToken) {
            quoteToken = this.getTokenByBase(pool.poolAssets[1].token.denom)!;
          }
        } else {
          if (!baseToken) {
            baseToken = this.getTokenByBase(pool.token0)!;
          }
          if (!quoteToken) {
            quoteToken = this.getTokenByBase(pool.token1)!;
          }
        }
      }

      let calcedFee;
      if (pool) {
        const gasPrice = await this.getLatestBasePrice();
        const msgs = [];
        if (singleToken_UseWhich) {
          // in case 1 of the amounts == 0
          let singleToken_amount = new BigNumber(0);
          let singleToken: CosmosAsset | undefined = undefined;
          if (singleToken_UseWhich == '0') {
            singleToken_amount = amount0_bignumber;
            singleToken = baseToken;
          } else {
            singleToken_amount = amount1_bignumber;
            singleToken = quoteToken;
          }
          const inputCoin = {
            denom: singleToken.base,
            amount: singleToken_amount.shiftedBy(this.getExponentByBase(singleToken.base)).toString(),
          };

          const coinSymbol = singleToken.symbol;
          const inputValue = this.baseUnitsToDollarValue(prices, coinSymbol, singleToken_amount.toNumber());
          // @ts-expect-error: Osmosis Case 2 - CosmosAsset.typeAsset
          const coinsNeeded = convertDollarValueToCoins(this.assetList, inputValue, pool, prices);
          // @ts-expect-error: Osmosis Case 3
          const shareOutAmount = calcShareOutAmount(pool, coinsNeeded);

          let finalShareOutAmount;
          if (slippage_percent == 100) {
            finalShareOutAmount = new BigNumber(1).integerValue(BigNumber.ROUND_CEIL);
          } else {
            finalShareOutAmount = new BigNumber(calcAmountWithSlippage(shareOutAmount, slippage_percent)).integerValue(
              BigNumber.ROUND_CEIL,
            );
          }

          const joinSwapExternAmountInMsg = joinSwapExternAmountIn({
            //@ts-expect-error: bad osmojs models
            poolId: pool.id.toString(),
            sender: req.walletAddress,
            tokenIn: inputCoin,
            shareOutMinAmount: this.noDecimals(finalShareOutAmount.toString()),
          });
          msgs.push(joinSwapExternAmountInMsg);

          const enumFee = FEES.osmosis.joinSwapExternAmountIn(feeTier);
          let gasToUse = enumFee.gas;
          try {
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('token is lesser than min amount')) {
              logger.error(
                `Osmosis:   Amount less than min amount error. tokenOutMinAmount: ${finalShareOutAmount.toString()}.`,
              );
              throw new Error(
                `Osmosis:   Amount less than min amount error. tokenOutMinAmount: ${finalShareOutAmount.toString()}.`,
              );
            } else {
              logger.error(`Osmosis:   Simulate failed.`);
              logger.error(error);
              throw error;
            }
          }
          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        } else {
          const allCoins = [];
          allCoins.push({
            denom: baseToken.base,
            amount: new BigNumber(amount0).shiftedBy(this.getExponentByBase(baseToken.base)).toString(),
          });
          allCoins.push({
            denom: quoteToken.base,
            amount: new BigNumber(amount1).shiftedBy(this.getExponentByBase(quoteToken.base)).toString(),
          });

          // alphabetize the coins going in or else invalid coins error
          if (!(baseToken.base.toLowerCase() < quoteToken.base.toLowerCase())) {
            allCoins.reverse();
          }

          // @ts-expect-error: Osmosis Case 3
          const shareOutAmount = calcShareOutAmount(pool, allCoins);
          const tokenInMaxs = allCoins.map((c: Coin) => {
            return coin(c.amount, c.denom);
          });

          let finalShareOutAmount;
          if (slippage_percent == 100) {
            finalShareOutAmount = new BigNumber(1).integerValue(BigNumber.ROUND_CEIL);
          } else {
            finalShareOutAmount = new BigNumber(calcAmountWithSlippage(shareOutAmount, slippage_percent)).integerValue(
              BigNumber.ROUND_CEIL,
            );
          }

          const joinPoolMsg = joinPool({
            //@ts-expect-error: bad osmojs models
            poolId: pool.id.toString(),
            sender: req.walletAddress,
            shareOutAmount: this.noDecimals(finalShareOutAmount.toString()),
            tokenInMaxs,
          });
          msgs.push(joinPoolMsg);

          const enumFee = FEES.osmosis.joinPool(feeTier);
          let gasToUse = enumFee.gas;
          try {
            // we only get gas back from simulating our tx... but Eth seems to be able to produce full quotes for pool joins
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('token is lesser than min amount')) {
              logger.error(
                `Osmosis:   Amount less than min amount error. shareOutAmount: ${finalShareOutAmount.toString()}.`,
              );
              throw new Error(
                `Osmosis:   Amount less than min amount error. shareOutAmount: ${finalShareOutAmount.toString()}.`,
              );
            } else {
              logger.error(`Osmosis:   Simulate failed.`);
              logger.error(error);
              throw error;
            }
          }

          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        }

        if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
          logger.error(
            `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
          );
          throw new Error(
            `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
          );
        }

        const signingResponse: AddPositionTransactionResponse = await this.signingClient.signAndBroadcast(
          req.walletAddress,
          msgs,
          calcedFee,
        );
        this.signingClient.disconnect();

        if (signingResponse?.code !== successfulTransaction) {
          signature = signingResponse.transactionHash;
          fee = signingResponse.feeAmount ? Number(signingResponse.feeAmount) : 0;
          const ammResponseF = {
            signature,
            status: signingResponse.code, // failed tx
            data: {
              fee,
              baseTokenAmountAdded: 0,
              quoteTokenAmountAdded: 0,
            },
          };

          return [signingResponse, ammResponseF];
        }

        let tokenBalanceChanges: Record<string, number> = {};
        {
          const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
            Record<string, number>,
            Record<string, number>,
            string,
          ];
          tokenBalanceChanges = dissectRes[1];
        }

        fee = signingResponse.feeAmount ? Number(signingResponse.feeAmount) : 0;
        const baseTokenAmountAdded = tokenBalanceChanges[baseToken.symbol]
          ? tokenBalanceChanges[baseToken.symbol] * -1
          : tokenBalanceChanges[baseToken.base]
            ? tokenBalanceChanges[baseToken.base] * -1
            : 0;
        const quoteTokenAmountAdded = tokenBalanceChanges[quoteToken.symbol]
          ? tokenBalanceChanges[quoteToken.symbol] * -1
          : tokenBalanceChanges[quoteToken.base]
            ? tokenBalanceChanges[quoteToken.base] * -1
            : 0;
        signature = signingResponse.transactionHash;
        const ammResponse: AMMAddLiquidityResponseType = {
          data: {
            fee,
            baseTokenAmountAdded: baseTokenAmountAdded,
            quoteTokenAmountAdded: quoteTokenAmountAdded,
          },
          signature: signature,
          status: signingResponse.code,
        };

        return [signingResponse, ammResponse];
      } else {
        throw new Error(`No AMM pool found for pair ${baseToken.base}-${quoteToken.base}`);
      }
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    logger.error('Osmosis:   Add position failed, reason unknown.');
  }

  /**
   * Requires positionId, so needs to be called after OpenPositionCLMM
   *
   * @param wallet CosmosWallet
   * @param req CLMM - AddLiquidityRequestType
   */
  async AddLiquidityCLMM(
    wallet: CosmosWallet,
    req: CLMMAddLiquidityRequestType,
  ): Promise<[AddPositionTransactionResponse, CLMMAddLiquidityResponseType]> {
    let addLiquidityResponse: CLMMAddLiquidityResponseType = {
      data: {
        fee: 0,
        baseTokenAmountAdded: 0,
        quoteTokenAmountAdded: 0,
      },
      signature: '',
      status: 1,
    };

    let final_poolId;
    if (req.positionAddress) {
      try {
        const allCLPositionsContainer = await this._provider.osmosis.concentratedliquidity.v1beta1.positionById({
          address: req.walletAddress, // endpoint is broken, seems to require positionAddress
          positionId: req.positionAddress,
        });
        if (allCLPositionsContainer.position.position.address == req.walletAddress) {
          // verify this is our position
          final_poolId = allCLPositionsContainer.position.position.poolId;
        }
      } catch (error) {
        console.debug(error);
      }
    }

    let poolsContainer;
    try {
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    }
    const pools: AnyPoolType[] = poolsContainer.pools;
    const prices = {}; //await this.getCoinGeckPricesStored();

    let filteredPools: ExtendedPool[] = [];
    if (final_poolId) {
      //@ts-expect-error: Osmosis Case 1
      filteredPools = getPoolByIdAndFilter(this.tokenList, pools, prices, final_poolId, false);
    } else {
      throw new Error('Osmosis:   AddLiquidtyCLMM failed, position not found.');
    }
    const pool: ExtendedPool = filteredPools[0];

    // these two may end up swapped depending on which pool gets selected
    let baseToken: CosmosAsset = this.getTokenByBase(pool.token0)!;
    let quoteToken: CosmosAsset = this.getTokenByBase(pool.token1)!;

    const gasAdjustment = this.gasAdjustment;
    const feeTier = this.feeTier;

    // in case we need to swap these later
    let baseTokenAmount = req.baseTokenAmount;
    let quoteTokenAmount = req.quoteTokenAmount;

    // set slippage for this to 100 because the pools are too unbalanced
    let slippage = 100;
    if (req.slippagePct) {
      slippage = req.slippagePct;
    } else {
      slippage = this.getAllowedSlippage(this.allowedSlippage);
    }

    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      if (!this.signingClient || !req.walletAddress) {
        logger.error(
          "Osmosis:   AddLiquidityCLMM failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
        throw new Error(
          "Osmosis:   AddLiquidityCLMM failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
      }

      if (!baseTokenAmount && !quoteTokenAmount) {
        logger.error('Osmosis:   AddLiquidityCLMM failed: Both token amounts equal to 0.');
        throw new Error('Osmosis:   AddLiquidityCLMM failed: Both token amounts equal to 0.');
      }

      let baseTokenAmount_bignumber = new BigNumber(0);
      let quoteTokenAmount_bignumber = new BigNumber(0);
      if (baseTokenAmount) {
        baseTokenAmount_bignumber = new BigNumber(baseTokenAmount);
      }
      if (quoteTokenAmount) {
        quoteTokenAmount_bignumber = new BigNumber(quoteTokenAmount);
      }
      if (baseTokenAmount_bignumber.isEqualTo(0) && quoteTokenAmount_bignumber.isEqualTo(0)) {
        logger.error('Osmosis:   AddLiquidityCLMM failed: Both token amounts equal to 0.');
        throw new Error('Osmosis:   AddLiquidityCLMM failed: Both token amounts equal to 0.');
      }

      // Osmo is weird, we can send in only one type of token to the CL pool, so we need to know which if it's a single token
      let singleToken_UseWhich: string | null = null;
      if (!baseTokenAmount_bignumber.isEqualTo(0) && quoteTokenAmount_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '0';
      }
      if (baseTokenAmount_bignumber.isEqualTo(0) && !quoteTokenAmount_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '1';
      }
      // NOT CHECKING (local wallet) BALANCES HERE it will bounce back either way

      let calcedFee;
      if (pool) {
        // swap token orders to match pool asset orders
        if (pool.token0 == baseToken.base && pool.token1 == quoteToken.base) {
          [baseToken, quoteToken] = [quoteToken, baseToken];
          [baseTokenAmount, quoteTokenAmount] = [quoteTokenAmount, baseTokenAmount];
          [baseTokenAmount_bignumber, quoteTokenAmount_bignumber] = [
            quoteTokenAmount_bignumber,
            baseTokenAmount_bignumber,
          ];
          if (singleToken_UseWhich) {
            if (singleToken_UseWhich == '0') {
              singleToken_UseWhich = '1';
            } else {
              singleToken_UseWhich = '0';
            }
          }
        }

        const gasPrice = await this.getLatestBasePrice();
        const msgs = [];
        if (singleToken_UseWhich) {
          // in case 1 of the token in amounts == 0, we need to change our Msg up
          let singleToken_amount = new BigNumber(0);
          let singleToken: CosmosAsset | undefined = undefined;
          if (singleToken_UseWhich == '0') {
            singleToken_amount = baseTokenAmount_bignumber;
            singleToken = baseToken;
          } else {
            singleToken_amount = quoteTokenAmount_bignumber;
            singleToken = quoteToken;
          }

          let singleTokenMinAmount;
          if (slippage == 100) {
            singleTokenMinAmount = '0';
          } else {
            singleTokenMinAmount = singleToken_amount
              .shiftedBy(this.getExponentByBase(singleToken.base))
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
          }

          let MsgAddToPosition;
          if (singleToken.base == pool.token0) {
            MsgAddToPosition = addToPosition({
              positionId: BigInt(req.positionAddress),
              sender: req.walletAddress,
              amount0: singleToken_amount.toString(),
              amount1: '0',
              tokenMinAmount0: singleTokenMinAmount.toString(),
              tokenMinAmount1: '0',
            });
          } else {
            MsgAddToPosition = addToPosition({
              positionId: BigInt(req.positionAddress),
              sender: req.walletAddress,
              amount0: '0',
              amount1: singleToken_amount.toString(),
              tokenMinAmount0: '0',
              tokenMinAmount1: singleTokenMinAmount.toString(),
            });
          }

          msgs.push(MsgAddToPosition);

          const enumFee = FEES.osmosis.joinPool(feeTier);
          let gasToUse = enumFee.gas;
          try {
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('token is lesser than min amount')) {
              logger.error(
                `Osmosis:   AddLiquidityCLMM simulation failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.`,
              );
            }
          }
          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        } else {
          const baseToken_bignumber = new BigNumber(baseTokenAmount).shiftedBy(this.getExponentByBase(baseToken.base));
          const quoteToken_bignumber = new BigNumber(quoteTokenAmount).shiftedBy(
            this.getExponentByBase(quoteToken.base),
          );

          let tokenMinAmount0;
          let tokenMinAmount1;
          if (slippage == 100) {
            tokenMinAmount0 = '0';
            tokenMinAmount1 = '0';
          } else {
            tokenMinAmount0 = baseToken_bignumber
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
            tokenMinAmount1 = quoteToken_bignumber
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
          }

          let baseTokenAmount_final = baseToken_bignumber.toString();
          let quoteTokenAmount_final = quoteToken_bignumber.toString();
          let tokenMinAmount0_final = tokenMinAmount0.toString();
          let tokenMinAmount1_final = tokenMinAmount1.toString();

          // alphabetize the coins going in or else invalid coins error (ask me how long it took to debug this completely undocumented issue)
          if (!(baseToken.base.toLowerCase() < quoteToken.base.toLowerCase())) {
            tokenMinAmount0_final = tokenMinAmount1.toString();
            tokenMinAmount1_final = tokenMinAmount0.toString();
            baseTokenAmount_final = quoteToken_bignumber.toString();
            quoteTokenAmount_final = baseToken_bignumber.toString();
          }

          const msgAddToPosition = addToPosition({
            positionId: BigInt(req.positionAddress),
            sender: req.walletAddress,
            amount0: baseTokenAmount_final,
            amount1: quoteTokenAmount_final,
            tokenMinAmount0: tokenMinAmount0_final,
            tokenMinAmount1: tokenMinAmount1_final,
          });

          msgs.push(msgAddToPosition);

          const enumFee = FEES.osmosis.joinPool(feeTier);
          let gasToUse = enumFee.gas;
          try {
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('slippage bound')) {
              logger.error(
                `Osmosis:   AddLiquidityCLMM failed: Outside of slippage bounds: insufficient amount of token created. ` +
                  baseToken.symbol +
                  `: ` +
                  baseTokenAmount_final +
                  ` ` +
                  quoteToken.symbol +
                  `: ` +
                  quoteTokenAmount_final,
              );
            }
            throw error;
          }

          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        }

        if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
          logger.error(
            `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
          );
        }

        const signingResponse: AddPositionTransactionResponse = await this.signingClient.signAndBroadcast(
          req.walletAddress,
          msgs,
          calcedFee,
        );
        this.signingClient.disconnect();
        let new_position_id = req.positionAddress;

        if (signingResponse?.code !== successfulTransaction) {
          addLiquidityResponse = {
            data: {
              fee: Number(signingResponse.feeAmount),
              baseTokenAmountAdded: 0,
              quoteTokenAmountAdded: 0,
            },
            signature: signingResponse.transactionHash,
            status: signingResponse.code,
          };
          return [signingResponse, addLiquidityResponse];
        }

        let tokenBalanceChanges: Record<string, number> = {};
        {
          const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
            Record<string, number>,
            Record<string, number>,
            string,
          ];
          tokenBalanceChanges = dissectRes[1];
          new_position_id = dissectRes[2];
        }

        const baseTokenAmountAdded = tokenBalanceChanges[baseToken.symbol]
          ? tokenBalanceChanges[baseToken.symbol] * -1
          : tokenBalanceChanges[baseToken.base]
            ? tokenBalanceChanges[baseToken.base] * -1
            : 0;
        const quoteTokenAmountAdded = tokenBalanceChanges[quoteToken.symbol]
          ? tokenBalanceChanges[quoteToken.symbol] * -1
          : tokenBalanceChanges[quoteToken.base]
            ? tokenBalanceChanges[quoteToken.base] * -1
            : 0;
        addLiquidityResponse = {
          data: {
            fee: Number(signingResponse.feeAmount),
            baseTokenAmountAdded: baseTokenAmountAdded,
            quoteTokenAmountAdded: quoteTokenAmountAdded,
            newPositionAddress: new_position_id,
          },
          signature: signingResponse.transactionHash,
          status: signingResponse.code,
        };

        return [signingResponse, addLiquidityResponse];
      }
    } catch (error) {
      console.debug(error);
      logger.error('Osmosis:   AddLiquidityCLMM failed, reason unknown.');
      throw error;
    } finally {
      this.signingClient.disconnect();
    }
    logger.error('Osmosis:   AddLiquidityCLMM failed, reason unknown.');
    throw new Error('Osmosis:   AddLiquidityCLMM, reason unknown.');
  }

  /**
   * Requires poolAddress, so called after fetchPools()
   *
   * @param wallet CosmosWallet
   * @param req CLMM - OpenPositionRequestType
   */
  async OpenPositionCLMM(
    wallet: CosmosWallet,
    req: CLMMOpenPositionRequestType,
  ): Promise<[AddPositionTransactionResponse, CLMMOpenPositionResponseType]> {
    let openPositionResponse: CLMMOpenPositionResponseType = {
      signature: '',
      status: 1,
      data: { fee: 0, baseTokenAmountAdded: 0, quoteTokenAmountAdded: 0, positionAddress: '', positionRent: 0 },
    };
    const gasAdjustment = this.gasAdjustment;
    const feeTier = this.feeTier;

    // set slippage for this to 100 because the pools are too unbalanced
    let slippage = 100;
    if (req.slippagePct) {
      slippage = req.slippagePct;
    } else {
      slippage = this.getAllowedSlippage(this.allowedSlippage);
    }

    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      if (!this.signingClient || !req.walletAddress) {
        logger.error(
          "Osmosis:   OpenPoolPosition failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
        throw new Error(
          "Osmosis:   OpenPoolPosition failed: Can't instantiate signing client. StargateClient undefined or address undefined.",
        );
      }
      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }
      const pools: AnyPoolType[] = poolsContainer.pools;
      const prices = await this.getCoinGeckPricesStored();

      //@ts-expect-error: Osmosis Case 1
      const pool = getPoolByAddressAndFilter(this.tokenList, pools, prices, req.poolAddress, false)[0];
      // in case we need to swap these later
      // these two may end up swapped depending on which pool gets selected (tokens must be added in correct order via rpc)
      const baseToken: CosmosAsset = this.getTokenByBase(pool.token0)!;
      const quoteToken: CosmosAsset = this.getTokenByBase(pool.token1)!;
      const baseTokenAmount = req.baseTokenAmount;
      const quoteTokenAmount = req.quoteTokenAmount;

      if (!baseTokenAmount && !quoteTokenAmount) {
        logger.error('Osmosis:   OpenPoolPosition failed: Both token amounts equal to 0.');
        throw new Error('Osmosis:   OpenPoolPosition failed: Both token amounts equal to 0.');
      }

      let baseTokenAmount_bignumber = new BigNumber(0);
      let quoteTokenAmount_bignumber = new BigNumber(0);
      if (baseTokenAmount) {
        baseTokenAmount_bignumber = new BigNumber(baseTokenAmount);
      }
      if (quoteTokenAmount) {
        quoteTokenAmount_bignumber = new BigNumber(quoteTokenAmount);
      }
      if (baseTokenAmount_bignumber.isEqualTo(0) && quoteTokenAmount_bignumber.isEqualTo(0)) {
        logger.error('Osmosis:   OpenPoolPosition failed: Both token amounts equal to 0.');
        throw new Error('Osmosis:   OpenPoolPosition failed: Both token amounts equal to 0.');
      }

      // Osmo is weird, we can send in only one type of token to the CL pool, so we need to know which if it's a single token
      let singleToken_UseWhich: string | null = null;
      if (!baseTokenAmount_bignumber.isEqualTo(0) && quoteTokenAmount_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '0';
      }
      if (baseTokenAmount_bignumber.isEqualTo(0) && !quoteTokenAmount_bignumber.isEqualTo(0)) {
        singleToken_UseWhich = '1';
      }
      // NOT CHECKING (local wallet) BALANCES HERE it will bounce back either way

      let calcedFee;
      let singleTokenMinAmount = new BigNumber(0);
      if (pool) {
        const gasPrice = await this.getLatestBasePrice();
        const msgs = [];
        if (singleToken_UseWhich) {
          // in case 1 of the amounts == 0
          let singleToken_amount = new BigNumber(0);
          let singleToken: CosmosAsset | undefined = undefined;
          if (singleToken_UseWhich == '0') {
            singleToken_amount = baseTokenAmount_bignumber;
            singleToken = baseToken;
          } else {
            singleToken_amount = quoteTokenAmount_bignumber;
            singleToken = quoteToken;
          }
          const inputCoin = {
            denom: singleToken.base,
            amount: singleToken_amount.shiftedBy(this.getExponentByBase(singleToken.base)).toString(),
          };

          if (slippage != 100) {
            singleTokenMinAmount = singleToken_amount
              .shiftedBy(this.getExponentByBase(singleToken.base))
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
          }

          const lowerTick = calculatePriceToTick(
            req.lowerPrice.toString(),
            Number(pool.exponentAtPriceOne.toString()),
            Number(pool.tickSpacing.toString()),
            true,
          );
          const upperTick = calculatePriceToTick(
            req.upperPrice.toString(),
            Number(pool.exponentAtPriceOne.toString()),
            Number(pool.tickSpacing.toString()),
            false,
          );

          let MsgCreatePosition;
          if (singleToken.base == pool.token0) {
            MsgCreatePosition = createPosition({
              // @ts-expect-error: bad osmojs models
              poolId: pool.id.toString(),
              sender: req.walletAddress,
              // @ts-expect-error: bad osmojs models
              lowerTick: lowerTick,
              // @ts-expect-error: bad osmojs models
              upperTick: upperTick,
              tokensProvided: [inputCoin],
              tokenMinAmount0: singleTokenMinAmount.toString(),
              tokenMinAmount1: '0',
            });
          } else {
            MsgCreatePosition = createPosition({
              // @ts-expect-error: bad osmojs models
              poolId: pool.id.toString(),
              sender: req.walletAddress,
              // @ts-expect-error: bad osmojs models
              lowerTick: lowerTick,
              // @ts-expect-error: bad osmojs models
              upperTick: upperTick,
              tokensProvided: [inputCoin],
              tokenMinAmount0: '0',
              tokenMinAmount1: singleTokenMinAmount.toString(),
            });
          }

          msgs.push(MsgCreatePosition);

          const enumFee = FEES.osmosis.joinPool(feeTier);
          let gasToUse = enumFee.gas;
          try {
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('token is lesser than min amount')) {
              logger.error(
                `Osmosis:   OpenPoolPosition simulation failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.`,
              );
              throw new Error(
                `Osmosis:   OpenPoolPosition simulation failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.`,
              );
            } else if (error.message.includes('Not providing enough liquidity in token')) {
              logger.error(
                `Osmosis:   OpenPoolPosition simulation failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.`,
              );
              throw new Error(
                `Osmosis:   OpenPoolPosition simulation failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.`,
              );
            } else {
              logger.error(`Osmosis:   Simulate failed.`);
              logger.error(error);
              throw error;
            }
          }
          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        } else {
          const allCoins = [];
          allCoins.push({
            denom: baseToken.base,
            amount: new BigNumber(baseTokenAmount).shiftedBy(this.getExponentByBase(baseToken.base)).toString(),
          });
          allCoins.push({
            denom: quoteToken.base,
            amount: new BigNumber(quoteTokenAmount).shiftedBy(this.getExponentByBase(quoteToken.base)).toString(),
          });

          const baseToken_bignumber = new BigNumber(baseTokenAmount);
          const quoteToken_bignumber = new BigNumber(quoteTokenAmount);

          let tokenMinAmount0;
          let tokenMinAmount1;
          if (slippage == 100) {
            tokenMinAmount0 = '0';
            tokenMinAmount1 = '0';
          } else {
            tokenMinAmount0 = baseToken_bignumber
              .shiftedBy(this.getExponentByBase(baseToken.base))
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
            tokenMinAmount1 = quoteToken_bignumber
              .shiftedBy(this.getExponentByBase(quoteToken.base))
              .multipliedBy(100 - slippage)
              .dividedBy(100)
              .integerValue(BigNumber.ROUND_CEIL);
          }

          const lowerTick = findTickForPrice(
            req.lowerPrice.toString(),
            Number(pool.exponentAtPriceOne.toString()),
            Number(pool.tickSpacing.toString()),
            true,
          ); // pool.currentTick,
          const upperTick = findTickForPrice(
            req.upperPrice.toString(),
            Number(pool.exponentAtPriceOne.toString()),
            Number(pool.tickSpacing.toString()),
            false,
          );

          const tokenMinAmount0_final = tokenMinAmount0.toString();
          const tokenMinAmount1_final = tokenMinAmount1.toString();

          // alphabetize the coins going in or else invalid coins error (ask me how long it took to debug this completely undocumented issue)
          if (!(baseToken.base.toLowerCase() < quoteToken.base.toLowerCase())) {
            allCoins.reverse();
          }

          const MsgCreatePosition = createPosition({
            // @ts-expect-error: bad osmojs models
            poolId: pool.id.toString(),
            sender: req.walletAddress,
            // @ts-expect-error: bad osmojs models
            lowerTick: lowerTick,
            // @ts-expect-error: bad osmojs models
            upperTick: upperTick,
            tokensProvided: allCoins,
            tokenMinAmount0: tokenMinAmount0_final,
            tokenMinAmount1: tokenMinAmount1_final,
          });

          msgs.push(MsgCreatePosition);

          const enumFee = FEES.osmosis.joinPool(feeTier);
          let gasToUse = enumFee.gas;
          try {
            const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
            gasToUse = gasEstimation;
          } catch (error1) {
            const error = error1 as Error;
            if (error.message.includes('token is lesser than min amount')) {
              logger.error(
                `Osmosis:   OpenPoolPosition simulation failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.` +
                  error.message,
              );
              throw new Error(
                `Osmosis:   OpenPoolPosition simulation failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.` +
                  error.message,
              );
            } else if (error.message.includes('Not providing enough liquidity in token')) {
              logger.error(
                `Osmosis:   OpenPoolPosition simulation failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.` +
                  error.message,
              );
              throw new Error(
                `Osmosis:   OpenPoolPosition simulation failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.` +
                  error.message,
              );
            } else if (error.message.includes('slippage bound: insufficient amount of token ')) {
              logger.error(
                `Osmosis:   OpenPoolPosition simulation failed. Insufficient amount of token provided.` + error.message,
              );
              throw new Error(
                `Osmosis:   OpenPoolPosition simulation failed. Insufficient amount of token provided.` + error.message,
              );
            } else {
              logger.error(`Osmosis:   Simulate failed.`);
              logger.error(error);
              throw error;
            }
          }

          calcedFee = calculateFee(
            Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
            GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
          );
        }

        if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
          logger.error(
            `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
          );
        }

        let signingResponse: AddPositionTransactionResponse;
        try {
          signingResponse = await this.signingClient.signAndBroadcast(req.walletAddress, msgs, calcedFee);
          this.signingClient.disconnect();
        } catch (error1) {
          const error = error1 as Error;
          if (error.message.includes('token is lesser than min amount')) {
            logger.error(
              `Osmosis:   OpenPoolPosition failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.`,
            );
            throw new Error(
              `Osmosis:   OpenPoolPosition failed. Amount less than min amount error. tokenMinAmount0: ${singleTokenMinAmount.toString()}.`,
            );
          } else if (error.message.includes('Not providing enough liquidity in token')) {
            logger.error(
              `Osmosis:   OpenPoolPosition failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.`,
            );
            throw new Error(
              `Osmosis:   OpenPoolPosition failed. Single token provided and failed to translate amount to positive liquidity. The given tick range is inactive. If the given range becomes activated, two tokens will be needed as opposed to one.`,
            );
          } else {
            logger.error(`Osmosis:   Sign and Broadcast failed.`);
            logger.error(error);
            throw error;
          }
        }

        if (signingResponse?.code !== successfulTransaction) {
          openPositionResponse = {
            signature: signingResponse.transactionHash,
            status: signingResponse.code,
          };
          return [signingResponse, openPositionResponse];
        }

        let tokenBalanceChanges: Record<string, number> = {};
        let position_id = '';
        {
          const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
            Record<string, number>,
            Record<string, number>,
            string,
          ];
          tokenBalanceChanges = dissectRes[1];
          position_id = dissectRes[2];
        }

        const baseTokenAmountAdded = tokenBalanceChanges[baseToken.symbol]
          ? tokenBalanceChanges[baseToken.symbol] * -1
          : tokenBalanceChanges[baseToken.base]
            ? tokenBalanceChanges[baseToken.base] * -1
            : 0;
        const quoteTokenAmountAdded = tokenBalanceChanges[quoteToken.symbol]
          ? tokenBalanceChanges[quoteToken.symbol] * -1
          : tokenBalanceChanges[quoteToken.base]
            ? tokenBalanceChanges[quoteToken.base] * -1
            : 0;
        openPositionResponse = {
          signature: signingResponse.transactionHash,
          status: signingResponse.code,
          data: {
            fee: signingResponse.feeAmount ? Number(signingResponse.feeAmount) : 0,
            baseTokenAmountAdded: baseTokenAmountAdded,
            quoteTokenAmountAdded: quoteTokenAmountAdded,
            positionAddress: position_id,
            positionRent: 0,
          },
        };
        return [signingResponse, openPositionResponse];
      }
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    logger.error('Osmosis:   Open Pool Position failed, reason unknown.');
    throw new Error('Osmosis:   Open Pool Position, reason unknown.');
  }

  /**
   * Stub. No position sim supported on Osmosis.
   *
   * @param wallet CosmosWallet
   * @param req CLMM - OpenPositionRequestType
   */
  async QuotePositionCLMM(req: CLMMOpenPositionRequestType): Promise<QuotePositionResponseType> {
    try {
      const quotePositionResponse: QuotePositionResponseType = {
        baseLimited: false,
        baseTokenAmount: req.baseTokenAmount,
        quoteTokenAmount: req.quoteTokenAmount,
        baseTokenAmountMax: req.baseTokenAmount,
        quoteTokenAmountMax: req.quoteTokenAmount,
        liquidity: 0,
      };
      return quotePositionResponse;
    } catch (error) {
      console.debug(error);
    }
    logger.error('Osmosis:   Quote Position failed, reason unknown.');
  }

  /**
   * Exchange pool liquidity shares for amounts of tokens from a pool
   *
   * @param wallet CosmosWallet
   * @param req AMM - RemoveLiquidityRequestType
   * @param feeTier_input? high/medium/low
   * @param gasAdjustment_input? extra gas as number, eg. 1.2
   */
  async removeLiquidityAMM(
    wallet: CosmosWallet,
    req: AMMRemoveLiquidityRequestType,
    feeTier_input?: string,
    gasAdjustment_input?: number,
  ): Promise<[ReduceLiquidityTransactionResponse, AMMRemoveLiquidityResponseType]> {
    let response_signature = '';
    let response_fee = 0;
    let ammResponse: AMMRemoveLiquidityResponseType = {
      signature: response_signature,
      status: 1,
    };

    if (!req.poolAddress) {
      throw new Error('Osmosis:   reducePositionAMM Missing poolAddress or token pair');
    }

    const poolAddress = req.poolAddress;
    let baseToken: CosmosAsset;
    let quoteToken: CosmosAsset;

    const address = req.walletAddress;
    const percent = req.percentageToRemove; // total percent of pool shares
    // new models not sending in allowed slippage for remove so using default I guess
    const slippage = this.getAllowedSlippage(this.allowedSlippage);

    let feeTier = this.feeTier;
    if (feeTier_input) {
      feeTier = feeTier_input;
    }
    let gasAdjustment = this.gasAdjustment;
    if (gasAdjustment_input) {
      gasAdjustment = gasAdjustment_input;
    }

    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
        address: address,
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(10000),
          countTotal: false,
          reverse: false,
        },
      });
      const balances = balancesContainer.balances;
      const lockedCoinsContainer = await this._provider.osmosis.lockup.accountLockedCoins({
        owner: address,
      });
      const lockedCoins: Coin[] = lockedCoinsContainer.lockedCoins ? lockedCoinsContainer.lockedCoins : [];

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }
      const pools: ExtendedPool[] = poolsContainer.pools;
      const fees = await parseFees(pools);
      const prices = await this.getCoinGeckPricesStored();

      //@ts-expect-error: Osmosis Case 1
      const filteredPools = getPoolByAddressAndFilter(this.tokenList, pools, prices, poolAddress, false); // removes stableswap, !token.denom.startsWith('gamm/pool'), has price, has osmosisAsset
      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.assetList, { pool, fees, balances, lockedCoins, prices: prices }),
      );

      let currentPool: ExtendedPool;
      const final_poolAddress = req.poolAddress;
      if (final_poolAddress) {
        currentPool = extendedPools.find((pl) => pl.address == final_poolAddress);
      } else {
        currentPool = extendedPools.find((pl) => pl.myLiquidity && pl.myLiquidity != '0'); // first one we find we have coins in
      }

      if (!currentPool || !currentPool.myLiquidity || currentPool.myLiquidity == '0') {
        throw new Error('Osmosis:   No liquidity found for poolAddress or token pair.');
      }

      if (!baseToken) {
        baseToken = this.getTokenByBase(currentPool.poolAssets[0].token.denom)!;
      }
      if (!quoteToken) {
        quoteToken = this.getTokenByBase(currentPool.poolAssets[1].token.denom)!;
      }

      let tokenOutMins: Coin[] = [];
      const msgs = [];
      let myLiquidityDollarValue;
      if (currentPool.myLiquidityDollarValue) {
        myLiquidityDollarValue = new BigNumber(currentPool.myLiquidityDollarValue || 0)
          .multipliedBy(percent)
          .div(100)
          .toString();
      }

      const unbondedShares = convertDollarValueToShares(
        //@ts-expect-error Case 2
        this.assetList,
        myLiquidityDollarValue || 0,
        currentPool,
        prices,
      );

      const myCoins = convertDollarValueToCoins(
        //@ts-expect-error: Osmosis Case 2
        this.assetList,
        myLiquidityDollarValue || 0,
        currentPool,
        prices,
      );

      const coinsNeeded: Coin[] = [];
      myCoins.forEach(({ denom, amount }) => {
        const amountWithSlippage = new BigNumber(amount).multipliedBy(new BigNumber(100).minus(slippage)).div(100);
        if (amountWithSlippage.isGreaterThanOrEqualTo(1)) {
          coinsNeeded.push({
            denom,
            amount: this.noDecimals(amountWithSlippage.toString()),
          });
        }
      });

      const shareInAmount = new BigNumber(unbondedShares).shiftedBy(18).decimalPlaces(0).toString();

      // alphabetize the coins going in or else invalid coins error
      if (coinsNeeded.length > 1) {
        if (!(coinsNeeded[0].denom.toLowerCase() < coinsNeeded[1].denom.toLowerCase())) {
          coinsNeeded.reverse();
        }
      }

      tokenOutMins = coinsNeeded.map((c: Coin) => {
        return coin(c.amount, c.denom);
      });

      if (slippage == 100) {
        tokenOutMins = [];
      }

      const msg = exitPool({
        // @ts-expect-error: bad osmojs models
        poolId: currentPool.id.toString(),
        sender: address,
        shareInAmount,
        tokenOutMins: tokenOutMins,
      });
      msgs.push(msg);

      const enumFee = FEES.osmosis.exitPool(feeTier);
      let gasToUse = enumFee.gas;
      try {
        const gasEstimation = await this.signingClient.simulate(address, msgs);
        gasToUse = gasEstimation;
      } catch (error1) {
        const error = error1 as Error;
        if (error.message.includes('token is lesser than min amount')) {
          let composeTokenOutMins = '';
          for (let idx = 0; idx < tokenOutMins.length; idx++) {
            composeTokenOutMins += ' denom: ' + tokenOutMins[idx].denom + ' amount: ' + tokenOutMins[idx].amount;
          }
          logger.error(
            `Osmosis:   ReducePosition failed: Amount less than min amount error. tokenOutMins: ${composeTokenOutMins}`,
          );
          throw new Error(
            `Osmosis:   ReducePosition failed: Amount less than min amount error. tokenOutMins: ${composeTokenOutMins}`,
          );
        } else {
          logger.error(`Osmosis:   Simulate failed.`);
          logger.error(error);
          throw error;
        }
      }

      const gasPrice = await this.getLatestBasePrice();
      const calcedFee = calculateFee(
        Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
        GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
      );

      if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
        logger.error(
          `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
        );
        throw new Error(
          `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
        );
      }

      const signingResponse: ReduceLiquidityTransactionResponse = await this.signingClient.signAndBroadcast(
        address,
        msgs,
        calcedFee,
      );
      this.signingClient.disconnect();

      if (signingResponse?.code !== successfulTransaction) {
        signingResponse.balances = [];
        return [signingResponse, ammResponse];
      }

      let tokenBalanceChanges: Record<string, number> = {};
      {
        const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
          Record<string, number>,
          Record<string, number>,
          string,
        ];
        tokenBalanceChanges = dissectRes[1];
      }

      const baseTokenAmountRemoved = tokenBalanceChanges[baseToken.symbol]
        ? tokenBalanceChanges[baseToken.symbol]
        : tokenBalanceChanges[baseToken.base]
          ? tokenBalanceChanges[baseToken.base]
          : 0;
      const quoteTokenAmountRemoved = tokenBalanceChanges[quoteToken.symbol]
        ? tokenBalanceChanges[quoteToken.symbol]
        : tokenBalanceChanges[quoteToken.base]
          ? tokenBalanceChanges[quoteToken.base]
          : 0;
      response_signature = signingResponse.transactionHash;
      response_fee = signingResponse.feeAmount ? Number(signingResponse.feeAmount) : 0;
      ammResponse = {
        signature: response_signature,
        status: signingResponse.code,
        data: {
          fee: response_fee,
          baseTokenAmountRemoved: baseTokenAmountRemoved,
          quoteTokenAmountRemoved: quoteTokenAmountRemoved,
        },
      };

      return [signingResponse, ammResponse];
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    logger.error('Osmosis:   ReducePosition failed, reason unknown.');
  }

  /**
   * exchange pool liquidity shares for amounts of tokens from a pool
   *
   * @param wallet CosmosWallet
   * @param req CLMM - RemoveLiquidityRequestType
   */
  async removeLiquidityCLMM(
    wallet: CosmosWallet,
    req: CLMMRemoveLiquidityRequestType,
  ): Promise<CLMMRemoveLiquidityResponseType> {
    let clPosition;
    let final_poolId;
    try {
      const clPositionsContainer = await this._provider.osmosis.concentratedliquidity.v1beta1.positionById({
        address: req.walletAddress, // doesn't actually check the address
        positionId: req.positionAddress,
      });
      if (clPositionsContainer.position.position.address == req.walletAddress) {
        // is this our position?
        final_poolId = clPositionsContainer.position.position.poolId;
        clPosition = clPositionsContainer.position;
      }
    } catch (error) {
      console.debug(error);
      throw new Error('Osmosis:  RemoveLiquidityCLMM failed, position not found.');
    }

    let poolsContainer;
    try {
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
    }
    const pools: AnyPoolType[] = poolsContainer.pools;
    const prices = await this.getCoinGeckPricesStored();
    let filteredPools: ExtendedPool[] = [];
    if (final_poolId) {
      //@ts-expect-error: Osmosis Case 1
      filteredPools = getPoolByIdAndFilter(this.tokenList, pools, prices, final_poolId, false);
    } else {
      throw new Error('Osmosis:   AddLiquidtyCLMM failed, position not found.');
    }
    const pool: ExtendedPool = filteredPools[0];
    const baseToken: CosmosAsset = this.getTokenByBase(pool.token0)!;
    const quoteToken: CosmosAsset = this.getTokenByBase(pool.token1)!;

    // new models not sending in allowed slippage for remove so using default I guess
    const feeTier = this.feeTier;

    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      const percent = req.percentageToRemove; // total percent of pool shares

      const tokenOutMins: Coin[] = [];
      const msgs = [];
      let myLiquidityToRemove;
      myLiquidityToRemove = new BigNumber(clPosition.position.liquidity || 0)
        .multipliedBy(percent)
        .div(100)
        .decimalPlaces(18);

      if (new BigNumber(clPosition.position.liquidity).lt(myLiquidityToRemove)) {
        myLiquidityToRemove = new BigNumber(clPosition.position.liquidity).decimalPlaces(18);
      }

      const msgWithdrawPosition = withdrawPosition({
        sender: req.walletAddress,
        positionId: BigInt(req.positionAddress),
        liquidityAmount: myLiquidityToRemove.toString(),
      });
      msgs.push(msgWithdrawPosition);

      const enumFee = FEES.osmosis.exitPool(feeTier);
      let gasToUse = enumFee.gas;
      try {
        const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
        gasToUse = gasEstimation;
      } catch (error1) {
        const error = error1 as Error;
        if (error.message.includes('token is lesser than min amount')) {
          let composeTokenOutMins = '';
          for (let idx = 0; idx < tokenOutMins.length; idx++) {
            composeTokenOutMins += ' denom: ' + tokenOutMins[idx].denom + ' amount: ' + tokenOutMins[idx].amount;
          }
          logger.error(
            `Osmosis:   ReducePosition failed: Amount less than min amount error. tokenOutMins: ${composeTokenOutMins}`,
          );
        }
      }

      const gasPrice = await this.getLatestBasePrice();
      const calcedFee = calculateFee(
        Math.round(Number(gasToUse) * (this.gasAdjustment || 1.5)),
        GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
      );

      if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
        logger.error(
          `Osmosis:   Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`,
        );
      }

      const signingResponse: ReduceLiquidityTransactionResponse = await this.signingClient.signAndBroadcast(
        req.walletAddress,
        msgs,
        calcedFee,
      );
      this.signingClient.disconnect();

      // const new_position_id = req.positionAddress; // this doesn't actually change on removeLiquidityCL, only addLiquidityCL
      if (signingResponse?.code !== successfulTransaction) {
        signingResponse.balances = [];
        const finalResponse: CLMMRemoveLiquidityResponseType = {
          signature: signingResponse.transactionHash,
          status: signingResponse.code,
        };
        return finalResponse;
      }

      logger.info(
        `Osmosis:    Liquidity removed, txHash is ${signingResponse.transactionHash}, gasUsed is ${signingResponse.gasUsed}.`,
      );

      let tokenBalanceChanges: Record<string, number> = {};
      {
        const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
          Record<string, number>,
          Record<string, number>,
          string,
        ];
        tokenBalanceChanges = dissectRes[1];
      }

      const response_fee = signingResponse.feeAmount ? Number(signingResponse.feeAmount) : 0;

      const finalResponse: CLMMRemoveLiquidityResponseType = {
        signature: signingResponse.transactionHash,
        status: signingResponse.code,
        data: {
          fee: response_fee,
          baseTokenAmountRemoved: tokenBalanceChanges[baseToken.symbol] ? tokenBalanceChanges[baseToken.symbol] : 0,
          quoteTokenAmountRemoved: tokenBalanceChanges[quoteToken.symbol] ? tokenBalanceChanges[quoteToken.symbol] : 0,
        },
      };
      return finalResponse;
    } catch (error) {
      console.debug(error);
    } finally {
      this.signingClient.disconnect();
    }
    logger.error('Osmosis:   ReducePosition failed, reason unknown.');
  }

  /**
   * Collects rewards on CL pool
   *
   * @param wallet CosmosWallet
   * @param req CLMM - CollectFeesRequestType
   */
  async collectRewardsIncentives(
    wallet: CosmosWallet,
    req: CLMMCollectFeesRequestType,
  ): Promise<CLMMCollectFeesResponseType> {
    try {
      const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
      this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

      let final_poolId = undefined;
      try {
        const allCLPositionsContainer = await this._provider.osmosis.concentratedliquidity.v1beta1.positionById({
          address: req.walletAddress, // doesn't actually check the address
          positionId: req.positionAddress,
        });
        if (allCLPositionsContainer.position.position.address == req.walletAddress) {
          final_poolId = allCLPositionsContainer.position.position.poolId;
        }
      } catch (error) {
        console.debug(error);
        throw new Error('Osmosis:  Collect fees failed to find position: ' + error);
      }

      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }
      const pools: ExtendedPool[] = poolsContainer.pools;
      const prices = await this.getCoinGeckPricesStored();

      //@ts-expect-error: Osmosis Case 1
      const filteredPools = getPoolByIdAndFilter(this.tokenList, pools, prices, BigInt(final_poolId), false);
      const pool = filteredPools.filter((pl) => pl.id.toString() == final_poolId!.toString())[0];
      const baseToken: CosmosAsset = this.getTokenByBase(pool.token0)!;
      const quoteToken: CosmosAsset = this.getTokenByBase(pool.token1)!;

      const msgs = [];
      const positionIds: string[] = [req.positionAddress.toString()];
      const msg1 = collectSpreadRewards({
        // @ts-expect-error: bad osmojs models
        positionIds: positionIds,
        sender: req.walletAddress,
      });
      const msg2 = collectIncentives({
        // @ts-expect-error: bad osmojs models
        positionIds: positionIds,
        sender: req.walletAddress,
      });
      msgs.push(msg1);
      msgs.push(msg2);

      const enumFee = FEES.osmosis.exitPool(this.feeTier);
      let gasToUse = enumFee.gas;
      const gasPrice = await this.getLatestBasePrice();
      try {
        const gasEstimation = await this.signingClient.simulate(req.walletAddress, msgs);
        gasToUse = gasEstimation;
      } catch (error) {
        console.debug(error);
      }
      const calcedFee = calculateFee(
        Math.round(Number(gasToUse) * (this.gasAdjustment || 1.5)),
        GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
      );

      const signingResponse: ReduceLiquidityTransactionResponse | any = await this.signingClient.signAndBroadcast(
        req.walletAddress,
        msgs,
        calcedFee,
      );
      this.signingClient.disconnect();

      if (signingResponse?.code !== successfulTransaction) {
        signingResponse.balances = [];
        const response: CLMMCollectFeesResponseType = {
          signature: signingResponse.transactionHash,
          status: signingResponse.code,
        };
        return response;
      }

      let tokenBalanceChanges: Record<string, number> = {};
      {
        const dissectRes = (await this.dissectTransactionResponse(wallet.address, signingResponse)) as [
          Record<string, number>,
          Record<string, number>,
          string,
        ];
        tokenBalanceChanges = dissectRes[1];
      }

      logger.info(
        `Osmosis:    Collected Fees, txHash is ${signingResponse.transactionHash}, gasUsed is ${signingResponse.gasUsed}.`,
      );
      const response: CLMMCollectFeesResponseType = {
        signature: signingResponse.transactionHash,
        status: 0,
        data: {
          fee: signingResponse.feeAmount ? signingResponse.feeAmount : 0,
          baseFeeAmountCollected: tokenBalanceChanges[baseToken.symbol] ? tokenBalanceChanges[baseToken.symbol] : 0,
          quoteFeeAmountCollected: tokenBalanceChanges[quoteToken.symbol] ? tokenBalanceChanges[quoteToken.symbol] : 0,
        },
      };
      return response;
    } catch (error) {
      console.debug(error);
    }
    logger.error('Osmosis:   CollectRewardsIncentives failed, reason unknown.');
    throw new Error('Osmosis:   CollectRewardsIncentives failed, reason unknown.');
  }

  /**
   * Returns all pools and their prices for pool address or by token (not checking wallet balances currently)
   *
   * @param poolType amm || clmm
   * @param token0_in Requires both tokens or pool address
   * @param token1_in
   * @param poolAddress May be required
   */
  async findPoolsPrices(
    poolType: string,
    poolAddress?: string,
    token0_in?: CosmosAsset,
    token1_in?: CosmosAsset,
  ): Promise<PriceAndSerializableExtendedPools> {
    try {
      let token0: CosmosAsset = token0_in;
      let token1: CosmosAsset = token1_in;

      const balances: Coin[] = [];
      const lockedCoins: Coin[] = [];

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }

      const pools: ExtendedPool[] = poolsContainer.pools;
      const prices = await this.getCoinGeckPricesStored();
      const fees = await parseFees(pools);
      let filteredPools: ExtendedPool[] = [];

      if (poolAddress) {
        //@ts-expect-error: Osmosis Case 1
        filteredPools = getPoolByAddressAndFilter(this.tokenList, pools, prices, poolAddress, true);
        if (filteredPools && filteredPools.length == 1) {
          if (filteredPools[0].token0) {
            // CL pool
            token0 = this.getTokenByBase(filteredPools[0].token0);
            token1 = this.getTokenByBase(filteredPools[0].token1);
          } else {
            if (filteredPools[0].poolAssets && filteredPools[0].poolAssets.length > 0) {
              token0 = this.getTokenByBase(filteredPools[0].poolAssets[0].token.denom);
              token1 = this.getTokenByBase(filteredPools[0].poolAssets[1].token.denom);
            }
          }
        }
      } else {
        if (poolType == 'amm') {
          //@ts-expect-error: Osmosis Case 1
          filteredPools = filterPoolsGAMM(this.tokenList, pools, prices);
        } else if ((poolType = 'clmm')) {
          //@ts-expect-error: Osmosis Case 1
          filteredPools = filterPoolsCLMM(this.tokenList, pools, prices);
        }
      }
      if (!filteredPools || filteredPools.length == 0) {
        logger.error('Osmosis:   Failed to find pool for address.');
        return { pools: [], prices: [] };
      }
      if (!token0 || !token1) {
        logger.error('Osmosis:   Failed to find tokens for pool address.');
        return { pools: [], prices: [] };
      }
      const exponentToken0 = this.getExponentByBase(token0.base);
      const exponentToken1 = this.getExponentByBase(token1.base);
      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.assetList, { pool, fees, balances, lockedCoins, prices: prices }),
      );

      const pricesOut: string[] = [];
      const returnPools: SerializableExtendedPool[] = [];
      extendedPools.forEach(function (cPool) {
        let foundToken0 = false;
        let foundToken1 = false;
        if (cPool.token0) {
          if (cPool.token0 == token0.base || cPool.token1 == token0.base) {
            foundToken0 = true;
          }
          if (cPool.token0 == token1.base || cPool.token1 == token1.base) {
            foundToken1 = true;
          }
        } else if (cPool.poolAssets) {
          for (let poolAsset_idx = 0; poolAsset_idx < cPool.poolAssets.length; poolAsset_idx++) {
            const poolAsset: PoolAsset = cPool.poolAssets[poolAsset_idx];
            if (poolAsset!.token! && poolAsset!.token!.denom) {
              if (poolAsset!.token!.denom == token0.base) {
                foundToken0 = true;
              }
              if (poolAsset!.token!.denom == token1.base) {
                foundToken1 = true;
              }
            }
          }
        }

        if (foundToken0 && foundToken1) {
          returnPools.push(new SerializableExtendedPool(cPool));
          if (poolType == 'clmm') {
            pricesOut.push(
              tickToPrice(
                exponentToken0,
                exponentToken1,
                cPool.currentTick.toString(),
                cPool.exponentAtPriceOne.toString(),
              ),
            );
          } else {
            pricesOut.push(
              new BigNumber(cPool.poolAssets[0].token.amount)
                .dividedBy(new BigNumber(cPool.poolAssets[1].token.amount))
                .toString(),
            );
          }
        }
      });

      const returnPriceAndPools = { pools: returnPools, prices: pricesOut };
      return returnPriceAndPools;
    } catch (error) {
      console.debug(error);
    }
    logger.error('Osmosis:   FindPoolsPrices failed, reason unknown.');
    throw new Error('Osmosis:   FindPoolsPrices failed, reason unknown.');
  }

  /**
   * Returns all pool positions data including number of user's shares, or for single specified poolId
   *
   * @param req AMM - GetPositionInfoRequestType
   * @param return_all? Used internally to resuse function for all positions
   */
  async findPoolsPositionsGAMM(
    req: AMMGetPositionInfoRequestType,
    return_all: boolean = false,
  ): Promise<AMMPositionInfo[]> {
    const address = req.walletAddress;
    try {
      // only shows GAMM positions by # of poolShares
      const balancesContainer = await this._provider.cosmos.bank.v1beta1.allBalances({
        address: address,
        pagination: {
          key: new Uint8Array(),
          offset: BigInt(0),
          limit: BigInt(10000),
          countTotal: false,
          reverse: false,
        },
      });
      const balances = balancesContainer.balances;
      const lockedCoinsContainer = await this._provider.osmosis.lockup.accountLockedCoins({
        owner: address,
      });
      const lockedCoins: Coin[] = lockedCoinsContainer.coins ? lockedCoinsContainer.coins : [];

      // RETURN TYPES:
      // concentrated-liquidity/pool || cosmwasmpool/v1beta1/model/pool || gamm/pool-models/balancer/balancerPool || gamm/pool-models/stableswap/stableswap_pool
      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }
      const pools: ExtendedPool[] = poolsContainer.pools;
      const prices = await this.getCoinGeckPricesStored();
      const fees = await parseFees(pools);
      let final_poolAddress;
      let filteredPools: ExtendedPool[] = [];
      if (req.poolAddress) {
        //@ts-expect-error: Osmosis Case 1
        filteredPools = getPoolByAddressAndFilter(this.tokenList, pools, prices, req.poolAddress, false);
        if (filteredPools.length > 0) {
          final_poolAddress = filteredPools[0].address;
        }
      } else {
        //@ts-expect-error: Osmosis Case 1
        filteredPools = filterPoolsGAMM(this.tokenList, pools, prices, false); // removes stableswap, !token.denom.startsWith('gamm/pool'), has price, has osmosisAsset
      }

      const extendedPools = filteredPools.map((pool) =>
        extendPool(this.assetList, { pool, fees, balances, lockedCoins, prices: prices }),
      );

      // balances contain pool address (as coin denom) and amount (# of shares)
      //  however it's not returning that for CL pool positions (only GAMM).. so we can't match the pool address to anything here
      const returnPools: SerializableExtendedPool[] = [];
      extendedPools.forEach(function (cPool) {
        if ((cPool.myLiquidity && cPool.myLiquidity != '0') || (cPool.bonded && cPool.bonded != '0')) {
          returnPools.push(new SerializableExtendedPool(cPool));
        } else if (final_poolAddress) {
          if (cPool.address == final_poolAddress) {
            returnPools.push(new SerializableExtendedPool(cPool));
          }
        }
      });

      // OSMO AMM pools only return shares, not coins
      const final_return: AMMPositionInfo[] = [];
      if (return_all) {
        returnPools.map((firstPool: SerializableExtendedPool) => {
          const poolPrice = new BigNumber(firstPool.poolAssets![0].token.amount)
            .dividedBy(new BigNumber(firstPool.poolAssets![1].token.amount))
            .toNumber();
          const returnObj: AMMPositionInfo = {
            walletAddress: req.walletAddress,
            poolAddress: firstPool.address,
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            baseTokenAddress: '',
            quoteTokenAddress: '',
            price: poolPrice,
            lpTokenAmount: firstPool.myLiquidityShares,
          };
          final_return.push(returnObj);
        });
      } else {
        if (returnPools.length > 0) {
          // we got a poolId but it was for a GAMM pool - so yes poolShares
          const firstPool: SerializableExtendedPool = returnPools[0]!;
          const poolPrice = new BigNumber(firstPool.poolAssets![0].token.amount)
            .dividedBy(new BigNumber(firstPool.poolAssets![1].token.amount))
            .toNumber();
          const returnObj: AMMPositionInfo = {
            walletAddress: req.walletAddress,
            poolAddress: firstPool.address,
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            baseTokenAddress: '',
            quoteTokenAddress: '',
            price: poolPrice,
            lpTokenAmount: firstPool.myLiquidityShares,
          };
          final_return.push(returnObj);
        }
      }

      return final_return;
    } catch (error) {
      console.debug(error + ' ' + error.stack);
    }
    console.error('Osmosis:   FindPoolsPositions failed, reason unknown.');
  }

  /**
   * Returns all pool positions data including number of user's shares, or for single specified poolId
   *
   * @param req CLMM - GetPositionInfoRequestType
   * @param return_all? Used internally to resuse function for all positions
   */
  async findPoolsPositionsCLMM(
    req: CLMMGetPositionInfoRequestType,
    return_all: boolean = false,
  ): Promise<CLMMPositionInfo[]> {
    const CLMMPositionInfoResponse: CLMMPositionInfo[] = [];
    let allCLPositionsBreakDowns = [];

    try {
      const typeUrlCLMM = 'osmosis.concentratedliquidity.v1beta1.Pool'; // .token0 .token1
      let poolsContainer;
      try {
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        poolsContainer = await this._provider.osmosis.poolmanager.v1beta1.allPools({});
      }
      const pools: ExtendedPool[] = poolsContainer.pools;
      const allCLPools = pools.filter(({ $typeUrl }) => $typeUrl?.includes(typeUrlCLMM));

      if (return_all) {
        for (const clPool of allCLPools) {
          try {
            const allCLPositionsContainer = await this._provider.osmosis.concentratedliquidity.v1beta1.userPositions({
              address: req.walletAddress,
              poolId: clPool.id, // UserPositionsRequest requires poolId... so we'll need to query for each CL pool if we do this
            });
            if (
              allCLPositionsContainer &&
              allCLPositionsContainer.positions &&
              allCLPositionsContainer.positions.length > 0
            ) {
              allCLPositionsContainer.positions.map((a) => allCLPositionsBreakDowns.push(a)); //FullPositionBreakdown[]
            }
            await new Promise((resolve) => setTimeout(resolve, 50)); // RPC will spam ban us if we don't do this.
          } catch (error) {
            console.debug('Osmosis error from querying all CL pools for active positions. RPC overload?'); // probably spamming RPC too hard at this point
            console.debug(error); // probably spamming RPC too hard at this point
          }
        }
      } else {
        const clPositionContainer = await this._provider.osmosis.concentratedliquidity.v1beta1.positionById({
          address: req.walletAddress, // requires positionAddress
          positionId: req.positionAddress,
        });
        if (clPositionContainer && clPositionContainer.position && clPositionContainer.position.position) {
          allCLPositionsBreakDowns = [clPositionContainer.position];
        }
      }

      for (const clPosition of allCLPositionsBreakDowns) {
        const clPoolId = clPosition.position.poolId;
        const myPool = pools.find(({ id }) => id == clPoolId);
        const lowerPrice = tickToPrice(
          this.getExponentByBase(myPool.token0),
          this.getExponentByBase(myPool.token1),
          clPosition.position.lowerTick.toString(),
          myPool.exponentAtPriceOne.toString(),
        );
        const upperPrice = tickToPrice(
          this.getExponentByBase(myPool.token0),
          this.getExponentByBase(myPool.token1),
          clPosition.position.upperTick.toString(),
          myPool.exponentAtPriceOne.toString(),
        );
        const currentPrice = tickToPrice(
          this.getExponentByBase(myPool.token0),
          this.getExponentByBase(myPool.token1),
          myPool.currentTick.toString(),
          myPool.exponentAtPriceOne.toString(),
        );
        CLMMPositionInfoResponse.push({
          address: clPosition.position.positionId.toString(), // positionId works better as address, positionAddress almost unused
          poolAddress: myPool.address,
          baseTokenAddress: '',
          quoteTokenAddress: '',
          baseTokenAmount: Number(clPosition.asset0.amount),
          quoteTokenAmount: Number(clPosition.asset1.amount),
          baseFeeAmount: 0,
          quoteFeeAmount: 0,
          lowerBinId: Number(clPosition.position.lowerTick.toString()),
          upperBinId: Number(clPosition.position.upperTick.toString()),
          lowerPrice: Number(lowerPrice),
          upperPrice: Number(upperPrice),
          price: Number(currentPrice),
        });
      }
      return CLMMPositionInfoResponse;
    } catch (error) {
      console.debug(error);
      throw error;
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    try {
      const client = await CosmWasmClient.connect(this.nodeURL);
      const getHeight = await client.getHeight();
      return getHeight;
    } catch (error) {
      console.debug(error);
      return 0; // cosmwasm likes to throw 429 on the above call, and we don't actually use this number anywhere on the strat side so this should be ok
    }
  }

  /**
   * Transfer tokens
   *
   * @param wallet
   * @param token
   * @param req TransferRequest
   */
  async transfer(wallet: CosmosWallet, token: CosmosAsset, req: TransferRequest): Promise<TransactionResponse> {
    const keyWallet = await cWalletMaker(wallet.privkey, 'osmo');
    this.signingClient = await this.osmosisGetSigningStargateClient(this.nodeURL, keyWallet.member);

    const tokenInAmount = new BigNumber(req.amount).shiftedBy(token.decimals).toString();

    const coinIn = {
      denom: token.base,
      amount: tokenInAmount,
    };

    const coinsList = [];
    coinsList.push(coinIn);
    const msg = send({
      fromAddress: req.from,
      toAddress: req.to,
      amount: coinsList,
    });

    const gasAdjustment = this.gasAdjustment;
    const feeTier = this.feeTier;

    const enumFee = FEES.osmosis.swapExactAmountIn(feeTier);
    let gasToUse = enumFee.gas;
    try {
      const gasEstimation = await this.signingClient.simulate(req.from, [msg]);
      gasToUse = gasEstimation;
    } catch (error) {
      console.debug(error);
    }

    const gasPrice = await this.getLatestBasePrice();
    const calcedFee = calculateFee(
      Math.round(Number(gasToUse) * (gasAdjustment || 1.5)),
      GasPrice.fromString(gasPrice.toString() + this.manualGasPriceToken),
    );

    if (new BigNumber(calcedFee.gas).gt(new BigNumber(this.gasLimitEstimate))) {
      const err = `Osmosis:   Transfer failed; Gas limit exceeded ${new BigNumber(calcedFee.gas).toString()} exceeds configured gas limit estimate ${this.gasLimitEstimate}.`;
      logger.error(err);
      logger.error(err);
      throw new Error(err);
    }

    const res = await this.signingClient.signAndBroadcast(req.from, [msg], calcedFee);
    res.gasPrice = gasPrice;
    this.signingClient.disconnect();
    return res;
  }

  async getTokens(req?: TokensRequestType): Promise<TokensResponseType> {
    const responseTokens: TokenInfo[] = [];
    this.tokenList.forEach((element) => {
      // FILTER IF req.tokenSymbols != []
      let addToken = true;
      if (req && req.tokenSymbols && req.tokenSymbols.length > 0) {
        addToken = false;
        for (let idx = 0; idx < req.tokenSymbols.length; idx++) {
          if (req.tokenSymbols[idx] == element.symbol) {
            addToken = true;
            break;
          }
        }
      }
      if (addToken) {
        responseTokens.push({
          chainId: 0,
          address: element.address,
          name: element.name,
          symbol: element.symbol,
          decimals: element.decimals,
        });
      }
    });

    return { tokens: responseTokens };
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10' or '22'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): number {
    if (allowedSlippageStr && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return 100 * (Number(fractionSplit[0]) / Number(fractionSplit[1]));
    } else if (allowedSlippageStr) {
      try {
        return Number(allowedSlippageStr);
      } catch (err) {
        console.debug('Osmosis: Failed to parse allowed slippage input string: ' + allowedSlippageStr);
      }
    }

    // Use the global allowedSlippage setting
    const allowedSlippage = this.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return 100 * (Number(nd[1]) / Number(nd[2]));
    throw new Error('Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.');
  }
}
