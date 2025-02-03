import { Raydium } from '@raydium-io/raydium-sdk-v2'
import { logger } from '../../services/logger'
import { convertDecimals } from '../../services/base'
import { RaydiumClmmConfig } from './raydium-clmm.config'
import { Solana } from '../../chains/solana/solana'
import { Keypair } from '@solana/web3.js'
import { PoolInfo } from '../../services/clmm-interfaces'

export class RaydiumCLMM {
  private static _instances: { [name: string]: RaydiumCLMM }
  private raydium: Raydium
  public config: RaydiumClmmConfig.NetworkConfig
  private solana: Solana
  private clmmPools: Map<string, any> = new Map()
  private clmmPoolPromises: Map<string, Promise<any>> = new Map()
  private owner?: Keypair

  private constructor() {
    this.config = RaydiumClmmConfig.config
    this.raydium = null
    this.solana = null
  }

  /** Gets singleton instance of RaydiumCLMM */
  public static async getInstance(network: string): Promise<RaydiumCLMM> {
    if (!RaydiumCLMM._instances) {
      RaydiumCLMM._instances = {}
    }

    if (!RaydiumCLMM._instances[network]) {
      const instance = new RaydiumCLMM()
      await instance.init(network)
      RaydiumCLMM._instances[network] = instance
    }

    return RaydiumCLMM._instances[network]
  }

