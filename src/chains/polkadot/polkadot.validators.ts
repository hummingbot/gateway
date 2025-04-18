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
