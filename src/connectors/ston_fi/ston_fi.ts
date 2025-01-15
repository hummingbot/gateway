import LRUCache from 'lru-cache';
import {percentRegexp} from '../../services/config-manager-v2';
import {Ton} from '../../chains/ton/ton';
import {StonfiConfig} from './ston_fi.config';
import {getTonConfig} from '../../chains/ton/ton.config';
import {TonAsset} from '../../chains/ton/ton.requests';
import {logger} from '../../services/logger';
import {PriceRequest} from '../../amm/amm.requests';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import {pow} from 'mathjs';
import {StonApiClient} from '@ston-fi/api';
import {internal, SenderArguments} from '@ton/ton';
import {DEX, pTON} from '@ston-fi/sdk';
import {createHash} from 'crypto';
import {runWithRetryAndTimeout} from '../../chains/ton/ton.utils';

export class Stonfi {
  private static _instances: LRUCache<string, Stonfi>;
  private chain: Ton;
  private _ready: boolean = false;
  private _config: StonfiConfig.NetworkConfig;
  private stonfi: StonApiClient;

  private constructor(network: string) {
    this._config = StonfiConfig.config;
    this.chain = Ton.getInstance(network);
    this.stonfi = new StonApiClient();
  }

  public static getInstance(network: string): Stonfi {
    const config = getTonConfig(network);
    if (Stonfi._instances === undefined) {
      Stonfi._instances = new LRUCache<string, Stonfi>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Stonfi._instances.has(network)) {
      if (network !== null) {
        Stonfi._instances.set(network, new Stonfi(network));
      } else {
        throw new Error(
          `Stonfi.getInstance received an unexpected network: ${network}.`,
        );
      }
    }

    return Stonfi._instances.get(network) as Stonfi;
  }

  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Gets the allowed slippage percent from configuration.
   */
  getSlippage(): number {
    const allowedSlippage = this._config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) slippage = Number(nd[1]) / Number(nd[2]);
    return slippage;
  }

  /**
   * This is typically used for calculating token prices.
   *
   * @param req Price request object
   */

  async estimateTrade(req: PriceRequest) {
    const baseToken: TonAsset | null = this.chain.getAssetForSymbol(req.base);
    const quoteToken: TonAsset | null = this.chain.getAssetForSymbol(req.quote);

    if (baseToken === null || quoteToken === null)
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
        TOKEN_NOT_SUPPORTED_ERROR_CODE,
      );

    const baseAsset = {
      id: baseToken.assetId,
      decimals: baseToken.decimals,
    } as any;

    const quoteAsset = {
      id: quoteToken.assetId,
      decimals: quoteToken.decimals,
    } as any;

    const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);

    const isBuy: boolean = req.side === 'BUY';

    const quote = await this.stonfi.simulateSwap({
      askAddress: isBuy === true ? quoteAsset.id.address : baseAsset.id.address,
      offerUnits: amount.toString(),
      offerAddress:
        isBuy === true ? baseAsset.id.address : quoteAsset.id.address,
      slippageTolerance: '0.01', // TODO add this value to the config!!!
    });

    const price = Number(quote.swapRate);

    logger.info(
      `Best quote for ${baseToken.symbol}-${quoteToken.symbol}: ` +
      `${price}` +
      `${baseToken.symbol}.`,
    );

    const expectedPrice = isBuy === true ? 1 / price : price;

    const expectedAmount =
      req.side === 'BUY'
        ? Number(req.amount)
        : expectedPrice * Number(req.amount);

    return { trade: quote, expectedAmount, expectedPrice };
  }

  async executeTrade(
    account: string,
    quote: StonfiConfig.StonfiQuoteRes,
    baseName: string,
    quoteName: string,
    _isBuy: boolean,
  ): Promise<any> {
    const keyPair = await this.chain.getAccountFromAddress(account);
    const contract = this.chain.tonClient.open(this.chain.wallet);
    const dex = this.chain.tonClient.open(new DEX.v1.Router());
    const transactionHash = Stonfi.generateUniqueHash(
      `${new Date().toISOString() + quote.offerUnits}`,
    );
    const queryId = Stonfi.generateQueryId(15, transactionHash);
    let txParams: SenderArguments;

    if (baseName === 'TON') {
      txParams = await dex.getSwapTonToJettonTxParams({
        userWalletAddress: this.chain.wallet.address.toString() || account,
        proxyTon: new pTON.v1(),
        offerAmount: quote.offerUnits,
        askJettonAddress: quote.askAddress,
        minAskAmount: quote.minAskUnits,
        queryId: queryId,
      });
    } else if (quoteName === 'TON') {
      txParams = await dex.getSwapJettonToTonTxParams({
        userWalletAddress: this.chain.wallet.address.toString() || account,
        proxyTon: new pTON.v1(),
        offerAmount: quote.offerUnits,
        offerJettonAddress: quote.offerAddress,
        minAskAmount: quote.minAskUnits,
        queryId: queryId,
      });
    } else {
      txParams = await dex.getSwapJettonToJettonTxParams({
        userWalletAddress: this.chain.wallet.address.toString() || account,
        offerJettonAddress: quote.offerAddress,
        askJettonAddress: quote.askAddress,
        offerAmount: quote.offerUnits,
        minAskAmount: quote.minAskUnits,
        queryId: queryId,
      });
    }

    const options = {
      seqno: await contract.getSeqno(),
      secretKey: Buffer.from(keyPair.secretKey, 'base64url'),
      messages: [internal(txParams)],
    };

    await contract.sendTransfer(options);

    const hashObj = {
      walletAddress: this.chain.wallet.address.toString() || account,
      queryId: queryId,
    };

    const hashBase64 = Buffer.from(JSON.stringify(hashObj)).toString(
      'base64url',
    );

    return `hb-ton-stonfi-${hashBase64}`;
  }

  public async waitForConfirmation(walletAddress: string, queryId: string) {
    return await runWithRetryAndTimeout<{
      '@type': 'Found';
      address: string;
      balanceDeltas: string;
      coins: string;
      exitCode: string;
      logicalTime: string;
      queryId: string;
      txHash: string;
    }>(
      this,
      this.waitForTransactionHash as any,
      [walletAddress, queryId],
      90, // maxNumberOfRetries
      1000, // delayBetweenRetries in milliseconds
      90000, // timeout in milliseconds
      'Timeout while waiting for confirmation.', // timeoutMessage
    );
  }

  public async waitForTransactionHash(ownerAddress: string, queryId: string) {
    const today = new Date();
    today.setHours(23, 0, 0, 0);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(8, 0, 0, 0);

    const operations = await this.stonfi.getWalletOperations({
      since: yesterday,
      until: today,
      walletAddress: ownerAddress,
      opType: 'Swap',
    });

    if (!operations) {
      throw new Error('No operations found');
    }

    const routerAddress =
      operations[operations.length - 1].operation.routerAddress;

    const result = await runWithRetryAndTimeout<
      | { '@type': 'NotFound' }
      | {
        '@type': 'Found';
        address: string;
        balanceDeltas: string;
        coins: string;
        exitCode: string;
        logicalTime: string;
        queryId: string;
        txHash: string;
      }
    >(
      this.stonfi,
      this.stonfi.getSwapStatus as any,
      [{ ownerAddress, routerAddress, queryId }],
      3, // maxNumberOfRetries
      1000, // delayBetweenRetries in milliseconds
      10000, // timeout in milliseconds
      'Timeout while waiting for confirmation.', // timeoutMessage
    );

    if (!result['txHash']) {
      throw new Error('Transaction not found');
    }

    return result;
  }

  public static generateUniqueHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
  public static generateQueryId(length: number, hash: string): number {
    const max = Math.pow(10, length) - 1;
    const min = Math.pow(10, length - 1);

    const hashValue = parseInt(hash.slice(0, 5), 16);
    return (hashValue % (max - min + 1)) + min;
  }
}
