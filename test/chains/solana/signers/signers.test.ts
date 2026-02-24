// Mock fs-extra to prevent actual file writes
jest.mock('fs-extra');

// Mock wallet utils before importing factory
jest.mock('../../../../src/wallet/utils', () => ({
  getHardwareWalletByAddress: jest.fn(),
  isHardwareWallet: jest.fn(),
  getSafeWalletFilePath: jest.fn(),
}));

import { Keypair, PublicKey, VersionedTransaction, TransactionMessage, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fse from 'fs-extra';

import { SignerFactory } from '../../../../src/chains/solana/signers/factory';
import { KeypairSigner } from '../../../../src/chains/solana/signers/keypair-signer';
import { LedgerSigner } from '../../../../src/chains/solana/signers/ledger-signer';
import { SignerError, SignerErrorCode } from '../../../../src/chains/solana/signers/types';
import { ConfigManagerCertPassphrase } from '../../../../src/services/config-manager-cert-passphrase';
import { HardwareWalletService } from '../../../../src/services/hardware-wallet-service';
import * as walletUtils from '../../../../src/wallet/utils';
import { patch, unpatch } from '../../../services/patch';

const mockFse = fse as jest.Mocked<typeof fse>;
const mockWalletUtils = walletUtils as jest.Mocked<typeof walletUtils>;

// Generate test keypairs
const testKeypair = Keypair.generate();
const testAddress = testKeypair.publicKey.toBase58();
const testPrivateKey = bs58.encode(testKeypair.secretKey);

// Mock encrypted wallet data
const mockEncryptedWallet = JSON.stringify({
  salt: '0123456789abcdef',
  iv: '0123456789abcdef0123456789abcdef',
  content: '0123456789abcdef', // dummy encrypted content
});

beforeEach(() => {
  jest.clearAllMocks();
  SignerFactory.clearCache();
});

afterEach(() => {
  unpatch();
});

describe('SignerError', () => {
  it('should create error with code and message', () => {
    const error = new SignerError(SignerErrorCode.SIGNING_FAILED, 'Test error');
    expect(error.code).toBe(SignerErrorCode.SIGNING_FAILED);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('SignerError');
  });

  it('should include cause when provided', () => {
    const cause = new Error('Original error');
    const error = new SignerError(SignerErrorCode.SIGNING_FAILED, 'Test error', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('KeypairSigner', () => {
  describe('constructor', () => {
    it('should create signer from keypair', () => {
      const signer = new KeypairSigner(testKeypair);
      expect(signer.type).toBe('keypair');
      expect(signer.address).toBe(testAddress);
    });
  });

  describe('fromPrivateKey', () => {
    it('should create signer from base58 private key', () => {
      const signer = KeypairSigner.fromPrivateKey(testPrivateKey);
      expect(signer.type).toBe('keypair');
      expect(signer.address).toBe(testAddress);
    });

    it('should throw SignerError for invalid private key', () => {
      expect(() => KeypairSigner.fromPrivateKey('invalid-key')).toThrow(SignerError);
    });
  });

  describe('fromSecretKey', () => {
    it('should create signer from secret key Uint8Array', () => {
      const signer = KeypairSigner.fromSecretKey(testKeypair.secretKey);
      expect(signer.type).toBe('keypair');
      expect(signer.address).toBe(testAddress);
    });

    it('should throw SignerError for invalid secret key', () => {
      expect(() => KeypairSigner.fromSecretKey(new Uint8Array(16))).toThrow(SignerError);
    });
  });

  describe('isAvailable', () => {
    it('should always return true for keypair signer', async () => {
      const signer = new KeypairSigner(testKeypair);
      expect(await signer.isAvailable()).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    it('should return the public key', () => {
      const signer = new KeypairSigner(testKeypair);
      expect(signer.getPublicKey().equals(testKeypair.publicKey)).toBe(true);
    });
  });

  describe('getKeypair', () => {
    it('should return the underlying keypair', () => {
      const signer = new KeypairSigner(testKeypair);
      expect(signer.getKeypair()).toBe(testKeypair);
    });
  });

  describe('signTransactions', () => {
    it('should sign versioned transactions', async () => {
      const signer = new KeypairSigner(testKeypair);

      // Create a minimal versioned transaction
      const instruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey('11111111111111111111111111111111'),
        data: Buffer.from([]),
      });

      const messageV0 = new TransactionMessage({
        payerKey: testKeypair.publicKey,
        recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', // dummy blockhash
        instructions: [instruction],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      const signedTxs = await signer.signTransactions([tx]);
      expect(signedTxs).toHaveLength(1);
      expect(signedTxs[0].signatures[0]).toBeDefined();
      // Verify signature is not all zeros
      expect(signedTxs[0].signatures[0].every((b) => b === 0)).toBe(false);
    });

    it('should sign multiple transactions', async () => {
      const signer = new KeypairSigner(testKeypair);

      const instruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey('11111111111111111111111111111111'),
        data: Buffer.from([]),
      });

      const messageV0 = new TransactionMessage({
        payerKey: testKeypair.publicKey,
        recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
        instructions: [instruction],
      }).compileToV0Message();

      const tx1 = new VersionedTransaction(messageV0);
      const tx2 = new VersionedTransaction(messageV0);

      const signedTxs = await signer.signTransactions([tx1, tx2]);
      expect(signedTxs).toHaveLength(2);
    });
  });

  describe('signMessages', () => {
    it('should sign arbitrary messages', async () => {
      const signer = new KeypairSigner(testKeypair);
      const message = new TextEncoder().encode('Hello, Solana!');

      const results = await signer.signMessages([message]);
      expect(results).toHaveLength(1);
      expect(results[0].signature).toBeDefined();
      expect(results[0].signatureBytes).toBeInstanceOf(Uint8Array);
      expect(results[0].signatureBytes.length).toBe(64); // Ed25519 signature length
    });

    it('should sign multiple messages', async () => {
      const signer = new KeypairSigner(testKeypair);
      const message1 = new TextEncoder().encode('Message 1');
      const message2 = new TextEncoder().encode('Message 2');

      const results = await signer.signMessages([message1, message2]);
      expect(results).toHaveLength(2);
      // Verify different messages produce different signatures
      expect(results[0].signature).not.toBe(results[1].signature);
    });
  });
});

describe('LedgerSigner', () => {
  const mockDerivationPath = "m/44'/501'/0'/0'";

  describe('constructor', () => {
    it('should create signer with address and derivation path', () => {
      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      expect(signer.type).toBe('ledger');
      expect(signer.address).toBe(testAddress);
    });
  });

  describe('getPublicKey', () => {
    it('should return the public key from address', () => {
      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      expect(signer.getPublicKey().toBase58()).toBe(testAddress);
    });
  });

  describe('isAvailable', () => {
    it('should return false when hardware wallet service fails', async () => {
      // Mock the hardware wallet service to throw
      patch(HardwareWalletService.prototype, 'isDeviceConnected', async () => {
        throw new Error('Ledger not connected');
      });

      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      const isAvailable = await signer.isAvailable();
      expect(isAvailable).toBe(false);
    });

    it('should return true when device is connected', async () => {
      patch(HardwareWalletService.prototype, 'isDeviceConnected', async () => true);

      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      const isAvailable = await signer.isAvailable();
      expect(isAvailable).toBe(true);
    });
  });

  describe('getDerivationPath', () => {
    it('should return the derivation path', () => {
      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      expect(signer.getDerivationPath()).toBe(mockDerivationPath);
    });
  });

  describe('signMessages', () => {
    it('should throw SignerError as Ledger does not support message signing', async () => {
      const signer = new LedgerSigner(testAddress, mockDerivationPath);
      const message = new TextEncoder().encode('Test message');

      await expect(signer.signMessages([message])).rejects.toThrow(SignerError);
    });
  });
});

describe('SignerFactory', () => {
  beforeEach(() => {
    SignerFactory.clearCache();
    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'test-passphrase');
    jest.clearAllMocks();
  });

  describe('getSigner', () => {
    it('should throw error for invalid address format', async () => {
      await expect(SignerFactory.getSigner('invalid-address')).rejects.toThrow(SignerError);
    });

    it('should throw error when no wallet found', async () => {
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue(null);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/path/wallet.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      await expect(SignerFactory.getSigner(testAddress)).rejects.toThrow(SignerError);
    });

    it('should return KeypairSigner for regular wallet', async () => {
      // Mock no hardware wallet
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue(null);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');

      // Mock wallet file exists
      (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFse.readFile as jest.Mock).mockResolvedValue(mockEncryptedWallet);

      // Mock the decrypt function to return the test private key
      patch(SignerFactory as any, 'decrypt', async () => testPrivateKey);

      const signer = await SignerFactory.getSigner(testAddress);
      expect(signer).toBeInstanceOf(KeypairSigner);
      expect(signer.type).toBe('keypair');
      expect(signer.address).toBe(testAddress);
    });

    it('should return LedgerSigner for hardware wallet', async () => {
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue({
        address: testAddress,
        publicKey: testAddress,
        derivationPath: "m/44'/501'/0'/0'",
        addedAt: new Date().toISOString(),
      });

      const signer = await SignerFactory.getSigner(testAddress);
      expect(signer).toBeInstanceOf(LedgerSigner);
      expect(signer.type).toBe('ledger');
    });
  });

  describe('getWalletInfo', () => {
    it('should return info for hardware wallet', async () => {
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue({
        address: testAddress,
        publicKey: testAddress,
        derivationPath: "m/44'/501'/0'/0'",
        addedAt: new Date().toISOString(),
      });

      const info = await SignerFactory.getWalletInfo(testAddress);
      expect(info.type).toBe('ledger');
      expect(info.address).toBe(testAddress);
      expect(info.derivationPath).toBe("m/44'/501'/0'/0'");
    });

    it('should return info for regular wallet', async () => {
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue(null);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

      const info = await SignerFactory.getWalletInfo(testAddress);
      expect(info.type).toBe('keypair');
      expect(info.address).toBe(testAddress);
    });

    it('should throw when wallet not found', async () => {
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue(null);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      await expect(SignerFactory.getWalletInfo(testAddress)).rejects.toThrow(SignerError);
    });
  });

  describe('getSignerType', () => {
    it('should return ledger for hardware wallet', async () => {
      mockWalletUtils.isHardwareWallet.mockResolvedValue(true);

      const type = await SignerFactory.getSignerType(testAddress);
      expect(type).toBe('ledger');
    });

    it('should return keypair for regular wallet', async () => {
      mockWalletUtils.isHardwareWallet.mockResolvedValue(false);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

      const type = await SignerFactory.getSignerType(testAddress);
      expect(type).toBe('keypair');
    });
  });

  describe('hasWallet', () => {
    it('should return true when wallet exists', async () => {
      mockWalletUtils.isHardwareWallet.mockResolvedValue(false);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(true);

      const hasWallet = await SignerFactory.hasWallet(testAddress);
      expect(hasWallet).toBe(true);
    });

    it('should return false when wallet does not exist', async () => {
      mockWalletUtils.isHardwareWallet.mockResolvedValue(false);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

      const hasWallet = await SignerFactory.hasWallet(testAddress);
      expect(hasWallet).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the keypair cache', async () => {
      // Setup mocks
      mockWalletUtils.getHardwareWalletByAddress.mockResolvedValue(null);
      mockWalletUtils.getSafeWalletFilePath.mockReturnValue('/mock/wallet/path.json');
      (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFse.readFile as jest.Mock).mockResolvedValue(mockEncryptedWallet);
      patch(SignerFactory as any, 'decrypt', async () => testPrivateKey);

      // Get signer to populate cache
      await SignerFactory.getSigner(testAddress);

      // Clear cache
      SignerFactory.clearCache();

      // Verify cache is cleared by checking pathExists is called again
      (mockFse.pathExists as jest.Mock).mockClear();
      await SignerFactory.getSigner(testAddress);
      expect(mockFse.pathExists).toHaveBeenCalled();
    });
  });
});
