/**
 * ETCswap Connector
 *
 * ETCswap is a fork of Uniswap deployed on Ethereum Classic.
 * This connector reuses Uniswap SDK components since the contracts are ABI-compatible.
 *
 * Supported networks:
 * - classic: Ethereum Classic mainnet (chain ID 61)
 * - mordor: Mordor testnet (chain ID 63)
 */

// ETCswap SDK imports - Using unified ETCswap SDKs for type consistency
import { Pair as V2Pair } from '@etcswapv2/sdk';
import { Token, CurrencyAmount, Percent, TradeType } from '@etcswapv2/sdk-core';
import { Protocol } from '@etcswapv3/router-sdk';
import { FeeAmount, Pool as V3Pool } from '@etcswapv3/sdk';
// V3 ABIs from Uniswap (contracts are ABI-compatible)
import { abi as IUniswapV3FactoryABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { Contract, constants } from 'ethers';
import { getAddress, parseUnits } from 'ethers/lib/utils';
import JSBI from 'jsbi';

import { Ethereum, TokenInfo } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { ETCswapConfig } from './etcswap.config';
import {
  IUniswapV2PairABI,
  IUniswapV2FactoryABI,
  IEtcswapV2Router02ABI,
  getETCswapV2RouterAddress,
  getETCswapV2FactoryAddress,
  getETCswapV3NftManagerAddress,
  getETCswapV3QuoterV2ContractAddress,
  getETCswapV3FactoryAddress,
  isV3Available,
  isUniversalRouterAvailable,
} from './etcswap.contracts';
import { isValidV2Pool, isValidV3Pool } from './etcswap.utils';
import { ETCswapUniversalRouterService } from './universal-router';

export class ETCswap {
  private static _instances: { [name: string]: ETCswap };

  // Ethereum chain instance
  private ethereum: Ethereum;

  // Configuration
  public config: ETCswapConfig.RootConfig;

  // Common properties
  private chainId: number;
  private _ready: boolean = false;

  // V2 (AMM) properties
  private v2Factory: Contract;
  private v2Router: Contract;

  // V3 (CLMM) properties - may be null if V3 not deployed
  private v3Factory: Contract | null = null;
  private v3NFTManager: Contract | null = null;
  private v3Quoter: Contract | null = null;

  // Universal Router service - may be null if not available
  private universalRouter: ETCswapUniversalRouterService | null = null;

  // Network information
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = ETCswapConfig.config;
  }

  public static async getInstance(network: string): Promise<ETCswap> {
    if (ETCswap._instances === undefined) {
      ETCswap._instances = {};
    }

    if (!(network in ETCswap._instances)) {
      ETCswap._instances[network] = new ETCswap(network);
      await ETCswap._instances[network].init();
    }

    return ETCswap._instances[network];
  }

  /**
   * Initialize the ETCswap instance
   */
  public async init() {
    try {
      // Initialize the Ethereum chain instance
      this.ethereum = await Ethereum.getInstance(this.networkName);
      this.chainId = this.ethereum.chainId;

      // Initialize V2 (AMM) contracts - Always available
      this.v2Factory = new Contract(
        getETCswapV2FactoryAddress(this.networkName),
        IUniswapV2FactoryABI.abi,
        this.ethereum.provider,
      );

      this.v2Router = new Contract(
        getETCswapV2RouterAddress(this.networkName),
        IEtcswapV2Router02ABI.abi,
        this.ethereum.provider,
      );

      // Initialize V3 (CLMM) contracts if available on this network
      if (isV3Available(this.networkName)) {
        this.v3Factory = new Contract(
          getETCswapV3FactoryAddress(this.networkName),
          IUniswapV3FactoryABI,
          this.ethereum.provider,
        );

        // Initialize NFT Manager with minimal ABI
        this.v3NFTManager = new Contract(
          getETCswapV3NftManagerAddress(this.networkName),
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
          getETCswapV3QuoterV2ContractAddress(this.networkName),
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

        logger.info(`ETCswap V3 initialized for network: ${this.networkName}`);
      } else {
        logger.info(`ETCswap V3 not available for network: ${this.networkName}, only V2 AMM will be available`);
      }

      // Initialize Universal Router service if available
      if (isUniversalRouterAvailable(this.networkName)) {
        this.universalRouter = new ETCswapUniversalRouterService(
          this.ethereum.provider,
          this.chainId,
          this.networkName,
        );
        logger.info(`ETCswap Universal Router initialized for network: ${this.networkName}`);
      } else {
        logger.info(`ETCswap Universal Router not available for network: ${this.networkName}`);
      }

      // Ensure ethereum is initialized
      if (!this.ethereum.ready()) {
        await this.ethereum.init();
      }

      this._ready = true;
      logger.info(`ETCswap connector initialized for network: ${this.networkName} (chain ID: ${this.chainId})`);
    } catch (error) {
      logger.error(`Error initializing ETCswap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the ETCswap instance is ready
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Check if V3 (CLMM) is available on this network
   */
  public hasV3(): boolean {
    return isV3Available(this.networkName);
  }

  /**
   * Check if Universal Router is available on this network
   */
  public hasUniversalRouter(): boolean {
    return isUniversalRouterAvailable(this.networkName);
  }

  /**
   * Get token by symbol or address from local token list
   */
  public async getToken(symbolOrAddress: string): Promise<Token | null> {
    const tokenInfo = await this.ethereum.getToken(symbolOrAddress);
    return tokenInfo ? this.getETCswapToken(tokenInfo) : null;
  }

  /**
   * Create a Uniswap SDK Token object from token info
   * Note: We use Uniswap SDK Token class since ETCswap is ABI-compatible
   * @param tokenInfo Token information from Ethereum
   * @returns Uniswap SDK Token object
   */
  public getETCswapToken(tokenInfo: TokenInfo): Token {
    return new Token(this.ethereum.chainId, tokenInfo.address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
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
      const pairContract = new Contract(pairAddress, IUniswapV2PairABI.abi, this.ethereum.provider);

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
    if (!this.hasV3()) {
      logger.warn(`V3 not available on network: ${this.networkName}`);
      return null;
    }

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
      if (!poolAddr && this.v3Factory) {
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
      const poolContract = new Contract(poolAddr, IUniswapV3PoolABI, this.ethereum.provider);

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
              liquidityNet: JSBI.BigInt(0),
              liquidityGross: JSBI.BigInt(0),
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

      // Check if V3/CLMM is available for this network
      if (poolType === 'clmm' && !this.hasV3()) {
        logger.warn(`CLMM (V3) not available on network: ${this.networkName}`);
        return null;
      }

      // Resolve token symbols if addresses are provided
      const baseTokenInfo = await this.ethereum.getToken(baseToken);
      const quoteTokenInfo = await this.ethereum.getToken(quoteToken);

      if (!baseTokenInfo || !quoteTokenInfo) {
        logger.warn(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
        return null;
      }

      const baseToken_sdk = this.getETCswapToken(baseTokenInfo);
      const quoteToken_sdk = this.getETCswapToken(quoteTokenInfo);

      logger.info(
        `Resolved tokens: ${baseToken_sdk.symbol} (${baseToken_sdk.address}), ${quoteToken_sdk.symbol} (${quoteToken_sdk.address})`,
      );

      // Use PoolService to find pool by token pair
      const { PoolService } = await import('../../services/pool-service');
      const poolService = PoolService.getInstance();

      const pool = await poolService.getPool(
        'etcswap',
        this.networkName,
        poolType,
        baseTokenInfo.symbol,
        quoteTokenInfo.symbol,
      );

      if (!pool) {
        logger.warn(
          `No ${poolType} pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on ETCswap network ${this.networkName}`,
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
   * Get a quote using the Universal Router
   * Routes through V2 and V3 pools to find the best swap path
   * @param inputToken The input token
   * @param outputToken The output token
   * @param amount The amount to swap
   * @param side The trade direction (BUY or SELL)
   * @param walletAddress The recipient wallet address
   * @returns Quote result from Universal Router
   */
  public async getUniversalRouterQuote(
    inputToken: Token,
    outputToken: Token,
    amount: number,
    side: 'BUY' | 'SELL',
    walletAddress?: string,
  ): Promise<any> {
    if (!this.universalRouter) {
      throw new Error(`Universal Router not available for network: ${this.networkName}`);
    }

    // Determine input/output based on side
    const exactIn = side === 'SELL';
    const tokenForAmount = exactIn ? inputToken : outputToken;

    // Convert amount to token units
    const rawAmount = parseUnits(amount.toString(), tokenForAmount.decimals);
    const tradeAmount = CurrencyAmount.fromRawAmount(tokenForAmount, rawAmount.toString());

    // Use default protocols (V2 and V3)
    const protocolsToUse = [Protocol.V2, Protocol.V3];

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
      },
    );

    return quoteResult;
  }

  /**
   * Check NFT ownership for ETCswap V3 positions
   * @param positionId The NFT position ID
   * @param walletAddress The wallet address to check ownership for
   * @throws Error if position is not owned by wallet or position ID is invalid
   */
  public async checkNFTOwnership(positionId: string, walletAddress: string): Promise<void> {
    if (!this.hasV3()) {
      throw new Error(`V3 not available on network: ${this.networkName}`);
    }

    const nftContract = new Contract(
      getETCswapV3NftManagerAddress(this.networkName),
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
   * Close the ETCswap instance and clean up resources
   */
  public async close() {
    // Clean up resources
    if (this.networkName in ETCswap._instances) {
      delete ETCswap._instances[this.networkName];
    }
  }
}
