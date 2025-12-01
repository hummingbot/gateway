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
  AmmV5Keys,
} from '@raydium-io/raydium-sdk-v2';
import { Keypair, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { SolanaLedger } from '../../chains/solana/solana-ledger';
import { PoolInfo as AmmPoolInfo } from '../../schemas/amm-schema';
import { PoolInfo as ClmmPoolInfo, PositionInfo } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { RaydiumConfig } from './raydium.config';
import { isValidClmm, isValidAmm, isValidCpmm } from './raydium.utils';

// Internal type that includes poolType for internal use
interface InternalAmmPoolInfo extends AmmPoolInfo {
  poolType?: 'amm' | 'cpmm';
}

export class Raydium {
  private static _instances: { [name: string]: Raydium };
  public solana: Solana; // Changed to public for use in route handlers
  public raydiumSDK: RaydiumSDK;
  public config: RaydiumConfig.RootConfig;
  public txVersion: TxVersion;
  private owner?: Keypair;

  private constructor() {
    this.config = RaydiumConfig.config;
    this.solana = null;
    this.txVersion = TxVersion.V0;
  }

  /** Gets singleton instance of Raydium */
  public static async getInstance(network: string): Promise<Raydium> {
    if (!Raydium._instances) {
      Raydium._instances = {};
    }

    if (!Raydium._instances[network]) {
      const instance = new Raydium();
      await instance.init(network);
      Raydium._instances[network] = instance;
    }

    return Raydium._instances[network];
  }

  /** Initializes Raydium instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);

      // Skip loading owner wallet - it will be provided in each operation
      const raydiumCluster = this.solana.network == `mainnet-beta` ? 'mainnet' : 'devnet';

      // Initialize Raydium SDK with optional owner
      this.raydiumSDK = await RaydiumSDK.load({
        connection: this.solana.connection,
        cluster: raydiumCluster,
        owner: this.owner, // undefined if no wallet present
        disableFeatureCheck: true,
        blockhashCommitment: 'confirmed',
      });

      logger.info('Raydium initialized with no default wallet');
    } catch (error) {
      logger.error('Raydium initialization failed:', error);
      throw error;
    }
  }

  /** Sets the owner for SDK operations */
  public async setOwner(owner: Keypair | PublicKey): Promise<void> {
    // If it's a PublicKey (hardware wallet), we only set it for read operations
    // For transaction building, we'll use the public key but sign externally
    this.owner = owner as Keypair;
    const raydiumCluster = this.solana.network == `mainnet-beta` ? 'mainnet' : 'devnet';

    // For hardware wallets (PublicKey), we need to create a dummy Keypair for SDK initialization
    // The SDK will use this for reading owner's positions, but we'll handle signing separately
    let sdkOwner: Keypair;
    if (owner instanceof PublicKey) {
      // Create a dummy keypair with the same public key for read-only operations
      sdkOwner = Keypair.generate();
      // Override the publicKey getter to return the hardware wallet's public key
      Object.defineProperty(sdkOwner, 'publicKey', {
        get: () => owner,
        configurable: true,
      });
    } else {
      sdkOwner = owner;
    }

    // Reinitialize SDK with the owner
    this.raydiumSDK = await RaydiumSDK.load({
      connection: this.solana.connection,
      cluster: raydiumCluster,
      owner: sdkOwner,
      disableFeatureCheck: true,
      blockhashCommitment: 'confirmed',
    });

    logger.info('Raydium SDK reinitialized with owner');
  }

  async getClmmPoolfromRPC(poolAddress: string): Promise<ClmmRpcData | null> {
    const poolInfoResponse: ClmmRpcData = await this.raydiumSDK.clmm.getRpcClmmPoolInfo({ poolId: poolAddress });
    return poolInfoResponse;
  }

  async getClmmPoolfromAPI(poolAddress: string): Promise<[ApiV3PoolInfoConcentratedItem, ClmmKeys] | null> {
    const poolInfoResponse = await this.raydiumSDK.api.fetchPoolById({
      ids: poolAddress,
    });
    let poolInfo: ApiV3PoolInfoConcentratedItem;
    let poolKeys: ClmmKeys | undefined;

    if (this.solana.network === 'mainnet-beta') {
      const data = await this.raydiumSDK.api.fetchPoolById({
        ids: poolAddress,
      });
      poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
    } else {
      const data = await this.raydiumSDK.clmm.getPoolInfoFromRpc(poolAddress);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }
    if (!poolInfoResponse || !poolInfoResponse[0]) {
      logger.error('Pool not found for address: ' + poolAddress);
      return null;
    }
    return [poolInfo, poolKeys];
  }

  async getClmmPoolInfo(poolAddress: string): Promise<ClmmPoolInfo | null> {
    try {
      const rawPool = await this.getClmmPoolfromRPC(poolAddress);

      // Fetch AMM config account data
      let ammConfigData;
      if (rawPool.ammConfig) {
        try {
          const configAccount = await this.solana.connection.getAccountInfo(rawPool.ammConfig);
          if (configAccount) {
            const dataBuffer = configAccount.data;
            ammConfigData = {
              // 47 is the offset for tradeFeeRate in the dataBuffer
              tradeFeeRate: dataBuffer.readUInt32LE(47) / 10000,
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
      };
      return poolInfo;
    } catch (error) {
      logger.debug(`Could not decode ${poolAddress} as Raydium CLMM pool: ${error}`);
      return null;
    }
  }

  async getClmmPosition(positionAddress: string): Promise<any> {
    const positionNftMint = new PublicKey(positionAddress);
    const positionPubKey = getPdaPersonalPositionAddress(CLMM_PROGRAM_ID, positionNftMint).publicKey;
    const positionAccount = await this.solana.connection.getAccountInfo(new PublicKey(positionPubKey));

    if (!positionAccount) {
      logger.warn(`Position account not found: ${positionAddress}`);
      return null;
    }

    const position = PositionInfoLayout.decode(positionAccount.data);
    return position;
  }

  async getPositionInfo(positionAddress: string): Promise<PositionInfo | null> {
    try {
      const position = await this.getClmmPosition(positionAddress);
      const poolIdString = position.poolId.toBase58();
      const [poolInfo, poolKeys] = await this.getClmmPoolfromAPI(poolIdString);

      const epochInfo = await this.solana.connection.getEpochInfo();

      const priceLower = TickUtils.getTickPrice({
        poolInfo,
        tick: position.tickLower,
        baseIn: true,
      });
      const priceUpper = TickUtils.getTickPrice({
        poolInfo,
        tick: position.tickUpper,
        baseIn: true,
      });

      const amounts = PositionUtils.getAmountsFromLiquidity({
        poolInfo: poolInfo,
        ownerPosition: position,
        liquidity: position.liquidity,
        slippage: 0,
        add: false,
        epochInfo,
      });
      const { amountA, amountB } = amounts;

      return {
        address: positionAddress,
        poolAddress: poolIdString,
        baseTokenAddress: poolInfo.mintA.address,
        quoteTokenAddress: poolInfo.mintB.address,
        lowerPrice: Number(priceLower.price),
        upperPrice: Number(priceUpper.price),
        price: Number(poolInfo.price),
        baseTokenAmount: Number(amountA.amount) / 10 ** Number(poolInfo.mintA.decimals),
        quoteTokenAmount: Number(amountB.amount) / 10 ** Number(poolInfo.mintB.decimals),
        baseFeeAmount: Number(position.tokenFeesOwedA?.toString() || '0'),
        quoteFeeAmount: Number(position.tokenFeesOwedB?.toString() || '0'),
        lowerBinId: position.tickLower,
        upperBinId: position.tickUpper,
      };
    } catch (error) {
      logger.error('Error in getPositionInfo:', error);
      return null;
    }
  }

  // General Pool Methods
  async getPoolfromAPI(
    poolAddress: string,
  ): Promise<[ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm, AmmV4Keys | AmmV5Keys] | null> {
    try {
      let poolInfo: ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
      let poolKeys: AmmV4Keys | AmmV5Keys;

      if (this.solana.network === 'mainnet-beta') {
        const data = await this.raydiumSDK.api.fetchPoolById({
          ids: poolAddress,
        });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
      } else {
        const data = await this.raydiumSDK.liquidity.getPoolInfoFromRpc({
          poolId: poolAddress,
        });
        poolInfo = data.poolInfo as ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm;
        poolKeys = data.poolKeys as AmmV4Keys | AmmV5Keys;
      }

      if (!poolInfo) {
        logger.error('Pool not found for address: ' + poolAddress);
        return null;
      }

      return [poolInfo, poolKeys];
    } catch (error) {
      logger.debug(`Could not fetch Raydium AMM pool info from API for ${poolAddress}: ${error}`);
      return null;
    }
  }

  async getPoolType(poolAddress: string): Promise<string> {
    const [poolInfo] = await this.getPoolfromAPI(poolAddress);
    if (isValidClmm(poolInfo.programId)) {
      return 'clmm';
    } else if (isValidAmm(poolInfo.programId)) {
      return 'amm';
    } else if (isValidCpmm(poolInfo.programId)) {
      return 'cpmm';
    }
    return null;
  }

  // AMM Pool Methods
  async getAmmPoolInfo(poolAddress: string): Promise<InternalAmmPoolInfo | null> {
    try {
      const poolType = await this.getPoolType(poolAddress);
      let poolInfo: InternalAmmPoolInfo;
      if (poolType === 'amm') {
        const rawPool = await this.raydiumSDK.liquidity.getRpcPoolInfos([poolAddress]);

        poolInfo = {
          address: poolAddress,
          baseTokenAddress: rawPool[poolAddress].baseMint.toString(),
          quoteTokenAddress: rawPool[poolAddress].quoteMint.toString(),
          feePct: Number(rawPool[poolAddress].tradeFeeNumerator) / Number(rawPool[poolAddress].tradeFeeDenominator),
          price: Number(rawPool[poolAddress].poolPrice),
          baseTokenAmount: Number(rawPool[poolAddress].mintAAmount) / 10 ** Number(rawPool[poolAddress].baseDecimal),
          quoteTokenAmount: Number(rawPool[poolAddress].mintBAmount) / 10 ** Number(rawPool[poolAddress].quoteDecimal),
          poolType: poolType,
        };
        return poolInfo;
      } else if (poolType === 'cpmm') {
        const rawPool = await this.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress]);

        poolInfo = {
          address: poolAddress,
          baseTokenAddress: rawPool[poolAddress].mintA.toString(),
          quoteTokenAddress: rawPool[poolAddress].mintB.toString(),
          feePct: Number(rawPool[poolAddress].configInfo?.tradeFeeRate || 0),
          price: Number(rawPool[poolAddress].poolPrice),
          baseTokenAmount: Number(rawPool[poolAddress].baseReserve) / 10 ** Number(rawPool[poolAddress].mintDecimalA),
          quoteTokenAmount: Number(rawPool[poolAddress].quoteReserve) / 10 ** Number(rawPool[poolAddress].mintDecimalB),
          poolType: poolType,
        };
        return poolInfo;
      }
    } catch (error) {
      logger.debug(`Could not decode ${poolAddress} as Raydium AMM pool: ${error}`);
      return null;
    }
  }

  private getPairKey(baseToken: string, quoteToken: string): string {
    return `${baseToken}-${quoteToken}`;
  }

  /**
   * Execute a transaction using the SDK V2 execute pattern
   * This provides a unified way to handle transaction execution
   *
   * @param executeFunc The execute function returned by SDK methods
   * @returns Transaction ID
   */
  async executeTransaction(executeFunc: () => Promise<{ txId: string }>): Promise<string> {
    try {
      const result = await executeFunc();
      logger.info(`Transaction executed successfully: ${result.txId}`);
      return result.txId;
    } catch (error: any) {
      logger.error('Transaction execution failed:', error);

      // Handle common Solana errors
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient SOL balance for transaction fees');
      }
      if (error.message?.includes('slippage')) {
        throw new Error('Transaction failed due to slippage. Try increasing slippage tolerance.');
      }
      if (error.message?.includes('blockhash')) {
        throw new Error('Transaction expired. Please try again.');
      }

      throw error;
    }
  }

  async findDefaultPool(_baseToken: string, _quoteToken: string, _routeType: 'amm' | 'clmm'): Promise<string | null> {
    // Pools are now managed separately, return null for dynamic pool discovery
    return null;
  }

  /**
   * Helper function to prepare wallet for transaction operations
   * Returns the wallet/public key and whether it's a hardware wallet
   */
  public async prepareWallet(walletAddress: string): Promise<{
    wallet: Keypair | PublicKey;
    isHardwareWallet: boolean;
  }> {
    const isHardwareWallet = await this.solana.isHardwareWallet(walletAddress);
    const wallet = isHardwareWallet
      ? await this.solana.getPublicKey(walletAddress)
      : await this.solana.getWallet(walletAddress);

    // Set the owner for SDK operations
    await this.setOwner(wallet);

    return { wallet, isHardwareWallet };
  }

  /**
   * Helper function to sign transaction with hardware or regular wallet
   */
  public async signTransaction(
    transaction: VersionedTransaction | Transaction,
    walletAddress: string,
    isHardwareWallet: boolean,
    wallet: Keypair | PublicKey,
  ): Promise<VersionedTransaction | Transaction> {
    if (isHardwareWallet) {
      logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
      const ledger = new SolanaLedger();
      return await ledger.signTransaction(walletAddress, transaction);
    } else {
      // Regular wallet - sign normally
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([wallet as Keypair]);
      } else {
        (transaction as Transaction).sign(wallet as Keypair);
      }
      return transaction;
    }
  }
}
