// Types and interfaces
export {
  SolanaSigner,
  SignerType,
  SignerConfig,
  SignerError,
  SignerErrorCode,
  SignerErrorContext,
  SignatureResult,
  WalletInfo,
} from './types';

// Utility functions (matches keychain-core patterns)
export { createSignerError, throwSignerError, isSolanaSigner, assertIsSolanaSigner } from './types';

// Signer implementations
export { KeypairSigner } from './keypair-signer';
export { LedgerSigner } from './ledger-signer';

// Factory
export { SignerFactory } from './factory';
