import { Transaction, utils } from 'ethers';

import { HardwareWalletService } from '../../services/hardware-wallet-service';
import { logger } from '../../services/logger';
import { getHardwareWalletByAddress } from '../../wallet/utils';

export class EthereumLedger {
  private hardwareWalletService: HardwareWalletService;

  constructor() {
    this.hardwareWalletService = HardwareWalletService.getInstance();
  }

  /**
   * Sign an Ethereum transaction using Ledger hardware wallet
   * @param address The wallet address
   * @param transaction The transaction to sign
   * @returns The signed transaction as a hex string
   */
  public async signTransaction(address: string, transaction: Transaction): Promise<string> {
    logger.info(`Signing transaction with Ledger for address: ${address}`);

    // Get hardware wallet info to find derivation path
    const hardwareWallet = await getHardwareWalletByAddress('ethereum', address);

    if (!hardwareWallet) {
      throw new Error(`Hardware wallet not found for address: ${address}`);
    }

    try {
      // Serialize the transaction for signing
      const unsignedTx = {
        nonce: transaction.nonce,
        gasPrice: transaction.gasPrice,
        gasLimit: transaction.gasLimit,
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        chainId: transaction.chainId,
      };

      // Remove undefined fields
      Object.keys(unsignedTx).forEach((key) => {
        if (unsignedTx[key] === undefined) {
          delete unsignedTx[key];
        }
      });

      // For EIP-1559 transactions
      if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
        unsignedTx['maxFeePerGas'] = transaction.maxFeePerGas;
        unsignedTx['maxPriorityFeePerGas'] = transaction.maxPriorityFeePerGas;
        unsignedTx['type'] = 2;
        delete unsignedTx['gasPrice'];
      }

      // Serialize transaction to hex
      const serializedTx = utils.serializeTransaction(unsignedTx);
      const rawTxHex = serializedTx.slice(2); // Remove 0x prefix

      // Get signature from Ledger
      const signature = await this.hardwareWalletService.signEthereumTransaction(
        hardwareWallet.derivationPath,
        rawTxHex,
        {
          timeout: 60000,
          displayMessage: `Please confirm the transaction on your Ledger device for address ${address}`,
        },
      );

      // Apply signature to transaction
      const signedTx = utils.serializeTransaction(unsignedTx, {
        v: parseInt(signature.v, 16),
        r: '0x' + signature.r,
        s: '0x' + signature.s,
      });

      logger.info('Transaction signed successfully with Ledger');

      // Return the signed transaction as a hex string for sending
      return signedTx;
    } catch (error) {
      logger.error(`Failed to sign transaction with Ledger: ${error.message}`);

      if (error.message.includes('rejected by user')) {
        throw new Error('Transaction rejected on Ledger device');
      } else if (error.message.includes('Timeout')) {
        throw new Error('Transaction signing timed out. Please try again.');
      } else if (error.message.includes('0x5515')) {
        throw new Error('Ledger device is locked. Please unlock your device and open the Ethereum app.');
      } else if (error.message.includes('0x6a83')) {
        throw new Error('Wrong app is open on Ledger. Please open the Ethereum app.');
      }

      throw error;
    }
  }

  /**
   * Build an unsigned transaction that can be signed by Ledger
   * @param transaction The transaction parameters
   * @returns The unsigned transaction
   */
  public buildUnsignedTransaction(transaction: any): Transaction {
    // Create transaction without signing
    const tx = {
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0x0',
      gasLimit: transaction.gasLimit,
      nonce: transaction.nonce,
      chainId: transaction.chainId,
    };

    // Add EIP-1559 fields if present
    if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
      tx['maxFeePerGas'] = transaction.maxFeePerGas;
      tx['maxPriorityFeePerGas'] = transaction.maxPriorityFeePerGas;
      tx['type'] = 2;
    } else if (transaction.gasPrice) {
      tx['gasPrice'] = transaction.gasPrice;
    }

    return tx as Transaction;
  }

  /**
   * Check if an address is a hardware wallet
   * @param address The wallet address to check
   * @returns True if the address is a hardware wallet
   */
  public async isHardwareWallet(address: string): Promise<boolean> {
    const wallet = await getHardwareWalletByAddress('ethereum', address);
    return wallet !== null;
  }

  /**
   * Get the derivation path for a hardware wallet address
   * @param address The wallet address
   * @returns The derivation path or null if not found
   */
  public async getDerivationPath(address: string): Promise<string | null> {
    const wallet = await getHardwareWalletByAddress('ethereum', address);
    return wallet ? wallet.derivationPath : null;
  }
}
