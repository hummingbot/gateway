import { SpectrumConfig } from './spectrum.config';
import { Ergo } from '../../chains/ergo/ergo';
import { ErgoAsset } from '../../chains/ergo/interfaces/ergo.interface';

export class Spectrum {
  private static _instances: { [name: string]: Spectrum };
  private ergo: Ergo;
  private _gasLimitEstimate: number;
  private tokenList: Record<string, ErgoAsset> = {};
  private _ready: boolean = false;

  private constructor(network: string) {
    const config = SpectrumConfig.config;

    this.ergo = Ergo.getInstance(network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): Spectrum {
    if (Spectrum._instances === undefined) {
      Spectrum._instances = {};
    }
    if (!(chain + network in Spectrum._instances)) {
      Spectrum._instances[chain + network] = new Spectrum(network);
    }

    return Spectrum._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): ErgoAsset {
    return this.tokenList[address];
  }

  public async init() {
    if (!this.ergo.ready()) {
      await this.ergo.init();
    }

    this.tokenList = this.ergo.storedTokenList;

    this._ready = true;
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
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   */
  // async estimateSellTrade(
  //   baseToken: Token,
  //   quoteToken: Token,
  //   amount: BigNumber,
  //   allowedSlippage?: string,
  // ): Promise<ExpectedTrade> {}

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
  // async estimateBuyTrade(
  //   quoteToken: Token,
  //   baseToken: Token,
  //   amount: BigNumber,
  //   allowedSlippage?: string,
  // ): Promise<ExpectedTrade> {}

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   * @param gasPrice Base gas price, for pre-EIP1559 transactions
   * @param pangolinRouter smart contract address
   * @param ttl How long the swap is valid before expiry, in seconds
   * @param abi Router contract ABI
   * @param gasLimit Gas limit
   * @param nonce (Optional) EVM transaction nonce
   * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
   * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
   */
  // async executeTrade(
  //   wallet: Wallet,
  //   trade: Trade,
  //   gasPrice: number,
  //   pangolinRouter: string,
  //   ttl: number,
  //   abi: ContractInterface,
  //   gasLimit: number,
  //   nonce?: number,
  //   maxFeePerGas?: BigNumber,
  //   maxPriorityFeePerGas?: BigNumber,
  //   allowedSlippage?: string,
  // ): Promise<Transaction> {}
}
