import { buildConfig, NetworkConfig } from '../../network/network.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace CurveSwapConfig {
  export const config: NetworkConfig = buildConfig(
    'curveswap',
    ['AMM'],
    [
      {
        chain: 'ethereum',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('curveswap.contractAddresses')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('ethereum.networks')
          ).includes(network)
        ),
      },
      {
        chain: 'polygon',
        networks: Object.keys(
          ConfigManagerV2.getInstance().get('curveswap.contractAddresses')
        ).filter((network) =>
          Object.keys(
            ConfigManagerV2.getInstance().get('polygon.networks')
          ).includes(network)
        ),
      },
    ],
    'EVM'
  );
}
