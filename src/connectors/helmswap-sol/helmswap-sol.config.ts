import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HelmswapSolConfig {
  export const chain = 'solana';
  export const networks = ['mainnet-beta'];
  export const tradingTypes = ['router'] as const;

  export interface RootConfig {
    baseUrl: string;
    /** Free key from https://helmswap.com/developers. Required to build Solana transactions. Never a wallet key. */
    apiKey: string;
    slippagePct: number;
    referrer: string;
  }

  export const config: RootConfig = {
    baseUrl: ConfigManagerV2.getInstance().get('helmswap-sol.baseUrl') || 'https://helmswap.com',
    apiKey: ConfigManagerV2.getInstance().get('helmswap-sol.apiKey') || '',
    slippagePct: ConfigManagerV2.getInstance().get('helmswap-sol.slippagePct'),
    referrer: ConfigManagerV2.getInstance().get('helmswap-sol.referrer') || '',
  };
}
