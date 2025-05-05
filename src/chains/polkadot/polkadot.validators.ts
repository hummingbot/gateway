import { decodeAddress } from '@polkadot/util-crypto';
import { HttpException } from '../../services/error-handler';
import { logger } from '../../services/logger';

/**
 * Validates a Polkadot address format
 * 
 * Checks if the provided address conforms to the Polkadot address format.
 * If the address is invalid, an HttpException with a 400 status code is thrown.
 * 
 * @param address The Polkadot address to validate
 * @param ss58Format The SS58 format to use for validation (optional)
 * @returns true if the address is valid
 * @throws HttpException if the address is invalid
 */
export function validatePolkadotAddress(address: string, ss58Format?: number): boolean {
  if (!address) {
    logger.error('Empty Polkadot address provided');
    throw new HttpException(
      400,
      'Invalid Polkadot address: Address cannot be empty',
      -1
    );
  }
  
  try {
    // Try to decode the address with the specified format
    decodeAddress(address, false, ss58Format);
    return true;
  } catch (error) {
    logger.error(`Invalid Polkadot address: ${address}`);
    throw new HttpException(
      400,
      `Invalid Polkadot address: ${address}`,
      -1
    );
  }
}
