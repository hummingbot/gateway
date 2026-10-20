/**
 * The `external` backend: an address with no key in Gateway. It signs nothing. An
 * execute route for it is refused, and the caller uses the route's build twin, signs
 * the transaction itself and sends it with POST /chains/{chain}/submit.
 */
import { EthereumSigner, SignerFactories, SolanaSigner, WalletRecord } from './types';

const REASON = 'Gateway holds no key for an external wallet';

class ExternalSolanaSigner implements SolanaSigner {
  readonly kind = 'external' as const;
  constructor(readonly address: string) {}

  async signTransactionMessage() {
    return { kind: 'unsigned' as const, reason: REASON };
  }
}

class ExternalEthereumSigner implements EthereumSigner {
  readonly kind = 'external' as const;
  constructor(readonly address: string) {}

  async signTransaction() {
    return { kind: 'unsigned' as const, reason: REASON };
  }
}

export const externalBackend: SignerFactories = {
  solana: async (record: WalletRecord) => new ExternalSolanaSigner(record.address),
  ethereum: async (record: WalletRecord) => new ExternalEthereumSigner(record.address),
};
