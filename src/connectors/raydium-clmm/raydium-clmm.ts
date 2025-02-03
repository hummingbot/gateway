import { 
  Raydium, 
  ApiV3PoolInfoConcentratedItem, 
  PositionInfoLayout, 
  CLMM_PROGRAM_ID,
  getPdaPersonalPositionAddress,
  PositionUtils,
  TickUtils,
  // TickArrayLayout,
  // U64_IGNORE_RANGE 
} from '@raydium-io/raydium-sdk-v2'
import { logger } from '../../services/logger'
import { RaydiumClmmConfig } from './raydium-clmm.config'
import { Solana } from '../../chains/solana/solana'
import { Keypair } from '@solana/web3.js'
import { PoolInfo, PositionInfo } from '../../services/clmm-interfaces'
import { PublicKey } from '@solana/web3.js'
// import BN from 'bn.js'

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
      if (!rawPool) {
        logger.warn(`Pool not found: ${poolAddress}`)
        return null
      }

      // Fetch AMM config account data
      let ammConfigData;
      if (rawPool.ammConfig) {
        try {
          const configAccount = await this.solana.connection.getAccountInfo(rawPool.ammConfig);
          if (configAccount) {
            const dataBuffer = configAccount.data;
            ammConfigData = {
              // 47 is the offset for tradeFeeRate in the dataBuffer
              tradeFeeRate: dataBuffer.readUInt32LE(47) / 10000
            };
          }
        } catch (e) {
          logger.error(`Error fetching AMM config: ${e}`);
        }
      }

      const vaultABalance = (await this.solana.connection.getTokenAccountBalance(rawPool.vaultA)).value.uiAmount;
      const vaultBBalance = (await this.solana.connection.getTokenAccountBalance(rawPool.vaultB)).value.uiAmount;

      const poolInfo: PoolInfo = {
        address: poolAddress,
        baseTokenAddress: rawPool.mintA.toString(),
        quoteTokenAddress: rawPool.mintB.toString(),
        binStep: Number(rawPool.tickSpacing),
        feePct: ammConfigData?.tradeFeeRate,
        price: Number(rawPool.currentPrice),
        baseTokenAmount: Number(vaultABalance),
        quoteTokenAmount: Number(vaultBBalance),
        activeBinId: Number(rawPool.tickCurrent),
      }
      return poolInfo
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error)
      return null
    }
  }

  async getClmmPosition(positionAddress: string): Promise<any> {
    const positionNftMint = new PublicKey(positionAddress)
    const positionPubKey = getPdaPersonalPositionAddress(CLMM_PROGRAM_ID, positionNftMint).publicKey
    const positionAccount = await this.solana.connection.getAccountInfo(new PublicKey(positionPubKey))
    
    if (!positionAccount) {
      logger.warn(`Position account not found: ${positionAddress}`)
      return null
    }

    const position = PositionInfoLayout.decode(positionAccount.data)
    console.log('position', position)
    return position
  }

  async getPositionInfo(positionAddress: string): Promise<PositionInfo | null> {
    try {
      const position = await this.getClmmPosition(positionAddress)
      if (!position) {
        logger.warn(`Position not found: ${positionAddress}`)
        return null
      }

      // Validate poolId exists and is valid
      if (!position.poolId) {
        logger.error('Invalid position: missing poolId')
        return null
      }
      const poolIdString = position.poolId.toBase58()
      logger.info('poolId')
      console.log('poolId:', poolIdString)

      // Fetch and validate pool info
      let poolInfoResponse;
      try {
        poolInfoResponse = await this.raydium.api.fetchPoolById({ ids: poolIdString })
        if (!poolInfoResponse || !poolInfoResponse[0]) {
          logger.error('Pool info not found for position')
          return null
        }
      } catch (error) {
        logger.error('Failed to fetch pool info:')
        console.log('Fetch pool info error:', error)
        return null
      }

      const poolInfo = poolInfoResponse[0] as ApiV3PoolInfoConcentratedItem
      logger.info('poolInfo')
      console.log('poolInfo:', poolInfo)

      // Validate required position data
      if (position.tickLower === undefined || position.tickUpper === undefined) {
        logger.error('Invalid position: missing tick data')
        console.log('Tick data:', { 
          tickLower: position.tickLower, 
          tickUpper: position.tickUpper 
        })
        return null
      }

      if (!position.liquidity || position.liquidity.isZero()) {
        logger.error('Invalid position: missing or zero liquidity')
        console.log('Liquidity:', position.liquidity?.toString())
        return null
      }

      let epochInfo;
      try {
        epochInfo = await this.solana.connection.getEpochInfo()
        console.log('Epoch info:', epochInfo)
      } catch (error) {
        logger.error('Failed to fetch epoch info:')
        console.log('Epoch info error:', error)
        return null
      }

      let priceLower, priceUpper;
      try {
        priceLower = TickUtils.getTickPrice({
          poolInfo,
          tick: position.tickLower,
          baseIn: true,
        })
        priceUpper = TickUtils.getTickPrice({
          poolInfo,
          tick: position.tickUpper,
          baseIn: true,
        })
        console.log('Price calculations:', { priceLower, priceUpper })
      } catch (error) {
        logger.error('Failed to calculate position prices:')
        console.log('Price calculation error:', error)
        console.log('Price calculation context:', {
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          poolInfo
        })
        return null
      }

      let amounts;
      try {
        amounts = PositionUtils.getAmountsFromLiquidity({
          poolInfo: poolInfo,
          ownerPosition: position,
          liquidity: position.liquidity,
          slippage: 0,
          add: false,
          epochInfo
        })
        console.log('Amount calculations:', amounts)
      } catch (error) {
        logger.error('Failed to calculate position amounts:')
        console.log('Amount calculation error:', error)
        console.log('Amount calculation context:', {
          liquidity: position.liquidity.toString(),
          position,
          poolInfo
        })
        return null
      }

      const { amountA, amountB } = amounts

      // Validate final data before returning
      if (!poolInfo.mintA || !poolInfo.mintB) {
        logger.error('Invalid pool info: missing mint addresses')
        console.log('Mint addresses:', {
          mintA: poolInfo.mintA,
          mintB: poolInfo.mintB
        })
        return null
      }

      const positionInfo: PositionInfo = {
        address: positionAddress,
        poolAddress: poolIdString,
        baseTokenAddress: poolInfo.mintA.address,
        quoteTokenAddress: poolInfo.mintB.address,
        lowerPrice: priceLower.price,
        upperPrice: priceUpper.price,
        price: poolInfo.price,
        baseTokenAmount: Number(amountA.amount),
        quoteTokenAmount: Number(amountB.amount),
        baseFeeAmount: Number(position.tokenFeesOwedA?.toString() || '0'),
        quoteFeeAmount: Number(position.tokenFeesOwedB?.toString() || '0'),
        lowerBinId: position.tickLower,
        upperBinId: position.tickUpper
      }
      
      console.log('Final position info:', positionInfo)
      return positionInfo
    } catch (error) {
      logger.error(`Error getting position info for ${positionAddress}:`)
      console.log('Error:', error)
      return null
    }
  }

  // Helper function to convert tick index to price
  // private tickIndexToPrice(tickIndex: number, decimalsA: number, decimalsB: number): number {
  //   const tick = tickIndex;
  //   const sqrtPrice = Math.pow(1.0001, tick / 2);
  //   const price = Math.pow(sqrtPrice, 2);
    
  //   // Adjust for decimals
  //   const decimalAdjustment = Math.pow(10, decimalsA - decimalsB);
  //   return price * decimalAdjustment;
  // }

  // private async processPoolTickData(
  //   poolAddress: string,
  //   rawPool: any
  // ) {
  //   try {
  //     // Get pool tick data
  //     const poolDataResponse = await this.raydium.clmm.getPoolInfoFromRpc(poolAddress);
  //     logger.info(`Processing pool data for ${poolAddress}`);
  //     console.log('Pool data response:', poolDataResponse);
      
  //     if (!poolDataResponse?.tickData?.[poolAddress]) {
  //       logger.warn(`No tick data found for pool: ${poolAddress}`)
  //       return null;
  //     }
  //     const tickArrays = poolDataResponse.tickData[poolAddress];
  //     if (!tickArrays || typeof tickArrays !== 'object') {
  //       logger.warn(`Invalid tick data structure for pool: ${poolAddress}`);
  //       return null;
  //     }
  //     logger.info(`Processing tick arrays for ${poolAddress}`);
  //     console.log('Tick arrays:', tickArrays);

  //     // DEBUG: Inspect first tick array entry
  //     const firstArrayKey = Object.keys(tickArrays)[0];
  //     const firstArray = tickArrays[firstArrayKey];
  //     logger.debug('First tick array structure:', {
  //       key: firstArrayKey,
  //       startTickIndex: firstArray.startTickIndex,
  //       ticksLength: firstArray.ticks?.length,
  //       initializedTickCount: firstArray.initializedTickCount,
  //       address: firstArray.address?.toString(),
  //       tickSpacing: rawPool.tickSpacing,
  //       rawTickSample: firstArray.ticks?.[0] // First tick in array
  //     });

  //     // Process tick arrays into bins
  //     const bins = [];
      
  //     // Process each tick array
  //     for (const [arrayStartTick, tickArray] of Object.entries(tickArrays)) {
  //       const startTickIndex = Number(arrayStartTick);
  //       const tickSpacing = rawPool.tickSpacing;
        
  //       logger.debug(`Processing tick array starting at ${startTickIndex}`);
        
  //       if (!tickArray?.ticks || !Array.isArray(tickArray.ticks)) {
  //         logger.warn(`No valid ticks array found at index ${startTickIndex}`);
  //         continue;
  //       }

  //       // Get address safely
  //       const arrayAddress = tickArray?.address?.toString() || 'unknown';
        
  //       try {
  //         // Process each tick in the array with its offset
  //         tickArray.ticks.forEach((tick, i) => {
  //           if (!tick?.liquidityNet) return;
            
  //           const tickIndex = startTickIndex + (i * tickSpacing);
  //           const bin = {
  //             binId: tickIndex,
  //             price: this.tickIndexToPrice(
  //               tickIndex,
  //               rawPool.mintDecimalsA,
  //               rawPool.mintDecimalsB
  //             ),
  //             liquidity: tick.liquidityNet.toString(),
  //             reserveA: 0,
  //             reserveB: 0,
  //             address: arrayAddress
  //           };
  //           bins.push(bin);
  //         });
  //       } catch (error) {
  //         logger.error(`Error processing ticks in array ${startTickIndex}:`, error);
  //       }
  //     }

  //     logger.info(`Final bins array for ${poolAddress} (length: ${bins.length}):`, bins);
  //     // Sort bins by binId
  //     return bins.sort((a, b) => a.binId - b.binId);
  //   } catch (error) {
  //     logger.error(`Error in processPoolTickData for ${poolAddress}:`, error);
  //     console.error('Full error:', error);
  //     throw error; // Re-throw to maintain error propagation
  //   }
  // }

  // Add other methods similar to Meteora class...
}
