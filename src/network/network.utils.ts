import { AvailableNetworks } from '../services/config-manager-types';
import { ConfigManagerV2 } from '../services/config-manager-v2';

export interface NetworkConfig {
  allowedSlippage: string;
  gasLimitEstimate: number;
  ttl: number;
  routerAddress: (network: string) => string;
  tradingTypes: Array<string>;
  chainType: string;
  availableNetworks: Array<AvailableNetworks>;
}

export function buildConfig(
  connector: string,
  tradingTypes: Array<string>,
  availableNetworks: Array<AvailableNetworks>,
  chainType: string = 'EVM'
): NetworkConfig {
  return {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      `${connector}.allowedSlippage`
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      `${connector}.gasLimitEstimate`
    ),
    ttl: ConfigManagerV2.getInstance().get(`${connector}.ttl`),
    routerAddress: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `${connector}.contractAddresses.` + network + '.routerAddress'
      ),
    tradingTypes: tradingTypes,
    chainType: chainType,
    availableNetworks,
  };
}
