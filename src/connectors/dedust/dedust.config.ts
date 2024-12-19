import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace DedustConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export interface DedustQuoteRes {
    to: string;
    value: string;
    payload: string;
    fromAmount: string;
    toAmount: string;
    priceImpact: string;
    route: {
      fromToken: string;
      toToken: string;
      pools: Array<{
        address: string;
        fee: string;
      }>;
    };
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'dedust.allowedSlippage'
    ),
    tradingTypes: ['AMM'],
    chainType: 'TON',
    availableNetworks: [
      { chain: 'ton', networks: ['mainnet'] },
    ],
  };
} 