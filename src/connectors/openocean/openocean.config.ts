import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace OpenoceanConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    routerAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'openocean.allowedSlippage',
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `openocean.gasLimitEstimate`,
    ),
    ttl: ConfigManagerV2.getInstance().get('openocean.ttl'),
    routerAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
        'openocean.contractAddresses.' +
          chain +
          '.' +
          network +
          '.routerAddress',
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      { chain: 'avalanche', networks: ['avalanche'] },
      { chain: 'ethereum', networks: ['mainnet', 'arbitrum', 'optimism'] },
      { chain: 'polygon', networks: ['mainnet'] },
      { chain: 'harmony', networks: ['mainnet'] },
      { chain: 'binance-smart-chain', networks: ['mainnet'] },
      { chain: 'cronos', networks: ['mainnet'] },
      { chain: 'telos', networks: ['evm'] },
    ],
  };
}
