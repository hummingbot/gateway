import {
  Client,
  Wallet,
  TxResponse,
  AccountTxResponse,
  rippleTimeToUnixTime,
  TransactionStream,
  TransactionMetadata,
  Transaction,
  dropsToXrp,
} from 'xrpl';
import { XRPL } from './xrpl';
import { getXRPLConfig } from './xrpl.config';
import {
  OrderStatus,
  Order,
  InflightOrders,
  TransaformedAccountTransaction,
  TransactionIntentType,
  TransactionIntent,
  AccountTransaction,
  ResponseOnlyTxInfo,
  CreatedNode,
  ModifiedNode,
} from '../../connectors/xrpl/xrpl.types';
import { OrderMutexManager } from '../../connectors/xrpl/xrpl.utils';
import {
  isModifiedNode,
  isDeletedNode,
  isCreatedNode,
} from 'xrpl/dist/npm/models/transactions/metadata';

import LRUCache from 'lru-cache';
import { XRPLOrderStorage } from './xrpl.order-storage';

// This class should:
// 1. Track orders that are created by xrpl.postOrder
// 2. Track orders that are deleted by xrpl.deleteOrder
// 3. Pool the XRP Ledger to update the inflight orders status
// 4. Provide interface to get order by states

export class OrderTracker {
  private static _instances: LRUCache<string, OrderTracker>;
  private readonly _xrpl: XRPL;
  private readonly _orderStorage: XRPLOrderStorage;
  private _wallet: Wallet;
  private _orderMutexManager: OrderMutexManager;
  private _inflightOrders: InflightOrders;
  private _isTracking: boolean;
  private _isProcessing: boolean;
  private _orderTrackingInterval: number;

  public chain: string;
  public network: string;

  private constructor(chain: string, network: string, wallet: Wallet) {
    this.chain = chain;
    this.network = network;

    this._xrpl = XRPL.getInstance(network);
    this._orderStorage = this._xrpl.orderStorage;
    this._wallet = wallet;
    this._inflightOrders = {};
    this._orderMutexManager = new OrderMutexManager(this._inflightOrders);
    this._isTracking = false;
    this._isProcessing = false;
    // set tracking interval to 1 seconds
    this._orderTrackingInterval = 1000;
    this.startTracking();
  }

  public static getInstance(
    chain: string,
    network: string,
    wallet: Wallet
  ): OrderTracker {
    if (OrderTracker._instances === undefined) {
      const config = getXRPLConfig(chain, network);
      OrderTracker._instances = new LRUCache<string, OrderTracker>({
        max: config.network.maxLRUCacheInstances,
      });
    }
    const instanceKey = chain + network + wallet.classicAddress;
    if (!OrderTracker._instances.has(instanceKey)) {
      OrderTracker._instances.set(
        instanceKey,
        new OrderTracker(chain, network, wallet)
      );
    }

    return OrderTracker._instances.get(instanceKey) as OrderTracker;
  }

  public get wallet(): Wallet {
    return this._wallet;
  }

  public get isTracking(): boolean {
    return this._isTracking;
  }

