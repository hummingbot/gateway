import { CpmmRpcData, FEE_RATE_DENOMINATOR_VALUE, GfxCpmmClient } from 'goosefx-amm-sdk'
import { logger } from '../../services/logger'
import { GammaConfig } from './gamma.config'
import { Solana } from '../../chains/solana/solana'
import { Keypair } from '@solana/web3.js'
import { PoolInfo as AmmPoolInfo } from '../../schemas/amm-schema'
import { PublicKey } from '@solana/web3.js'
import { percentRegexp } from '../../services/config-manager-v2';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export class Gamma {
  private static _instances: { [name: string]: Gamma }
  private solana: Solana
  public client: GfxCpmmClient
  public config: GammaConfig.NetworkConfig
  private owner?: Keypair

  private constructor() {
    this.config = 
      GammaConfig.config as unknown as GammaConfig.NetworkConfig
    this.solana = null
  }

  /** Gets singleton instance of Gamma */
  public static async getInstance(network: string): Promise<Gamma> {
    if (!Gamma._instances) {
      Gamma._instances = {}
    }

    if (!Gamma._instances[network]) {
      const instance = new Gamma()
      await instance.init(network)
      Gamma._instances[network] = instance
    }

    return Gamma._instances[network]
  }

  /** Initializes Gamma instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      
      // Load first wallet if available
      const walletAddress = await this.solana.getFirstWalletAddress();
      if (walletAddress) {
        this.owner = await this.solana.getWallet(walletAddress);
      }

      // Initialize client with optional owner
      this.client = await GfxCpmmClient.load({
        connection: this.solana.connection,
        owner: this.owner, // undefined if no wallet present
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: 'confirmed',
        urlConfigs: {}
      });

      logger.info(`Initialized Gamma. Wallet: ${walletAddress ? walletAddress : 'none'}`)
    } catch (error) {
      logger.error("Failed to initialize Gamma:", error);
      throw error;
    }
  } 

  async getAmmPoolInfo(poolAddress: string): Promise<AmmPoolInfo | null> {
    try {
      const pool = await this.client.cpmm.getRpcPoolInfo(poolAddress, true)
      if (!pool.configInfo) {
        throw new Error(`Failed to get config info`)
      }
      return this.rpcToPoolInfo(poolAddress, pool)
    } catch(error) {
      logger.error(`Error getting AMM pool info for ${poolAddress}:`, error)
      return null
    }
  }

  rpcToPoolInfo(poolAddress: string, pool: CpmmRpcData): AmmPoolInfo {
    return {
      address: poolAddress,
      baseTokenAddress: pool.token0Mint.toBase58(),
      quoteTokenAddress: pool.token1Mint.toBase58(),
      feePct: (pool.configInfo.tradeFeeRate.toNumber() / FEE_RATE_DENOMINATOR_VALUE.toNumber()) * 100,
      price: Number(pool.poolPrice),
      baseTokenAmount: pool.baseReserve.toNumber(),
      quoteTokenAmount: pool.quoteReserve.toNumber(),
      lpMint: {
        address: PublicKey.default.toBase58(),
        decimals: 0
      },
      poolType: 'amm'
    }
  }

  // General Slippage Settings
  getSlippagePct(routeType: 'amm' | 'clmm'): number {
    const allowedSlippage = this.config[routeType].allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) {
      slippage = Number(nd[1]) / Number(nd[2]);
    } else {
      logger.error('Failed to parse slippage value:', allowedSlippage);
    }
    return slippage * 100;
  }

  private getPairKey(baseToken: string, quoteToken: string): string {
    return `${baseToken}-${quoteToken}`;
  }

  async findDefaultPool(baseToken: string, quoteToken: string, routeType: 'amm' | 'clmm'): Promise<string | null> {
    const pools = this.config[routeType].pools;
    const pairKey = this.getPairKey(baseToken, quoteToken);
    const reversePairKey = this.getPairKey(quoteToken, baseToken);
    
    return pools[pairKey] || pools[reversePairKey] || null;
  }
}