import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace RefConfig {
  export const config: NetworkConfig = buildConfig(
    'ref',
    ['AMM'],
    [
      {
        chain: 'near',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('ref.contractAddresses')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('near.networks')
          ).includes(network)
        ),
      },
    ],
    'NEAR'
  );
}
