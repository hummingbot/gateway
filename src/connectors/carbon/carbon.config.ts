import { ContractsConfig } from '@bancor/carbon-sdk/contracts-api';
import { MatchType } from '@bancor/carbon-sdk';
import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace CarbonConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    tradingTypes: Array<string>;
    chainType: string;
    matchType: MatchType;
    availableNetworks: Array<AvailableNetworks>;
    carbonContractsConfig: (
      chain: string,
      network: string
    ) => Required<ContractsConfig>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      `carbon.allowedSlippage`
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `carbon.gasLimitEstimate`
    ),
    ttl: ConfigManagerV2.getInstance().get(`carbon.ttl`),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    matchType: MatchType.Fast,
    availableNetworks: [
      {
        chain: 'ethereum',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('carbon.contractAddresses.ethereum')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks')
          ).includes(network)
        ),
      },
    ],
    carbonContractsConfig: (chain: string, network: string) => {
      return {
        carbonControllerAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${chain}.${network}.carbonControllerAddress`
        ),
        multiCallAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${chain}.${network}.multiCallAddress`
        ),
        voucherAddress: ConfigManagerV2.getInstance().get(
          `carbon.contractAddresses.${chain}.${network}.voucherAddress`
        ),
      };
    },
  };
}
