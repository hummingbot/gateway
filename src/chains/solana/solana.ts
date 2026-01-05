import crypto from 'crypto';

import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  AccountLayout,
} from '@solana/spl-token';
import { TokenInfo } from '@solana/spl-token-registry';
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  MessageV0,
  Signer,
  Transaction,
  TransactionResponse,
  VersionedTransaction,
  VersionedTransactionResponse,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import fse from 'fs-extra';

// TODO: Replace with Fastify httpErrors
const SIMULATION_ERROR_MESSAGE = 'Transaction simulation failed: ';

import { HeliusService } from '../../rpc/helius-service';
import { createRateLimitAwareSolanaConnection } from '../../rpc/rpc-connection-interceptor';
import { RPCProvider } from '../../rpc/rpc-provider-base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger, redactUrl } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { getSafeWalletFilePath, isHardwareWallet as isHardwareWalletUtil } from '../../wallet/utils';

import { SolanaPriorityFees } from './solana-priority-fees';
import { SolanaNetworkConfig, getSolanaNetworkConfig, getSolanaChainConfig } from './solana.config';

// Constants used for fee calculations
export const BASE_FEE = 5000;
const LAMPORT_TO_SOL = 1 / Math.pow(10, 9);

// Interface for token account data
interface TokenAccount {
  parsedAccount: any;
  value: any;
}

enum TransactionResponseStatusCode {
  FAILED = -1,
  UNCONFIRMED = 0,
  CONFIRMED = 1,
}

export class Solana {
  public connection: Connection;
  public network: string;
  public nativeTokenSymbol: string;

  public config: SolanaNetworkConfig;
  private rpcProviderService?: RPCProvider;

  private static _instances: { [name: string]: Solana };

  private constructor(network: string) {
    this.network = network;
    this.config = getSolanaNetworkConfig(network);
    this.nativeTokenSymbol = this.config.nativeCurrencySymbol;

    // Get rpcProvider from chain config
    const chainConfig = getSolanaChainConfig();
    const rpcProvider = chainConfig.rpcProvider || 'url';

    // Initialize RPC connection based on provider
    if (rpcProvider === 'helius') {
      this.initializeHeliusProvider();
    } else {
      // Default: use nodeURL
      this.connection = createRateLimitAwareSolanaConnection(
        new Connection(this.config.nodeURL, {
          commitment: 'confirmed',
        }),
        this.config.nodeURL,
      );
    }
  }

  /**
   * Initialize Helius RPC provider
   */
  private initializeHeliusProvider() {
    try {
      // Load Helius config from apiKeys.yml
      const configManager = ConfigManagerV2.getInstance();
      const apiKey = configManager.get('apiKeys.helius') || '';

      // Validate API key
      if (!apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_')) {
        logger.warn(`⚠️ Helius provider selected but no valid API key configured`);
        logger.info(`Using standard RPC from nodeURL: ${redactUrl(this.config.nodeURL)}`);
        this.connection = createRateLimitAwareSolanaConnection(
          new Connection(this.config.nodeURL, {
            commitment: 'confirmed',
          }),
          this.config.nodeURL,
        );
        return;
      }

      // Create HeliusService instance
      this.rpcProviderService = new HeliusService(
        { apiKey },
        { chain: 'solana', network: this.network, chainId: this.config.chainID },
      );

      // Use Helius HTTP URL for connection
      const rpcUrl = this.rpcProviderService.getHttpUrl();
      logger.info(`Initializing Solana connector for network: ${this.network}, RPC URL: ${redactUrl(rpcUrl)}`);
      logger.info(`✅ Helius API key configured (length: ${apiKey.length} chars)`);

      this.connection = createRateLimitAwareSolanaConnection(
        new Connection(rpcUrl, {
          commitment: 'confirmed',
        }),
        rpcUrl,
      );
    } catch (error: any) {
      // If Helius config not found (e.g., in tests), fallback to standard RPC
      logger.warn(`Failed to initialize Helius provider: ${error.message}, falling back to standard RPC`);
      this.connection = createRateLimitAwareSolanaConnection(
        new Connection(this.config.nodeURL, {
          commitment: 'confirmed',
        }),
        this.config.nodeURL,
      );
    }
  }

  public static async getInstance(network: string): Promise<Solana> {
    if (!Solana._instances) {
      Solana._instances = {};
    }
    if (!Solana._instances[network]) {
      const instance = new Solana(network);
      // Add to instances BEFORE init() to prevent creating duplicate instances
      // during initialization (e.g., when trackPools calls connector getInstance)
      Solana._instances[network] = instance;
      await instance.init();
    }
    return Solana._instances[network];
  }

  private async init(): Promise<void> {
    try {
      // Initialize RPC provider service if configured
      if (this.rpcProviderService) {
        await this.rpcProviderService.initialize();
      }
    } catch (e) {
      logger.error(`Failed to initialize ${this.network}: ${e}`);
      throw e;
    }
  }

