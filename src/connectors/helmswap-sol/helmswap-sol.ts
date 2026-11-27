import { HelmswapApi, fromBaseUnits, toBaseUnits } from '../helmswap/helmswap-api';

import { HelmswapSolConfig } from './helmswap-sol.config';

export class HelmswapSol {
  private static instances: Map<string, HelmswapSol> = new Map();
  public readonly api: HelmswapApi;
  public readonly slippagePct: number;
  public readonly referrer?: string;

  private constructor() {
    this.slippagePct = HelmswapSolConfig.config.slippagePct;
    this.referrer = HelmswapSolConfig.config.referrer || undefined;
    this.api = new HelmswapApi({
      baseUrl: HelmswapSolConfig.config.baseUrl,
      apiKey: HelmswapSolConfig.config.apiKey || undefined,
    });
  }

  public static async getInstance(_network: string): Promise<HelmswapSol> {
    const key = 'solana';
    if (!HelmswapSol.instances.has(key)) {
      HelmswapSol.instances.set(key, new HelmswapSol());
    }
    return HelmswapSol.instances.get(key)!;
  }

  public static getSlippageBps(slippagePct: number): number {
    const bps = Math.round(slippagePct * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 1000) {
      throw new Error('slippagePct must be between 0 and 10 (0–1000 bps).');
    }
    return bps;
  }

  public parseTokenAmount(amount: number, decimals: number): string {
    return toBaseUnits(String(amount), decimals);
  }

  public formatTokenAmount(raw: string, decimals: number): string {
    return fromBaseUnits(raw, decimals).toString();
  }
}
