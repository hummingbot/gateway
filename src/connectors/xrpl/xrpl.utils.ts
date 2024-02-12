import { InflightOrders, OrderLocks } from './xrpl.types';
import { BookOffer, dropsToXrp } from 'xrpl';
import { XRPL } from '../../chains/xrpl/xrpl';

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

export function getTakerGetsAmount(offer: BookOffer): string {
  if (typeof offer.TakerGets === 'string') {
    return dropsToXrp(offer.TakerGets);
  }

  return offer.TakerGets.value;
}

export function getTakerPaysAmount(offer: BookOffer): string {
  if (typeof offer.TakerPays === 'string') {
    return dropsToXrp(offer.TakerPays);
  }

  return offer.TakerPays.value;
}

export function getTakerGetsFundedAmount(offer: BookOffer): string {
  if (typeof offer.taker_gets_funded === 'string') {
    return dropsToXrp(offer.taker_gets_funded);
  }

  if (!offer.taker_gets_funded) {
    return '0';
  }

  return offer.taker_gets_funded.value;
}

export function getTakerPaysFundedAmount(offer: BookOffer): string {
  if (typeof offer.taker_pays_funded === 'string') {
    return dropsToXrp(offer.taker_pays_funded);
  }

  if (!offer.taker_pays_funded) {
    return '0';
  }

  return offer.taker_pays_funded.value;
}

export async function getsSequenceNumberFromTxn(
  network: string,
  TxnHash: string
): Promise<number | undefined> {
  const xrpl = XRPL.getInstance(network);
  const txn = await xrpl.getTransaction(TxnHash);

  if (txn) {
    return txn.result.Sequence;
  }

  return undefined;
}

// check if string is 160-bit hexadecimal, if so convert it to string
export function convertHexToString(hex: string): string {
  if (hex.length === 40) {
    const str = Buffer.from(hex, 'hex').toString();
    return str.replace(/\0/g, '');
  }

  return hex;
}

export function convertStringToHex(str: string): string {
  if (str.length > 3) {
    let hex = Buffer.from(str).toString('hex');
    while (hex.length < 40) {
      hex += '00'; // pad with zeros to reach 160 bits (40 hex characters)
    }
    return hex;
  }

  return str;
}