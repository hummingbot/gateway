import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HydrationConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    maxRetryAttempts: number;
    retryIntervalMs: number;
    defaultPositionPadding: number;
    defaultFeeTier: number; // Corresponds to fee percentages (e.g., 500 = 0.05%)
    defaultLiquidityPositionSize: number;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'hydration.allowedSlippage',
    ),
    maxRetryAttempts: ConfigManagerV2.getInstance().get(
      'hydration.maxRetryAttempts',
    ),
    retryIntervalMs: ConfigManagerV2.getInstance().get(
      'hydration.retryIntervalMs',
    ),
    defaultPositionPadding: ConfigManagerV2.getInstance().get(
      'hydration.defaultPositionPadding',
    ),
    defaultFeeTier: ConfigManagerV2.getInstance().get(
      'hydration.defaultFeeTier',
    ),
    defaultLiquidityPositionSize: ConfigManagerV2.getInstance().get(
      'hydration.defaultLiquidityPositionSize',
    ),
    tradingTypes: ['AMM', 'CLMM'],
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet', 'testnet'] }],
  };
}

