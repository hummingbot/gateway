import { 
  Raydium as RaydiumSDK, 
  ApiV3PoolInfoConcentratedItem,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  PositionInfoLayout, 
  CLMM_PROGRAM_ID,
  getPdaPersonalPositionAddress,
  PositionUtils,
  TickUtils,
  ClmmKeys,
  ClmmRpcData,
  TxVersion,
  AmmV4Keys,
  AmmV5Keys
} from '@raydium-io/raydium-sdk-v2'
import { isValidClmm, isValidAmm, isValidCpmm } from './raydium.utils'
import { logger } from '../../services/logger'
import { RaydiumConfig } from './raydium.config'
import { Solana } from '../../chains/solana/solana'
import { Keypair } from '@solana/web3.js'
import { PoolInfo as ClmmPoolInfo, PositionInfo } from '../../services/clmm-interfaces'
import { PoolInfo as AmmPoolInfo } from '../../services/amm-interfaces'
import { PublicKey } from '@solana/web3.js'
import { percentRegexp } from '../../services/config-manager-v2';

export class Raydium {
  private static _instances: { [name: string]: Raydium }
  private solana: Solana
  public raydiumSDK: RaydiumSDK
  public config: RaydiumConfig.NetworkConfig
  public txVersion: TxVersion
  private owner?: Keypair

  private constructor() {
    this.config = RaydiumConfig.config
    this.solana = null
    this.txVersion = TxVersion.V0
  }

  /** Gets singleton instance of Raydium */
  public static async getInstance(network: string): Promise<Raydium> {
    if (!Raydium._instances) {
      Raydium._instances = {}
    }

    if (!Raydium._instances[network]) {
      const instance = new Raydium()
      await instance.init(network)
      Raydium._instances[network] = instance
    }

    return Raydium._instances[network]
  }

