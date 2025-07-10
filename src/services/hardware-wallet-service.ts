import EthApp from '@ledgerhq/hw-app-eth';
import SolanaApp from '@ledgerhq/hw-app-solana';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

import { LedgerTransportManager } from './ledger-transport';
import { logger } from './logger';

export interface SignTransactionOptions {
  timeout?: number;
  displayMessage?: string;
}

export interface HardwareWalletInfo {
  address: string;
  publicKey: string;
  derivationPath: string;
  chain: string;
  name?: string;
  addedAt: string;
}

export class HardwareWalletService {
  private static instance: HardwareWalletService;
  private transportManager: LedgerTransportManager;

  private constructor() {
    this.transportManager = LedgerTransportManager.getInstance();
  }

  public static getInstance(): HardwareWalletService {
    if (!HardwareWalletService.instance) {
      HardwareWalletService.instance = new HardwareWalletService();
    }
    return HardwareWalletService.instance;
  }

  /**
   * Get address from Ledger device for Solana
   */
  public async getSolanaAddress(derivationPath: string = "44'/501'/0'"): Promise<HardwareWalletInfo> {
    return await this.transportManager.withTransport(async (transport) => {
      const solanaApp = new SolanaApp(transport);

      logger.info(`Getting Solana address for derivation path: ${derivationPath}`);

      const result = await solanaApp.getAddress(derivationPath);

      if (!result || !result.address) {
        throw new Error('Failed to get address from Ledger device');
      }

      return {
        address: result.address.toString(),
        publicKey: result.address.toString(),
        derivationPath,
        chain: 'solana',
        addedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Get address from Ledger device for Ethereum
   */
  public async getEthereumAddress(derivationPath: string = "44'/60'/0'/0/0"): Promise<HardwareWalletInfo> {
    return await this.transportManager.withTransport(async (transport) => {
      const ethApp = new EthApp(transport);

      logger.info(`Getting Ethereum address for derivation path: ${derivationPath}`);

      const result = await ethApp.getAddress(derivationPath);

      if (!result || !result.address) {
        throw new Error('Failed to get address from Ledger device');
      }

      return {
        address: result.address,
        publicKey: result.publicKey || result.address,
        derivationPath,
        chain: 'ethereum',
        addedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Sign a Solana transaction using Ledger
   */
  public async signSolanaTransaction(
    derivationPath: string,
    transaction: Transaction | VersionedTransaction,
    options?: SignTransactionOptions,
  ): Promise<Buffer> {
    const timeout = options?.timeout || 60000; // Default 60 seconds
    const displayMessage = options?.displayMessage || 'Please confirm the transaction on your Ledger device';

    logger.info(displayMessage);

    return await this.transportManager.withTransport(async (transport) => {
      const solanaApp = new SolanaApp(transport);

      // Set timeout for the transport
      transport.setExchangeTimeout(timeout);

      try {
        let messageToSign: Buffer;

        if (transaction instanceof VersionedTransaction) {
          // VersionedTransaction.message.serialize() returns Uint8Array
          const serialized = transaction.message.serialize();
          // Convert Uint8Array to Buffer properly
          messageToSign = Buffer.from(serialized.buffer, serialized.byteOffset, serialized.byteLength);
        } else {
          messageToSign = transaction.serializeMessage();
        }

        logger.info(`Requesting signature for transaction on path: ${derivationPath}`);

        const result = await solanaApp.signTransaction(derivationPath, messageToSign);

        if (!result || !result.signature) {
          throw new Error('Failed to get signature from Ledger device');
        }

        logger.info('Transaction signed successfully');
        return result.signature;
      } catch (error) {
        if (error.statusCode === 0x6985) {
          throw new Error('Transaction rejected by user on Ledger device');
        } else if (error.message?.includes('Timeout')) {
          throw new Error('Transaction signing timed out. Please try again.');
        }

        logger.error(`Ledger signing error: ${error.message}`, { statusCode: error.statusCode });
        throw new Error(`Failed to sign transaction: ${error.message}`);
      }
    });
  }

  /**
   * Sign an Ethereum transaction using Ledger
   */
  public async signEthereumTransaction(
    derivationPath: string,
    rawTxHex: string,
    options?: SignTransactionOptions,
  ): Promise<{ v: string; r: string; s: string }> {
    const timeout = options?.timeout || 60000;
    const displayMessage = options?.displayMessage || 'Please confirm the transaction on your Ledger device';

    logger.info(displayMessage);

    return await this.transportManager.withTransport(async (transport) => {
      const ethApp = new EthApp(transport);

      transport.setExchangeTimeout(timeout);

      try {
        logger.info(`Requesting signature for transaction on path: ${derivationPath}`);

        const result = await ethApp.signTransaction(derivationPath, rawTxHex);

        if (!result) {
          throw new Error('Failed to get signature from Ledger device');
        }

        logger.info('Transaction signed successfully');
        return result;
      } catch (error) {
        if (error.statusCode === 0x6985) {
          throw new Error('Transaction rejected by user on Ledger device');
        } else if (error.message?.includes('Timeout')) {
          throw new Error('Transaction signing timed out. Please try again.');
        }

        logger.error(`Ledger signing error: ${error.message}`, { statusCode: error.statusCode });
        throw new Error(`Failed to sign transaction: ${error.message}`);
      }
    });
  }

  /**
   * Check if a Ledger device is connected
   */
  public async isDeviceConnected(): Promise<boolean> {
    return await this.transportManager.isDeviceConnected();
  }

  /**
   * List connected Ledger devices
   */
  public async listDevices(): Promise<any[]> {
    return await this.transportManager.listDevices();
  }

  /**
   * Verify that we can communicate with the Ledger device
   */
  public async verifyConnection(chain: 'solana' | 'ethereum'): Promise<boolean> {
    try {
      if (chain === 'solana') {
        await this.getSolanaAddress();
      } else {
        await this.getEthereumAddress();
      }
      return true;
    } catch (error) {
      logger.error(`Failed to verify Ledger connection: ${error.message}`);
      return false;
    }
  }
}
