import { Keypair, PublicKey } from '@solana/web3.js';

import { SolanaLedger } from '#src/chains/solana/solana-ledger';

import { Solana } from '../../chains/solana/solana';
import { PoolInfo as AmmPoolInfo } from '../../schemas/amm-schema';
import { logger } from '../../services/logger';

import { PumpswapConfig } from './pumpswap.config';
import { getGlobalConfigPDA } from './pumpswap.instructions';

// PumpSwap AMM Program ID
export const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

export class Pumpswap {
  private static _instances: { [name: string]: Pumpswap };
  public solana: Solana | null;
  public config: PumpswapConfig.RootConfig;
  private owner?: Keypair;

  private constructor() {
    this.config = PumpswapConfig.config;
    this.solana = null;
  }

  /** Gets singleton instance of Pumpswap */
  public static async getInstance(network: string): Promise<Pumpswap> {
    if (!Pumpswap._instances) {
      Pumpswap._instances = {};
    }

    if (!Pumpswap._instances[network]) {
      const instance = new Pumpswap();
      await instance.init(network);
      Pumpswap._instances[network] = instance;
    }

    return Pumpswap._instances[network];
  }

  /** Initializes Pumpswap instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('Pumpswap initialized');
    } catch (error) {
      logger.error('Pumpswap initialization failed:', error);
      throw error;
    }
  }

  /** Sets the owner for operations */
  public async setOwner(owner: Keypair | PublicKey): Promise<void> {
    this.owner = owner as Keypair;
    logger.info('Pumpswap owner set');
  }

  /**
   * Get AMM pool information by decoding the Pool account
   */
  async getAmmPoolInfo(poolAddress: string): Promise<AmmPoolInfo | null> {
    try {
      if (!this.solana) {
        throw new Error('Solana instance not initialized');
      }

      const poolPubkey = new PublicKey(poolAddress);

      // Fetch account data
      const accountInfo = await this.solana.connection.getAccountInfo(poolPubkey, 'confirmed');
      if (!accountInfo) {
        logger.debug(`Pool account not found: ${poolAddress}`);
        return null;
      }

      // Verify program owner
      if (!accountInfo.owner.equals(PUMPSWAP_PROGRAM_ID)) {
        logger.debug(
          `Pool is not owned by PumpSwap program. Owner: ${accountInfo.owner.toString()}, Expected: ${PUMPSWAP_PROGRAM_ID.toString()}`,
        );
        return null;
      }

      const data = accountInfo.data;

      /**
       * Decode Pool struct from IDL:
       * - pool_bump: u8 (offset 8)
       * - index: u16 (offset 9-10)
       * - creator: pubkey (offset 11-42)
       * - base_mint: pubkey (offset 43-74)
       * - quote_mint: pubkey (offset 75-106)
       * - lp_mint: pubkey (offset 107-138)
       * - pool_base_token_account: pubkey (offset 139-170)
       * - pool_quote_token_account: pubkey (offset 171-202)
       * - lp_supply: u64 (offset 203-210)
       * - coin_creator: pubkey (offset 211-242)
       */

      // Skip discriminator (8 bytes)
      let offset = 8;

      // Skip pool_bump (1 byte) and index (2 bytes)
      offset += 3;

      // Read creator (32 bytes) - not needed for pool info
      offset += 32;

      // Read base_mint (32 bytes)
      const baseMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Read quote_mint (32 bytes)
      const quoteMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Skip lp_mint (32 bytes)
      offset += 32;

      // Read pool_base_token_account (32 bytes)
      const poolBaseTokenAccount = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Read pool_quote_token_account (32 bytes)
      const poolQuoteTokenAccount = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Read lp_supply (8 bytes, u64)
      const lpSupply = data.readBigUInt64LE(offset);
      offset += 8;

      // Skip coin_creator (32 bytes)
      offset += 32;

      // Get token account balances
      const baseBalance = await this.solana.connection.getTokenAccountBalance(poolBaseTokenAccount);
      const quoteBalance = await this.solana.connection.getTokenAccountBalance(poolQuoteTokenAccount);

      const baseTokenAmount = baseBalance.value.uiAmount || 0;
      const quoteTokenAmount = quoteBalance.value.uiAmount || 0;

      // Calculate price: quote/base
      const price = baseTokenAmount > 0 ? quoteTokenAmount / baseTokenAmount : 0;

      // Get fee from global config
      // GlobalConfig struct layout (Anchor account):
      // - discriminator (8 bytes): offset 0-7
      // - admin (pubkey, 32 bytes): offset 8-39
      // - lp_fee_basis_points (u64, 8 bytes): offset 40-47
      const globalConfig = getGlobalConfigPDA();
      const globalConfigAccount = await this.solana.connection.getAccountInfo(globalConfig);
      let feePct = 1.0; // Default 1%
      if (globalConfigAccount && globalConfigAccount.data.length >= 48) {
        // lp_fee_basis_points is at offset 40 (after discriminator + admin)
        const lpFeeBasisPoints = globalConfigAccount.data.readBigUInt64LE(40);
        // Convert basis points to percentage: 100 basis points = 1%
        // So divide by 100 to get percentage (e.g., 100 bps = 1%)
        feePct = Number(lpFeeBasisPoints) / 100;
      }

      const poolInfo: AmmPoolInfo = {
        address: poolAddress,
        baseTokenAddress: baseMint.toString(),
        quoteTokenAddress: quoteMint.toString(),
        feePct,
        price,
        baseTokenAmount: Number(baseTokenAmount),
        quoteTokenAmount: Number(quoteTokenAmount),
      };

      return poolInfo;
    } catch (error) {
      logger.debug(`Could not decode ${poolAddress} as Pumpswap pool: ${error}`);
      return null;
    }
  }

  /**
   * Helper function to prepare wallet for transaction operations
   * Returns the wallet/public key and whether it's a hardware wallet
   */
  public async prepareWallet(walletAddress: string): Promise<{
    wallet: Keypair | PublicKey;
    isHardwareWallet: boolean;
  }> {
    if (!this.solana) {
      throw new Error('Solana instance not initialized');
    }
    const isHardwareWallet = await this.solana.isHardwareWallet(walletAddress);
    const wallet = isHardwareWallet
      ? await this.solana.getPublicKey(walletAddress)
      : await this.solana.getWallet(walletAddress);

    // Set the owner for operations
    await this.setOwner(wallet);

    return { wallet, isHardwareWallet };
  }

  /**
   * Helper function to sign transaction with hardware or regular wallet
   */
  public async signTransaction(
    transaction: any,
    walletAddress: string,
    isHardwareWallet: boolean,
    wallet: Keypair | PublicKey,
  ): Promise<any> {
    if (isHardwareWallet) {
      logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
      const ledger = new SolanaLedger();
      return await ledger.signTransaction(walletAddress, transaction);
    } else {
      // Regular wallet - sign normally
      if (transaction.sign) {
        transaction.sign([wallet as Keypair]);
      }
      return transaction;
    }
  }

  async findDefaultPool(_baseToken: string, _quoteToken: string, _routeType: 'amm'): Promise<string | null> {
    // Pools are now managed separately, return null for dynamic pool discovery
    return null;
  }
}
