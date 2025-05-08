export function isFractionString(value: string): boolean {
  return value.includes('/') && value.split('/').length === 2;
}