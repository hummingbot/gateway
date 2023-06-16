import {
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';
import { BigNumber, utils, Wallet } from 'ethers';
import LRUCache from 'lru-cache';
import { env } from 'process';
import { Ethereumish } from '../../services/common-interfaces';
import { logger } from '../../services/logger';

/**
 * This class is used to broadcast transactions
 * using a signer for the transactions and
 *  and broadcasting the transactions directly
 * in series to the node.
 *
 * Mainly used for working in a Node Environment
 */
export class EVMTxBroadcaster {
  private _chain: Ethereumish;
  private _isBlocked: boolean;
  private _txQueue: TransactionRequest[];
  private static _instances: LRUCache<string, EVMTxBroadcaster>;
  private _wallet_address: string;
  private _wallet: Wallet | undefined;

  constructor(chain: Ethereumish, wallet_address: string) {
    this._chain = chain;
    this._wallet_address = wallet_address;
    this._isBlocked = false;
    this._txQueue = [];
  }

  public static getInstance(
    chain: Ethereumish,
    wallet_address: string
  ): EVMTxBroadcaster {
    if (EVMTxBroadcaster._instances === undefined) {
      EVMTxBroadcaster._instances = new LRUCache<string, EVMTxBroadcaster>({
        max: 50,
      });
    }
    const instanceKey = chain.chainName + chain.chainId + wallet_address;
    if (!EVMTxBroadcaster._instances.has(instanceKey)) {
      EVMTxBroadcaster._instances.set(
        instanceKey,
        new EVMTxBroadcaster(chain, wallet_address)
      );
    }

    return EVMTxBroadcaster._instances.get(instanceKey) as EVMTxBroadcaster;
  }

  isNextTx(tx: TransactionRequest): boolean {
    return !this._isBlocked && tx === this._txQueue[0];
  }

  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Broadcasting the transaction using the client
   *
   * @param transaction
   * @returns {string} transaction hash
   */
  async broadcast(
    transaction: TransactionRequest,
    nonce?: number
  ): Promise<TransactionResponse> {
    let txResponse: TransactionResponse = {
      hash: '',
      confirmations: 0,
      from: '',
      wait: function (
        confirmations?: number | undefined
      ): Promise<TransactionReceipt> {
        throw new Error(confirmations + 'Function not implemented.');
      },
      nonce: 0,
      gasLimit: BigNumber.from('0'),
      data: '',
      value: BigNumber.from('0'),
      chainId: 0,
    };

    this._txQueue.push(transaction);

    try {
      while (!this.isNextTx(transaction)) {
        await this.sleep(10); // sleep
      }
      this._isBlocked = true;

      /** Prepare the Transaction * */
      const currentNonce = await this._chain.nonceManager.getNextNonce(
        this._wallet_address
      );
      txResponse = await this.createAndSend(
        transaction,
        nonce ? nonce : currentNonce
      );

      await this._chain.nonceManager.commitNonce(
        this._wallet_address,
        currentNonce
      );
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.includes('current nonce (')) {
          const expectedSequence = Number(
            e.message.split('current nonce (')[1].split(')')[0]
          );
          logger.info(`Expected nonce: ${expectedSequence}`);
          await this._chain.nonceManager.overridePendingNonce(
            this._wallet_address,
            expectedSequence
          );
          txResponse = await this.createAndSend(transaction, expectedSequence);
        } else {
          logger.error(e.message);
          throw e;
        }
      }
    } finally {
      this._txQueue.shift();
      this._isBlocked = false;
    }
    if (env.DEBUG) logger.error(await this.getRevertReason(txResponse));
    return txResponse;
  }

  async createAndSend(
    tx: TransactionRequest,
    nonce: number
  ): Promise<TransactionResponse> {
    tx.nonce = nonce;
    if (this._wallet === undefined)
      this._wallet = await this._chain.getWallet(this._wallet_address);

    /** Broadcast transaction */
    return await this._wallet.sendTransaction(tx);
  }

  async getRevertReason(err: any) {
    let reason;
    try {
      await err.wait();
    } catch (error: any) {
      if (!error.transaction) {
        logger.error('getRevertReason: error.transaction is undefined');
      } else {
        // https://gist.github.com/gluk64/fdea559472d957f1138ed93bcbc6f78a
        const code = await this._chain.provider.call(
          error.transaction,
          error.blockNumber || error.receipt.blockNumber
        );
        reason = utils.toUtf8String('0x' + code.substring(138));
        const i = reason.indexOf('0'); // delete all null characters after the
        if (i > -1) {
          return reason.substring(0, i);
        }
      }
    }
    return reason;
  }
}
