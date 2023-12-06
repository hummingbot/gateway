import {
  BigNumber,
  Wallet,
  ContractInterface,
  Transaction,
  PopulatedTransaction,
} from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import { Token } from '@uniswap/sdk';
import { Fraction } from '@uniswap/sdk-core';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { TokenInfo } from '../../chains/ethereum/ethereum-base';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';

import { isFractionString } from '../../services/validators';
import { percentRegexp } from '../../services/config-manager-v2';
import { Uniswapish, UniswapishTrade } from '../../services/common-interfaces';
import { logger } from '../../services/logger';

import { ChainCache, initSyncedCache } from './carbon-sdk/src/chain-cache';
import { ContractsConfig, ContractsApi } from './carbon-sdk/src/contracts-api';
import { Toolkit } from './carbon-sdk/src/strategy-management';
import { Action, MatchActionBNStr, TradeActionBNStr } from './carbon-sdk/src';
import { Decimal } from './carbon-sdk/src/utils';
import carbonControllerAbi from './carbon-sdk/src/abis/CarbonController.json';

import { CarbonConfig } from './carbon.config';

import { emptyToken } from './carbon.utils';

type TradeData = {
  tradeActions: TradeActionBNStr[];
  actionsTokenRes: Action[];
  totalSourceAmount: string;
  totalTargetAmount: string;
  effectiveRate: string;
  actionsWei: MatchActionBNStr[];
};

export interface CarbonTrade {
  from: string;
  to: string;
  amount: string;
  tradeData: TradeData;
  executionPrice: Fraction;
  tradeByTarget: boolean;
}

export class CarbonAMM implements Uniswapish {
  private static _instances: { [name: string]: CarbonAMM };
  public carbonContractConfig: Required<ContractsConfig>;
  public carbonSDK: Toolkit;
  public sdkCache: ChainCache;
  public api: ContractsApi;
  private tokenList: Record<string, Token> = {};
  public router: any;
  public routerAbi: any;
  private _chain: Ethereum;
  private _ready: boolean = false;
  private _conf: CarbonConfig.NetworkConfig;
  private _gasLimitEstimate: number;
  private _ttl: number;
  private _nativeToken: TokenInfo;

  private constructor(chain: string, network: string) {
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else {
      throw new Error('Unsupported chain');
    }

    this._nativeToken =
      this._chain.chainName === 'ethereum'
        ? {
            chainId: 1,
            address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
          }
        : emptyToken;

    this._conf = CarbonConfig.config;
    this.carbonContractConfig = this._conf.carbonContractsConfig(
      chain,
      network
    );

    this.api = new ContractsApi(
      this._chain.provider,
      this.carbonContractConfig
    );

    this.sdkCache = new ChainCache();
    this.carbonSDK = new Toolkit(this.api, this.sdkCache);
    this._gasLimitEstimate = this._conf.gasLimitEstimate;
    this._ttl = this._conf.ttl;

    this.router = this.carbonContractConfig.carbonControllerAddress;
    this.routerAbi = carbonControllerAbi;
  }

  public static getInstance(chain: string, network: string): CarbonAMM {
    if (CarbonAMM._instances === undefined) {
      CarbonAMM._instances = {};
    }
    if (!(chain + network in CarbonAMM._instances)) {
      CarbonAMM._instances[chain + network] = new CarbonAMM(chain, network);
    }

    return CarbonAMM._instances[chain + network];
  }

