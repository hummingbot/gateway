/**
 * Parse a Gateway response the way a caller with a decimal type does.
 *
 * Money crosses the wire as a decimal STRING — `"0.000037"`, not `0.000037` — because a
 * JSON number is an IEEE 754 double and an exact on-chain decimal does not survive one.
 * The generated clients map those fields to `Decimal`, so a caller compares quantities,
 * not representations.
 *
 * These tests assert quantities too, so this converts a numeric string back into a
 * number — except where the field is an identifier. A Uniswap position is addressed by
 * its NFT token id, which is digits and must stay a string; so is a numeric-looking
 * signature or pool address. Those are named rather than guessed.
 */
const NUMERIC = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/** Fields whose value identifies something, however numeric it looks. */
const IDENTIFIERS = new Set([
  'address',
  'poolAddress',
  'positionAddress',
  'walletAddress',
  'baseTokenAddress',
  'quoteTokenAddress',
  'signature',
  'txHash',
  'transactionHash',
  'quoteId',
  'tokenId',
]);

export const parseWire = (body: string): any => revive(JSON.parse(body));

const revive = (value: any, key?: string): any => {
  if (typeof value === 'string') {
    return !IDENTIFIERS.has(key ?? '') && NUMERIC.test(value) ? Number(value) : value;
  }
  if (Array.isArray(value)) return value.map((entry) => revive(entry, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, entry]) => [k, revive(entry, k)]));
  }
  return value;
};
