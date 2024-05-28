import { Markets, OrderStatus } from './kuru.constants';

/**
 * @notice Get the market symbol for a given address.
 * @param address The address to find the market symbol for.
 * @returns The market symbol corresponding to the given address, or an empty string if not found.
 */
export function GetMarketIdByAddress(address: string): string {
  for (const [symbol, marketAddress] of Object.entries(Markets)) {
    if (marketAddress.toLowerCase() === address.toLowerCase()) {
      return symbol;
    }
  }
  return '';
}

/**
 * @notice Get the key as a string for a given number in OrderStatus.
 * @param statusNumber The number representing the order status.
 * @returns The key as a string corresponding to the status number, or an error message if not found.
 */
export function GetOrderStatusKey(statusNumber: number): string {
  const entries = Object.entries(OrderStatus);
  for (const [key, value] of entries) {
    if (value === statusNumber) {
      return key;
    }
  }
  throw new Error(`OrderStatus key not found for value: ${statusNumber}`);
}
