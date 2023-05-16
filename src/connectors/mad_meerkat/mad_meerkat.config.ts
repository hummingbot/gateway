import { buildConfig, NetworkConfig } from '../../network/network.utils';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace MadMeerkatConfig {
  const contractAddresses: any = ConfigManagerV2.getInstance().get(
    'mad_meerkat.contractAddresses'
  );
  const networks: Array<string> = Object.keys(contractAddresses);
  export const config: NetworkConfig = buildConfig(
    'mad_meerkat',
    ['AMM'],
    [{ chain: 'cronos', networks }],
    'EVM'
  );
}
