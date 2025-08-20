import { getAvailableEthereumNetworks } from '../../chains/ethereum/ethereum.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace UniswapConfig {
  // Supported networks for Uniswap
  // See https://docs.uniswap.org/protocol/reference/deployments
  export const chain = 'ethereum';
  export const networks = getAvailableEthereumNetworks().filter((network) =>
    ['mainnet', 'arbitrum', 'avalanche', 'base', 'bsc', 'celo', 'optimism', 'polygon'].includes(network),
  );
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['amm', 'clmm', 'router'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;
    maximumHops: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('uniswap.slippagePct'),
    maximumHops: ConfigManagerV2.getInstance().get('uniswap.maximumHops') || 4,

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}