  /** Initializes RaydiumCLMM instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      
      // Load first wallet from Solana instance
      const walletAddress = await this.solana.getFirstWalletAddress();
      if (!walletAddress) throw new Error('No Solana wallet configured');
      this.owner = await this.solana.getWallet(walletAddress);
      const CLUSTER = this.solana.network == `mainnet-beta` ? 'mainnet' : 'devnet';

      // Initialize Raydium SDK with proper types
      this.raydium = await Raydium.load({
        connection: this.solana.connection,
        cluster: CLUSTER,
        owner: this.owner,
        disableFeatureCheck: true,
        blockhashCommitment: 'finalized'
      });

      this.clmmPools = new Map();
      this.clmmPoolPromises = new Map();
      logger.info("Raydium CLMM initialized with wallet: " + walletAddress);
    } catch (error) {
      logger.error("Raydium CLMM initialization failed:", error);
      throw error;
    }
  }

  async getClmmPool(poolAddress: string): Promise<any> {
    if (this.clmmPools.has(poolAddress)) return this.clmmPools.get(poolAddress)
    if (this.clmmPoolPromises.has(poolAddress)) return this.clmmPoolPromises.get(poolAddress)

    const poolPromise = this.raydium.clmm.getRpcClmmPoolInfo({ poolId: poolAddress })
      .then(poolInfo => {
        this.clmmPools.set(poolAddress, poolInfo)
        this.clmmPoolPromises.delete(poolAddress)
        return poolInfo
      })

    this.clmmPoolPromises.set(poolAddress, poolPromise)
    return poolPromise
  }

  async getPoolInfo(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const rawPool = await this.getClmmPool(poolAddress)
      console.log(rawPool)
      if (!rawPool) return null

      // Fetch AMM config account data
      let ammConfigData;
      if (rawPool.ammConfig) {
        try {
          const configAccount = await this.solana.connection.getAccountInfo(rawPool.ammConfig);
          if (configAccount) {
            const dataBuffer = configAccount.data;
            ammConfigData = {
            //   protocolFeeRate: dataBuffer.readUInt32LE(43) / 10000,  // 120000 → 12.0000%
              tradeFeeRate: dataBuffer.readUInt32LE(47) / 10000      // 2500 → 0.2500%
            };
          }
        } catch (e) {
          logger.error(`Error fetching AMM config: ${e}`);
        }
      }

      // Safe extraction with fallbacks
      const poolInfo: PoolInfo = {
        address: poolAddress,
        baseTokenAddress: rawPool.mintA || '',
        quoteTokenAddress: rawPool.mintB || '',
        binStep: Number(rawPool.tickSpacing) || 0,
        feePct: ammConfigData?.tradeFeeRate ?? 0,
        dynamicFeePct: ammConfigData?.tradeFeeRate ?? 0,
        price: Number(rawPool.currentPrice) || 0,
        baseTokenAmount: Number(convertDecimals(rawPool.vaultA?.amount || 0, rawPool.mintDecimalsA)),
        quoteTokenAmount: Number(convertDecimals(rawPool.vaultB?.amount || 0, rawPool.mintDecimalsB)),
        activeBinId: Number(rawPool.tickCurrent) || 0,
        minBinId: rawPool.tickArrayBitmap?.[0] || 0,
        maxBinId: rawPool.tickArrayBitmap?.[rawPool.tickArrayBitmap.length - 1] || 0,
        bins: []
      }
      return poolInfo
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error)
      return null
    }
  }

//   /** Gets position information */
//   async getPositionInfo(positionAddress: string, wallet: PublicKey): Promise<PositionInfo> {
//     try {
//       const positionNftMint = new PublicKey(positionAddress)
//       const programId = this.config.programId
      
//       const positionPubKey = getPdaPersonalPositionAddress(programId, positionNftMint).publicKey
//       const pos = await this.connection.getAccountInfo(positionPubKey)
//       if (!pos) throw new Error('Position not found')
      
//       const position = PositionInfoLayout.decode(pos.data)
//       const poolInfo = await this.raydium.getPoolInfo(position.poolId)

//       // Get tick arrays for price calculation
//       const [tickLowerArrayAddress, tickUpperArrayAddress] = [
//         TickUtils.getTickArrayAddressByTick(
//           programId,
//           new PublicKey(poolInfo.id),
//           position.tickLower,
//           poolInfo.config.tickSpacing
//         ),
//         TickUtils.getTickArrayAddressByTick(
//           programId,
//           new PublicKey(poolInfo.id),
//           position.tickUpper,
//           poolInfo.config.tickSpacing
//         ),
//       ]

//       const tickArrayRes = await this.connection.getMultipleAccountsInfo([
//         tickLowerArrayAddress, 
//         tickUpperArrayAddress
//       ])

//       if (!tickArrayRes[0] || !tickArrayRes[1]) {
//         throw new Error('Tick data not found')
//       }

//       const tickArrayLower = TickArrayLayout.decode(tickArrayRes[0].data)
//       const tickArrayUpper = TickArrayLayout.decode(tickArrayRes[1].data)

//       const tickLowerState = tickArrayLower.ticks[
//         TickUtils.getTickOffsetInArray(position.tickLower, poolInfo.config.tickSpacing)
//       ]
//       const tickUpperState = tickArrayUpper.ticks[
//         TickUtils.getTickOffsetInArray(position.tickUpper, poolInfo.config.tickSpacing)
//       ]

//       // Get fees and rewards
//       const rpcPoolData = await this.raydium.clmm.getRpcClmmPoolInfo({ poolId: position.poolId })
//       const tokenFees = PositionUtils.GetPositionFeesV2(
//         rpcPoolData, 
//         position, 
//         tickLowerState, 
//         tickUpperState
//       )

//       return {
//         positionAddress: positionAddress,
//         poolAddress: poolInfo.id,
//         baseTokenAddress: poolInfo.mintA.address,
//         quoteTokenAddress: poolInfo.mintB.address,
//         baseTokenAmount: Number(convertDecimals(position.liquidity, poolInfo.mintA.decimals)),
//         quoteTokenAmount: Number(convertDecimals(position.liquidity, poolInfo.mintB.decimals)),
//         baseFeeAmount: Number(convertDecimals(tokenFees.tokenFeeAmountA, poolInfo.mintA.decimals)),
//         quoteFeeAmount: Number(convertDecimals(tokenFees.tokenFeeAmountB, poolInfo.mintB.decimals)),
//         lowerBinId: position.tickLower,
//         upperBinId: position.tickUpper,
//         lowerPrice: tickLowerState.price,
//         upperPrice: tickUpperState.price,
//         price: rpcPoolData.currentPrice,
//       }
//     } catch (error) {
//       logger.error('Error getting position info:', error)
//       throw error
//     }
//   }

  // Add other methods similar to Meteora class...
}
