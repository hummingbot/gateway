import { InflightOrders, OrderLocks } from './xrpl.types';  

export class OrderMutexManager {
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

  // add new orders to manage
  addOrders(orders: InflightOrders) {
    Object.keys(orders).forEach((hash) => {
      this.orders[parseInt(hash)] = orders[parseInt(hash)];
      this.locks[parseInt(hash)] = false;
    });
  }

  // remove orders from manage
  removeOrders(orders: InflightOrders) {
    Object.keys(orders).forEach((hash) => {
      delete this.orders[parseInt(hash)];
      delete this.locks[parseInt(hash)];
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