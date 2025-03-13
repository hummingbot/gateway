import { decodeAddress } from '@polkadot/util-crypto';
import { HttpException } from '../../services/error-handler';
import { logger } from '../../services/logger';

/**
 * Validates a Polkadot address format
 * @param address The address to validate
 * @param ss58Format The SS58 format to use for validation (optional)
 * @returns true if valid, throws HttpException if invalid
 */
export function validatePolkadotAddress(address: string, ss58Format?: number): boolean {
  try {
    // Try to decode the address with the specified format
    decodeAddress(address, false, ss58Format);
    return true;
  } catch (error) {
    logger.error(`Invalid Polkadot address: ${address}`, error);
    throw new HttpException(
      400,
      `Invalid Polkadot address: ${address}`,
      -1
    );
  }
}

/**
 * Validates a Polkadot transaction hash format
 * @param txHash The transaction hash to validate
 * @returns true if valid, throws HttpException if invalid
 */
export function validateTransactionHash(txHash: string): boolean {
  const hexRegex = /^0x[a-fA-F0-9]{64}$/;

  if (!hexRegex.test(txHash)) {
    logger.error(`Invalid transaction hash format: ${txHash}`);
    throw new HttpException(
      400,
      `Invalid transaction hash format: ${txHash}`,
      -1
    );
  }

  return true;
}

/**
 * Validates a token symbol
 * @param symbol The symbol to validate
 * @returns true if valid, throws HttpException if invalid
 */
export function validateTokenSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
    logger.error(`Invalid token symbol: ${symbol}`);
    throw new HttpException(
      400,
      `Invalid token symbol: ${symbol}`,
      -1
    );
  }

  return true;
}

/**
 * Validates a token amount
 * @param amount The amount to validate
 * @returns true if valid, throws HttpException if invalid
 */
export function validateAmount(amount: number): boolean {
  if (isNaN(amount) || amount <= 0) {
    logger.error(`Invalid amount: ${amount}`);
    throw new HttpException(
      400,
      `Invalid amount: ${amount}. Amount must be a positive number.`,
      -1
    );
  }

  return true;
}

/**
 * Validates a network name
 * @param network The network name to validate
 * @returns true if valid, throws HttpException if invalid
 */
export function validateNetwork(network: string): boolean {
  const validNetworks = ['mainnet', 'testnet', 'local'];

  if (!validNetworks.includes(network)) {
    logger.error(`Invalid network: ${network}`);
    throw new HttpException(
      400,
      `Invalid network: ${network}. Valid networks are: ${validNetworks.join(', ')}`,
      -1
    );
  }

  return true;
}

/**
 * Validates a pallet name
 * @param palletName The pallet name to validate
 * @returns true if valid, throws HttpException if invalid
 */
export function validatePalletName(palletName: string): boolean {
  if (!palletName || typeof palletName !== 'string' || palletName.trim() === '') {
    logger.error(`Invalid pallet name: ${palletName}`);
    throw new HttpException(
      400,
      `Invalid pallet name: ${palletName}`,
      -1
    );
  }

  return true;
}

/**
 * Validates staking parameters
 * @param amount The amount to stake
 * @param validatorAddress The validator address
 * @returns true if valid, throws HttpException if invalid
 */
export function validateStakingParams(amount: number, validatorAddress?: string): boolean {
  validateAmount(amount);

  if (validatorAddress) {
    validatePolkadotAddress(validatorAddress);
  }

  return true;
}

