import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace CurveConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    routerAddress: (network: string) => string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    maximumHops: number;
    chainType: string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get('curve.allowedSlippage'),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'curve.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('curve.ttl'),
    maximumHops: ConfigManagerV2.getInstance().get(`curve.maximumHops`),
    routerAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        'curve.contractAddresses.' + network + '.routerAddress'
      ),
    tradingTypes: ['AMM'],
    chainType: 'EVM',
    availableNetworks: [
      { chain: 'polygon', networks: ['mainnet', 'mumbai'] },
      { chain: 'avalanche', networks: ['avalanche', 'fuji'] },
      { chain: 'etherium', networks: ['mainnet', 'arbitrum_one', 'optimism'] },
      { chain: 'avalanche', networks: ['avalanche', 'fuji'] },
    ],
  };
}