  /**
   * Get the token list from TokenService (reads from disk each time)
   */
  async getTokenList(): Promise<TokenInfo[]> {
    const tokens = await TokenService.getInstance().loadTokenList('solana', this.network);
    return tokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chainId: 101, // Solana mainnet chainId
    }));
  }

  async getToken(addressOrSymbol: string): Promise<TokenInfo | null> {
    const tokenList = await this.getTokenList();

    // First try to find by symbol (case-insensitive)
    const normalizedSearch = addressOrSymbol.toUpperCase().trim();
    let token = tokenList.find((token: TokenInfo) => token.symbol.toUpperCase().trim() === normalizedSearch);

    // If not found by symbol, try to find by address
    if (!token) {
      token = tokenList.find((token: TokenInfo) => token.address.toLowerCase() === addressOrSymbol.toLowerCase());
    }

    // If still not found, try to create a new token assuming addressOrSymbol is an address
    if (!token) {
      try {
        // Validate if it's a valid public key
        const mintPubkey = new PublicKey(addressOrSymbol);

        // Fetch mint info to get decimals
        const mintInfo = await getMint(this.connection, mintPubkey);

        // Create a basic token object with fetched decimals
        token = {
          address: addressOrSymbol,
          symbol: `DUMMY_${addressOrSymbol.slice(0, 4)}`,
          name: `Dummy Token (${addressOrSymbol.slice(0, 8)}...)`,
          decimals: mintInfo.decimals,
          chainId: 101,
        };
      } catch (e) {
        // Not a valid public key or couldn't fetch mint info, return null
        return null;
      }
    }

    return token;
  }

  // returns Keypair for a private key, which should be encoded in Base58
  getKeypairFromPrivateKey(privateKey: string): Keypair {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(new Uint8Array(decoded));
  }

  /**
   * Validate Solana address format
   * @param address The address to validate
   * @returns The address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      // Check if address can be parsed as a public key
      new PublicKey(address);

      // Additional check for proper length
      if (address.length < 32 || address.length > 44) {
        throw new Error('Invalid address length');
      }

      return address;
    } catch (error) {
      throw new Error(`Invalid Solana address format: ${address}`);
    }
  }

  async getWallet(address: string): Promise<Keypair> {
    try {
      // Validate the address format first
      const validatedAddress = Solana.validateAddress(address);

      // Use the safe wallet file path utility to prevent path injection
      const safeWalletPath = getSafeWalletFilePath('solana', validatedAddress);

      // Read the wallet file using the safe path
      const encryptedPrivateKey: string = await fse.readFile(safeWalletPath, 'utf8');

      const walletKey = ConfigManagerCertPassphrase.readWalletKey();
      if (!walletKey) {
        throw new Error('missing wallet encryption key');
      }
      const decrypted = await this.decrypt(encryptedPrivateKey, walletKey);

      return Keypair.fromSecretKey(new Uint8Array(bs58.decode(decrypted)));
    } catch (error) {
      if (error.message.includes('Invalid Solana address')) {
        throw error; // Re-throw validation errors
      }
      if (error.code === 'ENOENT') {
        throw new Error(`Wallet not found for address: ${address}`);
      }
      throw error;
    }
  }

  /**
   * Check if an address is a hardware wallet
   */
  async isHardwareWallet(address: string): Promise<boolean> {
    try {
      return await isHardwareWalletUtil('solana', address);
    } catch (error) {
      logger.error(`Error checking hardware wallet status: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the RPC provider service if initialized
   */
  public getRpcProviderService(): RPCProvider | null {
    return this.rpcProviderService || null;
  }

  /**
   * Get the PublicKey object for a wallet address
   * This is used for hardware wallets where we only need the public key
   */
  async getPublicKey(address: string): Promise<PublicKey> {
    try {
      return new PublicKey(address);
    } catch (error) {
      throw new Error(`Invalid Solana address: ${address}`);
    }
  }

  async encrypt(secret: string, password: string): Promise<string> {
    const algorithm = 'aes-256-ctr';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, new Uint8Array(salt), 5000, 32, 'sha512');
    const cipher = crypto.createCipheriv(algorithm, new Uint8Array(key), new Uint8Array(iv));

    const encryptedBuffers = [
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret)))),
      new Uint8Array(cipher.final()),
    ];
    const encrypted = Buffer.concat(encryptedBuffers);

    const ivJSON = iv.toJSON();
    const saltJSON = salt.toJSON();
    const encryptedJSON = encrypted.toJSON();

    return JSON.stringify({
      algorithm,
      iv: ivJSON,
      salt: saltJSON,
      encrypted: encryptedJSON,
    });
  }

  async decrypt(encryptedSecret: string, password: string): Promise<string> {
    const hash = JSON.parse(encryptedSecret);
    const salt = new Uint8Array(Buffer.from(hash.salt, 'utf8'));
    const iv = new Uint8Array(Buffer.from(hash.iv, 'utf8'));

    const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');

    const decipher = crypto.createDecipheriv(hash.algorithm, new Uint8Array(key), iv);

    const decryptedBuffers = [
      new Uint8Array(decipher.update(new Uint8Array(Buffer.from(hash.encrypted, 'hex')))),
      new Uint8Array(decipher.final()),
    ];
    const decrypted = Buffer.concat(decryptedBuffers);

    return decrypted.toString();
  }

  /**
   * @deprecated Use the optimized implementation in routes/balances.ts instead
   */
  async getBalance(wallet: Keypair, symbols?: string[]): Promise<Record<string, number>> {
    const publicKey = wallet.publicKey;
    const balances: Record<string, number> = {};
    const tokenList = await this.getTokenList();

    // Treat empty array as if no tokens were specified
    const effectiveSymbols = symbols && symbols.length === 0 ? undefined : symbols;

    // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
    if (!effectiveSymbols || effectiveSymbols.some((s) => s.toUpperCase() === 'SOL')) {
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance * LAMPORT_TO_SOL;
      balances['SOL'] = solBalanceInSol;
    }

    // Return early if only SOL balance was requested
    if (effectiveSymbols && effectiveSymbols.length === 1 && effectiveSymbols[0].toUpperCase() === 'SOL') {
      return balances;
    }

    // Get all token accounts for the provided address using jsonParsed encoding
    let allAccounts = [];
    try {
      const [legacyAccounts, token2022Accounts] = await Promise.all([
        this.connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        this.connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);
      allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
    } catch (error) {
      // If we get a StructError (validation failure from mixed parsed/base64 responses),
      // fall back to using base64 encoding
      if (error.name === 'StructError' || error.message?.includes('Expected an object')) {
        logger.warn('StructError in getBalance, falling back to base64 encoding');
        // Use the base64 fallback method to get token accounts
        const tokenAccountsMap = await this.fetchTokenAccountsBase64(publicKey);
        // Convert the map to the array format expected by the rest of this method
        allAccounts = Array.from(tokenAccountsMap.values()).map((ta) => ta.value);
      } else {
        throw error;
      }
    }

    // Track tokens that were found and those that still need to be fetched
    const foundTokens = new Set<string>();
    const tokensToFetch = new Map<string, string>(); // Maps address -> display symbol

    // Create a mapping of all mint addresses to their token accounts
    const mintToAccount = new Map();
    for (const account of allAccounts) {
      try {
        const parsedInfo = account.account.data.parsed?.info;
        if (!parsedInfo) {
          logger.warn('Account data not parsed or missing info');
          continue;
        }
        const mintAddress = parsedInfo.mint;
        mintToAccount.set(mintAddress, {
          parsedAccount: {
            mint: new PublicKey(mintAddress),
            amount: BigInt(parsedInfo.tokenAmount.amount),
            decimals: parsedInfo.tokenAmount.decimals,
          },
          value: account,
        });
      } catch (error) {
        logger.warn(`Error processing parsed account: ${error.message}`);
        continue;
      }
    }

    // Process requested specific symbols
    if (effectiveSymbols) {
      for (const s of effectiveSymbols) {
        // Skip SOL as it's handled separately
        if (s.toUpperCase() === 'SOL') {
          foundTokens.add('SOL');
          continue;
        }

        // Check if it's a token symbol in our list
        const tokenBySymbol = tokenList.find((t) => t.symbol.toUpperCase() === s.toUpperCase());

        if (tokenBySymbol) {
          foundTokens.add(tokenBySymbol.symbol);

          // Check if we have this token in the wallet
          if (mintToAccount.has(tokenBySymbol.address)) {
            const { parsedAccount } = mintToAccount.get(tokenBySymbol.address);
            // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
            const uiAmount =
              parsedAccount.uiAmount ?? Number(parsedAccount.amount) / Math.pow(10, tokenBySymbol.decimals);
            balances[tokenBySymbol.symbol] = uiAmount;
            logger.debug(`Found balance for ${tokenBySymbol.symbol}: ${uiAmount}`);
          } else {
            // Token not found in wallet, set balance to 0
            balances[tokenBySymbol.symbol] = 0;
            logger.debug(`No balance found for ${tokenBySymbol.symbol}, setting to 0`);
          }
        }
        // If it looks like a Solana address, prepare to fetch it directly
        else if (s.length >= 32 && s.length <= 44) {
          try {
            // Validate it's a proper public key
            const pubKey = new PublicKey(s);
            const mintAddress = pubKey.toBase58();

            // Check if we have this mint in the wallet
            if (mintToAccount.has(mintAddress)) {
              const { parsedAccount } = mintToAccount.get(mintAddress);

              // Try to get token from our token list
              const token = tokenList.find((t) => t.address === mintAddress);

              if (token) {
                // Token is in our list
                foundTokens.add(token.symbol);
                // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
                const uiAmount = parsedAccount.uiAmount ?? Number(parsedAccount.amount) / Math.pow(10, token.decimals);
                balances[token.symbol] = uiAmount;
                logger.debug(`Found balance for ${token.symbol} (${mintAddress}): ${uiAmount}`);
              } else {
                // Token is not in our list, need to fetch its metadata
                tokensToFetch.set(mintAddress, s);
              }
            } else {
              // Mint not found in wallet, add to tokens to fetch for metadata
              tokensToFetch.set(mintAddress, s);
            }
          } catch (e) {
            logger.warn(`Invalid token address format: ${s}`);
          }
        } else {
          logger.warn(`Token not recognized: ${s} (not a known symbol or valid address)`);
        }
      }
    } else {
      // No symbols provided or empty array - check all tokens in the token list
      // Note: When symbols is an empty array, we check all tokens in the token list
      logger.info(`Checking balances for all ${tokenList.length} tokens in the token list`);

      // Process all tokens from the token list
      for (const token of tokenList) {
        // Skip if already processed
        if (token.symbol === 'SOL' || foundTokens.has(token.symbol)) {
          continue;
        }

        // Check if we have this token in the wallet
        if (mintToAccount.has(token.address)) {
          const { parsedAccount } = mintToAccount.get(token.address);
          // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
          const uiAmount = parsedAccount.uiAmount ?? Number(parsedAccount.amount) / Math.pow(10, token.decimals);
          balances[token.symbol] = uiAmount;
          logger.debug(`Found balance for ${token.symbol} (${token.address}): ${uiAmount}`);
        } else {
          // Set balance to 0 for tokens in the list but not in wallet
          balances[token.symbol] = 0;
          logger.debug(`No balance found for ${token.symbol} (${token.address}), setting to 0`);
        }
      }
    }

    // Fetch metadata for unknown tokens
    for (const [mintAddress] of tokensToFetch.entries()) {
      try {
        // Check if we have this mint in the wallet
        let balance = 0;
        let decimals = 0;

        if (mintToAccount.has(mintAddress)) {
          const { parsedAccount } = mintToAccount.get(mintAddress);
          // Fetch mint info to get decimals
          const mintInfo = await getMint(this.connection, parsedAccount.mint);
          decimals = mintInfo.decimals;

          // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
          balance = parsedAccount.uiAmount ?? Number(parsedAccount.amount) / Math.pow(10, decimals);
        } else {
          // Try to get decimals anyway for the display
          try {
            const mintInfo = await getMint(this.connection, new PublicKey(mintAddress));
            decimals = mintInfo.decimals;
          } catch (error) {
            logger.warn(`Could not fetch mint info for ${mintAddress}: ${error.message}`);
            decimals = 9; // Default to 9 decimals
          }
        }

        // Use the full mint address as the display key for the balance
        balances[mintAddress] = balance;
        logger.debug(`Using full address as display key for ${mintAddress} with balance ${balance}`);
      } catch (error) {
        logger.error(`Failed to process token ${mintAddress}: ${error.message}`);
      }
    }

    // Filter out zero balances when no specific tokens are requested
    if (!symbols || (symbols && symbols.length === 0)) {
      const filteredBalances: Record<string, number> = {};

      // Keep SOL balance regardless of its value
      if ('SOL' in balances) {
        filteredBalances['SOL'] = balances['SOL'];
      }

      // Filter other tokens with zero balances
      Object.entries(balances).forEach(([key, value]) => {
        if (key !== 'SOL' && value > 0) {
          filteredBalances[key] = value;
        }
      });

      return filteredBalances;
    }

    return balances;
  }

  /**
   * Get balances for a given address
   * @param address Wallet address
   * @param tokens Optional array of token symbols/addresses to fetch. If not provided, fetches tokens from token list
   * @returns Map of token symbol to balance (only includes tokens in network's token list)
   */
  public async getBalances(address: string, tokens?: string[]): Promise<Record<string, number>> {
    return this.getBalancesFromRPC(address, tokens);
  }

  /**
   * Fetch positions for a wallet from all connectors
   * Uses connector-specific helpers to avoid duplicating logic
   */
  private async fetchPositionsForWallet(walletAddress: string): Promise<any[]> {
    const allPositions: any[] = [];

    // Try Meteora
    try {
      const { getPositionsOwned: getMeteoraPositions } = await import(
        '../../connectors/meteora/clmm-routes/positionsOwned'
      );
      // Create a minimal fastify-like object for validation
      const mockFastify = { httpErrors: { badRequest: (msg: string) => new Error(msg) } };
      const meteoraPositions = await getMeteoraPositions(mockFastify as any, this.network, walletAddress);

      // Add connector metadata to each position
      for (const position of meteoraPositions) {
        allPositions.push({
          connector: 'meteora',
          positionId: position.address,
          poolAddress: position.poolAddress,
          baseToken: position.baseTokenAddress,
          quoteToken: position.quoteTokenAddress,
          liquidity: position.baseTokenAmount + position.quoteTokenAmount,
          ...position,
        });
      }
      logger.debug(`Fetched ${meteoraPositions.length} Meteora position(s) for ${walletAddress.slice(0, 8)}...`);
    } catch (error: any) {
      logger.debug(`Could not fetch Meteora positions for ${walletAddress.slice(0, 8)}...: ${error.message}`);
    }

    // Try Raydium CLMM
    try {
      const { getPositionsOwned: getRaydiumPositions } = await import(
        '../../connectors/raydium/clmm-routes/positionsOwned'
      );
      const mockFastify = { httpErrors: { badRequest: (msg: string) => new Error(msg) } };
      const raydiumPositions = await getRaydiumPositions(mockFastify as any, this.network, walletAddress);

      // Add connector metadata to each position
      for (const position of raydiumPositions) {
        allPositions.push({
          connector: 'raydium',
          positionId: position.address,
          poolAddress: position.poolAddress,
          baseToken: position.baseTokenAddress,
          quoteToken: position.quoteTokenAddress,
          liquidity: position.baseTokenAmount + position.quoteTokenAmount,
          ...position,
        });
      }
      logger.debug(`Fetched ${raydiumPositions.length} Raydium position(s) for ${walletAddress.slice(0, 8)}...`);
    } catch (error: any) {
      logger.debug(`Could not fetch Raydium positions for ${walletAddress.slice(0, 8)}...: ${error.message}`);
    }

    // Try PancakeSwap
    try {
      const { getPositionsOwned: getPancakeswapPositions } = await import(
        '../../connectors/pancakeswap-sol/clmm-routes/positionsOwned'
      );
      const mockFastify = { httpErrors: { badRequest: (msg: string) => new Error(msg) } };
      const pancakeswapPositions = await getPancakeswapPositions(mockFastify as any, this.network, walletAddress);

      // Add connector metadata to each position
      for (const position of pancakeswapPositions) {
        allPositions.push({
          connector: 'pancakeswap-sol',
          positionId: position.address,
          poolAddress: position.poolAddress,
          baseToken: position.baseTokenAddress,
          quoteToken: position.quoteTokenAddress,
          liquidity: position.baseTokenAmount + position.quoteTokenAmount,
          ...position,
        });
      }
      logger.debug(
        `Fetched ${pancakeswapPositions.length} PancakeSwap position(s) for ${walletAddress.slice(0, 8)}...`,
      );
    } catch (error: any) {
      logger.debug(`Could not fetch PancakeSwap positions for ${walletAddress.slice(0, 8)}...: ${error.message}`);
    }

    return allPositions;
  }

  /**
   * Get balances for a given address directly from RPC (bypasses cache)
   * @param address Wallet address
   * @param tokens Optional array of token symbols/addresses to fetch. If not provided, fetches tokens from token list
   * @returns Map of token symbol to balance (only includes tokens in network's token list)
   */
  private async getBalancesFromRPC(address: string, tokens?: string[]): Promise<Record<string, number>> {
    const publicKey = new PublicKey(address);
    const balances: Record<string, number> = {};

    // Treat empty array as if no tokens were specified
    const effectiveSymbols = tokens && tokens.length === 0 ? undefined : tokens;

    // Always fetch SOL balance if no specific tokens or SOL is requested
    const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
    if (!effectiveSymbols || effectiveSymbols.some((s) => s.toUpperCase() === 'SOL' || s === SOL_NATIVE_MINT)) {
      balances['SOL'] = await this.getSolBalance(publicKey);
    }

    // Return early if only SOL was requested
    if (
      effectiveSymbols &&
      effectiveSymbols.length === 1 &&
      (effectiveSymbols[0].toUpperCase() === 'SOL' || effectiveSymbols[0] === SOL_NATIVE_MINT)
    ) {
      return balances;
    }

    // Fetch all token accounts
    const tokenAccounts = await this.fetchTokenAccounts(publicKey);
    if (tokenAccounts.size === 0) {
      return this.handleEmptyTokenAccounts(balances, effectiveSymbols);
    }

    // Process tokens based on request type
    if (effectiveSymbols) {
      // Specific tokens requested
      await this.processSpecificTokens(tokenAccounts, effectiveSymbols, balances);
    } else {
      // Default: only tokens in token list
      await this.processTokenListOnly(tokenAccounts, balances);
    }

    // Filter results if no specific tokens were requested
    if (!effectiveSymbols) {
      return this.filterZeroBalances(balances);
    }

    return balances;
  }

  /**
   * Get SOL balance for a public key
   */
  private async getSolBalance(publicKey: PublicKey): Promise<number> {
    try {
      const solBalance = await this.connection.getBalance(publicKey);
      return solBalance * LAMPORT_TO_SOL;
    } catch (error) {
      logger.error(`Error fetching SOL balance: ${error.message}`);

      // Re-throw rate limit errors (statusCode 429) so they propagate to the API response
      if (error.statusCode === 429) {
        throw error;
      }
      // For other errors, return 0 to avoid failing the entire request
      return 0;
    }
  }

  /**
   * Fetch all token accounts for a public key
   * Always uses base64 encoding for reliability across all RPC providers (Helius, standard RPC)
   */
  private async fetchTokenAccounts(publicKey: PublicKey): Promise<Map<string, TokenAccount>> {
    const tokenAccountsMap = new Map<string, TokenAccount>();
    const tokenList = await this.getTokenList();

    try {
      // Fetch all accounts with base64 encoding - works reliably for all providers
      const [legacyBase64, token2022Base64] = await Promise.all([
        this.connection.getTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        this.connection.getTokenAccountsByOwner(publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);

      const allBase64Accounts = [...legacyBase64.value, ...token2022Base64.value];
      logger.info(`Found ${allBase64Accounts.length} token accounts for ${publicKey.toString()}`);

      for (const account of allBase64Accounts) {
        try {
          // Convert Buffer to Uint8Array for AccountLayout.decode
          const data = new Uint8Array(account.account.data);
          const accountInfo = AccountLayout.decode(data);
          const mintAddress = accountInfo.mint.toString();

          // Get decimals from token list (only process tokens in our list)
          const tokenInList = tokenList.find((t) => t.address === mintAddress);
          if (!tokenInList) {
            // Skip tokens not in our token list
            logger.debug(`Skipping token ${mintAddress} - not in token list`);
            continue;
          }

          // Store in the same format as parsed accounts
          tokenAccountsMap.set(mintAddress, {
            parsedAccount: {
              mint: accountInfo.mint,
              owner: accountInfo.owner,
              amount: accountInfo.amount,
              decimals: tokenInList.decimals,
              uiAmount: Number(accountInfo.amount) / Math.pow(10, tokenInList.decimals),
              isNative: accountInfo.isNative !== null && accountInfo.isNativeOption === 1,
              delegatedAmount: accountInfo.delegateOption ? accountInfo.delegatedAmount : BigInt(0),
              delegate: accountInfo.delegateOption ? accountInfo.delegate : null,
              state: accountInfo.state === 1 ? 'initialized' : accountInfo.state === 2 ? 'frozen' : 'uninitialized',
              isInitialized: accountInfo.state !== 0,
              isFrozen: accountInfo.state === 2,
              rentExemptReserve: accountInfo.isNative,
              closeAuthority: accountInfo.closeAuthorityOption ? accountInfo.closeAuthority : null,
            },
            value: account,
          });
        } catch (decodeError) {
          logger.warn(`Error decoding base64 account: ${decodeError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error fetching token accounts with parsed encoding: ${error.message}`);

      // Re-throw rate limit errors (statusCode 429) so they propagate to the API response
      if (error.statusCode === 429) {
        throw error;
      }

      // If we get a StructError (validation failure from mixed parsed/base64 responses),
      // fall back to using base64 encoding exclusively
      if (error.name === 'StructError' || error.message?.includes('Expected an object')) {
        logger.warn('Falling back to base64 encoding due to mixed response format');
        return await this.fetchTokenAccountsBase64(publicKey);
      }
      // For other errors, log but don't fail the request (return empty map)
    }

    return tokenAccountsMap;
  }

  /**
   * Fallback method to fetch token accounts using base64 encoding
   * Used when getParsedTokenAccountsByOwner returns mixed parsed/base64 data
   */
  private async fetchTokenAccountsBase64(publicKey: PublicKey): Promise<Map<string, TokenAccount>> {
    const tokenAccountsMap = new Map<string, TokenAccount>();
    const { AccountLayout } = await import('@solana/spl-token');

    try {
      const [legacyAccounts, token2022Accounts] = await Promise.all([
        this.connection.getTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        this.connection.getTokenAccountsByOwner(publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);

      const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
      logger.info(`Found ${allAccounts.length} token accounts (base64) for ${publicKey.toString()}`);

      for (const account of allAccounts) {
        try {
          // Decode base64 account data using AccountLayout
          // Convert Buffer to Uint8Array for AccountLayout.decode
          const data =
            account.account.data instanceof Buffer ? Uint8Array.from(account.account.data) : account.account.data;
          const accountData = AccountLayout.decode(data);
          const mintAddress = accountData.mint.toString();

          tokenAccountsMap.set(mintAddress, {
            parsedAccount: {
              mint: accountData.mint,
              owner: accountData.owner,
              amount: accountData.amount,
              decimals: 0, // Will be fetched from mint if needed
              isNative: accountData.isNativeOption === 1,
              delegatedAmount: accountData.delegatedAmount,
              delegate: accountData.delegateOption === 1 ? accountData.delegate : null,
              state: accountData.state === 1 ? 'initialized' : 'uninitialized',
              isInitialized: accountData.state === 1,
              isFrozen: accountData.state === 2,
              rentExemptReserve: accountData.isNativeOption === 1 ? accountData.isNative : null,
              closeAuthority: accountData.closeAuthorityOption === 1 ? accountData.closeAuthority : null,
            },
            value: account,
          });
        } catch (error) {
          logger.warn(`Error decoding base64 account: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error fetching token accounts with base64 encoding: ${error.message}`);

      if (error.statusCode === 429) {
        throw error;
      }
    }

    return tokenAccountsMap;
  }

  /**
   * Handle case when no token accounts are found
   */
  private handleEmptyTokenAccounts(
    balances: Record<string, number>,
    effectiveSymbols?: string[],
  ): Record<string, number> {
    const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
    if (effectiveSymbols) {
      // Set all requested tokens to 0
      for (const symbol of effectiveSymbols) {
        if (symbol.toUpperCase() !== 'SOL' && symbol !== SOL_NATIVE_MINT) {
          balances[symbol] = 0;
        }
      }
    }
    return balances;
  }

  /**
   * Process specific tokens requested by the user
   */
  private async processSpecificTokens(
    tokenAccounts: Map<string, TokenAccount>,
    symbols: string[],
    balances: Record<string, number>,
  ): Promise<void> {
    const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
    const tokenList = await this.getTokenList();

    for (const symbol of symbols) {
      if (symbol.toUpperCase() === 'SOL' || symbol === SOL_NATIVE_MINT) continue;

      // Try to find token by symbol
      const tokenInfo = tokenList.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());

      if (tokenInfo) {
        // Token found in list
        const balance = this.getTokenBalance(tokenAccounts.get(tokenInfo.address), tokenInfo.decimals);
        balances[tokenInfo.symbol] = balance;
      } else if (this.isValidSolanaAddress(symbol)) {
        // Try as mint address
        const tokenAccount = tokenAccounts.get(symbol);
        if (tokenAccount) {
          const balance = await this.getTokenBalanceWithMintInfo(tokenAccount, symbol);
          balances[symbol] = balance;
        } else {
          balances[symbol] = 0;
        }
      } else {
        logger.warn(`Token not recognized: ${symbol}`);
        balances[symbol] = 0;
      }
    }
  }

  /**
   * Process all tokens in wallet (fetchAll=true)
   */
  private async processAllTokens(
    tokenAccounts: Map<string, TokenAccount>,
    balances: Record<string, number>,
  ): Promise<void> {
    logger.info('Processing all token accounts (fetchAll=true)');
    const tokenList = await this.getTokenList();

    for (const [mintAddress, tokenAccount] of tokenAccounts) {
      try {
        // Check if token is in our list
        const tokenInfo = tokenList.find((t) => t.address === mintAddress);

        if (tokenInfo) {
          const balance = this.getTokenBalance(tokenAccount, tokenInfo.decimals);
          balances[tokenInfo.symbol] = balance;
        } else {
          // Fetch mint info for unknown token
          const balance = await this.getTokenBalanceWithMintInfo(tokenAccount, mintAddress);
          if (balance > 0) {
            balances[mintAddress] = balance;
          }
        }
      } catch (error) {
        logger.warn(`Error processing token ${mintAddress}: ${error.message}`);
      }
    }
  }

  /**
   * Process only tokens that are in the token list (default behavior)
   */
  private async processTokenListOnly(
    tokenAccounts: Map<string, TokenAccount>,
    balances: Record<string, number>,
  ): Promise<void> {
    const tokenList = await this.getTokenList();
    logger.info(`Checking balances for ${tokenList.length} tokens in token list`);

    for (const tokenInfo of tokenList) {
      if (tokenInfo.symbol === 'SOL') continue;

      const tokenAccount = tokenAccounts.get(tokenInfo.address);
      if (tokenAccount) {
        const balance = this.getTokenBalance(tokenAccount, tokenInfo.decimals);
        if (balance > 0) {
          balances[tokenInfo.symbol] = balance;
        }
      }
    }
  }

  /**
   * Get token balance from a token account
   */
  private getTokenBalance(tokenAccount: TokenAccount | undefined, decimals: number): number {
    if (!tokenAccount) return 0;

    // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
    return tokenAccount.parsedAccount.uiAmount ?? Number(tokenAccount.parsedAccount.amount) / Math.pow(10, decimals);
  }

  /**
   * Get token balance with mint info lookup
   */
  private async getTokenBalanceWithMintInfo(tokenAccount: TokenAccount, mintAddress: string): Promise<number> {
    try {
      const programId = tokenAccount.value.account.owner;
      const mintInfo = await Promise.race([
        getMint(this.connection, new PublicKey(mintAddress), undefined, programId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Mint info timeout')), 1000)),
      ]);

      // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
      return (
        tokenAccount.parsedAccount.uiAmount ??
        Number(tokenAccount.parsedAccount.amount) / Math.pow(10, mintInfo.decimals)
      );
    } catch (error) {
      // Use default 9 decimals if mint info fails
      logger.debug(`Failed to get mint info for ${mintAddress}, using default decimals`);
      // Use pre-calculated uiAmount from RPC for efficiency (Helius optimization)
      return tokenAccount.parsedAccount.uiAmount ?? Number(tokenAccount.parsedAccount.amount) / Math.pow(10, 9);
    }
  }

  /**
   * Check if a string is a valid Solana address
   */
  private isValidSolanaAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Filter out zero balances (except SOL)
   */
  private filterZeroBalances(balances: Record<string, number>): Record<string, number> {
    const filtered: Record<string, number> = {};

    // Always include SOL
    if ('SOL' in balances) {
      filtered['SOL'] = balances['SOL'];
    }

    // Add non-zero balances
    for (const [key, value] of Object.entries(balances)) {
      if (key !== 'SOL' && value > 0) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  // returns a Solana TransactionResponse for a txHash.
  async getTransaction(payerSignature: string): Promise<VersionedTransactionResponse | null> {
    return this.connection.getTransaction(payerSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  }

  // returns a Solana TransactionResponseStatusCode for a txData.
  public async getTransactionStatusCode(txData: TransactionResponse | null): Promise<TransactionResponseStatusCode> {
    let txStatus;
    if (!txData) {
      // tx not yet confirmed by validator
      txStatus = TransactionResponseStatusCode.UNCONFIRMED;
    } else {
      // If txData exists, check if there's an error in the metadata
      txStatus =
        txData.meta?.err == null ? TransactionResponseStatusCode.CONFIRMED : TransactionResponseStatusCode.FAILED;
    }
    return txStatus;
  }

  // returns the current block number
  async getCurrentBlockNumber(): Promise<number> {
    return await this.connection.getSlot('processed');
  }

  async close() {
    if (this.network in Solana._instances) {
      delete Solana._instances[this.network];
    }
  }

  public async estimateGas(computeUnits?: number): Promise<number> {
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;
    const priorityFeePerCU = await this.estimateGasPrice();
    const priorityFee = computeUnitsToUse * priorityFeePerCU;

    // Add base fee (in lamports) and convert total to SOL
    const totalLamports = BASE_FEE + priorityFee;
    const gasCost = totalLamports * LAMPORT_TO_SOL;

    return gasCost;
  }

  /**
   * Prepare gas options for a transaction
   * @param priorityFeePerCU Priority fee in lamports per compute unit (optional)
   * @param computeUnits Compute units limit (optional)
   * @returns Gas options object containing priorityFeePerCU and computeUnits
   */
  public async prepareGasOptions(
    priorityFeePerCU?: number,
    computeUnits?: number,
  ): Promise<{
    priorityFeePerCU: number;
    computeUnits: number;
  }> {
    // If priorityFeePerCU not provided, estimate it
    const feePerCU = priorityFeePerCU ?? (await this.estimateGasPrice());

    // Use default compute units if not provided
    const units = computeUnits || this.config.defaultComputeUnits;

    return {
      priorityFeePerCU: feePerCU,
      computeUnits: units,
    };
  }

  async estimateGasPrice(): Promise<number> {
    return await SolanaPriorityFees.estimatePriorityFee(this.config, this.network);
  }

  public async confirmTransaction(
    signature: string,
    timeout: number = 3000,
  ): Promise<{ confirmed: boolean; txData?: any }> {
    try {
      // Use RPC provider WebSocket monitoring if available for real-time confirmation
      if (this.rpcProviderService?.supportsTransactionMonitoring()) {
        logger.info(`Using WebSocket monitoring for transaction ${signature}`);
        return await this.rpcProviderService.monitorTransaction(signature, timeout);
      }

      // Fallback to polling-based confirmation
      logger.info(`Using polling-based confirmation for transaction ${signature}`);
      const confirmationPromise = (async () => {
        // Use getTransaction instead of getSignatureStatuses for more reliability
        const txData = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        if (!txData) {
          return { confirmed: false };
        }

        // Check if transaction is already confirmed but had an error
        if (txData.meta?.err) {
          throw new Error(`Transaction failed with error: ${JSON.stringify(txData.meta.err)}`);
        }

        // More definitive check using slot confirmation
        const status = await this.connection.getSignatureStatus(signature);
        const isConfirmed =
          status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized';

        return { confirmed: !!isConfirmed, txData };
      })();

      const timeoutPromise = new Promise<{ confirmed: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error: any) {
      // Re-throw rate limit errors without wrapping
      if (error.statusCode === 429) {
        throw error;
      }

      throw new Error(`Failed to confirm transaction: ${error.message}`);
    }
  }

  private getFee(txData: any): number {
    if (!txData?.meta) {
      return 0;
    }

    // Base fee from meta (in lamports)
    const baseFee = txData.meta.fee || 0;

    // Extract priority fee from compute budget instructions
    let priorityFee = 0;
    try {
      const computeBudgetProgramId = 'ComputeBudget111111111111111111111111111111';
      const instructions = txData.transaction?.message?.instructions || [];
      const accountKeys = txData.transaction?.message?.accountKeys || [];

      // Find SetComputeUnitPrice instruction
      for (const ix of instructions) {
        const programId = accountKeys[ix.programIdIndex]?.toString() || accountKeys[ix.programIdIndex];

        if (programId === computeBudgetProgramId && ix.data) {
          // Decode base58 instruction data
          const data = typeof ix.data === 'string' ? bs58.decode(ix.data) : ix.data;

          // SetComputeUnitPrice instruction has discriminator [3] and u64 microLamports
          if (data.length >= 9 && data[0] === 3) {
            // Read u64 little-endian (microlamports per CU)
            const microLamportsPerCU =
              data[1] |
              (data[2] << 8) |
              (data[3] << 16) |
              (data[4] << 24) |
              (data[5] << 32) |
              (data[6] << 40) |
              (data[7] << 48) |
              (data[8] << 56);

            // Priority fee = (microlamports per CU) * (CUs consumed) / 1,000,000
            const computeUnitsConsumed = txData.meta.computeUnitsConsumed || 0;
            priorityFee = Math.floor((microLamportsPerCU * computeUnitsConsumed) / 1_000_000);
            break;
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to extract priority fee: ${error.message}`);
    }

    // Total fee = base fee + priority fee (convert to SOL)
    const totalFee = (baseFee + priorityFee) * LAMPORT_TO_SOL;

    if (priorityFee > 0) {
      logger.info(
        `Transaction fees: base=${baseFee} lamports, priority=${priorityFee} lamports, total=${baseFee + priorityFee} lamports (${totalFee.toFixed(9)} SOL)`,
      );
    }

    return totalFee;
  }

  public async sendAndConfirmTransaction(
    tx: Transaction | VersionedTransaction,
    signers: Signer[] = [],
    priorityFeePerCU?: number,
  ): Promise<{ signature: string; fee: number }> {
    // Use provided priority fee or estimate it
    const currentPriorityFee = priorityFeePerCU ?? (await this.estimateGasPrice());

    // Always simulate transaction to get actual compute units
    let computeUnitsToUse: number;
    try {
      let simulationResult;

      if (tx instanceof Transaction) {
        // For regular transactions, simulate with the Transaction object
        const result = await this.connection.simulateTransaction(tx);
        simulationResult = result.value;
      } else {
        // For versioned transactions, use the config object
        const result = await this.connection.simulateTransaction(tx, {
          replaceRecentBlockhash: true,
          sigVerify: false,
        });
        simulationResult = result.value;
      }

      if (simulationResult.unitsConsumed) {
        // Add 10% margin for safety
        computeUnitsToUse = Math.ceil(simulationResult.unitsConsumed * 1.1);
        logger.info(
          `Simulation consumed ${simulationResult.unitsConsumed} units, using ${computeUnitsToUse} with 10% margin`,
        );
      } else {
        // Fallback to default if simulation doesn't return units
        computeUnitsToUse = this.config.defaultComputeUnits;
        logger.warn('Simulation did not return units consumed, using default');
      }
    } catch (error) {
      logger.warn(`Failed to simulate for compute units: ${error.message}, using default`);
      computeUnitsToUse = this.config.defaultComputeUnits;
    }

    const basePriorityFeeLamports = currentPriorityFee * computeUnitsToUse;
    logger.info(
      `Sending transaction with ${currentPriorityFee} lamports/CU priority fee and total priority fee of ${(basePriorityFeeLamports * LAMPORT_TO_SOL).toFixed(6)} SOL`,
    );

    // Prepare transaction with compute budget
    if (tx instanceof Transaction) {
      tx = await this.prepareTx(tx, currentPriorityFee, computeUnitsToUse, signers);
    } else {
      tx = await this.prepareVersionedTx(tx, currentPriorityFee, computeUnitsToUse, signers);
    }

    // Use the confirmation retry logic from sendAndConfirmRawTransaction
    const serializedTx = tx.serialize();
    const { confirmed, signature, txData } = await this._sendAndConfirmRawTransaction(serializedTx);

    if (confirmed && txData) {
      const actualFee = this.getFee(txData);
      logger.info(`Transaction ${signature} confirmed with total fee: ${actualFee.toFixed(6)} SOL`);
      return { signature, fee: actualFee };
    }

    throw new Error(`Transaction failed to confirm after ${this.config.confirmRetryCount} attempts`);
  }

  private async prepareTx(
    tx: Transaction,
    currentPriorityFee: number,
    computeUnitsToUse: number,
    signers: Signer[],
  ): Promise<Transaction> {
    const priorityFeeMicroLamports = Math.floor(currentPriorityFee * 1_000_000);
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeMicroLamports,
    });

    // Remove any existing priority fee instructions and add the new one
    tx.instructions = [
      ...tx.instructions.filter((inst) => !inst.programId.equals(ComputeBudgetProgram.programId)),
      priorityFeeInstruction,
    ];

    // Set compute unit limit
    const computeUnitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitsToUse,
    });
    tx.add(computeUnitInstruction);

    // Get latest blockhash
    const {
      value: { lastValidBlockHeight, blockhash },
    } = await this.connection.getLatestBlockhashAndContext('confirmed');

    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);

    return tx;
  }

  private async prepareVersionedTx(
    tx: VersionedTransaction,
    currentPriorityFee: number,
    computeUnits: number,
    _signers: Signer[],
  ): Promise<VersionedTransaction> {
    const originalMessage = tx.message;
    const originalStaticCount = originalMessage.staticAccountKeys.length;
    const originalSignatures = tx.signatures; // Clone original signatures array

    let modifiedTx: VersionedTransaction;

    // Create new compute budget instructions
    const priorityFeeMicroLamports = Math.floor(currentPriorityFee * 1_000_000);
    const computeBudgetInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeeMicroLamports,
      }),
    ];

    // Check if ComputeBudgetProgram is in static keys
    const computeBudgetProgramIndex = originalMessage.staticAccountKeys.findIndex((key) =>
      key.equals(ComputeBudgetProgram.programId),
    );

    // Add ComputeBudget program to static keys, adjust indexes, and create modified instructions
    if (computeBudgetProgramIndex === -1) {
      // Add ComputeBudget program to static keys
      const newStaticKeys = [...originalMessage.staticAccountKeys, ComputeBudgetProgram.programId];

      // Process original instructions with index adjustment
      const originalInstructions = originalMessage.compiledInstructions.map((ix) => ({
        ...ix,
        accountKeyIndexes: ix.accountKeyIndexes.map((index) => (index >= originalStaticCount ? index + 1 : index)),
      }));

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map((ix) => ({
          programIdIndex: newStaticKeys.indexOf(ComputeBudgetProgram.programId), // Use new index
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
        })),
        ...originalInstructions,
      ];

      // Build new transaction
      modifiedTx = new VersionedTransaction(
        new MessageV0({
          header: originalMessage.header,
          staticAccountKeys: newStaticKeys,
          recentBlockhash: originalMessage.recentBlockhash!,
          compiledInstructions: modifiedInstructions.map((ix) => ({
            programIdIndex: ix.programIdIndex,
            accountKeyIndexes: ix.accountKeyIndexes,
            data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
          })),
          addressTableLookups: originalMessage.addressTableLookups,
        }),
      );
    } else {
      // Remove compute budget instructions from original instructions
      const nonComputeBudgetInstructions = originalMessage.compiledInstructions.filter(
        (ix) => !originalMessage.staticAccountKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId),
      );

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map((ix) => ({
          programIdIndex: computeBudgetProgramIndex, // Use existing index if already present
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
        })),
        ...nonComputeBudgetInstructions,
      ];
      // Build new transaction with same keys but modified instructions
      modifiedTx = new VersionedTransaction(
        new MessageV0({
          header: originalMessage.header,
          staticAccountKeys: originalMessage.staticAccountKeys,
          recentBlockhash: originalMessage.recentBlockhash,
          compiledInstructions: modifiedInstructions.map((ix) => ({
            programIdIndex: ix.programIdIndex,
            accountKeyIndexes: ix.accountKeyIndexes,
            data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
          })),
          addressTableLookups: originalMessage.addressTableLookups,
        }),
      );
    }
    // DON'T DELETE COMMENTS BELOW
    // console.log('Original message:', JSON.stringify({
    //   message: {
    //     header: originalMessage.header,
    //     staticAccountKeys: originalMessage.staticAccountKeys.map(k => k.toBase58()),
    //     recentBlockhash: originalMessage.recentBlockhash,
    //     compiledInstructions: originalMessage.compiledInstructions.map(ix => ({
    //       programIdIndex: ix.programIdIndex,
    //       accountKeyIndexes: ix.accountKeyIndexes,
    //       data: bs58.encode(ix.data)
    //     })),
    //     addressTableLookups: originalMessage.addressTableLookups
    //   }
    // }, null, 2));
    // console.log('Modified transaction:', JSON.stringify({
    //   message: {
    //     header: modifiedTx.message.header,
    //     staticAccountKeys: modifiedTx.message.staticAccountKeys.map(k => k.toBase58()),
    //     recentBlockhash: modifiedTx.message.recentBlockhash,
    //     compiledInstructions: modifiedTx.message.compiledInstructions.map(ix => ({
    //       programIdIndex: ix.programIdIndex,
    //       accountKeyIndexes: ix.accountKeyIndexes,
    //       data: bs58.encode(ix.data)
    //     })),
    //     addressTableLookups: modifiedTx.message.addressTableLookups
    //   }
    // }, null, 2));

    modifiedTx.signatures = originalSignatures;
    modifiedTx.sign([..._signers]);
    console.log('modifiedTx:', modifiedTx);

    return modifiedTx;
  }

  async sendAndConfirmRawTransaction(
    transaction: VersionedTransaction | Transaction,
  ): Promise<{ confirmed: boolean; signature: string; txData: any }> {
    // Convert Transaction to VersionedTransaction if necessary
    if (!(transaction instanceof VersionedTransaction)) {
      // Ensure transaction is properly prepared
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = transaction.recentBlockhash || blockhash;
      transaction.feePayer = transaction.feePayer || transaction.signatures[0]?.publicKey || null;

      // Get serialized transaction bytes
      const serializedTx = transaction.serialize();
      return this._sendAndConfirmRawTransaction(serializedTx);
    }

    // For VersionedTransaction, serialize directly
    const serializedTx = transaction.serialize();
    return this._sendAndConfirmRawTransaction(serializedTx);
  }

  /**
   * Confirm transaction via WebSocket monitoring
   */
  private async _confirmViaWebSocket(signature: string): Promise<{ confirmed: boolean; txData: any } | null> {
    if (!this.rpcProviderService?.supportsTransactionMonitoring()) {
      return null;
    }

    try {
      logger.info(`🚀 Sent transaction ${signature}, monitoring via WebSocket...`);
      const confirmationResult = await this.rpcProviderService.monitorTransaction(signature, 60000);

      if (confirmationResult.confirmed) {
        logger.info(`✅ Transaction ${signature} confirmed via WebSocket`);
        const txData = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        return { confirmed: true, txData };
      } else {
        logger.warn(`❌ Transaction ${signature} not confirmed via WebSocket within timeout`);
        return { confirmed: false, txData: null };
      }
    } catch (wsError: any) {
      logger.warn(`WebSocket monitoring failed: ${wsError.message}, falling back to polling`);
      return null;
    }
  }

  /**
   * Confirm transaction via REST polling
   */
  private async _confirmViaPolling(
    signature: string,
    lastValidBlockHeight: number,
  ): Promise<{ confirmed: boolean; txData: any }> {
    logger.info(`🚀 Sent transaction ${signature}, polling for confirmation...`);

    let attempts = 0;

    while (attempts < this.config.confirmRetryCount) {
      attempts++;

      try {
        const statuses = await this.connection.getSignatureStatuses([signature]);
        const status = statuses && statuses.value && statuses.value[0];

        if (status) {
          if (status.err) {
            logger.error(`❌ Transaction ${signature} failed with error:`, status.err);
            return { confirmed: false, txData: null };
          }

          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            logger.info(`✅ Transaction ${signature} confirmed after ${attempts} attempts`);
            const txData = await this.connection.getTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            return { confirmed: true, txData };
          }
        }

        // Check if blockhash has expired
        const currentBlockHeight = await this.connection.getBlockHeight();
        if (currentBlockHeight > lastValidBlockHeight) {
          logger.warn(`Blockhash expired for transaction ${signature}, transaction may have failed`);
        }

        await new Promise((resolve) => setTimeout(resolve, this.config.confirmRetryInterval * 1000));
      } catch (pollingError: any) {
        if (pollingError.statusCode === 429) {
          logger.error(`Rate limit error while polling transaction ${signature}`);
          throw pollingError;
        }
        logger.warn(`Polling attempt ${attempts} failed: ${pollingError.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    logger.warn(`❌ Transaction ${signature} not confirmed after ${attempts} attempts`);
    return { confirmed: false, txData: null };
  }

  /**
   * Send and confirm a raw transaction
   */
  private async _sendAndConfirmRawTransaction(
    serializedTx: Buffer | Uint8Array,
  ): Promise<{ confirmed: boolean; signature: string; txData: any }> {
    const { lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');

    let signature: string | null = null;

    try {
      logger.info('Sending transaction via sendRawTransaction');
      signature = await this.connection.sendRawTransaction(serializedTx, {
        skipPreflight: true,
        maxRetries: 0,
      });

      // Try WebSocket first, fall back to polling
      const wsResult = await this._confirmViaWebSocket(signature);
      if (wsResult !== null) {
        return { ...wsResult, signature };
      }

      const pollingResult = await this._confirmViaPolling(signature, lastValidBlockHeight);
      return { ...pollingResult, signature };
    } catch (sendError: any) {
      if (sendError.statusCode === 429) {
        throw sendError;
      }
      logger.error(`Failed to send transaction: ${sendError.message}`);
      return { confirmed: false, signature: signature || '', txData: null };
    }
  }

  async sendRawTransaction(rawTx: Buffer | Uint8Array | Array<number>, lastValidBlockHeight: number): Promise<string> {
    const blockheight = await this.connection.getBlockHeight({
      commitment: 'confirmed',
    });

    if (blockheight > lastValidBlockHeight + 50) {
      throw new Error('Maximum blockheight exceeded');
    }

    try {
      const signature = await this.connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 0,
      });
      return signature;
    } catch (error) {
      logger.error('Failed to send raw transaction:', error);
      throw error;
    }
  }

  /**
   * Extract balance changes and fee from a transaction for multiple tokens
   * @param signature Transaction signature
   * @param owner Owner address (required for SPL tokens and SOL balance extraction)
   * @param tokens Array of token mint addresses or 'SOL' for native SOL
   * @returns Array of balance changes in the same order as tokens, and transaction fee
   */
  async extractBalanceChangesAndFee(
    signature: string,
    owner: string,
    tokens: string[],
  ): Promise<{
    balanceChanges: number[];
    fee: number;
  }> {
    // Fetch transaction details
    const txDetails = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txDetails) {
      throw new Error(`Transaction ${signature} not found`);
    }

    // Calculate fee including priority fee using the same method as getFee
    const fee = this.getFee(txDetails);

    const preBalances = txDetails.meta?.preBalances || [];
    const postBalances = txDetails.meta?.postBalances || [];
    const preTokenBalances = txDetails.meta?.preTokenBalances || [];
    const postTokenBalances = txDetails.meta?.postTokenBalances || [];
    const ownerPubkey = new PublicKey(owner);

    // Process each token and return array of balance changes
    const balanceChanges = tokens.map((token) => {
      // Check if this is native SOL
      if (token === 'So11111111111111111111111111111111111111112') {
        // For native SOL, we need to calculate from lamport balance changes
        const accountIndex = txDetails.transaction.message.accountKeys.findIndex((key) =>
          key.pubkey.equals(ownerPubkey),
        );

        if (accountIndex === -1) {
          logger.warn(`Owner ${owner} not found in transaction accounts`);
          return 0;
        }

        // Calculate SOL change including fees
        const lamportChange = postBalances[accountIndex] - preBalances[accountIndex];
        return lamportChange * LAMPORT_TO_SOL;
      } else {
        // Token mint address provided - get SPL token balance change
        const preBalance =
          preTokenBalances.find((balance) => balance.mint === token && balance.owner === owner)?.uiTokenAmount
            .uiAmount || 0;

        const postBalance =
          postTokenBalances.find((balance) => balance.mint === token && balance.owner === owner)?.uiTokenAmount
            .uiAmount || 0;

        return postBalance - preBalance;
      }
    });

    return { balanceChanges, fee };
  }

  /**
   * Extract balance changes for CLMM operations with proper SOL handling
   * @param signature Transaction signature
   * @param owner Owner address
   * @param baseTokenInfo Base token info object with address and symbol
   * @param quoteTokenInfo Quote token info object with address and symbol
   * @param txFee Transaction fee in lamports (from txData.meta.fee)
   * @returns Object with base and quote token balance changes and calculated rent
   */
  async extractClmmBalanceChanges(
    signature: string,
    owner: string,
    baseTokenInfo: { address: string; symbol: string },
    quoteTokenInfo: { address: string; symbol: string },
    txFee: number,
  ): Promise<{
    baseTokenChange: number;
    quoteTokenChange: number;
    rent: number;
  }> {
    const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
    const isBaseSol = baseTokenInfo.symbol === 'SOL' || baseTokenInfo.address === SOL_NATIVE_MINT;
    const isQuoteSol = quoteTokenInfo.symbol === 'SOL' || quoteTokenInfo.address === SOL_NATIVE_MINT;

    // Build unique token list for extraction
    const tokensToExtract: string[] = [];
    const tokenIndices: { sol?: number; base?: number; quote?: number } = {};

    // Always include SOL first to track rent
    tokensToExtract.push(SOL_NATIVE_MINT);
    tokenIndices.sol = 0;

    // Add non-SOL tokens
    if (!isBaseSol) {
      tokensToExtract.push(baseTokenInfo.address);
      tokenIndices.base = tokensToExtract.length - 1;
    } else {
      tokenIndices.base = 0; // Base is SOL
    }

    if (!isQuoteSol) {
      tokensToExtract.push(quoteTokenInfo.address);
      tokenIndices.quote = tokensToExtract.length - 1;
    } else {
      tokenIndices.quote = 0; // Quote is SOL
    }

    // Extract balance changes
    const { balanceChanges } = await this.extractBalanceChangesAndFee(signature, owner, tokensToExtract);

    // Get individual balance changes
    const solChange = balanceChanges[tokenIndices.sol!];
    const baseTokenChange = balanceChanges[tokenIndices.base!];
    const quoteTokenChange = balanceChanges[tokenIndices.quote!];

    // Calculate rent from SOL balance
    // When neither token is SOL: rent = |SOL change| - fee
    // When one token is SOL: rent is included in the token's balance change
    let rent = 0;
    if (!isBaseSol && !isQuoteSol) {
      // SOL change = -(fee + rent)
      rent = Math.abs(solChange) - txFee / 1e9;
    } else {
      // For positions, rent is approximately 0.00204928 SOL
      rent = 0.00204928;
    }

    return {
      baseTokenChange,
      quoteTokenChange,
      rent,
    };
  }

  // Validate if a string is a valid Solana private key
  public static validateSolPrivateKey(secretKey: string): boolean {
    try {
      const secretKeyBytes = bs58.decode(secretKey);
      Keypair.fromSecretKey(new Uint8Array(secretKeyBytes));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Update getTokenBySymbol to use new getToken method
  public async getTokenBySymbol(tokenSymbol: string): Promise<TokenInfo | undefined> {
    return (await this.getToken(tokenSymbol)) || undefined;
  }

  public static async getWalletAddressExample(): Promise<string> {
    const chainConfig = getSolanaChainConfig();
    return chainConfig.defaultWallet;
  }

  public async simulateTransaction(transaction: VersionedTransaction | Transaction) {
    try {
      if (!(transaction instanceof VersionedTransaction)) {
        // Convert regular Transaction to VersionedTransaction for simulation
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = transaction.recentBlockhash || blockhash;
        transaction.feePayer = transaction.feePayer || transaction.signatures[0]?.publicKey || null;

        // Convert to VersionedTransaction
        const messageV0 = new MessageV0({
          header: transaction.compileMessage().header,
          staticAccountKeys: transaction.compileMessage().staticAccountKeys,
          recentBlockhash: transaction.recentBlockhash,
          compiledInstructions: transaction.compileMessage().compiledInstructions,
          addressTableLookups: [],
        });

        transaction = new VersionedTransaction(messageV0);
      }

      // Now handle all as VersionedTransaction
      const { value: simulatedTransactionResponse } = await this.connection.simulateTransaction(transaction, {
        replaceRecentBlockhash: false,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [] },
        sigVerify: false,
      });

      logger.info('Simulation Result:', {
        unitsConsumed: simulatedTransactionResponse.unitsConsumed,
        status: simulatedTransactionResponse.err ? 'FAILED' : 'SUCCESS',
      });

      if (simulatedTransactionResponse.err) {
        const logs = simulatedTransactionResponse.logs || [];
        const errorMessage = `${SIMULATION_ERROR_MESSAGE}\nError: ${JSON.stringify(simulatedTransactionResponse.err)}\nProgram Logs: ${logs.join('\n')}`;

        logger.error(errorMessage);

        throw new Error(errorMessage);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Transaction simulation failed: ${error.message}`);
        throw error;
      }
      throw new Error(`Error simulating transaction: ${error.message}`);
    }
  }

  /**
   * Helper function to simulate transaction with proper error handling
   * @param transaction Transaction to simulate
   * @param fastify Fastify instance for error responses
   * @returns Promise that resolves if simulation succeeds, throws descriptive error otherwise
   */
  public async simulateWithErrorHandling(
    transaction: VersionedTransaction | Transaction,
    fastify?: any,
  ): Promise<void> {
    try {
      await this.simulateTransaction(transaction);
    } catch (simulationError: any) {
      const errorMessage = simulationError?.message || '';

      // Helpers to safely create HTTP-style errors even if fastify is undefined
      const httpErrors = fastify?.httpErrors;
      const asBadRequest = (msg: string) => {
        if (httpErrors?.badRequest) return httpErrors.badRequest(msg);
        const e = new Error(msg) as Error & { statusCode?: number };
        e.statusCode = 400;
        return e;
      };

      // Known program-specific messages
      if (
        errorMessage.includes('Error Code: InvalidPositionWidth') ||
        errorMessage.includes('custom program error: 0x1798')
      ) {
        throw asBadRequest(
          'Error Code: InvalidPositionWidth. Error Number: 6040. Error Message: Invalid position width. ' +
            'Please use a position width of 69 bins or lower.',
        );
      }
      if (
        errorMessage.includes('Error Code: PriceSlippageCheck') ||
        errorMessage.includes('custom program error: 0x1785')
      ) {
        throw asBadRequest(
          'Position/Swap failed: Price slippage check failed. The calculated price from ticks does not match expected values. ' +
            "This can happen if: (1) price moved significantly since quote was calculated, (2) token amounts don't match the price range, " +
            'or (3) tick spacing constraints are not met. Try: increasing slippage tolerance, adjusting token amounts to better match current price, ' +
            'or using a wider price range.',
        );
      }
      if (
        errorMessage.includes('Error Code: TooLittleOutputReceived') ||
        errorMessage.includes('custom program error: 0x1786')
      ) {
        throw asBadRequest(
          'Swap failed: Slippage tolerance exceeded. Output would be less than your minimum. Consider increasing slippage.',
        );
      }
      if (
        errorMessage.includes('Error Code: TooMuchInputPaid') ||
        errorMessage.includes('custom program error: 0x1787')
      ) {
        throw asBadRequest(
          'Swap failed: Slippage tolerance exceeded. Input would be more than your maximum. Consider increasing slippage.',
        );
      }
      if (errorMessage.includes('SqrtPriceLimitOverflow') || errorMessage.includes('custom program error: 0x177d')) {
        throw asBadRequest(
          'Swap failed: Square root price limit overflow. Adjust price limit/direction or retry with default limits.',
        );
      }
      if (errorMessage.includes('InsufficientFunds') || errorMessage.toLowerCase().includes('insufficient')) {
        throw asBadRequest('Transaction failed: Insufficient funds. Please check your token balance.');
      }
      if (errorMessage.includes('AccountNotFound')) {
        throw asBadRequest(
          'Transaction failed: One or more required accounts not found. The pool or token accounts may not be initialized.',
        );
      }

      // Generic fallback
      logger.error('Transaction simulation failed:', simulationError);
      throw asBadRequest(
        'Transaction simulation failed. This usually means the swap parameters are invalid or market conditions changed. Try again.',
      );
    }
  }

  /**
   * Helper function to handle transaction confirmation results
   * Returns appropriate response object based on confirmation status
   * @param signature Transaction signature
   * @param confirmed Whether transaction was confirmed
   * @param txData Transaction data (if available)
   * @param tokenIn Input token address
   * @param tokenOut Output token address
   * @param walletAddress Wallet address for balance changes
   * @param side Trade side (optional, for AMM/CLMM swaps)
   * @returns Response object with status and data
   */
  public async handleConfirmation(
    signature: string,
    confirmed: boolean,
    txData: any,
    tokenIn: string,
    tokenOut: string,
    walletAddress: string,
    side?: 'BUY' | 'SELL',
  ): Promise<{
    signature: string;
    status: number;
    data?: {
      tokenIn: string;
      tokenOut: string;
      amountIn: number;
      amountOut: number;
      fee: number;
      baseTokenBalanceChange: number;
      quoteTokenBalanceChange: number;
    };
  }> {
    if (confirmed && txData) {
      // Transaction confirmed, extract balance changes
      const { balanceChanges, fee } = await this.extractBalanceChangesAndFee(signature, walletAddress, [
        tokenIn,
        tokenOut,
      ]);

      const inputTokenBalanceChange = balanceChanges[0];
      const outputTokenBalanceChange = balanceChanges[1];

      // Calculate actual amounts swapped
      const amountIn = Math.abs(inputTokenBalanceChange);
      const amountOut = Math.abs(outputTokenBalanceChange);

      // For AMM/CLMM swaps with side information
      let baseTokenBalanceChange: number | undefined;
      let quoteTokenBalanceChange: number | undefined;

      if (side) {
        // For AMM/CLMM swaps, determine base/quote changes based on side
        baseTokenBalanceChange = side === 'SELL' ? inputTokenBalanceChange : outputTokenBalanceChange;
        quoteTokenBalanceChange = side === 'SELL' ? outputTokenBalanceChange : inputTokenBalanceChange;
      } else {
        // For router swaps, use raw balance changes
        baseTokenBalanceChange = inputTokenBalanceChange;
        quoteTokenBalanceChange = outputTokenBalanceChange;
      }

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          fee,
          baseTokenBalanceChange: baseTokenBalanceChange!,
          quoteTokenBalanceChange: quoteTokenBalanceChange!,
        },
      };
    } else if (txData && !confirmed) {
      // Transaction exists but not confirmed - extract fee from txData
      const fee = this.getFee(txData);

      logger.warn(`Transaction ${signature} not confirmed. May need higher priority fee.`);

      return {
        signature,
        status: -1, // NOT_CONFIRMED
        data: {
          tokenIn,
          tokenOut,
          amountIn: 0,
          amountOut: 0,
          fee,
          baseTokenBalanceChange: 0,
          quoteTokenBalanceChange: 0,
        },
      };
    } else {
      // Transaction pending, no data available
      logger.warn(`Transaction ${signature} pending. No transaction data available.`);

      return {
        signature,
        status: 0, // PENDING
        data: undefined,
      };
    }
  }

  /**
   * Create instructions to wrap native SOL to WSOL
   * @param walletPubkey Wallet public key
   * @param amount Amount of SOL to wrap in lamports
   * @param tokenProgram Token program (default TOKEN_PROGRAM_ID)
   * @param checkBalance If true, only wrap the difference between required amount and existing WSOL balance
   * @returns Array of instructions to wrap SOL (empty if balance is sufficient when checkBalance is true)
   */
  public async wrapSOL(
    walletPubkey: PublicKey,
    amount: number,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    checkBalance: boolean = false,
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    const wsolAccount = getAssociatedTokenAddressSync(NATIVE_MINT, walletPubkey, false, tokenProgram);

    // Check if WSOL account exists
    const accountInfo = await this.connection.getAccountInfo(wsolAccount);

    let amountToWrap = amount;

    if (checkBalance && accountInfo) {
      // Smart balance checking: only wrap the difference
      const accountData = AccountLayout.decode(new Uint8Array(accountInfo.data));
      const existingBalance = Number(accountData.amount);
      amountToWrap = Math.max(0, amount - existingBalance);

      if (amountToWrap === 0) {
        logger.info(`WSOL: existing balance ${existingBalance} lamports is sufficient for ${amount} lamports`);
        return instructions; // Empty, no wrapping needed
      }
      logger.info(
        `WSOL: existing balance ${existingBalance} lamports, wrapping ${amountToWrap} more for ${amount} total`,
      );
    }

    if (!accountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(walletPubkey, wsolAccount, walletPubkey, NATIVE_MINT, tokenProgram),
      );
    }

    // Transfer SOL and sync
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: walletPubkey,
        toPubkey: wsolAccount,
        lamports: amountToWrap,
      }),
    );
    instructions.push(createSyncNativeInstruction(wsolAccount, tokenProgram));

    return instructions;
  }

  /**
   * Create instruction to unwrap WSOL back to native SOL
   * @param walletPubkey Wallet public key
   * @param tokenProgram Token program (default TOKEN_PROGRAM_ID)
   * @returns Instruction to close WSOL account and return SOL
   */
  public unwrapSOL(walletPubkey: PublicKey, tokenProgram: PublicKey = TOKEN_PROGRAM_ID): TransactionInstruction {
    const wsolAccount = getAssociatedTokenAddressSync(NATIVE_MINT, walletPubkey, false, tokenProgram);
    return createCloseAccountInstruction(wsolAccount, walletPubkey, walletPubkey, [], tokenProgram);
  }

  /**
   * Clean up resources including WebSocket connections
   */
  public disconnect(): void {
    if (this.rpcProviderService) {
      this.rpcProviderService.disconnect();
      logger.info(`${this.rpcProviderService.getProviderName()} disconnected and cleaned up`);
    }
  }

  /**
   * Static method to clean up all instances
   */
  public static disconnectAll(): void {
    if (Solana._instances) {
      for (const instance of Object.values(Solana._instances)) {
        instance.disconnect();
      }
    }
  }
}
