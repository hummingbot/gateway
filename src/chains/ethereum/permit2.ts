/** Uniswap's Permit2, deployed at the same address on every EVM chain. */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/**
 * Permit2 expirations are uint48 timestamps. Max uint48 means "never expires", so bots
 * approve once, matching plain ERC20 approvals on other connectors.
 */
export const MAX_UINT48 = 281474976710655;

/** Permit2 amounts are uint160. */
export const MAX_UINT160 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

export const PERMIT2_ABI = [
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
];

export const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount)'];
