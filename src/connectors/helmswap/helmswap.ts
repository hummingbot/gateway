import { HelmswapApi, fromBaseUnits, toBaseUnits } from './helmswap-api';
import { HelmswapConfig } from './helmswap.config';

export class Helmswap {
  private static instances: Map<string, Helmswap> = new Map();
  public readonly chainId: number;
  public readonly api: HelmswapApi;
  public readonly slippagePct: number;
  public readonly referrer?: string;

  private constructor(chainId: number) {
    this.chainId = chainId;
    this.slippagePct = HelmswapConfig.config.slippagePct;
    this.referrer = HelmswapConfig.config.referrer || undefined;
    this.api = new HelmswapApi({
      baseUrl: HelmswapConfig.config.baseUrl,
      apiKey: HelmswapConfig.config.apiKey || undefined,
    });
  }

  public static async getInstance(network: string): Promise<Helmswap> {
    if (!Helmswap.instances.has(network)) {
      const chainId = HelmswapConfig.networkToChainId[network];
      if (!chainId) {
        throw new Error(
          `HelmSwap does not support Gateway network "${network}". Supported: ${HelmswapConfig.networks.join(', ')}.`,
        );
      }
      Helmswap.instances.set(network, new Helmswap(chainId));
    }
    return Helmswap.instances.get(network)!;
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
