import { isFractionString } from '../../services/string-utils';
import { UniswapConfig } from './uniswap.config';
import { findPoolAddress, parseFeeTier, isValidV2Pool, isValidV3Pool } from './uniswap.utils';
import { Ethereum } from '../../chains/ethereum/ethereum';

// V2 (AMM) imports
import { 
  Pair as V2Pair,
  Route as V2Route,
  Trade as V2Trade
} from '@uniswap/v2-sdk';
import { Contract as EthersContract } from '@ethersproject/contracts';

// Define minimal ABIs for Uniswap V2 contracts
const IUniswapV2PairABI = {
  abi: [
    { constant: true, inputs: [], name: 'getReserves', outputs: [{ internalType: 'uint112', name: '_reserve0', type: 'uint112' }, { internalType: 'uint112', name: '_reserve1', type: 'uint112' }, { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [], name: 'token0', outputs: [{ internalType: 'address', name: '', type: 'address' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [], name: 'token1', outputs: [{ internalType: 'address', name: '', type: 'address' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [{ internalType: 'address', name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [], name: 'totalSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: false, inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'value', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], payable: false, stateMutability: 'nonpayable', type: 'function' }
  ]
};

const IUniswapV2FactoryABI = {
  abi: [
    { constant: true, inputs: [{ internalType: 'address', name: 'tokenA', type: 'address' }, { internalType: 'address', name: 'tokenB', type: 'address' }], name: 'getPair', outputs: [{ internalType: 'address', name: 'pair', type: 'address' }], payable: false, stateMutability: 'view', type: 'function' }
  ]
};

const IUniswapV2RouterABI = {
  abi: [
    { inputs: [{ internalType: 'address', name: 'tokenA', type: 'address' }, { internalType: 'address', name: 'tokenB', type: 'address' }, { internalType: 'uint256', name: 'amountADesired', type: 'uint256' }, { internalType: 'uint256', name: 'amountBDesired', type: 'uint256' }, { internalType: 'uint256', name: 'amountAMin', type: 'uint256' }, { internalType: 'uint256', name: 'amountBMin', type: 'uint256' }, { internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'deadline', type: 'uint256' }], name: 'addLiquidity', outputs: [{ internalType: 'uint256', name: 'amountA', type: 'uint256' }, { internalType: 'uint256', name: 'amountB', type: 'uint256' }, { internalType: 'uint256', name: 'liquidity', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' }
  ]
};

// V3 (CLMM) imports
import { AlphaRouter } from '@uniswap/smart-order-router';
import { Trade, SwapRouter } from '@uniswap/router-sdk';
import {
  FeeAmount,
  MethodParameters,
  Pool as V3Pool,
  SwapQuoter,
  Trade as UniswapV3Trade,
  Route as V3Route,
  Position as V3Position,
  NonfungiblePositionManager
} from '@uniswap/v3-sdk';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { abi as IUniswapV3FactoryABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
  Currency,
  Fraction,
} from '@uniswap/sdk-core';
import {
  BigNumber,
  Transaction,
  Wallet,
  Contract,
  utils,
  constants,
} from 'ethers';
import { logger } from '../../services/logger';
import { percentRegexp } from '../../services/config-manager-v2';
import { getAddress } from 'ethers/lib/utils';

export class Uniswap {
  private static _instances: { [name: string]: Uniswap };
  
  // Ethereum chain instance
  private ethereum: Ethereum;
  
  // Configuration
  public config: UniswapConfig.NetworkConfig;
  
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
  private _feeTier: FeeAmount;
  
  // Network information
  private chainName: string;
  private networkName: string;

  private constructor(chain: string, network: string) {
    this.chainName = chain;
    this.networkName = network;
    this.config = UniswapConfig.config;
    
    if (chain !== 'ethereum') {
      throw new Error('Unsupported chain');
    }
    
    // Set default fee tier for V3
    this._feeTier = parseFeeTier('MEDIUM');
  }

  public static async getInstance(chain: string, network: string): Promise<Uniswap> {
    if (Uniswap._instances === undefined) {
      Uniswap._instances = {};
    }
    
    const key = chain + network;
    if (!(key in Uniswap._instances)) {
      Uniswap._instances[key] = new Uniswap(chain, network);
      await Uniswap._instances[key].init();
    }

    return Uniswap._instances[key];
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
        this.config.uniswapV2FactoryAddress(this.chainName, this.networkName),
        IUniswapV2FactoryABI.abi,
        this.ethereum.provider
      );
      
      this.v2Router = new Contract(
        this.config.uniswapV2RouterAddress(this.chainName, this.networkName),
        IUniswapV2RouterABI.abi,
        this.ethereum.provider
      );
      
      // Initialize V3 (CLMM) contracts
      this.v3Factory = new Contract(
        this.config.uniswapV3FactoryAddress(this.chainName, this.networkName),
        IUniswapV3FactoryABI,
        this.ethereum.provider
      );
      
      // Define a minimal ABI for the NFT Manager
      const NFTManagerABI = [
        {
          inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function'
        }
      ];
      
      this.v3NFTManager = new Contract(
        this.config.uniswapV3NftManagerAddress(this.chainName, this.networkName),
        NFTManagerABI,
        this.ethereum.provider
      );
      
      // Define a minimal ABI for the Quoter
      const QuoterABI = [
        {
          inputs: [
            { internalType: 'bytes', name: 'path', type: 'bytes' },
            { internalType: 'uint256', name: 'amountIn', type: 'uint256' }
          ],
          name: 'quoteExactInput',
          outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ];
      
      this.v3Quoter = new Contract(
        this.config.quoterContractAddress(this.chainName, this.networkName),
        QuoterABI,
        this.ethereum.provider
      );
      
      // Initialize AlphaRouter for V3 swaps if needed
      if (this.config.clmm.useRouter) {
        this._alphaRouter = new AlphaRouter({
          chainId: this.chainId,
          provider: this.ethereum.provider,
        });
      } else {
        this._alphaRouter = null;
      }
      
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
          token.name
        );
      }
      
      this._ready = true;
      logger.info(`Uniswap connector initialized for ${this.chainName}:${this.networkName}`);
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
    poolAddress?: string
  ): Promise<V2Pair | null> {
    try {
      // Resolve pool address if provided
      let pairAddress = poolAddress;
      
      // If tokenA and tokenB are strings, assume they are symbols
      const tokenAObj = typeof tokenA === 'string' 
        ? this.getTokenBySymbol(tokenA)
        : tokenA;
      
      const tokenBObj = typeof tokenB === 'string'
        ? this.getTokenBySymbol(tokenB)
        : tokenB;
      
      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }
      
      // Find pool address if not provided
      if (!pairAddress) {
        if (typeof tokenA === 'string' && typeof tokenB === 'string') {
          pairAddress = findPoolAddress(tokenA, tokenB, 'amm');
        }
        
        // If still not found, try to get it from the factory
        if (!pairAddress) {
          pairAddress = await this.v2Factory.getPair(
            tokenAObj.address,
            tokenBObj.address
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
        this.ethereum.provider
      );
      
      const [reserves, token0Address] = await Promise.all([
        pairContract.getReserves(),
        pairContract.token0()
      ]);
      
      const [reserve0, reserve1] = reserves;
      const token0 = getAddress(token0Address) === getAddress(tokenAObj.address) ? tokenAObj : tokenBObj;
      const token1 = token0.address === tokenAObj.address ? tokenBObj : tokenAObj;
      
      return new V2Pair(
        CurrencyAmount.fromRawAmount(token0, reserve0.toString()),
        CurrencyAmount.fromRawAmount(token1, reserve1.toString())
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
    poolAddress?: string
  ): Promise<V3Pool | null> {
    try {
      // Resolve pool address if provided
      let poolAddr = poolAddress;
      const useFeeTier = fee || this._feeTier;
      
      // If tokenA and tokenB are strings, assume they are symbols
      const tokenAObj = typeof tokenA === 'string' 
        ? this.getTokenBySymbol(tokenA)
        : tokenA;
      
      const tokenBObj = typeof tokenB === 'string'
        ? this.getTokenBySymbol(tokenB)
        : tokenB;
      
      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Invalid tokens: ${tokenA}, ${tokenB}`);
      }
      
      // Find pool address if not provided
      if (!poolAddr) {
        if (typeof tokenA === 'string' && typeof tokenB === 'string') {
          // Try to find pool with fee tier in name first
          let feeStr = '';
          if (fee === FeeAmount.LOWEST) feeStr = '-0.01';
          else if (fee === FeeAmount.LOW) feeStr = '-0.05';
          else if (fee === FeeAmount.MEDIUM) feeStr = '-0.3';
          else if (fee === FeeAmount.HIGH) feeStr = '-1';
          
          // Try to find pool with fee in name
          if (feeStr) {
            poolAddr = findPoolAddress(`${tokenA}${feeStr}`, tokenB, 'clmm') || 
                       findPoolAddress(tokenA, `${tokenB}${feeStr}`, 'clmm');
          }
          
          // If still not found, try without fee
          if (!poolAddr) {
            poolAddr = findPoolAddress(tokenA, tokenB, 'clmm');
          }
        }
        
        // If still not found, try to get it from the factory
        if (!poolAddr) {
          poolAddr = await this.v3Factory.getPool(
            tokenAObj.address,
            tokenBObj.address,
            useFeeTier
          );
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
        this.ethereum.provider
      );
      
      const [liquidity, slot0, feeData] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0(),
        poolContract.fee(),
      ]);
      
      const [sqrtPriceX96, tick] = slot0;
      
      return new V3Pool(
        tokenAObj,
        tokenBObj,
        feeData,
        sqrtPriceX96.toString(),
        liquidity.toString(),
        tick
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
    poolType: 'amm' | 'clmm'
  ): Promise<string | null> {
    try {
      // Try to find pool in the config
      const poolAddr = findPoolAddress(baseToken, quoteToken, poolType);
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
          quoteTokenObj.address
        );
        
        if (pairAddress && pairAddress !== constants.AddressZero) {
          return pairAddress;
        }
      } else {
        // V3 pool - try with default fee tier
        const poolAddress = await this.v3Factory.getPool(
          baseTokenObj.address,
          quoteTokenObj.address,
          this._feeTier
        );
        
        if (poolAddress && poolAddress !== constants.AddressZero) {
          return poolAddress;
        }
        
        // Try other fee tiers if default tier doesn't work
        const feeTiers = [
          FeeAmount.LOWEST,
          FeeAmount.LOW,
          FeeAmount.MEDIUM,
          FeeAmount.HIGH
        ].filter(fee => fee !== this._feeTier);
        
        for (const fee of feeTiers) {
          const addr = await this.v3Factory.getPool(
            baseTokenObj.address,
            quoteTokenObj.address,
            fee
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
   */
  public getAllowedSlippage(allowedSlippageStr?: string, poolType: 'amm' | 'clmm' = 'clmm'): Percent {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return new Percent(fractionSplit[0], fractionSplit[1]);
    }

    const allowedSlippage = poolType === 'amm' 
      ? this.config.amm.allowedSlippage
      : this.config.clmm.allowedSlippage;
      
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for allowed slippage.'
    );
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
   * Close the Uniswap instance and clean up resources
   */
  public async close() {
    // Clean up resources
    if (this.chainName + this.networkName in Uniswap._instances) {
      delete Uniswap._instances[this.chainName + this.networkName];
    }
  }
}