import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HelmswapConfig {
  export const chain = 'ethereum';
  // Only networks already present in Gateway. HelmSwap also supports other
  // live EVM chains, but new-chain PRs are not being accepted by Gateway.
  export const networks = ['mainnet', 'base', 'bsc'];
  export const tradingTypes = ['router'] as const;
  export const networkToChainId: Record<string, number> = {
    mainnet: 1,
    base: 8453,
    bsc: 56,
  };

  export interface RootConfig {
    baseUrl: string;
    apiKey: string;
    slippagePct: number;
    referrer: string;
  }

  export const config: RootConfig = {
    baseUrl: ConfigManagerV2.getInstance().get('helmswap.baseUrl') || 'https://helmswap.com',
    apiKey: ConfigManagerV2.getInstance().get('helmswap.apiKey') || '',
    slippagePct: ConfigManagerV2.getInstance().get('helmswap.slippagePct'),
    referrer: ConfigManagerV2.getInstance().get('helmswap.referrer') || '',
  };
}
