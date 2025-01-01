import { AvailableNetworks } from '../services/config-manager-types';

export interface NetworkConfig {
  allowedSlippage: string;
  gasLimitEstimate: number;
  ttl: number;
  routerAddress: (network: string) => string;
  tradingTypes: Array<string>;
  chainType: string;
  availableNetworks: Array<AvailableNetworks>;
}
