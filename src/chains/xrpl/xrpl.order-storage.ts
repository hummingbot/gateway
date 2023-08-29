import { LocalStorage } from '../../services/local-storage';
import { ReferenceCountingCloseable } from '../../services/refcounting-closeable';
import { Order } from '../../connectors/xrpl/xrpl.types';
import { OrderStatus } from '../../connectors/xrpl/xrpl.types';

// store the order for when a transaction was initiated
// this will be used to monitor the order status when
// the order is included in the orderbook on XRP Ledger
export class XRPLOrderStorage extends ReferenceCountingCloseable {
  readonly localStorage: LocalStorage;

  protected constructor(dbPath: string) {
    super(dbPath);
    this.localStorage = LocalStorage.getInstance(dbPath, this.handle);
  }

  public async init(): Promise<void> {
    try {
      await this.localStorage.init();
    } catch (error) {
      throw new Error('Failed to initialize local storage: ' + error);
    }
  }

  public storageStatus(): string {
    return this.localStorage.dbStatus;
  }

  public async saveOrder(
    chain: string,
    network: string,
    walletAddress: string,
    order: Order
  ): Promise<void> {
    return this.localStorage.save(
      chain + '/' + network + '/' + walletAddress + '/' + order.hash,
      JSON.stringify(order)
    );
  }

  public async deleteOrder(
    chain: string,
    network: string,
    walletAddress: string,
    order: Order
  ): Promise<void> {
    return this.localStorage.del(
      chain + '/' + network + '/' + walletAddress + '/' + order.hash
    );
  }

  public async getOrders(
    chain: string,
    network: string,
    walletAddress: string
  ): Promise<Record<string, Order>> {
    return this.localStorage.get((key: string, value: string) => {
      const splitKey = key.split('/');
      if (
        splitKey.length === 4 &&
        splitKey[0] === chain &&
        splitKey[1] === network &&
        splitKey[2] === walletAddress
      ) {
        return [splitKey[3], JSON.parse(value)];
      }
      return;
    });
  }

  public async getOrdersByState(
    chain: string,
    network: string,
    walletAddress: string,
    state: OrderStatus
  ): Promise<Record<string, Order>> {
    return this.localStorage.get((key: string, value: string) => {
      const splitKey = key.split('/');
      if (
        splitKey.length === 4 &&
        splitKey[0] === chain &&
        splitKey[1] === network &&
        splitKey[2] === walletAddress
      ) {
        const order: Order = JSON.parse(value);
        if (order.state === state) {
          return [splitKey[3], order];
        }
      }
      return;
    });
  }

  public async getOrdersByMarket(
    chain: string,
    network: string,
    walletAddress: string,
    marketId: string
  ): Promise<Record<string, Order>> {
    return this.localStorage.get((key: string, value: string) => {
      const splitKey = key.split('/');
      if (
        splitKey.length === 4 &&
        splitKey[0] === chain &&
        splitKey[1] === network &&
        splitKey[2] === walletAddress
      ) {
        const order: Order = JSON.parse(value);
        if (order.marketId === marketId) {
          return [splitKey[3], order];
        }
      }
      return;
    });
  }

  // TODO: Investigate why this method is giving empty results, considering removeing it
  // public async getOrderByMarketAndHash(
  //   chain: string,
  //   network: string,
  //   walletAddress: string,
  //   marketId: string,
  //   hash: string
  // ): Promise<Record<string, Order>> {
  //   return this.localStorage.get((key: string, value: string) => {
  //     const splitKey = key.split('/');
  //     if (
  //       splitKey.length === 4 &&
  //       splitKey[0] === chain &&
  //       splitKey[1] === network &&
  //       splitKey[2] === walletAddress
  //     ) {
  //       const order: Order = JSON.parse(value);
  //       if (order.marketId === marketId && order.hash === parseInt(hash)) {
  //         return [splitKey[3], order];
  //       }
  //     }
  //     return;
  //   });
  // }

  public async getOrdersByHash(
    chain: string,
    network: string,
    walletAddress: string,
    hash: string
  ): Promise<Record<string, Order>> {
    return this.localStorage.get((key: string, value: string) => {
      const splitKey = key.split('/');
      if (
        splitKey.length === 4 &&
        splitKey[0] === chain &&
        splitKey[1] === network &&
        splitKey[2] === walletAddress &&
        splitKey[3] === hash
      ) {
        const order: Order = JSON.parse(value);
        return [splitKey[3], order];
      }
      return;
    });
  }

  public async getInflightOrders(
    chain: string,
    network: string,
    walletAddress: string
  ): Promise<Record<string, Order>> {
    return this.localStorage.get((key: string, value: string) => {
      const splitKey = key.split('/');
      if (
        splitKey.length === 4 &&
        splitKey[0] === chain &&
        splitKey[1] === network &&
        splitKey[2] === walletAddress
      ) {
        const order: Order = JSON.parse(value);
        if (
          order.state === OrderStatus.OPEN ||
          order.state === OrderStatus.PENDING_OPEN ||
          order.state === OrderStatus.PENDING_CANCEL ||
          order.state === OrderStatus.PARTIALLY_FILLED
        ) {
          return [splitKey[3], order];
        }
      }
      return;
    });
  }

  public async close(handle: string): Promise<void> {
    await super.close(handle);
    if (this.refCount < 1) {
      await this.localStorage.close(this.handle);
    }
  }
}
