import {
  BigNumber,
  ContractTransaction,
  Transaction,
  Wallet,
  Contract,
  ContractInterface,
  utils,
} from 'ethers';
import { percentRegexp } from '../../services/config-manager-v2';
import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
  UniswapishPriceError,
} from '../../services/error-handler';
import { logger } from '../../services/logger';
import { isFractionString } from '../../services/validators';
import { CurveConfig } from './curveswap.config';
import { getAddress } from 'ethers/lib/utils';
import { Polygon } from '../../chains/polygon/polygon';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';
import { Token } from '@uniswap/sdk';
import { Uniswapish, UniswapishTrade } from '../../services/common-interfaces';
import { Fraction } from '@uniswap/sdk-core';
import { abi as routerAbi } from './exchange.contract.abi.json';
import { abi as registryABI } from './registry.contract.abi.json';
import { Avalanche } from '../../chains/avalanche/avalanche';

export interface CurveTrade {
  from: string;
  to: string;
  amount: number;
  expected: number;
  executionPrice: Fraction;
  isBuy: boolean;
  pool: string;
}

export class Curve implements Uniswapish {
  private static _instances: { [name: string]: Curve };
  private _chain: Ethereum | Polygon | Avalanche;
  private _config: typeof CurveConfig.config;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;
  public gasLimitEstimate: any;
  public router: any;
  public curve: any;
  public routerAbi: any[];
  public ttl: any;

  private constructor(chain: string, network: string) {
    this._config = CurveConfig.config;
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else if (chain === 'avalanche') {
      this._chain = Avalanche.getInstance(network);
    } else if (chain === 'polygon') {
      this._chain = Polygon.getInstance(network);
    } else throw Error('Chain not supported.');
    this.routerAbi = routerAbi;
    this.gasLimitEstimate = this._config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): Curve {
    if (Curve._instances === undefined) {
      Curve._instances = {};
    }
    if (!(chain + network in Curve._instances)) {
      Curve._instances[chain + network] = new Curve(chain, network);
    }

    return Curve._instances[chain + network];
  }

  public async init() {
    if (!this._chain.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE(this._chain.chainName),
        SERVICE_UNITIALIZED_ERROR_CODE
      );
    for (const token of this._chain.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this._chain.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name
      );
    }
    const registry = new Contract(
      this._config.routerAddress(this._chain.chain),
      registryABI,
      this._chain.provider
    );
    this.router = await registry.get_address(2);
    this.curve = new Contract(
      this.router,
      this.routerAbi,
      this._chain.provider
    );
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

    const allowedSlippage = this._config.allowedSlippage;
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
   * @param amount Amount of `baseToken` desired from the transaction
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateBuyTrade(
    quoteToken: Token,
    baseToken: Token,
    amount: BigNumber,
    allowedSlippage?: string
  ) {
    const tradeInfo = await this.estimateSellTrade(
      baseToken,
      quoteToken,
      amount,
      allowedSlippage
    );
    tradeInfo.trade.isBuy = true;
    tradeInfo.trade.executionPrice = tradeInfo.trade.executionPrice.invert();
    return tradeInfo;
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
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    _allowedSlippage?: string
  ) {
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );
    const info = await this.curve.get_best_rate(
      baseToken.address,
      quoteToken.address,
      amount.toString()
    );
    const pool = info[0];
    if (!pool || pool === '0x0000000000000000000000000000000000000000') {
      throw new UniswapishPriceError(
        `No pool found for ${quoteToken.address} to ${baseToken.address}.`
      );
    }
    return {
      trade: {
        from: baseToken.address,
        to: quoteToken.address,
        amount: Number(amount.toString()),
        expected: info[1].toString(),
        executionPrice: new Fraction(
          utils.parseUnits(info[1].toString(), baseToken.decimals).toString(),
          utils.parseUnits(amount.toString(), quoteToken.decimals).toString()
        ),
        isBuy: false,
        pool: pool,
      },
      expectedAmount: new Fraction(info[1], '1'),
    };
  }

  /**
   * Given a wallet and a Uniswap trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param _router Router smart contract address
   * @param _ttl How long the swap is valid before expiry, in seconds
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
    _uniswapRouter: string,
    _ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction> {
    const castedTrade = <CurveTrade>trade;
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
        gasLimit: gasLimit,
        value: 0,
        nonce: nonce,
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
    let tradeParams: { [s: string]: unknown } | ArrayLike<unknown>;
    if (castedTrade.isBuy) {
      tradeParams = {
        pool: castedTrade.pool,
        from: castedTrade.to,
        to: castedTrade.from,
        amount: castedTrade.expected,
        expected: String(0.9 * Number(castedTrade.amount)),
      };
    } else {
      tradeParams = {
        pool: castedTrade.pool,
        from: castedTrade.from,
        to: castedTrade.to,
        amount: castedTrade.amount,
        expected: String(Number(castedTrade.expected.toString()) - 1000000),
      };
    }
    const txData = await this.curve.populateTransaction[
      'exchange(address,address,address,uint256,uint256)'
    ](...Object.values(tradeParams), {
      ...overrideParams,
    });
    const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
      this._chain,
      wallet.address
    ).broadcast(txData);

    logger.info(`Transaction Details: ${JSON.stringify(txResponse.hash)}`);
    return txResponse;
  }
}
