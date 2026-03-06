import { getAvailableEthereumNetworks } from '../../chains/ethereum/ethereum.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace ETCswapConfig {
  // Supported networks for ETCswap
  // ETCswap is deployed on Ethereum Classic (classic) and Mordor testnet
  export const chain = 'ethereum';
  export const networks = getAvailableEthereumNetworks().filter((network) => ['classic', 'mordor'].includes(network));
  export type Network = string;

  // Supported trading types
  // V2 = amm, V3 = clmm, Universal Router = router
  export const tradingTypes = ['amm', 'clmm', 'router'] as const;

  export interface RootConfig {
    // Global configuration
    slippagePct: number;
    maximumHops: number;

    // Available networks
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    slippagePct: ConfigManagerV2.getInstance().get('etcswap.slippagePct'),
    maximumHops: ConfigManagerV2.getInstance().get('etcswap.maximumHops') || 4,

    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}
