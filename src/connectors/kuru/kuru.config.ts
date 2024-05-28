import { buildConfig, NetworkConfig } from '../../network/network.utils';

export namespace KuruConfig {
  export const config: NetworkConfig = buildConfig(
    'kuru',
    ['CLOB_SPOT'],
    [
      {
        chain: 'ethereum',
        networks: ['localhost'],
      },
    ],
    'EVM'
  );
}