  public async loadTokens() {
    for (const token of this._chain.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this._chain.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name
      );
    }
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    if (address === this._nativeToken.address) {
      return new Token(
        this._nativeToken.chainId,
        this._nativeToken.address,
        this._nativeToken.decimals,
        this._nativeToken.symbol,
        this._nativeToken.name
      );
    } else {
      return this.tokenList[getAddress(address)];
    }
  }

  /**
   * Default time-to-live for swap transactions, in seconds.
   */
  public get ttl(): number {
    return Math.floor(new Date().getTime() / 1000) + this._ttl;
  }

  public async init() {
    if (!this._chain.ready()) {
      await this._chain.init();
    }

    if (!this._ready) {
      const { cache, startDataSync } = initSyncedCache(this.api.reader);
      this.sdkCache = cache;

      const decimalsMap = new Map();
      this._chain.storedTokenList.forEach((token) => {
        decimalsMap.set(token.address, token.decimals);
      });

      this.carbonSDK = new Toolkit(this.api, this.sdkCache, (address) =>
        decimalsMap.get(address.toLowerCase())
      );

      logger.info('Loading tokens...');
      await this.loadTokens();

      logger.info('Starting Data Sync...');
      await startDataSync();

      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Default gas limit for swap transactions.
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
  public getAllowedSlippage(allowedSlippageStr?: string): number {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return Number(fractionSplit[0]) / Number(fractionSplit[1]);
    }

    const allowedSlippage = this._conf.allowedSlippage;
    const matches = allowedSlippage.match(percentRegexp);
    if (matches) return Number(matches[1]) / Number(matches[2]);
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
   * @param amount Amount of `baseToken` desired from the transaction, in wei
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber
  ) {
    const tradeByTarget = true;
    return await this.estimateTrade(
      quoteToken,
      baseToken,
      amount,
      tradeByTarget
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
    amount: BigNumber
  ) {
    const tradeByTarget = false;
    return await this.estimateTrade(
      baseToken,
      quoteToken,
      amount,
      tradeByTarget
    );
  }

  /**
   * Given the amount of `inputToken` to put into a transaction, calculate the
   * amount of `outputToken` that can be expected from the transaction.
   *
   * Used to calculate buy and sell prices
   *
   * @param inputToken Token input for the transaction
   * @param outputToken Output from the transaction
   * @param amount Amount of `inputToken` to put into the transaction
   */
  async estimateTrade(
    inputToken: Token,
    outputToken: Token,
    amount: BigNumber,
    tradeByTarget: boolean
  ): Promise<{ trade: CarbonTrade; expectedAmount: Fraction }> {
    const amountWei = amount.toString();

    // Because the toolkit expects floating point amounts
    const parsedAmount = new Decimal(amountWei)
      .div(
        new Decimal(10).pow(
          tradeByTarget ? outputToken.decimals : inputToken.decimals
        )
      )
      .toString();

    const tradeData = await this.carbonSDK.getTradeData(
      inputToken.address,
      outputToken.address,
      parsedAmount,
      tradeByTarget,
      this._conf.matchType
    );

    if (!tradeData || tradeData.tradeActions.length === 0) {
      throw new Error(
        `No trade actions possible for ${inputToken.address} to ${outputToken.address}`
      );
    }

    const expectedAmountFraction = new Decimal(
      tradeByTarget ? tradeData.totalSourceAmount : tradeData.totalTargetAmount
    ).toFraction();

    const expectedAmount = new Fraction(
      expectedAmountFraction[0].toFixed(0).toString(),
      expectedAmountFraction[1].toFixed(0).toString()
    );

    const effectiveRateFraction = new Decimal(
      tradeData.effectiveRate
    ).toFraction();

    const executionPrice = new Fraction(
      effectiveRateFraction[0].toFixed(0).toString(),
      effectiveRateFraction[1].toFixed(0).toString()
    );

    return {
      trade: {
        from: inputToken.address,
        to: outputToken.address,
        amount: amountWei,
        tradeData: tradeData,
        executionPrice: executionPrice,
        tradeByTarget: tradeByTarget,
      },
      expectedAmount: expectedAmount,
    };
  }

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  async executeTrade(
    wallet: Wallet,
    trade: UniswapishTrade,
    gasPrice: number,
    _router: string,
    ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    if (!wallet.address) throw Error('No wallet address specified.');

    const carbonTrade = <CarbonTrade>trade;

    let overrideParams: {
      gasLimit: string | number;
      value: number;
      nonce: number | undefined;
      maxFeePerGas?: BigNumber | undefined;
      maxPriorityFeePerGas?: BigNumber | undefined;
      gasPrice?: string;
    };
    if (maxFeePerGas || maxPriorityFeePerGas) {
      overrideParams = {
        gasLimit,
        value: 0,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
    } else {
      overrideParams = {
        gasPrice: (gasPrice * 1e9).toFixed(0),
        gasLimit: gasLimit.toFixed(0),
        value: 0,
        nonce: nonce,
      };
    }

    const slippage = this.getAllowedSlippage(allowedSlippage);
    let deadlineMs: number;
    if (ttl) {
      deadlineMs = Math.floor(new Date().getTime()) + this._ttl * 1000;
    } else {
      deadlineMs = this.ttl * 1000;
    }
    let tradeTransaction: PopulatedTransaction;

    if (carbonTrade.tradeByTarget) {
      const maxInput = new Decimal(1)
        .add(slippage)
        .times(carbonTrade.tradeData.totalSourceAmount)
        .toString();

      tradeTransaction = await this.carbonSDK.composeTradeByTargetTransaction(
        carbonTrade.from,
        carbonTrade.to,
        carbonTrade.tradeData.tradeActions,
        deadlineMs.toString(),
        maxInput,
        { ...overrideParams }
      );
    } else {
      const minReturn = new Decimal(1)
        .sub(slippage)
        .times(carbonTrade.tradeData.totalTargetAmount)
        .toString();

      tradeTransaction = await this.carbonSDK.composeTradeBySourceTransaction(
        carbonTrade.from,
        carbonTrade.to,
        carbonTrade.tradeData.tradeActions,
        deadlineMs.toString(),
        minReturn,
        { ...overrideParams }
      );
    }

    const txResponse = await EVMTxBroadcaster.getInstance(
      this._chain,
      wallet.address
    ).broadcast(tradeTransaction);

    return txResponse;
  }
}
