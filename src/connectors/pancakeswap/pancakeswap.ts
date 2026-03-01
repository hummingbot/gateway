// V3 (CLMM) imports
import { Token, CurrencyAmount, Percent, TradeType } from '@pancakeswap/sdk';
import { PoolType } from '@pancakeswap/smart-router';
import { Pair as V2Pair } from '@pancakeswap/v2-sdk';
import { abi as IPancakeswapV3FactoryABI } from '@pancakeswap/v3-core/artifacts/contracts/interfaces/IPancakeV3Factory.sol/IPancakeV3Factory.json';
import { abi as IPancakeswapV3PoolABI } from '@pancakeswap/v3-core/artifacts/contracts/interfaces/IPancakeV3Pool.sol/IPancakeV3Pool.json';
import { FeeAmount, Pool as V3Pool, tickToPrice } from '@pancakeswap/v3-sdk';
import { Contract, constants, utils } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import { Address } from 'viem';

import { Ethereum, TokenInfo } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { PancakeswapConfig } from './pancakeswap.config';
import {
  IPancakeswapV2PairABI,
  IPancakeswapV2FactoryABI,
  IPancakeswapV2Router02ABI,
  getPancakeswapV2RouterAddress,
  getPancakeswapV2FactoryAddress,
  getPancakeswapV3NftManagerAddress,
  getPancakeswapV3QuoterV2ContractAddress,
  getPancakeswapV3FactoryAddress,
  getPancakeswapV3MasterchefAddress,
} from './pancakeswap.contracts';
import { isValidV2Pool, isValidV3Pool } from './pancakeswap.utils';
import PancakeswapV3MasterchefABI from './PancakeswapV3Masterchef.abi.json';
import { UniversalRouterService } from './universal-router';

export class Pancakeswap {
  private static _instances: { [name: string]: Pancakeswap };

  // Ethereum chain instance
  private ethereum: Ethereum;

  // Configuration
  public config: PancakeswapConfig.RootConfig;

  // Common properties
  private chainId: number;
  private _ready: boolean = false;

  // V2 (AMM) properties
  private v2Factory: Contract;
  private v2Router: Contract;

  // V3 (CLMM) properties
  private v3Factory: Contract;
  private v3NFTManager: Contract;
  private v3Quoter: Contract;
  private universalRouter: UniversalRouterService;
  private masterChef: Contract;

