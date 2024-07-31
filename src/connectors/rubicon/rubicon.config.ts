import { AvailableNetworks } from '../../services/config-manager-types';

export namespace RubiconCLOBConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    tradingTypes: ['CLOB_SPOT'],
    chainType: 'EVM',
    allowedSlippage: "2/100",
    availableNetworks: [ { chain: 'ethereum', networks: ['mainnet', 'arbitrum', 'arbitrum_sepolia', 'optimism', 'base'] } ],
  };
}
