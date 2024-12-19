import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';
import { OpenedContract } from '@ton/core';
import { Pool, VaultNative, VaultJetton, Asset } from '@dedust/sdk';

export namespace DedustConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
    maxPriceImpact?: number;
  }

  export interface SwapEstimate {
    amountOut: bigint;
    tradeFee: bigint;
    assetOut: Asset;
  }

  export interface DedustQuote {
    pool: OpenedContract<Pool>;
    vault: OpenedContract<VaultNative | VaultJetton>;
    amount: bigint;
    fromAsset: Asset;
    toAsset: Asset;
    expectedOut: bigint;
    priceImpact: number;
    tradeFee: bigint;
  }

  export interface DedustTradeResult {
    txId: string;
    success: boolean;
    error?: string;
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
    maxPriceImpact: 15,
  };
} 