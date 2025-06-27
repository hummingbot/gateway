import { UniswapConfig } from './uniswap.config';
import {
  findPoolAddress,
  isValidV2Pool,
  isValidV3Pool,
  isFractionString,
} from './uniswap.utils';
import { 
  IUniswapV2PairABI, 
  IUniswapV2FactoryABI,
  IUniswapV2Router02ABI 
} from './uniswap.contracts';

// V3 (CLMM) imports
import { Token, CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { AlphaRouter } from '@uniswap/smart-order-router';
import { Pair as V2Pair } from '@uniswap/v2-sdk';
import { abi as IUniswapV3FactoryABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Contract, constants } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import JSBI from 'jsbi';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { percentRegexp } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

export class Uniswap {
  private static _instances: { [name: string]: Uniswap };

  // Ethereum chain instance
  private ethereum: Ethereum;

  // Configuration
  public config: UniswapConfig.RootConfig;

  // Common properties
  private chainId: number;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;

  // V2 (AMM) properties
  private v2Factory: Contract;
  private v2Router: Contract;

  // V3 (CLMM) properties
  private _alphaRouter: AlphaRouter | null;
  private v3Factory: Contract;
  private v3NFTManager: Contract;
  private v3Quoter: Contract;

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

      // Initialize V2 (AMM) contracts
      this.v2Factory = new Contract(
        this.config.uniswapV2FactoryAddress(this.networkName),
        IUniswapV2FactoryABI.abi,
        this.ethereum.provider,
      );

      this.v2Router = new Contract(
        this.config.uniswapV2RouterAddress(this.networkName),
        IUniswapV2Router02ABI.abi,
        this.ethereum.provider,
      );

      // Initialize V3 (CLMM) contracts
      this.v3Factory = new Contract(
        this.config.uniswapV3FactoryAddress(this.networkName),
        IUniswapV3FactoryABI,
        this.ethereum.provider,
      );

      // Initialize NFT Manager with minimal ABI
      this.v3NFTManager = new Contract(
        this.config.uniswapV3NftManagerAddress(this.networkName),
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
        this.config.quoterContractAddress(this.networkName),
        [
          {
            inputs: [
              { internalType: 'bytes', name: 'path', type: 'bytes' },
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
            ],
            name: 'quoteExactInput',
            outputs: [
              { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
            ],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        this.ethereum.provider,
      );

      // Initialize AlphaRouter for V3 swaps (always use AlphaRouter with Universal Router)
      this._alphaRouter = new AlphaRouter({
        chainId: this.chainId,
        provider: this.ethereum.provider,
      });

      // Load tokens
      if (!this.ethereum.ready()) {
        await this.ethereum.init();
      }

      for (const token of this.ethereum.storedTokenList) {
        this.tokenList[token.address] = new Token(
          this.chainId,
          token.address,
          token.decimals,
          token.symbol,
          token.name,
        );
      }

      this._ready = true;
      logger.info(
        `Uniswap connector initialized for network: ${this.networkName}`,
      );
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
  public getTokenByAddress(address: string): Token {
    return this.tokenList[getAddress(address)];
  }

  /**
   * Given a token's symbol, return the connector's native representation of the token.
   */
  public getTokenBySymbol(symbol: string): Token | null {
    const token = this.ethereum.getTokenBySymbol(symbol);
    if (!token) return null;
    return this.getTokenByAddress(token.address);
  }

  /**
   * Get a V2 pool (pair) by its address or by token symbols
   */
  public async getV2Pool(
    tokenA: Token | string,
    tokenB: Token | string,
    poolAddress?: string,
  ): Promise<V2Pair | null> {
    try {
      // Resolve pool address if provided
      let pairAddress = poolAddress;

      // If tokenA and tokenB are strings, assume they are symbols
      const tokenAObj =
        typeof tokenA === 'string' ? this.getTokenBySymbol(tokenA) : tokenA;

      const tokenBObj =
        typeof tokenB === 'string' ? this.getTokenBySymbol(tokenB) : tokenB;

      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }

      // Find pool address if not provided
      if (!pairAddress) {
        if (typeof tokenA === 'string' && typeof tokenB === 'string') {
          pairAddress = findPoolAddress(
            tokenA,
            tokenB,
            'amm',
            this.networkName,
          );
        }

        // If still not found, try to get it from the factory
        if (!pairAddress) {
          pairAddress = await this.v2Factory.getPair(
            tokenAObj.address,
            tokenBObj.address,
          );
        }
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
      const pairContract = new Contract(
        pairAddress,
        IUniswapV2PairABI.abi,
        this.ethereum.provider,
      );

      const [reserves, token0Address] = await Promise.all([
        pairContract.getReserves(),
        pairContract.token0(),
      ]);

      const [reserve0, reserve1] = reserves;
      const token0 =
        getAddress(token0Address) === getAddress(tokenAObj.address)
          ? tokenAObj
          : tokenBObj;
      const token1 =
        token0.address === tokenAObj.address ? tokenBObj : tokenAObj;

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
      const tokenAObj =
        typeof tokenA === 'string' ? this.getTokenBySymbol(tokenA) : tokenA;

      const tokenBObj =
        typeof tokenB === 'string' ? this.getTokenBySymbol(tokenB) : tokenB;

      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }

      // Find pool address if not provided
      if (!poolAddr) {
        if (typeof tokenA === 'string' && typeof tokenB === 'string') {
          // Try to find pool from the config pools dictionary
          poolAddr = findPoolAddress(tokenA, tokenB, 'clmm', this.networkName);
        }

        // If still not found and a fee is provided, try to get it from the factory
        if (!poolAddr && fee) {
          poolAddr = await this.v3Factory.getPool(
            tokenAObj.address,
            tokenBObj.address,
            fee,
          );
        }

        // If still not found, try all possible fee tiers
        if (!poolAddr) {
          // Try each fee tier
          const allFeeTiers = [
            FeeAmount.LOWEST,
            FeeAmount.LOW,
            FeeAmount.MEDIUM,
            FeeAmount.HIGH,
          ];

          for (const feeTier of allFeeTiers) {
            if (feeTier === fee) continue; // Skip if we already tried this fee tier

            poolAddr = await this.v3Factory.getPool(
              tokenAObj.address,
              tokenBObj.address,
              feeTier,
            );

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
      const poolContract = new Contract(
        poolAddr,
        IUniswapV3PoolABI,
        this.ethereum.provider,
      );

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
      // Try to find pool in the config pools dictionary, passing in the network
      const poolAddr = findPoolAddress(
        baseToken,
        quoteToken,
        poolType,
        this.networkName,
      );
      if (poolAddr) {
        return poolAddr;
      }

      // Get token objects
      const baseTokenObj = this.getTokenBySymbol(baseToken);
      const quoteTokenObj = this.getTokenBySymbol(quoteToken);

      if (!baseTokenObj || !quoteTokenObj) {
        logger.error(`Tokens not found: ${baseToken}, ${quoteToken}`);
        return null;
      }

      // If not found, try to get it from the factory
      if (poolType === 'amm') {
        // V2 pool
        const pairAddress = await this.v2Factory.getPair(
          baseTokenObj.address,
          quoteTokenObj.address,
        );

        if (pairAddress && pairAddress !== constants.AddressZero) {
          return pairAddress;
        }
      } else {
        // V3 pool - try all fee tiers
        const feeTiers = [
          FeeAmount.MEDIUM, // Try medium fee first (0.3%)
          FeeAmount.LOW, // Then low (0.05%)
          FeeAmount.LOWEST, // Then lowest (0.01%)
          FeeAmount.HIGH, // Finally high (1%)
        ];

        for (const fee of feeTiers) {
          const addr = await this.v3Factory.getPool(
            baseTokenObj.address,
            quoteTokenObj.address,
            fee,
          );

          if (addr && addr !== constants.AddressZero) {
            return addr;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding default pool: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the allowed slippage percent from string or config
   * @param allowedSlippageStr Optional string representation of slippage value
   * @returns A Percent object for use with Uniswap SDK
   */
  public getAllowedSlippage(allowedSlippageStr?: string): Percent {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return new Percent(fractionSplit[0], fractionSplit[1]);
    }

    // Use the global allowedSlippage setting
    const allowedSlippage = this.config.allowedSlippage;

    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for allowed slippage.',
    );
  }

  /**
   * Gets the allowed slippage percentage from config
   * @returns Slippage as a percentage (e.g., 1.0 for 1%)
   */
  public getSlippagePct(): number {
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

  /**
   * Get the first available wallet address from Ethereum
   */
  public async getFirstWalletAddress(): Promise<string | null> {
    try {
      return await this.ethereum.getFirstWalletAddress();
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
  public async checkNFTOwnership(
    positionId: string,
    walletAddress: string,
  ): Promise<void> {
    const nftContract = new Contract(
      this.config.uniswapV3NftManagerAddress(this.networkName),
      [
        {
          inputs: [
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
          ],
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
        throw new Error(
          `Position ${positionId} is not owned by wallet ${walletAddress}`,
        );
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
  public async checkNFTApproval(
    positionId: string,
    walletAddress: string,
    operatorAddress: string,
  ): Promise<void> {
    const nftContract = new Contract(
      this.config.uniswapV3NftManagerAddress(this.networkName),
      [
        {
          inputs: [
            { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
          ],
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
    const isApprovedForAll = await nftContract.isApprovedForAll(
      walletAddress,
      operatorAddress,
    );

    if (
      approvedAddress.toLowerCase() !== operatorAddress.toLowerCase() &&
      !isApprovedForAll
    ) {
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
