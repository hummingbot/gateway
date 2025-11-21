/**
 * Number Formatting Utilities
 *
 * Functions for formatting numbers, balances, prices, and percentages.
 */

/**
 * Format token amount with specified decimal places
 * Handles both string and number inputs
 * @param amount - Token amount to format
 * @param decimals - Number of decimal places (default: 6)
 * @returns Formatted string
 * @example formatTokenAmount(1.234567890, 6) => '1.234568'
 */
export function formatTokenAmount(
  amount: number | string,
  decimals = 6
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Format price in scientific notation for very small/large values
 * @param price - Price value
 * @param decimals - Number of significant figures (default: 6)
 * @returns Formatted string
 * @example formatPrice(0.000001234, 6) => '1.234000e-6'
 */
export function formatPrice(price: number, decimals = 6): string {
  if (isNaN(price)) return '0';
  return price.toExponential(decimals);
}

/**
 * Format percentage with specified decimal places
 * @param value - Percentage value (as number, not 0-1)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with % sign
 * @example formatPercent(12.3456, 2) => '12.35%'
 */
export function formatPercent(value: number, decimals = 2): string {
  if (isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format balance with smart decimal truncation
 * - Truncates to maxDecimals if the value exceeds it
 * - Preserves original decimals if less than maxDecimals
 * - Handles edge cases gracefully
 * @param balance - Balance to format
 * @param maxDecimals - Maximum decimal places (default: 6)
 * @returns Formatted balance string
 * @example formatBalance('1.123', 6) => '1.123'
 * @example formatBalance('1.123456789', 6) => '1.123457'
 */
export function formatBalance(
  balance: string | number,
  maxDecimals = 6
): string {
  const balanceStr = String(balance);
  const num = parseFloat(balanceStr);

  if (isNaN(num)) return balanceStr;

  const decimalIndex = balanceStr.indexOf('.');
  if (decimalIndex !== -1) {
    const actualDecimals = balanceStr.length - decimalIndex - 1;
    if (actualDecimals > maxDecimals) {
      return num.toFixed(maxDecimals);
    }
  }

  return balanceStr;
}

/**
 * Calculate percentage of value relative to total
 * Returns 0-100 range, capped at 100
 * @param value - Part value
 * @param total - Total value
 * @returns Percentage (0-100)
 * @example calculatePercentage(25, 100) => 25
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, (value / total) * 100);
}

/**
 * Format large numbers with commas for readability
 * @param value - Number to format
 * @param decimals - Decimal places to show (default: 0)
 * @returns Formatted string with commas
 * @example formatNumber(1234567.89) => '1,234,568'
 * @example formatNumber(1234567.89, 2) => '1,234,567.89'
 */
export function formatNumber(value: number, decimals = 0): string {
  if (isNaN(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
