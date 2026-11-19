/**
 * The `hardware` backend: a Ledger account. The record carries its derivation path; the
 * device signs, and Gateway never sees the key.
 */
import { utils } from 'ethers';

import { httpErrors } from '../../services/error-handler';
import { HardwareWalletService } from '../../services/hardware-wallet-service';

import { EthereumSigner, SignerFactories, SolanaSigner, UnsignedEvmTransaction, WalletRecord } from './types';

const LEDGER_TIMEOUT_MS = 60000;

function derivationPath(record: WalletRecord): string {
  if (!record.derivationPath) {
    throw httpErrors.internalServerError(`Hardware wallet ${record.address} has no derivationPath in its record`);
  }
  return record.derivationPath;
}

/** The Ledger's errors as messages a caller can act on. */
function ledgerError(e: any): Error {
  const message: string = e?.message ?? String(e);
  if (message.includes('rejected by user')) return httpErrors.badRequest('Transaction rejected on Ledger device');
  if (message.includes('Timeout') || message.includes('timed out')) {
    return httpErrors.badRequest('Transaction signing timed out on the Ledger device. Please try again.');
  }
  if (message.includes('0x5515')) {
    return httpErrors.badRequest('Ledger device is locked. Please unlock it and open the chain app.');
  }
  if (message.includes('0x6a83')) return httpErrors.badRequest('Wrong app is open on the Ledger device.');
  return e instanceof Error ? e : new Error(message);
}

class HardwareSolanaSigner implements SolanaSigner {
  readonly kind = 'hardware' as const;
  constructor(private readonly record: WalletRecord) {}

  get address(): string {
    return this.record.address;
  }

  async signTransactionMessage(message: Uint8Array) {
    try {
      const signature = await HardwareWalletService.getInstance().signSolanaMessageBytes(
        derivationPath(this.record),
        message,
        {
          timeout: LEDGER_TIMEOUT_MS,
          displayMessage: `Please confirm the transaction on your Ledger device for address ${this.address}`,
        },
      );
      return { kind: 'signed' as const, value: new Uint8Array(signature) };
    } catch (e) {
      throw ledgerError(e);
    }
  }
}

class HardwareEthereumSigner implements EthereumSigner {
  readonly kind = 'hardware' as const;
  constructor(private readonly record: WalletRecord) {}

  get address(): string {
    return this.record.address;
  }

  async signTransaction(tx: UnsignedEvmTransaction) {
    const unsigned: utils.UnsignedTransaction = { ...tx };
    try {
      const { v, r, s } = await HardwareWalletService.getInstance().signEthereumTransaction(
        derivationPath(this.record),
        utils.serializeTransaction(unsigned).slice(2),
        {
          timeout: LEDGER_TIMEOUT_MS,
          displayMessage: `Please confirm the transaction on your Ledger device for address ${this.address}`,
        },
      );
      const signed = utils.serializeTransaction(unsigned, { v: parseInt(v, 16), r: '0x' + r, s: '0x' + s });
      return { kind: 'signed' as const, value: signed };
    } catch (e) {
      throw ledgerError(e);
    }
  }
}

export const hardwareBackend: SignerFactories = {
  solana: async (record: WalletRecord) => new HardwareSolanaSigner(record),
  ethereum: async (record: WalletRecord) => new HardwareEthereumSigner(record),
};
