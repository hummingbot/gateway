import { ContractsConfig } from '@bancor/carbon-sdk/contracts-api';
import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace CarbonConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    tradingTypes: (type: string) => Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    carbonContractsConfig: (network: string) => Required<ContractsConfig>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      `carbon.allowedSlippage`
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `carbon.gasLimitEstimate`
    ),
    ttl: ConfigManagerV2.getInstance().get(`carbon.ttl`),
    tradingTypes: (type: string) => {
      return type === 'swap' ? ['AMM'] : ['CLOB_SPOT'];
    },
    chainType: 'EVM',
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('carbon.contractAddresses')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks')
          ).includes(network)
        ),
      },
    ],
    carbonContractsConfig: (network: string) => {
      return {
        carbonControllerAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${network}.carbonControllerAddress`
        ),
        multiCallAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${network}.multiCallAddress`
        ),
        voucherAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${network}.voucherAddress`
        ),
      };
    },
  };
}
