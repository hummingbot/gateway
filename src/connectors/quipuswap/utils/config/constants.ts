import BigNumber from 'bignumber.js';

export const ZERO_AMOUNT = 0;
export const ZERO_AMOUNT_BN = new BigNumber(ZERO_AMOUNT);
export const MAX_HOPS_COUNT = 3;

// Referal code
export const QUIPUSWAP_REFERRAL_CODE = new BigNumber(1);

export const precision = new BigNumber(1e18);

export const aPrecision = new BigNumber(100);

export const getDCache = new Map();

export const calculateYCache = new Map();

export const feeDenominator = new BigNumber(10000000000);

export const SWAP_RATIO_DENOMINATOR = new BigNumber('1000000000000000000');

export const SAVED_TOKENS_KEY = 'savedCustomTokens';