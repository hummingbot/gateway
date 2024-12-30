import LRUCache from 'lru-cache';
import { percentRegexp } from '../../services/config-manager-v2';
import { Ton } from '../../chains/ton/ton';
import { DedustConfig } from './dedust.config';
import { getTonConfig } from '../../chains/ton/ton.config';
import { TonAsset } from '../../chains/ton/ton.requests';
import { logger } from '../../services/logger';
import { PriceRequest } from '../../amm/amm.requests';
import {
  UniswapishPriceError,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  InitializationError,
  PRICE_FAILED_ERROR_MESSAGE,
  AMOUNT_NOT_SUPPORTED_ERROR_MESSAGE,
  INSUFFICIENT_FUNDS_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
  AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
} from '../../services/error-handler';
import { pow } from 'mathjs';
import {
  WalletContractV4,
  toNano,
  Address,
  Sender,
  SenderArguments,
} from '@ton/ton';
import {
  Factory,
  MAINNET_FACTORY_ADDR,
  Asset,
  PoolType,
  ReadinessStatus,
  VaultJetton,
  JettonRoot,
  Pool,
  VaultNative,
  AssetType,
} from '@dedust/sdk';
import { OpenedContract } from '@ton/core';
import { beginCell } from '@ton/core';

export class Dedust {
  private static _instances: LRUCache<string, Dedust>;
  private chain: Ton;
  private _ready: boolean = false;
  private _config: DedustConfig.NetworkConfig;
  private factory: OpenedContract<Factory>;

  private constructor(network: string) {
    this._config = DedustConfig.config;
    this.chain = Ton.getInstance(network);
    this.factory = this.chain.tonClient.open(
      Factory.createFromAddress(MAINNET_FACTORY_ADDR),
    );
  }

  public static getInstance(network: string): Dedust {
    const config = getTonConfig(network);
    if (Dedust._instances === undefined) {
      Dedust._instances = new LRUCache<string, Dedust>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Dedust._instances.has(network)) {
      if (network !== null) {
        Dedust._instances.set(network, new Dedust(network));
      } else {
        throw new InitializationError(
          `Dedust.getInstance received an unexpected network: ${network}.`,
          TOKEN_NOT_SUPPORTED_ERROR_CODE,
        );
      }
    }

    return Dedust._instances.get(network) as Dedust;
  }

  public async init() {
    try {
      if (!this.chain.ready()) {
        await this.chain.init();
      }
      this._ready = true;
    } catch (error) {
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('Dedust'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    }
  }

  public ready(): boolean {
    if (!this._ready) {
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('Dedust'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    }
    return this._ready;
  }

  getSlippage(): number {
    const allowedSlippage = this._config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) slippage = Number(nd[1]) / Number(nd[2]);
    return slippage;
  }

  async estimateTrade(req: PriceRequest): Promise<{
    trade: DedustConfig.DedustQuote;
    expectedAmount: number;
    expectedPrice: number;
  }> {
    if (!this._ready) {
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('Dedust'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    }

    const baseToken: TonAsset | null = this.chain.getAssetForSymbol(req.base);
    const quoteToken: TonAsset | null = this.chain.getAssetForSymbol(req.quote);

    if (baseToken === null || quoteToken === null) {
      throw new Error(
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + `${req.base} or ${req.quote}`,
      );
    }

    if (!Number(req.amount) || Number(req.amount) <= 0) {
      throw new Error(AMOUNT_NOT_SUPPORTED_ERROR_MESSAGE);
    }

    const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);

    try {
      // Create Asset instances for the tokens
      const fromAsset =
        baseToken.assetId === 'TON'
          ? Asset.native()
          : Asset.jetton(Address.parse(baseToken.assetId));

      const toAsset =
        quoteToken.assetId === 'TON'
          ? Asset.native()
          : Asset.jetton(Address.parse(quoteToken.assetId));

      // Get the pool
      let pool;
      try {
        pool = this.chain.tonClient.open(
          await this.factory.getPool(PoolType.VOLATILE, [fromAsset, toAsset]),
        ) as OpenedContract<Pool>;
      } catch (error) {
        throw new UniswapishPriceError('Failed to get pool: ' + error);
      }

      // Check if pool exists
      if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new UniswapishPriceError('Pool does not exist or is not ready');
      }

      // Get the vault for the input token
      let vault;
      try {
        vault =
          baseToken.assetId === 'TON'
            ? (this.chain.tonClient.open(
                await this.factory.getNativeVault(),
              ) as OpenedContract<VaultNative>)
            : (this.chain.tonClient.open(
                await this.factory.getJettonVault(
                  Address.parse(baseToken.assetId),
                ),
              ) as OpenedContract<VaultJetton>);
      } catch (error) {
        throw new UniswapishPriceError('Failed to get vault: ' + error);
      }

      // Check if vault exists
      if ((await vault.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new UniswapishPriceError('Vault does not exist.');
      }

      // Get estimated swap output
      const swapEstimate = await pool.getEstimatedSwapOut({
        assetIn: fromAsset,
        amountIn: BigInt(amount),
      });

      const expectedAmount =
        Number(swapEstimate.amountOut) / Math.pow(10, quoteToken.decimals);
      const expectedPrice = expectedAmount / Number(req.amount);

      // Calculate price impact
      const inputValue = Number(amount);
      const outputValue = Number(swapEstimate.amountOut);
      const tradeFeeValue = Number(swapEstimate.tradeFee);

      // Price impact is the percentage of value lost in the trade
      const priceImpact =
        ((inputValue - (outputValue + tradeFeeValue)) / inputValue) * 100;

      // Check if price impact is too high
      if (
        this._config.maxPriceImpact &&
        priceImpact > this._config.maxPriceImpact
      ) {
        throw new UniswapishPriceError(
          `Price impact too high: ${priceImpact.toFixed(2)}% > ${this._config.maxPriceImpact}%`,
        );
      }

      const quote: DedustConfig.DedustQuote = {
        pool,
        vault,
        amount: toNano(amount.toString()),
        fromAsset,
        toAsset,
        expectedOut: swapEstimate.amountOut,
        priceImpact,
        tradeFee: swapEstimate.tradeFee,
      };

      return {
        trade: quote,
        expectedAmount,
        expectedPrice,
      };
    } catch (error) {
      logger.error(`Failed to get swap quote: ${error}`);
      if (error instanceof UniswapishPriceError) {
        throw error;
      }
      if (
        error instanceof Error &&
        error.message.includes('insufficient funds')
      ) {
        throw new Error(INSUFFICIENT_FUNDS_ERROR_MESSAGE);
      }
      if (error instanceof Error && error.message.includes('network')) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }
      throw new Error(PRICE_FAILED_ERROR_MESSAGE + error);
    }
  }

