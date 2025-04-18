import {BN} from 'bn.js';

/**
 * Converts an amount from base units to human-readable form
 * @param amount Amount in base units (as string to handle large numbers)
 * @param decimals Number of decimals for the token
 * @returns The human-readable decimal value
 */
export function fromBaseUnits(amount: string, decimals: number): number {
  const divisor = new BN(10).pow(new BN(decimals));
  const amountBN = new BN(amount);
  const wholePart = amountBN.div(divisor).toString();

  const fractionalBN = amountBN.mod(divisor);
  let fractionalPart = fractionalBN.toString().padStart(decimals, '0');

  // Trim trailing zeros
  while (fractionalPart.endsWith('0') && fractionalPart.length > 0) {
    fractionalPart = fractionalPart.slice(0, -1);
  }

  // Format for JS number conversion
  const result = `${wholePart}${fractionalPart.length > 0 ? '.' + fractionalPart : ''}`;
  return parseFloat(result);
}

/**
 * Converts from a human-readable decimal to base units
 * @param amount Amount in human-readable form
 * @param decimals Number of decimals for the token
 * @returns The amount in base units as a string
 */
export function toBaseUnits(amount: number, decimals: number): string {
  // Convert to string for precision
  const amountStr = amount.toString();

  // Split by decimal point
  const parts = amountStr.split('.');
  const wholePart = parts[0];
  const fractionalPart =
    parts.length > 1
      ? parts[1].padEnd(decimals, '0').slice(0, decimals)
      : '0'.repeat(decimals);

  // Combine and convert to BN
  const result = wholePart + fractionalPart;

  // Remove leading zeros
  return new BN(result).toString();
}
