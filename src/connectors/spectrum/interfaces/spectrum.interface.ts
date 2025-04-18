import { AvailableNetworks } from "../../connector.requests";

export interface NetworkConfig {
  allowedSlippage: string;
  gasLimitEstimate: number;
  tradingTypes: Array<string>;
  availableNetworks: Array<AvailableNetworks>;
  chainType: string;
}
