import { AvailableNetworks } from '../../../services/config-manager-types';

export interface NetworkConfig {
  allowedSlippage: string;
  gasLimitEstimate: number;
  tradingTypes: Array<string>;
  availableNetworks: Array<AvailableNetworks>;
  chainType: string;
}
