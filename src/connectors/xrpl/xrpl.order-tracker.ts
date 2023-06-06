import { Client, Wallet } from 'xrpl';
import { XRPL } from '../../chains/xrpl/xrpl';
import { getXRPLConfig } from '../../chains/xrpl/xrpl.config';
import { OrderStatus, TradeType, Order } from './xrpl.types';
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

  startTracking(): void {
    if (this._trackingId) {
      return;
    }

    this._trackingId = setInterval(() => {
      this._trackOrders();
    }, 1000);
  }

  stopTracking(): void {
    clearInterval(this._trackingId);
  }

  private async _trackOrders(): Promise<void> {
    return;
  }

  private isInflightOrder(order: Order): boolean {
    return (
      order.state === OrderStatus.OPEN ||
      order.state === OrderStatus.PARTIALLY_FILLED ||
      order.state === OrderStatus.PENDING_OPEN ||
      order.state === OrderStatus.PENDING_CANCEL
    );
  }
}
