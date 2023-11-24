import { buildConfig, NetworkConfig } from '../../network/network.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace VVSConfig {
  const contractAddresses: any = ConfigManagerV2.getInstance().get(
    'vvs.contractAddresses'
  );
  const networks: Array<string> = Object.keys(contractAddresses);
  export const config: NetworkConfig = buildConfig(
    'vvs',
    ['AMM'],
    [{ chain: 'cronos', networks }],
    'EVM'
  );
}