  // Network information
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = PancakeswapConfig.config;
  }

  public static async getInstance(network: string): Promise<Pancakeswap> {
    if (Pancakeswap._instances === undefined) {
      Pancakeswap._instances = {};
    }

    if (!(network in Pancakeswap._instances)) {
      Pancakeswap._instances[network] = new Pancakeswap(network);
      await Pancakeswap._instances[network].init();
    }

    return Pancakeswap._instances[network];
  }

  /**
   * Initialize the Pancakeswap instance
   */
  public async init() {
    try {
      // Initialize the Ethereum chain instance
      this.ethereum = await Ethereum.getInstance(this.networkName);
      this.chainId = this.ethereum.chainId;

      // Initialize V2 (AMM) contracts
      this.v2Factory = new Contract(
        getPancakeswapV2FactoryAddress(this.networkName),
        IPancakeswapV2FactoryABI.abi,
        this.ethereum.provider,
      );

      this.v2Router = new Contract(
        getPancakeswapV2RouterAddress(this.networkName),
        IPancakeswapV2Router02ABI.abi,
        this.ethereum.provider,
      );

      // Initialize V3 (CLMM) contracts
      this.v3Factory = new Contract(
        getPancakeswapV3FactoryAddress(this.networkName),
        IPancakeswapV3FactoryABI,
        this.ethereum.provider,
      );

      // Initialize NFT Manager with minimal ABI
      this.v3NFTManager = new Contract(
        getPancakeswapV3NftManagerAddress(this.networkName),
        [
          {
            inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      // Initialize Quoter with minimal ABI
      this.v3Quoter = new Contract(
        getPancakeswapV3QuoterV2ContractAddress(this.networkName),
        [
          {
            inputs: [
              { internalType: 'bytes', name: 'path', type: 'bytes' },
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
            ],
            name: 'quoteExactInput',
            outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      // Initialize Universal Router service
      this.universalRouter = new UniversalRouterService(this.ethereum.provider, this.chainId, this.networkName);

      // Initialize MasterChef contract with full ABI
      this.masterChef = new Contract(
        getPancakeswapV3MasterchefAddress(this.networkName),
        PancakeswapV3MasterchefABI,
        this.ethereum.provider,
      );

      // Ensure ethereum is initialized
      if (!this.ethereum.ready()) {
        await this.ethereum.init();
      }

      this._ready = true;
      logger.info(`Pancakeswap connector initialized for network: ${this.networkName}`);
    } catch (error) {
      logger.error(`Error initializing Pancakeswap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the Pancakeswap instance is ready
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Get token by symbol or address from local token list
   */
  public async getToken(symbolOrAddress: string): Promise<Token | null> {
    const tokenInfo = await this.ethereum.getToken(symbolOrAddress);
    return tokenInfo ? this.getPancakeswapToken(tokenInfo) : null;
  }

  /**
   * Create a Pancakeswap SDK Token object from token info
   * @param tokenInfo Token information from Ethereum
   * @returns Pancakeswap SDK Token object
   */
  public getPancakeswapToken(tokenInfo: TokenInfo): Token {
    return new Token(
      this.ethereum.chainId,
      tokenInfo.address as Address,
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name,
    );
  }

  /**
   * Get a quote from Universal Router for token swaps
   * @param inputToken The token being swapped from
   * @param outputToken The token being swapped to
   * @param amount The amount to swap
   * @param side The trade direction (BUY or SELL)
   * @param walletAddress The recipient wallet address (optional for quotes)
   * @returns Quote result from Universal Router
   */
  public async getUniversalRouterQuote(
    inputToken: Token,
    outputToken: Token,
    amount: number,
    side: 'BUY' | 'SELL',
    walletAddress?: string,
  ): Promise<any> {
    // Determine input/output based on side
    const exactIn = side === 'SELL';
    const tokenForAmount = exactIn ? inputToken : outputToken;

    // Convert amount to token units using string manipulation to avoid BigInt conversion issues
    const amountStr = amount.toFixed(tokenForAmount.decimals);
    const rawAmount = amountStr.replace('.', '');
    const tradeAmount = CurrencyAmount.fromRawAmount(tokenForAmount, rawAmount);

    // Use default PoolType (V2 and V3)
    const protocolsToUse = [PoolType.V2, PoolType.V3]; // V4 requires different approach

    // Get slippage from config
    const slippageTolerance = new Percent(Math.floor(this.config.slippagePct * 100), 10000);

    // Get quote from Universal Router
    // Use a placeholder address for quotes when no wallet is provided
    const recipient = walletAddress || '0x0000000000000000000000000000000000000001';
    const quoteResult = await this.universalRouter.getQuote(
      inputToken,
      outputToken,
      tradeAmount,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      {
        slippageTolerance,
        deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
        recipient,
        protocols: protocolsToUse,
        maxHops: this.config.maximumHops,
        maxSplits: this.config.maximumSplits,
      },
    );

    return quoteResult;
  }

  /**
   * Get a V2 pool (pair) by its address or by token symbols
   */
  public async getV2Pool(tokenA: Token | string, tokenB: Token | string, poolAddress?: string): Promise<V2Pair | null> {
    try {
      // Resolve pool address if provided
      let pairAddress = poolAddress;

      // If tokenA and tokenB are strings, resolve them to Token objects
      const tokenAObj = typeof tokenA === 'string' ? await this.getToken(tokenA) : tokenA;
      const tokenBObj = typeof tokenB === 'string' ? await this.getToken(tokenB) : tokenB;

      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }

      // Find pool address if not provided
      if (!pairAddress) {
        // Try to get it from the factory
        pairAddress = await this.v2Factory.getPair(tokenAObj.address, tokenBObj.address);
      }

      // If no pair exists or invalid address, return null
      if (!pairAddress || pairAddress === constants.AddressZero) {
        return null;
      }

      // Check if pool is valid
      const isValid = await isValidV2Pool(pairAddress);
      if (!isValid) {
        return null;
      }

      // Get pair data from the contract
      const pairContract = new Contract(pairAddress, IPancakeswapV2PairABI.abi, this.ethereum.provider);

      const [reserves, token0Address] = await Promise.all([pairContract.getReserves(), pairContract.token0()]);

      const [reserve0, reserve1] = reserves;
      const token0 = getAddress(token0Address) === getAddress(tokenAObj.address) ? tokenAObj : tokenBObj;
      const token1 = token0.address === tokenAObj.address ? tokenBObj : tokenAObj;

      return new V2Pair(
        CurrencyAmount.fromRawAmount(token0, reserve0.toString()),
        CurrencyAmount.fromRawAmount(token1, reserve1.toString()),
      );
    } catch (error) {
      logger.error(`Error getting V2 pool: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a V3 pool by its address or by token symbols and fee
   */
  public async getV3Pool(
    tokenA: Token | string,
    tokenB: Token | string,
    fee?: FeeAmount,
    poolAddress?: string,
  ): Promise<V3Pool | null> {
    try {
      // Resolve pool address if provided
      let poolAddr = poolAddress;

      // If tokenA and tokenB are strings, resolve them to Token objects
      const tokenAObj = typeof tokenA === 'string' ? await this.getToken(tokenA) : tokenA;
      const tokenBObj = typeof tokenB === 'string' ? await this.getToken(tokenB) : tokenB;

      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }

      // Find pool address if not provided
      if (!poolAddr) {
        // If a fee is provided, try to get it from the factory
        if (fee) {
          poolAddr = await this.v3Factory.getPool(tokenAObj.address, tokenBObj.address, fee);
        }

        // If still not found, try all possible fee tiers
        if (!poolAddr) {
          // Try each fee tier
          const allFeeTiers = [FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

          for (const feeTier of allFeeTiers) {
            if (feeTier === fee) continue; // Skip if we already tried this fee tier

            poolAddr = await this.v3Factory.getPool(tokenAObj.address, tokenBObj.address, feeTier);

            if (poolAddr && poolAddr !== constants.AddressZero) {
              break;
            }
          }
        }
      }

      // If no pool exists or invalid address, return null
      if (!poolAddr || poolAddr === constants.AddressZero) {
        return null;
      }

      // Check if pool is valid
      const isValid = await isValidV3Pool(poolAddr);
      if (!isValid) {
        return null;
      }

      // Get pool data from the contract
      const poolContract = new Contract(poolAddr, IPancakeswapV3PoolABI, this.ethereum.provider);

      const [liquidity, slot0, feeData] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0(),
        poolContract.fee(),
      ]);

      const [sqrtPriceX96, tick] = slot0;

      // Create the pool with a tick data provider to avoid 'No tick data provider' error
      return new V3Pool(
        tokenAObj,
        tokenBObj,
        feeData,
        sqrtPriceX96.toString(),
        liquidity.toString(),
        tick,
        // Add a tick data provider to make SDK operations work
        {
          async getTick(index) {
            return {
              index,
              liquidityNet: 0,
              liquidityGross: 0,
            };
          },
          async nextInitializedTickWithinOneWord(tick, lte, tickSpacing) {
            // Always return a valid result to prevent errors
            // Use the direction parameter (lte) to determine which way to go
            const nextTick = lte ? tick - tickSpacing : tick + tickSpacing;
            return [nextTick, false];
          },
        },
      );
    } catch (error) {
      logger.error(`Error getting V3 pool: ${error.message}`);
      return null;
    }
  }

  /**
   * Find a default pool for a token pair in either AMM or CLMM
   */
  public async findDefaultPool(
    baseToken: string,
    quoteToken: string,
    poolType: 'amm' | 'clmm',
  ): Promise<string | null> {
    try {
      logger.info(`Finding ${poolType} pool for ${baseToken}-${quoteToken} on ${this.networkName}`);

      // Resolve token symbols if addresses are provided
      const baseTokenInfo = await this.ethereum.getToken(baseToken);
      const quoteTokenInfo = await this.ethereum.getToken(quoteToken);

      if (!baseTokenInfo || !quoteTokenInfo) {
        logger.warn(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
        return null;
      }

      const baseToken_sdk = this.getPancakeswapToken(baseTokenInfo);
      const quoteToken_sdk = this.getPancakeswapToken(quoteTokenInfo);

      logger.info(
        `Resolved tokens: ${baseToken_sdk.symbol} (${baseToken_sdk.address}), ${quoteToken_sdk.symbol} (${quoteToken_sdk.address})`,
      );

      // Use PoolService to find pool by token pair
      const { PoolService } = await import('../../services/pool-service');
      const poolService = PoolService.getInstance();

      const pool = await poolService.getPool(
        'pancakeswap',
        this.networkName,
        poolType,
        baseTokenInfo.symbol,
        quoteTokenInfo.symbol,
      );

      if (!pool) {
        logger.warn(
          `No ${poolType} pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Pancakeswap network ${this.networkName}`,
        );
        return null;
      }

      logger.info(`Found ${poolType} pool at ${pool.address}`);
      return pool.address;
    } catch (error) {
      logger.error(`Error finding default pool: ${error.message}`);
      if (error.stack) {
        logger.debug(`Stack trace: ${error.stack}`);
      }
      return null;
    }
  }

  /**
   * Get the first available wallet address from Ethereum
   */
  public async getFirstWalletAddress(): Promise<string | null> {
    try {
      return await Ethereum.getFirstWalletAddress();
    } catch (error) {
      logger.error(`Error getting first wallet address: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the pool ID for a V3 pool address from MasterChef (returns 0 if not registered)
   */
  public async getV3PoolIdFromMasterChef(poolAddress: string): Promise<number> {
    const contract = new Contract(this.masterChef.address, PancakeswapV3MasterchefABI, this.ethereum.provider);
    const pid = await contract.v3PoolAddressPid(poolAddress);
    return Number(pid);
  }

  /**
   * Get MasterChef reward data for a V3 pool, useful for APR estimation.
   * @param poolAddress The V3 pool contract address
   * @returns Pool ID, CAKE rewards per second (in CAKE units), reward period end time (unix), and active status
   */
  public async getPoolMasterchefData(poolAddress: string): Promise<{
    poolId: number;
    cakePerSecond: number;
    rewardEndTime: number;
    isRewardActive: boolean;
  }> {
    try {
      const [poolId, periodInfo] = await Promise.all([
        this.getV3PoolIdFromMasterChef(poolAddress),
        this.masterChef.getLatestPeriodInfo(poolAddress),
      ]);

      const [cakePerSecondRaw, endTime] = periodInfo;
      const now = Math.floor(Date.now() / 1000);
      const rewardEndTime = Number(endTime);
      const isRewardActive = rewardEndTime > now;
      // CAKE token has 18 decimals
      const cakePerSecond = parseFloat(cakePerSecondRaw.toString()) / 1e18;

      return { poolId, cakePerSecond, rewardEndTime, isRewardActive };
    } catch (error) {
      logger.error(`Failed to get MasterChef data for pool ${poolAddress}: ${error.message}`);
      return { poolId: 0, cakePerSecond: 0, rewardEndTime: 0, isRewardActive: false };
    }
  }

  /**
   * Get a V3 pool by token addresses and fee
   */
  private async getV3PoolByTokens(token0: string, token1: string, fee: number): Promise<string | null> {
    try {
      const poolAddress = await this.v3Factory.getPool(token0, token1, fee);
      if (poolAddress && poolAddress !== constants.AddressZero) {
        return poolAddress;
      }
      return null;
    } catch (error) {
      logger.error(`Error getting pool: ${error.message}`);
      return null;
    }
  }

  /**
   * Check NFT ownership for Pancakeswap V3 positions
   * @param positionId The NFT position ID
   * @param walletAddress The wallet address to check ownership for
   * @throws Error if position is not owned by wallet or position ID is invalid
   */
  public async checkNFTOwnership(positionId: string, walletAddress: string): Promise<void> {
    const nftContract = new Contract(
      getPancakeswapV3NftManagerAddress(this.networkName),
      [
        {
          inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
          name: 'ownerOf',
          outputs: [{ internalType: 'address', name: '', type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      this.ethereum.provider,
    );

    try {
      const owner = await nftContract.ownerOf(positionId);
      if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error(`Position ${positionId} is not owned by wallet ${walletAddress}`);
      }
    } catch (error: any) {
      if (error.message.includes('is not owned by')) {
        throw error;
      }
      throw new Error(`Invalid position ID ${positionId}`);
    }
  }

  /**
   * Check NFT approval for Pancakeswap V3 positions
   * @param positionId The NFT position ID
   * @param walletAddress The wallet address that owns the NFT
   * @param operatorAddress The address that needs approval (usually the position manager itself)
   * @throws Error if NFT is not approved
   */
  public async checkNFTApproval(positionId: string, walletAddress: string, operatorAddress: string): Promise<void> {
    const nftContract = new Contract(
      getPancakeswapV3NftManagerAddress(this.networkName),
      [
        {
          inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
          name: 'getApproved',
          outputs: [{ internalType: 'address', name: '', type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        },
        {
          inputs: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'operator', type: 'address' },
          ],
          name: 'isApprovedForAll',
          outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      this.ethereum.provider,
    );

    // Check if the position manager itself is approved (it should be the operator)
    const approvedAddress = await nftContract.getApproved(positionId);
    const isApprovedForAll = await nftContract.isApprovedForAll(walletAddress, operatorAddress);

    if (approvedAddress.toLowerCase() !== operatorAddress.toLowerCase() && !isApprovedForAll) {
      throw new Error(
        `Insufficient NFT approval. Please approve the position NFT (${positionId}) for the Pancakeswap Position Manager (${operatorAddress})`,
      );
    }
  }

  /**
   * Stake an NFT in the MasterChef contract using a specific wallet.
   * Staking is done by transferring the NFT to the MasterChef contract.
   * The MasterChef contract has an onERC721Received handler that processes the stake.
   * @param tokenId The ID of the NFT to stake
   * @param walletAddress The wallet address to use for signing
   * @returns Enriched stake result including pool info, price range, and CAKE reward metadata
   */
  public async stakeNft(
    tokenId: number,
    walletAddress: string,
  ): Promise<{
    txHash: string;
    poolId: number;
    poolAddress: string;
    baseTokenAddress: string;
    baseTokenSymbol: string;
    quoteTokenAddress: string;
    quoteTokenSymbol: string;
    feePct: number;
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    currentPrice: number;
    lowerPrice: number;
    upperPrice: number;
    inRange: boolean;
    cakePerSecond: number;
    rewardEndTime: number;
    isRewardActive: boolean;
  }> {
    try {
      // First, verify NFT ownership
      logger.info(`Verifying ownership of NFT ${tokenId} for wallet ${walletAddress}`);
      await this.checkNFTOwnership(tokenId.toString(), walletAddress);

      // Get addresses
      const masterChefAddress = getPancakeswapV3MasterchefAddress(this.networkName);
      const nftManagerAddress = getPancakeswapV3NftManagerAddress(this.networkName);

      logger.info(`MasterChef Address: ${masterChefAddress}`);
      logger.info(`NFT Manager Address: ${nftManagerAddress}`);

      // Get position details from NFT Manager
      logger.info(`Retrieving position details for NFT ${tokenId}...`);
      const positionContract = new Contract(
        nftManagerAddress,
        [
          {
            inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
            name: 'positions',
            outputs: [
              { internalType: 'uint96', name: 'nonce', type: 'uint96' },
              { internalType: 'address', name: 'operator', type: 'address' },
              { internalType: 'address', name: 'token0', type: 'address' },
              { internalType: 'address', name: 'token1', type: 'address' },
              { internalType: 'uint24', name: 'fee', type: 'uint24' },
              { internalType: 'int24', name: 'tickLower', type: 'int24' },
              { internalType: 'int24', name: 'tickUpper', type: 'int24' },
              { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
              { internalType: 'uint256', name: 'feeGrowthInside0LastX128', type: 'uint256' },
              { internalType: 'uint256', name: 'feeGrowthInside1LastX128', type: 'uint256' },
              { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
              { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' },
            ],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      const position = await positionContract.positions(tokenId);
      const liquidity = position.liquidity.toString();
      logger.info(
        `Position liquidity: ${liquidity}, Fee: ${position.fee}, Tick range: [${position.tickLower}, ${position.tickUpper}]`,
      );

      if (liquidity === '0') {
        throw new Error(
          `Position ${tokenId} has zero liquidity and cannot be staked. ` +
            `Please add liquidity to the position before staking.`,
        );
      }

      // Check if pool is registered in MasterChef
      logger.info(`Verifying pool is registered in MasterChef...`);
      const v3Pool = await this.getV3PoolByTokens(position.token0, position.token1, position.fee);
      if (!v3Pool) {
        throw new Error(
          `Could not find pool for tokens with fee ${position.fee}. ` +
            `The pool may not exist or may not be registered in MasterChef.`,
        );
      }

      const poolId = await this.getV3PoolIdFromMasterChef(v3Pool);
      logger.info(`Pool ID in MasterChef: ${poolId}`);

      if (poolId === 0) {
        throw new Error(
          `Pool for position ${tokenId} is not registered in MasterChef. ` +
            `Only positions in MasterChef-registered pools can be staked. ` +
            `Please contact the PancakeSwap team to add this pool.`,
        );
      }

      // Check if the NFT is already owned by MasterChef (already staked)
      logger.info(`Checking current owner of NFT ${tokenId}...`);
      const ownerCheckContract = new Contract(
        nftManagerAddress,
        [
          {
            inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
            name: 'ownerOf',
            outputs: [{ internalType: 'address', name: '', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      const currentOwner = await ownerCheckContract.ownerOf(tokenId);
      logger.info(`Current owner: ${currentOwner}`);

      if (currentOwner.toLowerCase() === masterChefAddress.toLowerCase()) {
        throw new Error(
          `NFT ${tokenId} is already staked in MasterChef. ` +
            `The position is currently owned by the MasterChef contract. ` +
            `Use the unstake endpoint to withdraw it first if you want to re-stake it.`,
        );
      }

      if (currentOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error(
          `NFT ${tokenId} is not owned by wallet ${walletAddress}. ` +
            `Current owner: ${currentOwner}. Cannot stake an NFT you don't own.`,
        );
      }

      // Check if the wallet has approved MasterChef to transfer the NFT
      logger.info(`Checking if MasterChef is approved to transfer NFTs...`);
      const approvalCheckContract = new Contract(
        nftManagerAddress,
        [
          {
            inputs: [
              { internalType: 'address', name: 'owner', type: 'address' },
              { internalType: 'address', name: 'operator', type: 'address' },
            ],
            name: 'isApprovedForAll',
            outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      const isApproved = await approvalCheckContract.isApprovedForAll(walletAddress, masterChefAddress);
      logger.info(`MasterChef approved for all NFTs: ${isApproved}`);

      if (!isApproved) {
        throw new Error(
          `MasterChef is not approved to transfer your NFTs. ` +
            `Please approve MasterChef to manage your LP NFTs by calling setApprovalForAll on the NonfungiblePositionManager contract. ` +
            `Go to https://bscscan.com/address/${nftManagerAddress}#writeContract, ` +
            `connect your wallet (${walletAddress}), and call setApprovalForAll with: ` +
            `operator=${masterChefAddress}, approved=true. ` +
            `This is a one-time approval that allows MasterChef to stake/unstake your LP positions.`,
        );
      }

      // Get the wallet signer
      const wallet = await this.ethereum.getWallet(walletAddress);

      // Stake by transferring the NFT to MasterChef
      // The MasterChef contract's onERC721Received handler will process the deposit
      logger.info(`Staking NFT ${tokenId} by transferring to MasterChef...`);
      const nftManagerContract = new Contract(
        nftManagerAddress,
        [
          {
            inputs: [
              { internalType: 'address', name: 'from', type: 'address' },
              { internalType: 'address', name: 'to', type: 'address' },
              { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
            ],
            name: 'safeTransferFrom',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        wallet,
      );

      const tx = await nftManagerContract['safeTransferFrom(address,address,uint256)'](
        walletAddress,
        masterChefAddress,
        tokenId,
        {
          gasLimit: 600000,
        },
      );

      logger.info(`Transfer transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(
          `Staking transaction failed. ` +
            `The MasterChef contract rejected the NFT transfer. ` +
            `This could mean the position is in an invalid state, the pool is not properly registered, ` +
            `or the MasterChef is in emergency mode. Check the position details above.`,
        );
      }

      logger.info(`Successfully staked NFT with tokenId ${tokenId} in transaction ${tx.hash}`);

      // ── Gather enriched response data ──────────────────────────────────────
      const [token0Obj, token1Obj, mcData] = await Promise.all([
        this.getToken(position.token0),
        this.getToken(position.token1),
        this.getPoolMasterchefData(v3Pool),
      ]);

      const pool = token0Obj && token1Obj ? await this.getV3Pool(token0Obj, token1Obj, position.fee) : null;

      // Determine base/quote ordering (WETH is always quote; otherwise sort by address)
      const isBaseToken0 =
        (token0Obj?.symbol !== 'WETH' && token1Obj?.symbol === 'WETH') ||
        (token0Obj?.symbol !== 'WETH' &&
          token1Obj?.symbol !== 'WETH' &&
          token0Obj?.address.toLowerCase() < token1Obj?.address.toLowerCase());

      const baseTokenAddress = isBaseToken0 ? (token0Obj?.address ?? '') : (token1Obj?.address ?? '');
      const baseTokenSymbol = isBaseToken0 ? (token0Obj?.symbol ?? '') : (token1Obj?.symbol ?? '');
      const quoteTokenAddress = isBaseToken0 ? (token1Obj?.address ?? '') : (token0Obj?.address ?? '');
      const quoteTokenSymbol = isBaseToken0 ? (token1Obj?.symbol ?? '') : (token0Obj?.symbol ?? '');

      let currentPrice = 0;
      let lowerPrice = 0;
      let upperPrice = 0;
      let inRange = false;

      if (pool && token0Obj && token1Obj) {
        currentPrice = isBaseToken0
          ? parseFloat(pool.token0Price.toSignificant(8))
          : parseFloat(pool.token1Price.toSignificant(8));

        const lowerTickPrice = tickToPrice(token0Obj, token1Obj, position.tickLower);
        const upperTickPrice = tickToPrice(token0Obj, token1Obj, position.tickUpper);
        // When base=token0 prices are already in base/quote direction; when base=token1 we invert and swap bounds
        lowerPrice = isBaseToken0
          ? parseFloat(lowerTickPrice.toSignificant(8))
          : parseFloat(upperTickPrice.invert().toSignificant(8));
        upperPrice = isBaseToken0
          ? parseFloat(upperTickPrice.toSignificant(8))
          : parseFloat(lowerTickPrice.invert().toSignificant(8));

        inRange = pool.tickCurrent >= position.tickLower && pool.tickCurrent < position.tickUpper;
      }

      return {
        txHash: tx.hash,
        poolId: mcData.poolId,
        poolAddress: v3Pool,
        baseTokenAddress,
        baseTokenSymbol,
        quoteTokenAddress,
        quoteTokenSymbol,
        feePct: position.fee / 10000,
        liquidity,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        currentPrice,
        lowerPrice,
        upperPrice,
        inRange,
        cakePerSecond: mcData.cakePerSecond,
        rewardEndTime: mcData.rewardEndTime,
        isRewardActive: mcData.isRewardActive,
      };
    } catch (error) {
      logger.error(`Failed to stake NFT: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unstake an NFT from the MasterChef contract and collect accumulated CAKE rewards.
   * @param tokenId The ID of the NFT to unstake
   * @param walletAddress The wallet address to receive the NFT and rewards
   * @returns Transaction hash, CAKE reward amount, and reward token details
   */
  public async unstakeNft(
    tokenId: number,
    walletAddress: string,
  ): Promise<{
    txHash: string;
    rewardAmount: number;
    rewardToken: string;
    rewardTokenAddress: string;
  }> {
    try {
      const wallet = await this.ethereum.getWallet(walletAddress);
      const contractWithSigner = this.masterChef.connect(wallet);
      const tx = await contractWithSigner.withdraw(tokenId, walletAddress, { gasLimit: 500000 });
      const receipt = await tx.wait();

      // Parse the CAKE reward from the Harvest event emitted during withdraw
      let rewardAmount = 0;
      try {
        const iface = new utils.Interface(PancakeswapV3MasterchefABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed.name === 'Harvest') {
              // reward is a non-indexed uint256 in the event data
              rewardAmount = parseFloat(parsed.args.reward.toString()) / 1e18;
              break;
            }
          } catch {
            // Not a Harvest log from this contract, skip
          }
        }
      } catch (parseErr) {
        logger.warn(`Could not parse Harvest event from unstake receipt: ${parseErr.message}`);
      }

      // Resolve CAKE token address and symbol
      let rewardTokenAddress = '';
      let rewardToken = 'CAKE';
      try {
        rewardTokenAddress = await this.masterChef.CAKE();
        const cakeToken = await this.getToken(rewardTokenAddress);
        if (cakeToken?.symbol) rewardToken = cakeToken.symbol;
      } catch (tokenErr) {
        logger.warn(`Could not resolve CAKE token info: ${tokenErr.message}`);
      }

      logger.info(`Successfully unstaked NFT ${tokenId}: earned ${rewardAmount} ${rewardToken}, tx ${tx.hash}`);

      return { txHash: tx.hash, rewardAmount, rewardToken, rewardTokenAddress };
    } catch (error) {
      logger.error(`Failed to unstake NFT: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close the Pancakeswap instance and clean up resources
   */
  public async close() {
    // Clean up resources
    if (this.networkName in Pancakeswap._instances) {
      delete Pancakeswap._instances[this.networkName];
    }
  }
}
