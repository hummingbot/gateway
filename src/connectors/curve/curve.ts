import {
  BigNumber,
  ContractInterface,
  ContractTransaction,
  Transaction,
  Wallet,
} from 'ethers';
import { ExpectedTrade, Uniswapish } from '../../services/common-interfaces';
import { percentRegexp } from '../../services/config-manager-v2';
import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
  UniswapishPriceError,
} from '../../services/error-handler';
import { logger } from '../../services/logger';
import { isFractionString } from '../../services/validators';
import { CurveSwapConfig } from './curveswap.config';
import { getAddress } from 'ethers/lib/utils';
import { Polygon } from '../../chains/polygon/polygon';
import { Ethereum } from '../../chains/ethereum/ethereum';
import curve from 'curvefi';
import { Token } from '@uniswap/sdk/dist/entities';
import { IRoute } from 'curvefi/lib/interfaces';
import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';

export type CurveTrade = {
  route: IRoute;
  inputCoin: string;
  outputCoin: string;
  amount: string;
};

export class CurveSwap implements Uniswapish {
  private static _instances: { [name: string]: CurveSwap };
  private _chain: Ethereum | Polygon;
  private _config: typeof CurveSwapConfig.config;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;
  public gasLimitEstimate: any;
  public router: any;
  public routerAbi: any[] = [];
  public ttl: any;

  private constructor(chain: string, network: string) {
    this._config = CurveSwapConfig.config;
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else {
      this._chain = Polygon.getInstance(network);
    }
  }

  public static getInstance(chain: string, network: string): CurveSwap {
    if (CurveSwap._instances === undefined) {
      CurveSwap._instances = {};
    }
    if (!(chain + network in CurveSwap._instances)) {
      CurveSwap._instances[chain + network] = new CurveSwap(chain, network);
    }

    return CurveSwap._instances[chain + network];
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
    await curve.init(
      'JsonRpc',
      { url: this._chain.rpcUrl },
      { chainId: this._chain.chainId }
    );

    this._ready = true;
  }

  public async fetchPools() {
    await Promise.all([
      curve.factory.fetchPools(),
      curve.crvUSDFactory.fetchPools(),
      curve.EYWAFactory.fetchPools(),
      curve.cryptoFactory.fetchPools(),
      curve.tricryptoFactory.fetchPools(),
    ]);
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
    _allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );
    await this.fetchPools();
    const { route, output } = await curve.router.getBestRouteAndOutput(
      quoteToken.address,
      baseToken.address,
      amount.toString()
    );
    if (!route) {
      throw new UniswapishPriceError(
        `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
      );
    }
    return {
      trade: {
        route: route,
        inputCoin: quoteToken.address,
        outputCoin: baseToken.address,
        amount: amount.toString(),
      },
      expectedAmount: output,
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
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async estimateSellTrade(
    baseToken: Token,
    quoteToken: Token,
    amount: BigNumber,
    _allowedSlippage?: string
  ): Promise<ExpectedTrade> {
    logger.info(
      `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
    );
    await this.fetchPools();
    const { route, output } = await curve.router.getBestRouteAndOutput(
      baseToken.address,
      quoteToken.address,
      amount.toString()
    );
    if (!route) {
      throw new UniswapishPriceError(
        `priceSwapOut: no trade pair found for ${quoteToken.address} to ${baseToken.address}.`
      );
    }
    return {
      trade: {
        route: route,
        inputCoin: baseToken.address,
        outputCoin: quoteToken.address,
        amount: amount.toString(),
      },
      expectedAmount: output,
    };
  }

  /**
   * Given a wallet and a Uniswap trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param pancakeswapRouter Router smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
   */
  async executeTrade(
    wallet: Wallet,
    trade: CurveTrade,
    gasPrice: number,
    _router: string,
    _ttl: number,
    _abi: ContractInterface,
    gasLimit: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    allowedSlippage?: string
  ): Promise<Transaction> {
    const result = await curve.router.modifiedSwap(
      trade.inputCoin,
      trade.outputCoin,
      trade.amount,
      allowedSlippage ? this.getAllowedSlippage(allowedSlippage) : 0
    );
    let overrideParams;
    if (maxFeePerGas || maxPriorityFeePerGas) {
      overrideParams = {
        gasLimit: gasLimit,
        value: result.value,
        nonce: nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
    } else {
      overrideParams = {
        gasPrice: (gasPrice * 1e9).toFixed(0),
        gasLimit: gasLimit.toFixed(0),
        value: result.value,
        nonce: nonce,
      };
    }
    const txData = await result.contract.populateTransaction[
      <any>result.methodName
    ](result.methodParams, { ...overrideParams });
    const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
      this._chain,
      wallet.address
    ).broadcast(txData);

    logger.info(`Transaction Details: ${JSON.stringify(txResponse.hash)}`);
    return txResponse;
  }
}
