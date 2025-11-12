// V3 (CLMM) imports
import { Protocol } from '@uniswap/router-sdk';
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import { Pair as V2Pair } from '@uniswap/v2-sdk';
import { abi as IUniswapV3FactoryABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Contract, constants } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import JSBI from 'jsbi';

import { Ethereum, TokenInfo } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { UniswapConfig } from './uniswap.config';
import {
  IUniswapV2PairABI,
  IUniswapV2FactoryABI,
  IUniswapV2Router02ABI,
  getUniswapV2RouterAddress,
  getUniswapV2FactoryAddress,
  getUniswapV3NftManagerAddress,
  getUniswapV3QuoterV2ContractAddress,
  getUniswapV3FactoryAddress,
  isUniswapV2Available,
} from './uniswap.contracts';
import { isValidV2Pool, isValidV3Pool } from './uniswap.utils';
import { UniversalRouterService } from './universal-router';

export class Uniswap {
  private static _instances: { [name: string]: Uniswap };

  // Ethereum chain instance
  private ethereum: Ethereum;

  // Configuration
  public config: UniswapConfig.RootConfig;

  // Common properties
  private chainId: number;
  private _ready: boolean = false;

  // V2 (AMM) properties (optional - not all networks have V2)
  private v2Factory?: Contract;
  private v2Router?: Contract;

  // V3 (CLMM) properties
  private v3Factory: Contract;
  private v3NFTManager: Contract;
  private v3Quoter: Contract;
  private universalRouter: UniversalRouterService;