  public async addOrder(order: Order): Promise<void> {
    this._inflightOrders[order.hash] = order;

    // Check if isProcessing is on, if so, wait until it's done
    while (this._isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Mark isProcessing as true
    this._isProcessing = true;

    // save inflightOrders to DB
    await this.saveInflightOrdersToDB();

    // Mark isProcessing as false
    this._isProcessing = false;
  }

  public getOrder(hash: number): Order | undefined {
    return this._inflightOrders[hash];
  }

  async saveInflightOrdersToDB(): Promise<void> {
    await Promise.all(
      Object.keys(this._inflightOrders).map(async (hash) => {
        await this._orderStorage.saveOrder(
          this.chain,
          this.network,
          this._wallet.classicAddress,
          this._inflightOrders[parseInt(hash)]
        );
      })
    );
  }

  public async loadInflightOrders(): Promise<void> {
    const orders = await this._orderStorage.getInflightOrders(
      this.chain,
      this.network,
      this._wallet.classicAddress
    );

    Object.keys(orders).forEach((hash) => {
      this._inflightOrders[parseInt(hash)] = orders[parseInt(hash)];
    });
    this._orderMutexManager.updateOrders(this._inflightOrders);
  }

  public async startTracking(): Promise<void> {
    if (this._isTracking) {
      return;
    }

    this._isTracking = true;

    await this._xrpl.ensureConnection();
    await this.loadInflightOrders();

    const client = this._xrpl.client;

    client.on('transaction', async (event) => {
      // Check if isProcessing is on, if so, wait until it's done
      while (this._isProcessing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Mark isProcessing as true
      this._isProcessing = true;

      const updatedOrders = await this.processTransactionStream(
        this._inflightOrders,
        event,
        this._orderMutexManager
      );

      // merge updateOrders with inflightOrders
      Object.keys(updatedOrders).forEach((hash) => {
        this._inflightOrders[parseInt(hash)] = updatedOrders[parseInt(hash)];
      });

      this._orderMutexManager.updateOrders(this._inflightOrders);

      // Save inflightOrders to DB
      await this.saveInflightOrdersToDB();

      // Mark isProcessing as false
      this._isProcessing = false;
    });

    await client.request({
      command: 'subscribe',
      accounts: [this._wallet.classicAddress],
    });

    while (this._isTracking) {
      // Make sure connection is good
      await this._xrpl.ensureConnection();

      // Check if isProcessing is on, if so, wait until it's done
      while (this._isProcessing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Mark isProcessing as true
      this._isProcessing = true;

      // Check inflightOrders
      const updatedOrders = await this.checkOpenOrders(
        this._inflightOrders,
        this._wallet.classicAddress,
        client,
        this._orderMutexManager
      );

      // merge updateOrders with inflightOrders
      Object.keys(updatedOrders).forEach((hash) => {
        this._inflightOrders[parseInt(hash)] = updatedOrders[parseInt(hash)];
      });

      // Update mutex manager
      this._orderMutexManager.updateOrders(this._inflightOrders);
      // Save inflightOrders to DB
      await this.saveInflightOrdersToDB();

      // Mark isProcessing as false
      this._isProcessing = false;

      // Wait for next interval
      await new Promise((resolve) =>
        setTimeout(resolve, this._orderTrackingInterval)
      );
    }
  }

  public async stopTracking(): Promise<void> {
    this._isTracking = false;
    const client = this._xrpl.client;
    client.removeAllListeners('transaction');

    if (client.isConnected()) {
      await client.request({
        command: 'unsubscribe',
        accounts: [this._wallet.classicAddress],
      });
    }
  }

  public static async stopTrackingOnAllInstances(): Promise<void> {
    const instances = OrderTracker._instances;
    if (instances === undefined) {
      return;
    }

    await Promise.all(
      Array.from(instances.values()).map(async (instance) => {
        await instance.stopTracking();
      })
    );
  }

  public static async stopTrackingOnAllInstancesForNetwork(
    network: string
  ): Promise<void> {
    const instances = OrderTracker._instances;
    if (instances === undefined) {
      return;
    }

    await Promise.all(
      Array.from(instances.values()).map(async (instance) => {
        if (instance.network === network) {
          await instance.stopTracking();
        }
      })
    );
  }

  async checkOpenOrders(
    openOrders: InflightOrders,
    account: string,
    client: Client,
    omm: OrderMutexManager
  ) {
    // TODO
    // 1. Get the minLedgerIndex from the inflightOrders
    // 2. Get the transactions stack based on minLedgerIndex and account id
    // 3. Process the transactions stack
    // 4. Update the inflightOrders
    const ordersToCheck: InflightOrders = openOrders;

    // 1. Get the minLedgerIndex from the inflightOrders
    const hashes = Object.keys(ordersToCheck);
    let minLedgerIndex = await this._xrpl.getCurrentLedgerIndex();
    for (const hash of hashes) {
      if (ordersToCheck[parseInt(hash)].updatedAtLedgerIndex < minLedgerIndex) {
        minLedgerIndex = ordersToCheck[parseInt(hash)].updatedAtLedgerIndex;
      }
    }

    // 2. Get the transactions stack based on minLedgerIndex and account id
    const txStack = await this.getTransactionsStack(
      client,
      account,
      minLedgerIndex
    );

    // 3. Process the transactions stack
    if (txStack === null) {
      return ordersToCheck;
    }

    if (txStack.result?.transactions === undefined) {
      return ordersToCheck;
    }

    const transactionStack = txStack.result.transactions;
    transactionStack.reverse();

    for (const tx of transactionStack) {
      const transformedTx = this.transformAccountTransaction(tx);

      if (transformedTx === null) {
        continue;
      }

      const updatedOrders = await this.processTransactionStream(
        ordersToCheck,
        transformedTx,
        omm
      );

      // merge updateOrders to ordersToCheck
      Object.keys(updatedOrders).forEach((hash) => {
        ordersToCheck[parseInt(hash)] = updatedOrders[parseInt(hash)];
      });
    }

    return ordersToCheck;
  }

  async processTransactionStream(
    inflightOrders: InflightOrders,
    transaction: TransactionStream | TransaformedAccountTransaction,
    omm: OrderMutexManager
  ): Promise<InflightOrders> {
    // TODO: Extend this function to handle multiple intents
    const transactionIntents = await this.getTransactionIntentsFromStream(
      this.wallet.classicAddress,
      transaction
    );

    const ordersToCheck = inflightOrders;
    // console.log('Transaction intent: ');
    // console.log(inspect(transactionIntent, { colors: true, depth: null }));

    if (transactionIntents.length === 0) {
      // console.log('No intent found!');
      return ordersToCheck;
    }

    for (const intent of transactionIntents) {
      if (intent.sequence === undefined) {
        continue;
      }

      const matchOrder = ordersToCheck[intent.sequence];

      if (matchOrder === undefined) {
        // console.log('No match order found!');
        continue;
      }

      // Wait until the order is not locked
      while (omm.isLocked(matchOrder.hash)) {
        // console.log('Order is locked! Wait for 300ms');
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Lock the order
      omm.lock(matchOrder.hash);

      matchOrder.updatedAt = transaction.transaction.date
        ? rippleTimeToUnixTime(transaction.transaction.date)
        : 0;
      matchOrder.updatedAtLedgerIndex = transaction.ledger_index ?? 0;

      // Find if transaction.transaction.hash already in associatedTxns, if not, then push it
      const foundIndex = matchOrder.associatedTxns.findIndex((hash) => {
        return hash === intent.tx.transaction.hash;
      });

      if (foundIndex === -1) {
        matchOrder.associatedTxns.push(intent.tx.transaction.hash ?? 'UNKNOWN');
      } else {
        // console.log('Transaction already found!');
      }

      let filledAmount = 0.0;
      let node: CreatedNode | ModifiedNode;
      let fields: any;

      switch (intent.type) {
        case TransactionIntentType.OFFER_CREATE_FINALIZED:
          // console.log('Offer create finalized!');
          if (matchOrder.state === OrderStatus.PENDING_OPEN) {
            matchOrder.state = OrderStatus.OPEN;
          }
          break;

        case TransactionIntentType.OFFER_CANCEL_FINALIZED:
          // console.log('Offer cancel finalized!');
          matchOrder.state = OrderStatus.CANCELED;
          break;

        case TransactionIntentType.OFFER_PARTIAL_FILL:
          // console.log('Offer partial fill!');
          matchOrder.state = OrderStatus.PARTIALLY_FILLED;

          if (intent.node === undefined) {
            // console.log('No node found!');
            break;
          }

          node = intent.node as CreatedNode | ModifiedNode;

          if (isCreatedNode(node)) {
            fields = node.CreatedNode.NewFields;
          } else {
            fields = node.ModifiedNode.FinalFields;
          }

          // Update filled amount
          if (matchOrder.tradeType === 'SELL') {
            if (typeof fields.TakerGets === 'string') {
              filledAmount =
                parseFloat(matchOrder.amount) -
                parseFloat(dropsToXrp(fields.TakerGets as string));
            } else {
              filledAmount =
                parseFloat(matchOrder.amount) -
                parseFloat(fields.TakerGets.value as string);
            }
          }

          if (matchOrder.tradeType === 'BUY') {
            if (typeof fields.TakerPays === 'string') {
              filledAmount =
                parseFloat(matchOrder.amount) -
                parseFloat(dropsToXrp(fields.TakerPays as string));
            } else {
              filledAmount =
                parseFloat(matchOrder.amount) -
                parseFloat(fields.TakerPays.value as string);
            }
          }

          // console.log('Filled amount: ', filledAmount);
          matchOrder.filledAmount = filledAmount.toString();
          break;

        case TransactionIntentType.OFFER_FILL:
          matchOrder.state = OrderStatus.FILLED;
          matchOrder.filledAmount = matchOrder.amount;
          break;

        case TransactionIntentType.OFFER_EXPIRED_OR_UNFUNDED:
          matchOrder.state = OrderStatus.OFFER_EXPIRED_OR_UNFUNDED;
          break;

        case TransactionIntentType.UNKNOWN:
          matchOrder.state = OrderStatus.UNKNOWN;
          break;
      }

      // Check matchOrder value
      // console.log('Updated matchOrder: ');
      // console.log(inspect(matchOrder, { colors: true, depth: null }));

      // Update ordersToCheck
      ordersToCheck[matchOrder.hash] = matchOrder;

      // Release the lock
      omm.release(matchOrder.hash);
    }

    return ordersToCheck;
  }

  // Utility methods
  async getTransactionIntentsFromStream(
    walletAddress: string,
    transaction: TransactionStream | TransaformedAccountTransaction
  ): Promise<TransactionIntent[]> {
    const transactionType = transaction.transaction.TransactionType;
    const intents: TransactionIntent[] = [];

    if (transaction.transaction.Sequence === undefined) {
      return [
        {
          type: TransactionIntentType.UNKNOWN,
          sequence: 0,
          tx: transaction,
        },
      ];
    }

    if (transaction.meta === undefined) {
      return [
        {
          type: TransactionIntentType.UNKNOWN,
          sequence: transaction.transaction.Sequence,
          tx: transaction,
        },
      ];
    }

    if (transaction.transaction.Account !== walletAddress) {
      // console.log('Transaction is not from wallet!');
      switch (transactionType) {
        case 'OfferCreate':
          for (const affnode of transaction.meta.AffectedNodes) {
            if (isModifiedNode(affnode)) {
              if (affnode.ModifiedNode.LedgerEntryType == 'Offer') {
                // Usually a ModifiedNode of type Offer indicates a previous Offer that
                // was partially consumed by this one.
                if (affnode.ModifiedNode.FinalFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.Sequence,
                    tx: transaction,
                    node: affnode,
                  });
                }

                const finalFields = affnode.ModifiedNode.FinalFields as any;

                intents.push({
                  type: TransactionIntentType.OFFER_PARTIAL_FILL,
                  sequence: finalFields.Sequence as number,
                  tx: transaction,
                  node: affnode,
                });
              }
            } else if (isDeletedNode(affnode)) {
              if (affnode.DeletedNode.LedgerEntryType == 'Offer') {
                // The removed Offer may have been fully consumed, or it may have been
                // found to be expired or unfunded.
                if (affnode.DeletedNode.FinalFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.Sequence,
                    tx: transaction,
                    node: affnode,
                  });
                }

                const finalFields = affnode.DeletedNode.FinalFields as any;

                intents.push({
                  type: TransactionIntentType.OFFER_FILL,
                  sequence: finalFields.Sequence as number,
                  tx: transaction,
                  node: affnode,
                });
              }
            }
          }
          break;
      }
    } else {
      // console.log('Transaction is from wallet!');
      let consumedNodeCount = 0;
      let createNodeCount = 0;
      let deleteNodeCount = 0;

      switch (transactionType) {
        case 'OfferCreate':
          for (const affnode of transaction.meta.AffectedNodes) {
            if (isModifiedNode(affnode)) {
              if (affnode.ModifiedNode.LedgerEntryType == 'Offer') {
                // Usually a ModifiedNode of type Offer indicates a previous Offer that
                // was partially consumed by this one.

                if (affnode.ModifiedNode.FinalFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.Sequence,
                    tx: transaction,
                    node: affnode,
                  });
                }

                const finalFields = affnode.ModifiedNode.FinalFields as any;
                intents.push({
                  type: TransactionIntentType.OFFER_PARTIAL_FILL,
                  sequence: finalFields.Sequence as number,
                  tx: transaction,
                  node: affnode,
                });
                consumedNodeCount++;
              }
            } else if (isDeletedNode(affnode)) {
              if (affnode.DeletedNode.LedgerEntryType == 'Offer') {
                // The removed Offer may have been fully consumed, or it may have been
                // found to be expired or unfunded.
                if (affnode.DeletedNode.FinalFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.Sequence,
                    tx: transaction,
                    node: affnode,
                  });
                } else {
                  const finalFields = affnode.DeletedNode.FinalFields as any;

                  if (finalFields.Account === walletAddress) {
                    const replacingOfferSequnce =
                      transaction.transaction.OfferSequence;

                    if (finalFields.Sequence !== replacingOfferSequnce) {
                      intents.push({
                        type: TransactionIntentType.OFFER_EXPIRED_OR_UNFUNDED,
                        sequence: finalFields.Sequence as number,
                        tx: transaction,
                        node: affnode,
                      });
                    } else {
                      intents.push({
                        type: TransactionIntentType.OFFER_CANCEL_FINALIZED,
                        sequence: finalFields.Sequence as number,
                        tx: transaction,
                        node: affnode,
                      });
                    }
                  } else {
                    intents.push({
                      type: TransactionIntentType.OFFER_FILL,
                      sequence: finalFields.Sequence as number,
                      tx: transaction,
                      node: affnode,
                    });
                    consumedNodeCount++;
                  }
                }
              }
            } else if (isCreatedNode(affnode)) {
              if (affnode.CreatedNode.LedgerEntryType == 'Offer') {
                if (affnode.CreatedNode.NewFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.Sequence,
                    tx: transaction,
                    node: affnode,
                  });
                } else {
                  const newFields = affnode.CreatedNode.NewFields as any;
                  if (consumedNodeCount > 0) {
                    intents.push({
                      type: TransactionIntentType.OFFER_PARTIAL_FILL,
                      sequence: newFields.Sequence,
                      tx: transaction,
                      node: affnode,
                    });
                  } else {
                    intents.push({
                      type: TransactionIntentType.OFFER_CREATE_FINALIZED,
                      sequence: newFields.Sequence,
                      tx: transaction,
                      node: affnode,
                    });
                  }
                  createNodeCount++;
                }
              }
            }
          }

          if (createNodeCount === 0) {
            if (consumedNodeCount > 0) {
              intents.push({
                type: TransactionIntentType.OFFER_FILL,
                sequence: transaction.transaction.Sequence,
                tx: transaction,
              });
            } else {
              intents.push({
                type: TransactionIntentType.UNKNOWN,
                sequence: transaction.transaction.Sequence,
                tx: transaction,
              });
            }
          }
          break;

        case 'OfferCancel':
          for (const affnode of transaction.meta.AffectedNodes) {
            if (isDeletedNode(affnode)) {
              if (affnode.DeletedNode.LedgerEntryType == 'Offer') {
                if (affnode.DeletedNode.FinalFields === undefined) {
                  intents.push({
                    type: TransactionIntentType.UNKNOWN,
                    sequence: transaction.transaction.OfferSequence,
                    tx: transaction,
                    node: affnode,
                  });
                } else {
                  const finalFields = affnode.DeletedNode.FinalFields as any;

                  if (finalFields.Account === walletAddress) {
                    intents.push({
                      type: TransactionIntentType.OFFER_CANCEL_FINALIZED,
                      sequence: finalFields.Sequence as number,
                      tx: transaction,
                      node: affnode,
                    });
                    deleteNodeCount++;
                  }
                }
              }
            }
          }

          if (deleteNodeCount === 0) {
            intents.push({
              type: TransactionIntentType.UNKNOWN,
              sequence: transaction.transaction.OfferSequence,
              tx: transaction,
            });
          }
          break;
      }
    }

    return intents;
  }
  async getTransaction(
    client: Client,
    txHash: string
  ): Promise<TxResponse | null> {
    if (txHash === '') {
      return null;
    }

    const tx_resp = await client.request({
      command: 'tx',
      transaction: txHash,
      binary: false,
    });

    const result = tx_resp;

    return result;
  }

  async getTransactionsStack(
    client: Client,
    account: string,
    minLedgerIndex: number
  ): Promise<AccountTxResponse | null> {
    if (account === '') {
      return null;
    }

    const tx_resp: AccountTxResponse = await client.request({
      command: 'account_tx',
      account: account,
      ledger_index_min: minLedgerIndex,
      binary: false,
    });

    const result = tx_resp;

    return result;
  }

  transformAccountTransaction(
    transaction: AccountTransaction
  ): TransaformedAccountTransaction | null {
    if (typeof transaction.meta === 'string') {
      return null;
    }

    if (transaction.tx === undefined) {
      return null;
    }

    const transformedTx: TransaformedAccountTransaction = {
      ledger_index: transaction.tx.ledger_index ?? 0,
      meta: transaction.meta as TransactionMetadata,
      transaction: transaction.tx as Transaction & ResponseOnlyTxInfo,
      tx_blob: transaction.tx_blob,
      validated: transaction.validated,
    };

    return transformedTx;
  }
}
