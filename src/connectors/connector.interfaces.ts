/**
 * Common connector interfaces
 * 
 * This file contains shared interfaces used by multiple connectors.
 */

/**
 * Represents available networks for a specific blockchain
 */
export interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}