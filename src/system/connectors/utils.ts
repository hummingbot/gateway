import { JupiterConfig } from '../../connectors/jupiter/jupiter.config';
import { MeteoraConfig } from '../../connectors/meteora/meteora.config';
import { RaydiumConfig } from '../../connectors/raydium/raydium.config';
import { logger } from '../../services/logger';
import { Connector } from './schemas';

/**
 * Gets all available connectors and their supported networks
 * @returns Array of connector info objects
 */
export const getAvailableConnectors = (): Connector[] => {
  logger.info('Getting available DEX connectors and networks');
  
  const connectors = [
    {
      name: 'jupiter',
      trading_types: ['swap'],
      available_networks: JupiterConfig.config.availableNetworks,
    },
    {
      name: 'meteora/clmm',
      trading_types: ['clmm', 'swap'],
      available_networks: MeteoraConfig.config.availableNetworks,
    },
    {
      name: 'raydium/amm',
      trading_types: ['amm', 'swap'],
      available_networks: RaydiumConfig.config.availableNetworks,
    },
    {
      name: 'raydium/clmm',
      trading_types: ['clmm', 'swap'],
      available_networks: RaydiumConfig.config.availableNetworks,
    },
  ];

  logger.info('Available connectors: ' + connectors.map(c => c.name).join(', '));
  
  return connectors;
};