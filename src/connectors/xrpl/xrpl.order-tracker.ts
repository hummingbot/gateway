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
  // TradeType,
  Order,
  InflightOrders,
  OrderLocks,
  TransaformedAccountTransaction,
  TransactionIntentType,
  TransactionIntent,
  AccountTransaction,
  ResponseOnlyTxInfo,
} from './xrpl.types';
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

  public chain: string;
  public network: string;

  private constructor(chain: string, network: string, wallet: Wallet) {
    this.chain = chain;
    this.network = network;

    this._xrpl = XRPL.getInstance(network);
    this._orderStorage = this._xrpl.orderStorage;
    this._wallet = wallet;
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

  public async saveOrder(order: Order): Promise<void> {
    this._orderStorage.saveOrder(
      this.chain,
      this.network,
      this._wallet.classicAddress,
      order
    );
  }

  public async deleteOrder(order: Order): Promise<void> {
    this._orderStorage.deleteOrder(
      this.chain,
      this.network,
      this._wallet.classicAddress,
      order
    );
  }

  public async getOrdersByState(
    state: OrderStatus
  ): Promise<Record<string, Order>> {
    return this._orderStorage.getOrdersByState(
      this.chain,
      this.network,
      this._wallet.classicAddress,
      state
    );
  }

  // TODO: Start implementing order tracker!

  // startTracking(): void {
  //   if (this._trackingId) {
  //     return;
  //   }

  //   this._trackingId = setInterval(() => {
  //     this._trackOrders();
  //   }, 1000);
  // }

  // stopTracking(): void {
  //   clearInterval(this._trackingId);
  // }

  // private async _trackOrders(): Promise<void> {
  //   return;
  // }

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

  async checkOpenOrder(
    inflightOrders: InflightOrders,
    account: string,
    client: Client,
    omm: OrderMutexManager
  ) {
    // TODO
    // 1. Get the minLedgerIndex from the inflightOrders
    // 2. Get the transactions stack based on minLedgerIndex and account id
    // 3. Process the transactions stack
    // 4. Update the inflightOrders

    // 1. Get the minLedgerIndex from the inflightOrders
    const hashes = Object.keys(inflightOrders);
    let minLedgerIndex = 0;
    for (const hash of hashes) {
      if (
        inflightOrders[parseInt(hash)].updatedAtLedgerIndex > minLedgerIndex
      ) {
        minLedgerIndex = inflightOrders[parseInt(hash)].updatedAtLedgerIndex;
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
      return inflightOrders;
    }

    if (txStack.result?.transactions === undefined) {
      return inflightOrders;
    }

    for (const tx of txStack.result.transactions) {
      const transformedTx = this.transformAccountTransaction(tx);

      if (transformedTx === null) {
        continue;
      }

      const updatedOrders = await this.processTransactionStream(
        inflightOrders,
        transformedTx,
        omm
      );

      // merge updateOrders with inflightOrders
      Object.keys(updatedOrders).forEach((hash) => {
        inflightOrders[parseInt(hash)] = updatedOrders[parseInt(hash)];
      });
    }
  }

  async processTransactionStream(
    inflightOrders: InflightOrders,
    transaction: TransactionStream | TransaformedAccountTransaction,
    omm: OrderMutexManager
  ): Promise<InflightOrders> {
    const transactionIntent = await this.getTransactionIntentFromStream(
      transaction
    );
    // console.log('Transaction intent: ');
    // console.log(inspect(transactionIntent, { colors: true, depth: null }));

    if (transactionIntent.sequence === undefined) {
      console.log('No sequence found!');
      return inflightOrders;
    }

    const matchOrder = inflightOrders[transactionIntent.sequence];

    if (matchOrder === undefined) {
      console.log('No match order found!');
      return inflightOrders;
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

    // Update inflightOrders
    inflightOrders[matchOrder.hash] = matchOrder;

    // Release the lock
    omm.release(matchOrder.hash);

    return inflightOrders;
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

class OrderMutexManager {
  private locks: OrderLocks = {};
  private orders: InflightOrders = {}; // orders to manage

  constructor(ordersToManage: InflightOrders) {
    this.orders = ordersToManage;

    Object.keys(this.orders).forEach((hash) => {
      this.locks[parseInt(hash)] = false;
    });
  }

  // lock an order by hash
  lock(hash: number) {
    this.locks[hash] = true;
  }

  // release an order by hash
  release(hash: number) {
    this.locks[hash] = false;
  }

  // reset all locks
  reset() {
    Object.keys(this.orders).forEach((hash) => {
      this.locks[parseInt(hash)] = false;
    });
  }

  // update orders list and locks
  updateOrders(orders: InflightOrders) {
    this.orders = orders;
    this.reset();
  }

  // get lock satus of an order by hash
  isLocked(hash: number) {
    return this.locks[hash];
  }
}
