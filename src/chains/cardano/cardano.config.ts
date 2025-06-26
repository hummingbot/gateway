import { ConfigManagerV2 } from '../../services/config-manager-v2';
interface NetworkConfig {
  name: string;
  tokenListType: string;
  tokenListSource: string;
  nativeCurrencySymbol: string;
  apiurl: string;
  projectId: string;
}

export interface Config {
  network: NetworkConfig;
}

export function getCardanoConfig(
  chainName: string,
  networkName: string,
): Config {
  return {
    network: {
      name: networkName,
      tokenListType: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListType',
      ),
      tokenListSource: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.tokenListSource',
      ),
      nativeCurrencySymbol: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.nativeCurrencySymbol',
      ),
      apiurl: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.apiurl',
      ),
      projectId: ConfigManagerV2.getInstance().get(
        chainName + '.networks.' + networkName + '.projectId',
      ),
    },
    // Additional Cardano-specific configurations can be added here
  };
}
