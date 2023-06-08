import {
  Client,
  Wallet,
  TxResponse,
  AccountTxResponse,
  rippleTimeToUnixTime,
  TransactionStream,
  TransactionMetadata,
  Transaction,
} from 'xrpl';
import { XRPL } from '../../chains/xrpl/xrpl';
import { getXRPLConfig } from '../../chains/xrpl/xrpl.config';
import {
  OrderStatus,
  Order,
  InflightOrders,
  TransaformedAccountTransaction,
  TransactionIntentType,
  TransactionIntent,
  AccountTransaction,
  ResponseOnlyTxInfo,
} from './xrpl.types';
import { OrderMutexManager } from './xrpl.utils';
import {
  isModifiedNode,
  isDeletedNode,
} from 'xrpl/dist/npm/models/transactions/metadata';

import LRUCache from 'lru-cache';
import { XRPLOrderStorage } from '../../chains/xrpl/xrpl.order-storage';

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
    // set tracking interval to 10 seconds
    this._orderTrackingInterval = 10000;
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

  public addOrder(order: Order): void {
    this._inflightOrders[order.hash] = order;
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
    });

    await client.request({
      command: 'subscribe',
      accounts: [this._wallet.classicAddress],
    });

    while (this._isTracking) {
      // Make sure connection is good
      await this._xrpl.ensureConnection();

      // Check pending inflightOrders
      const hashes = Object.keys(this._inflightOrders);
      for (const hash of hashes) {
        this._inflightOrders[parseInt(hash)] = await this.checkPendingOrder(
          client,
          this._inflightOrders[parseInt(hash)],
          this._orderMutexManager
        );
      }

      // Check open inflightOrders
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

  async checkPendingOrder(
    client: Client,
    order: Order,
    omm: OrderMutexManager
  ): Promise<Order> {
    // Check if order is canceled
    // Check if order is open
    let result: Order = order;
    const currentLedgerIndex = await client.getLedgerIndex();

    // If order state is not pending open or pending cancel, then return
    if (
      order.state !== OrderStatus.PENDING_OPEN &&
      order.state !== OrderStatus.PENDING_CANCEL
    ) {
      return order;
    }

    // If order currentLedgerIndex is less than or equal than order createdAtLedgerIndex, then return
    if (currentLedgerIndex <= order.updatedAtLedgerIndex) {
      return order;
    }

    // Wait until the order is not locked
    while (omm.isLocked(order.hash)) {
      console.log('Order is locked! Wait for 300ms');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Lock the order
    omm.lock(order.hash);

    // If order state is pending open, check if order is open
    if (order.state === OrderStatus.PENDING_OPEN) {
      const latestTxnResp = await this.getTransaction(
        client,
        order.associatedTxns[0] || ''
      );
      if (typeof latestTxnResp?.result.meta === 'string') {
        result = order;
      } else if (
        latestTxnResp?.result.meta?.TransactionResult === 'tesSUCCESS'
      ) {
        result = {
          ...order,
          state: OrderStatus.OPEN,
          updatedAt: latestTxnResp?.result.date
            ? rippleTimeToUnixTime(latestTxnResp?.result.date)
            : 0,
          updatedAtLedgerIndex: latestTxnResp?.result.ledger_index ?? 0,
        };
        console.log('Order opened!');
      } else {
        // Handle other cases here
        // https://xrpl.org/transaction-results.html
        result = order;
      }
    }

    // If order state is pending cancel, check if order is canceled
    if (order.state === OrderStatus.PENDING_CANCEL) {
      const latestTxnResp = await this.getTransaction(
        client,
        order.associatedTxns[order.associatedTxns.length - 1] || ''
      );
      if (typeof latestTxnResp?.result.meta === 'string') {
        result = order;
      } else if (
        latestTxnResp?.result.meta?.TransactionResult === 'tesSUCCESS'
      ) {
        result = {
          ...order,
          state: OrderStatus.CANCELED,
          updatedAt: latestTxnResp?.result.date
            ? rippleTimeToUnixTime(latestTxnResp?.result.date)
            : 0,
          updatedAtLedgerIndex: latestTxnResp?.result.ledger_index ?? 0,
        };
        console.log('Order canceled!');
      } else {
        // Handle other cases here
        // https://xrpl.org/transaction-results.html
        result = order;
      }
    }

    // Release the lock
    omm.release(order.hash);

    return result;
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
    let minLedgerIndex = 0;
    for (const hash of hashes) {
      if (ordersToCheck[parseInt(hash)].updatedAtLedgerIndex > minLedgerIndex) {
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

    for (const tx of txStack.result.transactions) {
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
    const transactionIntent = await this.getTransactionIntentFromStream(
      transaction
    );
    const ordersToCheck = inflightOrders;
    // console.log('Transaction intent: ');
    // console.log(inspect(transactionIntent, { colors: true, depth: null }));

    if (transactionIntent.sequence === undefined) {
      console.log('No sequence found!');
      return ordersToCheck;
    }

    const matchOrder = ordersToCheck[transactionIntent.sequence];

    if (matchOrder === undefined) {
      console.log('No match order found!');
      return ordersToCheck;
    }

    // Wait until the order is not locked
    while (omm.isLocked(matchOrder.hash)) {
      console.log('Order is locked! Wait for 300ms');
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
      return hash === transaction.transaction.hash;
    });

    if (foundIndex === -1) {
      matchOrder.associatedTxns.push(transaction.transaction.hash ?? 'UNKNOWN');
    } else {
      console.log('Transaction already found!');
    }

    switch (transactionIntent.type) {
      case TransactionIntentType.OFFER_CREATE_FINALIZED:
        console.log('Offer create finalized!');
        matchOrder.state = OrderStatus.OPEN;
        break;

      case TransactionIntentType.OFFER_CANCEL_FINALIZED:
        console.log('Offer cancel finalized!');
        matchOrder.state = OrderStatus.CANCELED;
        break;

      case TransactionIntentType.OFFER_PARTIAL_FILL:
        console.log('Offer partial fill!');
        matchOrder.state = OrderStatus.PARTIALLY_FILLED;

        if (transaction.meta === undefined) {
          console.log('No meta found!');
          break;
        }

        for (const affnode of transaction.meta.AffectedNodes) {
          if (isModifiedNode(affnode)) {
            console.log('Modified node found!');
            if (affnode.ModifiedNode.LedgerEntryType == 'Offer') {
              // Usually a ModifiedNode of type Offer indicates a previous Offer that
              // was partially consumed by this one.
              if (affnode.ModifiedNode.FinalFields === undefined) {
                console.log('No final fields found!');
                break;
              }

              const finalFields = affnode.ModifiedNode.FinalFields as any;
              let filledAmount = 0.0;

              // Update filled amount
              if (matchOrder.tradeType === 'SELL') {
                if (typeof finalFields.TakerGets === 'string') {
                  filledAmount =
                    parseFloat(matchOrder.amount) -
                    parseFloat(finalFields.TakerGets as string);
                } else {
                  filledAmount =
                    parseFloat(matchOrder.amount) -
                    parseFloat(finalFields.TakerGets.value as string);
                }
              }

              if (matchOrder.tradeType === 'BUY') {
                if (typeof finalFields.TakerPays === 'string') {
                  filledAmount =
                    parseFloat(matchOrder.amount) -
                    parseFloat(finalFields.TakerPays as string);
                } else {
                  filledAmount =
                    parseFloat(matchOrder.amount) -
                    parseFloat(finalFields.TakerPays.value as string);
                }
              }

              console.log('Filled amount: ', filledAmount);
              matchOrder.filledAmount = filledAmount.toString();
              break;
            }
          }
        }
        break;

      case TransactionIntentType.OFFER_FILL:
        matchOrder.state = OrderStatus.FILLED;
        matchOrder.filledAmount = matchOrder.amount;
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

    return ordersToCheck;
  }

  // Utility methods
  async getTransactionIntentFromStream(
    transaction: TransactionStream | TransaformedAccountTransaction
  ): Promise<TransactionIntent> {
    const transactionType = transaction.transaction.TransactionType;

    if (transaction.transaction.Sequence === undefined) {
      return { type: TransactionIntentType.UNKNOWN };
    }

    if (transaction.meta === undefined) {
      return { type: TransactionIntentType.UNKNOWN };
    }

    switch (transactionType) {
      case 'OfferCreate':
        // return { type:  TransactionIntentType.OFFER_CREATE_FINALIZED, hash: transaction.transaction.Sequence };
        for (const affnode of transaction.meta.AffectedNodes) {
          if (isModifiedNode(affnode)) {
            if (affnode.ModifiedNode.LedgerEntryType == 'Offer') {
              // Usually a ModifiedNode of type Offer indicates a previous Offer that
              // was partially consumed by this one.
              if (affnode.ModifiedNode.FinalFields === undefined) {
                return { type: TransactionIntentType.UNKNOWN };
              }

              return {
                type: TransactionIntentType.OFFER_PARTIAL_FILL,
                sequence: affnode.ModifiedNode.FinalFields.Sequence as number,
              };
            }
          } else if (isDeletedNode(affnode)) {
            if (affnode.DeletedNode.LedgerEntryType == 'Offer') {
              // The removed Offer may have been fully consumed, or it may have been
              // found to be expired or unfunded.
              if (affnode.DeletedNode.FinalFields === undefined) {
                return { type: TransactionIntentType.UNKNOWN };
              }

              return {
                type: TransactionIntentType.OFFER_FILL,
                sequence: affnode.DeletedNode.FinalFields.Sequence as number,
              };
            }
          } else {
            return {
              type: TransactionIntentType.OFFER_CREATE_FINALIZED,
              sequence: transaction.transaction.Sequence,
            };
          }
        }
        break;

      case 'OfferCancel':
        return {
          type: TransactionIntentType.OFFER_CANCEL_FINALIZED,
          sequence: transaction.transaction.OfferSequence,
        };
    }

    return { type: TransactionIntentType.UNKNOWN };
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
      ledger_index: transaction.ledger_index,
      meta: transaction.meta as TransactionMetadata,
      transaction: transaction.tx as Transaction & ResponseOnlyTxInfo,
      tx_blob: transaction.tx_blob,
      validated: transaction.validated,
    };

    return transformedTx;
  }
}