  /** Initializes Raydium instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      
      // Load first wallet if available
      const walletAddress = await this.solana.getFirstWalletAddress();
      if (walletAddress) {
        this.owner = await this.solana.getWallet(walletAddress);
      }
      const raydiumCluster = this.solana.network == `mainnet-beta` ? 'mainnet' : 'devnet';

      // Initialize Raydium SDK with optional owner
      this.raydiumSDK = await RaydiumSDK.load({
        connection: this.solana.connection,
        cluster: raydiumCluster,
        owner: this.owner,  // undefined if no wallet present
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed'
      });

      logger.info("Raydium initialized" + (walletAddress ? ` with wallet: ${walletAddress}` : "with no wallet"));
    } catch (error) {
      logger.error("Raydium initialization failed:", error);
      throw error;
    }
  }

  async getClmmPoolfromRPC(poolAddress: string): Promise<ClmmRpcData | null> {
    const poolInfoResponse: ClmmRpcData = await this.raydiumSDK.clmm.getRpcClmmPoolInfo({ poolId: poolAddress })
    return poolInfoResponse
  }

  async getClmmPoolfromAPI(poolAddress: string): Promise<[ApiV3PoolInfoConcentratedItem, ClmmKeys] | null> {
    const poolInfoResponse = await this.raydiumSDK.api.fetchPoolById({ ids: poolAddress })
    let poolInfo: ApiV3PoolInfoConcentratedItem
    let poolKeys: ClmmKeys | undefined

    if (this.solana.network === 'mainnet-beta') {
      const data = await this.raydiumSDK.api.fetchPoolById({ ids: poolAddress })
      poolInfo = data[0] as ApiV3PoolInfoConcentratedItem
    } else {
      const data = await this.raydiumSDK.clmm.getPoolInfoFromRpc(poolAddress)
      poolInfo = data.poolInfo
      poolKeys = data.poolKeys
    }
    if (!poolInfoResponse || !poolInfoResponse[0]) {
      logger.error('Pool not found for address: ' + poolAddress)
      return null
    }
    return [poolInfo, poolKeys]
  }

  async getClmmPoolInfo(poolAddress: string): Promise<ClmmPoolInfo | null> {
    try {
      const rawPool = await this.getClmmPoolfromRPC(poolAddress)
      console.log('rawPool', rawPool)

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
          logger.error(`Error fetching CLMM pool info for ${poolAddress}: ${e}`);
        }
      }

      const vaultABalance = (await this.solana.connection.getTokenAccountBalance(rawPool.vaultA)).value.uiAmount;
      const vaultBBalance = (await this.solana.connection.getTokenAccountBalance(rawPool.vaultB)).value.uiAmount;

      const poolInfo: ClmmPoolInfo = {
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
      logger.error(`Error getting CLMM pool info for ${poolAddress}:`, error)
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
      const poolIdString = position.poolId.toBase58()
      const [poolInfo, poolKeys] = await this.getClmmPoolfromAPI(poolIdString)
      console.log('poolInfo', poolInfo)
      console.log('poolKeys', poolKeys)
    
      const epochInfo = await this.solana.connection.getEpochInfo()

      const priceLower = TickUtils.getTickPrice({
        poolInfo,
        tick: position.tickLower,
        baseIn: true,
      })
      const priceUpper = TickUtils.getTickPrice({
        poolInfo,
        tick: position.tickUpper,
        baseIn: true,
      })

      const amounts = PositionUtils.getAmountsFromLiquidity({
        poolInfo: poolInfo,
        ownerPosition: position,
        liquidity: position.liquidity,
        slippage: 0,
        add: false,
        epochInfo
      })
      const { amountA, amountB } = amounts

      return {
        address: positionAddress,
        poolAddress: poolIdString,
        baseTokenAddress: poolInfo.mintA.address,
        quoteTokenAddress: poolInfo.mintB.address,
        lowerPrice: Number(priceLower.price),
        upperPrice: Number(priceUpper.price),
        price: Number(poolInfo.price),
        baseTokenAmount: Number(amountA.amount),
        quoteTokenAmount: Number(amountB.amount),
        baseFeeAmount: Number(position.tokenFeesOwedA?.toString() || '0'),
        quoteFeeAmount: Number(position.tokenFeesOwedB?.toString() || '0'),
        lowerBinId: position.tickLower,
        upperBinId: position.tickUpper
      }
    } catch (error) {
      logger.error('Error in getPositionInfo:', error)
      return null
    }
  }

  // General Pool Methods
  async getPoolfromAPI(poolAddress: string): Promise<[ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm, AmmV4Keys | AmmV5Keys] | null> {
    try {
      let poolInfo: ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
      let poolKeys: AmmV4Keys | AmmV5Keys;

      if (this.solana.network === 'mainnet-beta') {
        const data = await this.raydiumSDK.api.fetchPoolById({ ids: poolAddress });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
      } else {
        const data = await this.raydiumSDK.liquidity.getPoolInfoFromRpc({ poolId: poolAddress });
        poolInfo = data.poolInfo as ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
        poolKeys = data.poolKeys as AmmV4Keys | AmmV5Keys;
      }
      console.log('poolInfo', poolInfo)

      if (!poolInfo) {
        logger.error('Pool not found for address: ' + poolAddress);
        return null;
      }

      return [poolInfo, poolKeys];
    } catch (error) {
      logger.error(`Error getting AMM pool info from API for ${poolAddress}:`, error);
      return null;
    }
  }

  async getPoolType(poolAddress: string): Promise<string> {
    const [poolInfo] = await this.getPoolfromAPI(poolAddress)
    if (isValidClmm(poolInfo.programId)) {
      return 'clmm'
    } else if (isValidAmm(poolInfo.programId)) {
      return 'amm'
    } else if (isValidCpmm(poolInfo.programId)) {
      return 'cpmm'
    }
    return null
  }

  // AMM Pool Methods
  async getAmmPoolInfo(poolAddress: string): Promise<AmmPoolInfo | null> {
    try {
      const poolType = await this.getPoolType(poolAddress)
      let poolInfo: AmmPoolInfo
      if (poolType === 'amm') {
        const rawPool = await this.raydiumSDK.liquidity.getRpcPoolInfos([poolAddress])
        console.log('ammPoolInfo', rawPool)

        poolInfo = {
          address: poolAddress,
          baseTokenAddress: rawPool[poolAddress].baseMint.toString(),
          quoteTokenAddress: rawPool[poolAddress].quoteMint.toString(),
          feePct: Number(rawPool[poolAddress].tradeFeeNumerator) / Number(rawPool[poolAddress].tradeFeeDenominator),
          price: Number(rawPool[poolAddress].poolPrice),
          baseTokenAmount: Number(rawPool[poolAddress].mintAAmount) / 10 ** Number(rawPool[poolAddress].baseDecimal),
          quoteTokenAmount: Number(rawPool[poolAddress].mintBAmount) / 10 ** Number(rawPool[poolAddress].quoteDecimal),
          poolType: poolType,
        }
        return poolInfo
      } else if (poolType === 'cpmm') {
        const rawPool = await this.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress])
        console.log('cpmmPoolInfo', rawPool)

        poolInfo = {
          address: poolAddress,
          baseTokenAddress: rawPool[poolAddress].mintA.toString(),
          quoteTokenAddress: rawPool[poolAddress].mintB.toString(),
          feePct: Number(rawPool[poolAddress].configInfo?.tradeFeeRate || 0),
          price: Number(rawPool[poolAddress].poolPrice),
          baseTokenAmount: Number(rawPool[poolAddress].baseReserve) / 10 ** Number(rawPool[poolAddress].mintDecimalA),
          quoteTokenAmount: Number(rawPool[poolAddress].quoteReserve) / 10 ** Number(rawPool[poolAddress].mintDecimalB),
          poolType: poolType,
        }
        return poolInfo
      }
    } catch (error) {
      logger.error(`Error getting AMM pool info for ${poolAddress}:`, error)
      return null
    }
  }  

  // General Slippage Settings
  getSlippagePct(): number {
    const allowedSlippage = this.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) {
      slippage = Number(nd[1]) / Number(nd[2]);
    } else {
      logger.error('Failed to parse slippage value:', allowedSlippage);
    }
    return slippage * 100;
  }

}