  // Network information
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = UniswapConfig.config;
  }

  public static async getInstance(network: string): Promise<Uniswap> {
    if (Uniswap._instances === undefined) {
      Uniswap._instances = {};
    }

    if (!(network in Uniswap._instances)) {
      Uniswap._instances[network] = new Uniswap(network);
      await Uniswap._instances[network].init();
    }

    return Uniswap._instances[network];
  }

  /**
   * Initialize the Uniswap instance
   */
  public async init() {
    try {
      // Initialize the Ethereum chain instance
      this.ethereum = await Ethereum.getInstance(this.networkName);
      this.chainId = this.ethereum.chainId;

      // Initialize V2 (AMM) contracts only if available on this network
      if (isUniswapV2Available(this.networkName)) {
        this.v2Factory = new Contract(
          getUniswapV2FactoryAddress(this.networkName),
          IUniswapV2FactoryABI.abi,
          this.ethereum.provider,
        );

        this.v2Router = new Contract(
          getUniswapV2RouterAddress(this.networkName),
          IUniswapV2Router02ABI.abi,
          this.ethereum.provider,
        );
        logger.info(`Uniswap V2 contracts initialized for ${this.networkName}`);
      } else {
        logger.info(`Uniswap V2 not available on ${this.networkName}, skipping V2 initialization`);
      }

      // Initialize V3 (CLMM) contracts
      this.v3Factory = new Contract(
        getUniswapV3FactoryAddress(this.networkName),
        IUniswapV3FactoryABI,
        this.ethereum.provider,
      );

      // Initialize NFT Manager with minimal ABI
      this.v3NFTManager = new Contract(
        getUniswapV3NftManagerAddress(this.networkName),
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
        getUniswapV3QuoterV2ContractAddress(this.networkName),
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

      // Ensure ethereum is initialized
      if (!this.ethereum.ready()) {
        await this.ethereum.init();
      }

      this._ready = true;
      logger.info(`Uniswap connector initialized for network: ${this.networkName}`);
    } catch (error) {
      logger.error(`Error initializing Uniswap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the Uniswap instance is ready
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Given a token's address, return the connector's native representation of the token.
   */
  public getTokenByAddress(address: string): Token | null {
    const tokenInfo = this.ethereum.getToken(address);
    if (!tokenInfo) return null;

    // Create Uniswap SDK Token instance
    return new Token(tokenInfo.chainId, tokenInfo.address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
  }

  /**
   * Given a token's symbol, return the connector's native representation of the token.
   */
  public getTokenBySymbol(symbol: string): Token | null {
    // Just use getTokenByAddress since ethereum.getToken handles both symbols and addresses
    return this.getTokenByAddress(symbol);
  }

  /**
   * Get token by address with blockchain fallback for unlisted tokens (async version).
   * Use this in routes that support trading unlisted tokens.
   */
  public async getOrFetchTokenByAddress(address: string): Promise<Token | null> {
    const tokenInfo = await this.ethereum.getOrFetchToken(address);
    if (!tokenInfo) return null;

    // Create Uniswap SDK Token instance
    return new Token(tokenInfo.chainId, tokenInfo.address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
  }

  /**
   * Get token by symbol with blockchain fallback for unlisted tokens (async version).
   * Use this in routes that support trading unlisted tokens.
   */
  public async getOrFetchTokenBySymbol(symbol: string): Promise<Token | null> {
    return this.getOrFetchTokenByAddress(symbol);
  }

  /**
   * Create a Uniswap SDK Token object from token info
   * @param tokenInfo Token information from Ethereum
   * @returns Uniswap SDK Token object
   */
  public getUniswapToken(tokenInfo: TokenInfo): Token {
    return new Token(this.ethereum.chainId, tokenInfo.address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
  }

  /**
   * Get a quote from Universal Router for token swaps
   * @param inputToken The token being swapped from
   * @param outputToken The token being swapped to
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
    walletAddress: string,
  ): Promise<any> {
    // Determine input/output based on side
    const exactIn = side === 'SELL';
    const tokenForAmount = exactIn ? inputToken : outputToken;

    // Convert amount to token units using ethers parseUnits for proper decimal handling
    const { parseUnits } = await import('ethers/lib/utils');
    const rawAmount = parseUnits(amount.toString(), tokenForAmount.decimals);
    const tradeAmount = CurrencyAmount.fromRawAmount(tokenForAmount, rawAmount.toString());

    // Use default protocols (V2 and V3)
    const protocolsToUse = [Protocol.V2, Protocol.V3]; // V4 requires different approach

    // Get slippage from config
    const slippageTolerance = new Percent(Math.floor(this.config.slippagePct * 100), 10000);

    // Get quote from Universal Router
    const quoteResult = await this.universalRouter.getQuote(
      inputToken,
      outputToken,
      tradeAmount,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      {
        slippageTolerance,
        deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
        recipient: walletAddress,
        protocols: protocolsToUse,
      },
    );

    return quoteResult;
  }

  /**
   * Get a V2 pool (pair) by its address or by token symbols
   */
  public async getV2Pool(tokenA: Token | string, tokenB: Token | string, poolAddress?: string): Promise<V2Pair | null> {
    try {
      // Check if V2 is available on this network
      if (!isUniswapV2Available(this.networkName)) {
        throw new Error(
          `Uniswap V2 is not deployed on ${this.networkName} network. Please use Uniswap V3 for this network.`,
        );
      }

      // Resolve pool address if provided
      let pairAddress = poolAddress;

      // If tokenA and tokenB are strings, assume they are symbols
      const tokenAObj = typeof tokenA === 'string' ? this.getTokenBySymbol(tokenA) : tokenA;

      const tokenBObj = typeof tokenB === 'string' ? this.getTokenBySymbol(tokenB) : tokenB;

      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }

      // Find pool address if not provided
      if (!pairAddress && this.v2Factory) {
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
    try {
      // Resolve pool address if provided
      let poolAddr = poolAddress;

      // If tokenA and tokenB are strings, assume they are symbols
      const tokenAObj = typeof tokenA === 'string' ? this.getTokenBySymbol(tokenA) : tokenA;

      const tokenBObj = typeof tokenB === 'string' ? this.getTokenBySymbol(tokenB) : tokenB;

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

      // Resolve token symbols if addresses are provided
      const baseTokenInfo = this.getTokenBySymbol(baseToken) || this.getTokenByAddress(baseToken);
      const quoteTokenInfo = this.getTokenBySymbol(quoteToken) || this.getTokenByAddress(quoteToken);

      if (!baseTokenInfo || !quoteTokenInfo) {
        logger.warn(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
        return null;
      }

      logger.info(
        `Resolved tokens: ${baseTokenInfo.symbol} (${baseTokenInfo.address}), ${quoteTokenInfo.symbol} (${quoteTokenInfo.address})`,
      );

      // Use PoolService to find pool by token pair
      const { PoolService } = await import('../../services/pool-service');
      const poolService = PoolService.getInstance();

      const pool = await poolService.getPool(
        'uniswap',
        this.networkName,
        poolType,
        baseTokenInfo.symbol,
        quoteTokenInfo.symbol,
      );

      if (!pool) {
        logger.warn(
          `No ${poolType} pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Uniswap network ${this.networkName}`,
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
   * Check NFT ownership for Uniswap V3 positions
   * @param positionId The NFT position ID
   * @param walletAddress The wallet address to check ownership for
   * @throws Error if position is not owned by wallet or position ID is invalid
   */
  public async checkNFTOwnership(positionId: string, walletAddress: string): Promise<void> {
    const nftContract = new Contract(
      getUniswapV3NftManagerAddress(this.networkName),
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
   * Check NFT approval for Uniswap V3 positions
   * @param positionId The NFT position ID
   * @param walletAddress The wallet address that owns the NFT
   * @param operatorAddress The address that needs approval (usually the position manager itself)
   * @throws Error if NFT is not approved
   */
  public async checkNFTApproval(positionId: string, walletAddress: string, operatorAddress: string): Promise<void> {
    const nftContract = new Contract(
      getUniswapV3NftManagerAddress(this.networkName),
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
        `Insufficient NFT approval. Please approve the position NFT (${positionId}) for the Uniswap Position Manager (${operatorAddress})`,
      );
    }
  }

  /**
   * Close the Uniswap instance and clean up resources
   */
  public async close() {
    // Clean up resources
    if (this.networkName in Uniswap._instances) {
      delete Uniswap._instances[this.networkName];
    }
  }
}
