import { AvailableNetworks } from '../../services/config-manager-types';
// import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace XRPLCLOBConfig {
  export interface NetworkConfig {
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    tradingTypes: ['CLOB_SPOT'],
    chainType: 'XRPL',
    availableNetworks: [
      {
        chain: 'xrpl',
        networks: ['mainnet', 'testnet'],
      },
    ],
  };
}