  async executeTrade(
    account: string,
    quote: DedustConfig.DedustQuote,
    isBuy: boolean,
  ): Promise<DedustConfig.DedustTradeResult> {
    if (!this._ready) {
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('Dedust'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    }

    try {
      const keyPar = await this.chain.getAccountFromAddress(account);
      if (!keyPar) {
        throw new Error('Failed to get account keys');
      }

      const wallet = WalletContractV4.create({
        workchain: this.chain.workchain,
        publicKey: Buffer.from(keyPar.publicKey, 'utf8'),
      });

      const walletContract = this.chain.tonClient.open(wallet);
      const sender: Sender = {
        address: walletContract.address,
        async send(args: SenderArguments) {
          return walletContract.sendTransfer({
            secretKey: Buffer.from(keyPar.secretKey, 'utf8'),
            messages: [
              {
                body: args.body || beginCell().endCell(),
                info: {
                  type: 'internal',
                  ihrDisabled: true,
                  bounce: true,
                  bounced: false,
                  dest: args.to,
                  value: { coins: args.value },
                  ihrFee: BigInt(0),
                  forwardFee: BigInt(0),
                  createdLt: BigInt(0),
                  createdAt: 0,
                },
              },
            ],
            seqno: await walletContract.getSeqno(),
          });
        },
      };

      const slippage = this.getSlippage();
      const minExpectedOut = BigInt(
        Math.floor(Number(quote.expectedOut) * (1 - slippage)),
      );

      if (minExpectedOut <= BigInt(0)) {
        throw new Error(AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE);
      }

      if (quote.fromAsset.type === AssetType.NATIVE) {
        // Swapping TON to Jetton - use VaultNative directly
        await (quote.vault as OpenedContract<VaultNative>).sendSwap(sender, {
          amount: quote.amount,
          poolAddress: quote.pool.address,
          gasAmount: toNano('0.25'),
          limit: minExpectedOut,
          swapParams: {
            recipientAddress: sender.address,
          },
        });
      } else {
        // Swapping Jetton to something else - use JettonWallet
        if (!quote.fromAsset.address) {
          throw new Error('From asset address is required');
        }
        const jettonRoot = this.chain.tonClient.open(
          JettonRoot.createFromAddress(quote.fromAsset.address),
        );
        if (!sender.address) {
          throw new Error('Sender address is required');
        }
        const jettonWallet = this.chain.tonClient.open(
          await jettonRoot.getWallet(sender.address),
        );

        await jettonWallet.sendTransfer(sender, toNano('0.3'), {
          amount: quote.amount,
          destination: quote.vault.address,
          responseAddress: sender.address,
          forwardAmount: toNano('0.25'),
          forwardPayload: VaultJetton.createSwapPayload({
            poolAddress: quote.pool.address,
          }),
        });
      }

      logger.info(
        `${isBuy ? 'Buy' : 'Sell'} swap executed with minimum output: ${minExpectedOut}`,
      );

      // Wait for the next transaction on the sender's address
      if (!sender.address) {
        throw new Error('Sender address is required');
      }
      // TODO: This is a temporary solution, we need to find a better way to get the transaction id
      // Best would be to get the transaction id from the response of the sendTransfer method
      // But the SDK does not return the transaction id
      // Either we need to modify the SDK to return the transaction id or reimplment the sendTransfer method
      const transactions = await this.chain.tonweb.getTransactions(
        sender.address.toString(),
        1,
      );

      if (!transactions || transactions.length === 0) {
        throw new Error('No transactions found');
      }

      return {
        txId: transactions[0].transaction_id.hash,
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to execute swap: ${error}`);

      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          return {
            txId: '',
            success: false,
            error: INSUFFICIENT_FUNDS_ERROR_MESSAGE,
          };
        }
        if (error.message.includes('network')) {
          return {
            txId: '',
            success: false,
            error: NETWORK_ERROR_MESSAGE,
          };
        }
        if (error.message.includes('min amount')) {
          return {
            txId: '',
            success: false,
            error: AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
          };
        }
        return {
          txId: '',
          success: false,
          error: TRADE_FAILED_ERROR_MESSAGE + error.message,
        };
      }

      return {
        txId: '',
        success: false,
        error: TRADE_FAILED_ERROR_MESSAGE + 'Unknown error occurred',
      };
    }
  }
}
