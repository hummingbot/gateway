import { ConfigManagerV2 } from '../../services/config-manager-v2';

export interface Config {
  chainID: number;
  nativeCurrencySymbol: string;
  apiurl: string;
  projectId: string;
}

export function getCardanoConfig(networkName: string): Config {
  const namespaceId = `cardano-${networkName}`;
  return {
    chainID: ConfigManagerV2.getInstance().get(namespaceId + '.chainID'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(namespaceId + '.nativeCurrencySymbol'),
    apiurl: ConfigManagerV2.getInstance().get(namespaceId + '.apiurl'),
    projectId: ConfigManagerV2.getInstance().get(namespaceId + '.projectId'),
    // Additional Cardano-specific configurations can be added here
  };
}
