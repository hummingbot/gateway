import { getAvailableEthereumNetworks } from '../../chains/ethereum/ethereum.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace PancakeswapConfig {
  // Supported networks for Pancakeswap
  // See https://developer.pancakeswap.finance/contracts/v3/addresses#smart-router
  export const chain = 'ethereum';
  export const networks = getAvailableEthereumNetworks().filter((network) =>
    ['mainnet', 'arbitrum', 'base', 'bsc'].includes(network),
  );
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['amm', 'clmm', 'router'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;
    maximumHops: number;
    maximumSplits: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('pancakeswap.slippagePct'),
    maximumHops: ConfigManagerV2.getInstance().get('pancakeswap.maximumHops'),
    maximumSplits: ConfigManagerV2.getInstance().get('pancakeswap.maximumSplits'),

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}
