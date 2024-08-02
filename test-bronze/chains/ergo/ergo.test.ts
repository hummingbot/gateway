import {
  NetworkPrefix,
  SecretKey,
  SecretKeys,
  Wallet,
  Address,
  Mnemonic,
  ExtSecretKey,
  DerivationPath,
} from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { patch, unpatch } from '../../../test/services/patch';
import * as ergo_cofing from '../../../src/chains/ergo/ergo.config';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { RustModule } from '@patternglobal/ergo-sdk';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';
import {
  ErgoAccount,
  ErgoAsset,
  ErgoBox,
} from '../../../src/chains/ergo/interfaces/ergo.interface';
import LRUCache from 'lru-cache';
import fse from 'fs-extra';
import { makeNativePools } from '@patternglobal/ergo-dex-sdk';
import { BigNumber } from 'bignumber.js';
import * as ergo_utils from '../../../src/chains/ergo/ergo.util';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';

jest.mock('@patternglobal/ergo-dex-sdk', () => ({
  AmmPool: jest.fn(),
  makeNativePools: jest.fn(),
  makeWrappedNativePoolActionsSelector: jest.fn().mockReturnValue(() => ({
    swap: jest.fn().mockResolvedValue({ id: 'txId' }),
  })),
  swapVars: jest
    .fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce([
      1,
      {
        minOutput: { amount: BigInt(1) },
        maxExFee: BigInt(1),
      },
    ] as any)
    .mockReturnValueOnce([
      1,
      {
        minOutput: { amount: BigInt(1) },
        maxExFee: BigInt(1),
      },
    ] as any)
    .mockReturnValueOnce([
      1,
      {
        minOutput: { amount: BigInt(1) },
        maxExFee: BigInt(1),
      },
    ] as any)
    .mockReturnValueOnce([
      1,
      {
        minOutput: { amount: BigInt(1) },
        maxExFee: BigInt(1),
      },
    ] as any),
}));
jest.mock('@patternglobal/ergo-sdk', () => ({
  Explorer: jest.fn().mockReturnValue({
    getNetworkContext: jest.fn().mockReturnValue({ height: 1 } as any),
  }),
  AssetAmount: jest.fn(),
  publicKeyFromAddress: jest
    .fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce('publicKey')
    .mockReturnValueOnce('publicKey')
    .mockReturnValueOnce('publicKey'),
  RustModule: {
    load: jest.fn().mockResolvedValue,
  },
  DefaultTxAssembler: jest.fn().mockReturnValue('mainnetTxAssembler' as any),
}));

let ergo: Ergo;

const patchGetErgoConfig = (imputNetwork: string) => {
  patch(ergo_cofing, 'getErgoConfig', () => {
    return {
      network: {
        name: imputNetwork,
        nodeURL: 'ergo.networks.' + imputNetwork + '.nodeURL',
        explorerURL: 'ergo.networks.' + imputNetwork + '.explorerURL',
        explorerDEXURL: 'ergo.networks.' + imputNetwork + '.explorerDEXURL',
        timeOut: 1000,
        networkPrefix:
          imputNetwork === 'mainnet'
            ? NetworkPrefix.Mainnet
            : NetworkPrefix.Testnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
        defaultMinerFee: BigNumber(2),
        defaultSlippage: 10,
      },
    };
  });
};

const patchFrom_secrets = () => {
  patch(Wallet, 'from_secrets', () => {
    return 'testWallet' as any;
  });
};

const patchTo_base58 = () => {
  patch(Address.prototype, 'to_base58', () => {
    return 'testAddress' as any;
  });
};

const patchErgo_node = async () => {
  patch(ergo['_node'], 'getUnspentBoxesByAddress', () => {
    return [];
  });
};

const patchGetAddressUnspentBoxes = () => {
  patch(ergo, 'getAddressUnspentBoxes', () => {
    return [];
  });
};

const patchGetAssetData = () => {
  patch(ergo, 'getAssetData', () => {
    return {
      tokens: [
        {
          address:
            'ba553573f83c61be880d79db0f4068177fa75ab7c250ce3543f7e7aeb471a9d2',
          decimals: 7,
          name: '$Bass Token',
          ticker: '$bass',
          logoURI:
            'https://cloudflare-ipfs.com/ipfs/bafybeifjq7aaleq2eg4o4vhqsg2zjow6pkbb3upb7vpz6g24r777ikh5ua',
          project: '$Bass',
          description: 'Memecoin of the Ergo ecosystem',
        },
      ],
    };
  });
};

const patchGetTokens = () => {
  patch(ergo['_dex'], 'getTokens', () => {
    return {
      name: 'Spectrum Finance Ergo Token List',
      timestamp: '2024-04-02T08:05:42.697Z',
      version: {
        major: 2,
        minor: 0,
        patch: 0,
      },
      tags: {},
      keywords: ['spectrum finance', 'tokens', 'ergo tokens'],
      tokens: [
        {
          address:
            'ba553573f83c61be880d79db0f4068177fa75ab7c250ce3543f7e7aeb471a9d2',
          decimals: 7,
          name: '$Bass Token',
          ticker: '$bass',
          logoURI:
            'https://cloudflare-ipfs.com/ipfs/bafybeifjq7aaleq2eg4o4vhqsg2zjow6pkbb3upb7vpz6g24r777ikh5ua',
          project: '$Bass',
          description: 'Memecoin of the Ergo ecosystem',
        },
      ],
    };
  });
};

beforeEach(() => {
  patchGetErgoConfig('mainnet');
  ergo = new Ergo('mainnet');
});
afterEach(() => {
  unpatch();
  jest.clearAllMocks();
});

describe('Ergo', () => {
  it('Should be defined', () => {
    expect(ergo).toBeDefined();
  });
  it('Should throw new Error if network is not mainnet or testnet', () => {
    expect(() => new Ergo('invalidNetwork')).toThrow(
      'network should be `mainnet` or `testnet`',
    );
  });
  it('Should initialize with mainnet configuration', () => {
    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('mainnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Mainnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  it('Should initialize with testnet configuration', () => {
    patchGetErgoConfig('testnet');

    const ergo = new Ergo('testnet');
    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('testnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Testnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  describe('get node', () => {
    it('Should be defined', () => {
      expect(ergo.node).toBeDefined();
    });
    it('Should initialize node correctly and return the correct node', () => {
      expect(ergo.node).toBeInstanceOf(NodeService);
      expect(ergo.node).toEqual({
        nodeURL: 'ergo.networks.mainnet.nodeURL',
        timeout: 1000,
      });
    });
  });

  describe('get network', () => {
    it('Should be defined', () => {
      expect(ergo.network).toBeDefined();
    });
    it('Should return the correct network when network is mainnet', () => {
      expect(ergo.network).toBe('mainnet');
    });

    it('Should return the correct network when network is testnet', () => {
      patchGetErgoConfig('testnet');

      ergo = new Ergo('testnet');

      expect(ergo.network).toBe('testnet');
    });
  });

  describe('get storedAssetList', () => {
    it('Should be defined', () => {
      expect(ergo.storedAssetList);
    });
    it('Should return the stored asset list', () => {
      const assetMap: Record<string, ErgoAsset> = {
        ERGO: {
          tokenId: 'ERGOId',
          decimals: 9,
          name: 'ERGO',
          symbol: 'ERG',
        },
        SigUSD: {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
      };
      ergo['_assetMap'] = assetMap;
      expect(ergo.storedAssetList).toEqual(Object.values(assetMap));
    });
  });

  describe('ready', () => {
    it('Should be defined', () => {
      expect(ergo.ready).toBeDefined();
    });
    it('Should return the ready state', () => {
      expect(ergo.ready()).toBe(false);
      ergo['_ready'] = true;
      expect(ergo.ready()).toBe(true);
    });
  });

  describe('getNetworkHeight', () => {
    it('Should be defined', () => {
      expect(ergo.getNetworkHeight).toBeDefined();
    });
    it('Should call getNetworkHeight method from node', async () => {
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(1);
      await ergo.getNetworkHeight();
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('Should be defined', () => {
      expect(ergo.init).toBeDefined();
    });
    it('Should initialize assets and pools in init method', async () => {
      jest.spyOn(ergo as any, 'loadAssets').mockResolvedValue({});
      jest.spyOn(ergo as any, 'loadPools').mockResolvedValue({});

      await ergo.init();

      expect(ergo['loadAssets']).toHaveBeenCalled();
      expect(ergo['loadPools']).toHaveBeenCalled();
      expect(ergo.ready()).toBe(true);
    });
  });

  describe('close', () => {
    it('Should be defined', () => {
      expect(ergo.close).toBeDefined();
    });
    it('Should close correctly', async () => {
      await expect(ergo.close()).resolves.toBeUndefined();
    });
  });

  describe('getInstance', () => {
    it('Should be getInstance', () => {
      expect(ergo.close).toBeDefined();
    });
    const mockNetwork = 'testnet';

    beforeEach(() => {
      patchGetErgoConfig('testnet');
      Ergo['_instances'] = undefined as any;
    });

    it('Should initialize the LRUCache if not already initialized', () => {
      Ergo.getInstance(mockNetwork);

      expect(Ergo['_instances']).toBeDefined();
      expect(Ergo['_instances']).toBeInstanceOf(LRUCache);
    });

    it('Should set and return a new Ergo instance if not in the cache', () => {
      const instance = Ergo.getInstance(mockNetwork);

      expect(instance).toBeInstanceOf(Ergo);
      expect(Ergo['_instances'].has(mockNetwork)).toBe(true);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance);
    });

    it('Should return an existing Ergo instance from the cache', () => {
      const instance1 = Ergo.getInstance(mockNetwork);
      const instance2 = Ergo.getInstance(mockNetwork);
      expect(instance1).toBe(instance2);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance1);
    });

    it('Should throw an error if an unexpected network is provided', () => {
      expect(() => Ergo.getInstance('invalidNetwork')).toThrow(
        'network should be `mainnet` or `testnet`',
      );
    });
  });

  describe('getConnectedInstances', () => {
    let mockErgoInstance1: Ergo;
    let mockErgoInstance2: Ergo;

    beforeEach(() => {
      mockErgoInstance1 = new Ergo('testnet');
      mockErgoInstance2 = new Ergo('mainnet');

      Ergo['_instances'] = new LRUCache<string, Ergo>({
        max: 10,
      });
      Ergo['_instances'].set('testnet', mockErgoInstance1);
      Ergo['_instances'].set('mainnet', mockErgoInstance2);
    });
    it('Should be defined', () => {
      expect(Ergo.getConnectedInstances).toBeDefined();
    });
    it('Should return all connected instances', () => {
      const connectedInstances = Ergo.getConnectedInstances();
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'mainnet',
        'testnet',
      ]);
      expect(connectedInstances['testnet']).toBe(mockErgoInstance1);
      expect(connectedInstances['mainnet']).toBe(mockErgoInstance2);
    });

    it('Should return an empty object if there are no instances', () => {
      Ergo['_instances'] = undefined as any;
      const connectedInstances = Ergo.getConnectedInstances();
      expect(connectedInstances).toEqual({});
    });

    it('Should return only valid instances', () => {
      Ergo['_instances'].set('', null as any);
      const connectedInstances = Ergo.getConnectedInstances();
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'mainnet',
        'testnet',
      ]);
      expect(connectedInstances['testnet']).toBe(mockErgoInstance1);
      expect(connectedInstances['mainnet']).toBe(mockErgoInstance2);
      expect(connectedInstances['']).toBeUndefined();
    });
  });

  describe('getCurrentBlockNumber', () => {
    it('Should be defined', () => {
      expect(ergo.getCurrentBlockNumber).toBeDefined();
    });
    it('Should return the current block number incremented by one', async () => {
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(17);

      const blockNumber = await ergo.getCurrentBlockNumber();
      expect(blockNumber).toEqual(18);
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled;
    });
  });

  describe('getAddressUnspentBoxes', () => {
    it('Should be defined', () => {
      expect(ergo.getAddressUnspentBoxes).toBeDefined();
    });
    const mockAddress = '9j2s7d8f4s8s8o8s0q8f5s8d7f8s0d4r5';

    it('Should return an empty arry when length of nodeBoxes is 0', async () => {
      await patchErgo_node();
      const utxos = await ergo.getAddressUnspentBoxes(mockAddress);
      expect(utxos).toEqual([]);
    });

    it('Should retrieve all unspent boxes for the given address', async () => {
      const mockUnspentBoxesPage1 = [
        { boxId: 'box1' },
        { boxId: 'box2' },
      ] as Array<ErgoBox>;
      const mockUnspentBoxesPage2 = [{ boxId: 'box3' }] as Array<ErgoBox>;
      const mockUnspentBoxesPage3 = [] as Array<ErgoBox>; // Last page, empty
      jest
        .spyOn(ergo['_node'], 'getUnspentBoxesByAddress')
        .mockResolvedValueOnce(mockUnspentBoxesPage1)
        .mockResolvedValueOnce(mockUnspentBoxesPage2)
        .mockResolvedValueOnce(mockUnspentBoxesPage3);
      const result = await ergo.getAddressUnspentBoxes(mockAddress);
      expect(result).toEqual([
        { boxId: 'box1' },
        { boxId: 'box2' },
        { boxId: 'box3' },
      ]);
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledTimes(3);
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        0,
        100,
      );
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        100,
        100,
      );
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        200,
        100,
      );
    });
  });

  describe('getAccountFromSecretKey', () => {
    it('Should be defined', () => {
      expect(ergo.getAccountFromSecretKey).toBeDefined();
    });
    it('Should return an account with address and wallet from secret key', () => {
      const secret =
        '591811a0d6361f18e42549b32e65b98c9a63d6aad369d1056a97ca81f2a980d5';
      patchFrom_secrets();
      patchTo_base58();
      const mockGetAddress = jest.fn().mockReturnValue(new Address());
      const mockSecretKeyInstance = {
        get_address: mockGetAddress,
      } as unknown as SecretKey;
      jest
        .spyOn(SecretKey, 'dlog_from_bytes')
        .mockReturnValue(mockSecretKeyInstance);
      const mockAdd = jest.fn();
      jest.spyOn(SecretKeys.prototype, 'add').mockImplementation(mockAdd);

      const result = ergo.getAccountFromSecretKey(secret);
      expect(result.address).toBe('testAddress');
      expect(result.wallet).toBe('testWallet');
    });
  });

  describe('getAccountFromMnemonic', () => {
    it('Should be defined', () => {
      expect(ergo.getAccountFromMnemonic).toBeDefined();
    });
    it('Should return an account with address and wallet from mnemonic', () => {
      patchFrom_secrets();
      patchTo_base58();
      const mockGetAddress = jest.fn().mockReturnValue(new Address());
      const mockSecretKeyInstance = {
        get_address: mockGetAddress,
      } as unknown as SecretKey;
      jest
        .spyOn(SecretKey, 'dlog_from_bytes')
        .mockReturnValue(mockSecretKeyInstance);

      jest.spyOn(DerivationPath, 'new').mockReturnValue({} as any);
      jest.spyOn(Mnemonic, 'to_seed').mockReturnValue(1 as any);
      jest.spyOn(ExtSecretKey, 'derive_master').mockReturnValue({
        derive: jest.fn().mockReturnValue({
          secret_key_bytes: jest.fn().mockReturnValue('uint*Array' as any),
        }),
      } as any);
      const result = ergo.getAccountFromMnemonic('mnemonic');
      expect(result.address).toBe('testAddress');
      expect(result.wallet).toBe('testWallet');
      expect(result.prover).toEqual({
        wallet: 'testWallet',
        nodeService: {
          nodeURL: 'ergo.networks.mainnet.nodeURL',
          timeout: 1000,
        },
      });
      expect(DerivationPath.new).toHaveBeenCalledWith(0, new Uint32Array([0]));
      // 1 as return value from Mnemonic.to_seed function
      expect(ExtSecretKey.derive_master).toHaveBeenCalledWith(1);
    });
  });

  describe('encrypt', () => {
    const secret = 'mySecret';
    const password = 'myPassword';
    it('Should be defined', () => {
      expect(ergo.encrypt).toBeDefined();
    });
    it('Should encrypt a secret with a given password', () => {
      const encryptedText = ergo.encrypt(secret, password);
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });

    it('Should produce different encryption outputs for different secrets', () => {
      const encryptedText1 = ergo.encrypt('secret1', password);
      const encryptedText2 = ergo.encrypt('secret2', password);
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different encryption outputs for different passwords', () => {
      const encryptedText1 = ergo.encrypt(secret, 'password1');
      const encryptedText2 = ergo.encrypt(secret, 'password2');
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different IVs for different encryptions', () => {
      const encryptedText1 = ergo.encrypt(secret, password);
      const encryptedText2 = ergo.encrypt(secret, password);
      // Extract IVs from the encrypted texts
      const [iv1] = encryptedText1.split(':');
      const [iv2] = encryptedText2.split(':');
      expect(iv1).not.toBe(iv2);
    });

    it('Should handle edge case where password is longer than 32 bytes', () => {
      const longPassword = 'a'.repeat(50); // 50 bytes password
      const encryptedText = ergo.encrypt(secret, longPassword);
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });
  });
  describe('getAccountFromAddress', () => {
    beforeEach(() => {
      jest.spyOn(fse, 'readFile').mockResolvedValue('file' as any);
    });
    it('Should be defined', () => {
      expect(ergo.getAccountFromAddress).toBeDefined();
    });
    it('Should throw new Error if passphrase is invalid', async () => {
      jest
        .spyOn(ConfigManagerCertPassphrase, 'readPassphrase')
        .mockReturnValue(undefined);
      await expect(ergo.getAccountFromAddress('address')).rejects.toThrow(
        'missing passphrase',
      );
      expect(fse.readFile).toHaveBeenCalledWith(
        './conf/wallets/ergo/address.json',
        'utf8',
      );
    });
    it('Should return account from address given', async () => {
      jest
        .spyOn(ConfigManagerCertPassphrase, 'readPassphrase')
        .mockReturnValue('passphrase');
      jest.spyOn(ergo, 'decrypt').mockReturnValue('mnemonic');
      jest
        .spyOn(ergo, 'getAccountFromMnemonic')
        .mockReturnValue('Ergo Accont' as any);
      const result = await ergo.getAccountFromAddress('address');
      expect(ergo.decrypt).toHaveBeenCalledWith('file', 'passphrase');
      expect(ConfigManagerCertPassphrase.readPassphrase).toHaveBeenCalled();
      expect(fse.readFile).toHaveBeenCalledWith(
        './conf/wallets/ergo/address.json',
        'utf8',
      );
      expect(ergo.getAccountFromMnemonic).toHaveBeenCalledWith('mnemonic');
      expect(result).toEqual('Ergo Accont');
    });
  });

  describe('decrypt', () => {
    const secret = 'mySecret';
    it('Should be defined', () => {
      expect(ergo.decrypt).toBeDefined();
    });
    it('Should decrypt an encrypted secret correctly', () => {
      // Arrange: Set up the secret and password, and encrypt the secret
      const password = 'myPassword';
      const encryptedText = ergo.encrypt(secret, password);
      // Act: Call the decrypt method
      const decryptedText = ergo.decrypt(encryptedText, password);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should fail to decrypt with wrong password', () => {
      // Arrange: Set up the secret, correct password, wrong password, and encrypt the secret
      const correctPassword = 'correctPassword';
      const wrongPassword = 'wrongPassword';
      const encryptedText = ergo.encrypt(secret, correctPassword);
      // Act & Assert: Call the decrypt method with the wrong password and expect an error
      expect(() => {
        ergo.decrypt(encryptedText, wrongPassword);
      }).toThrow();
    });

    it('Should handle edge case where password is longer than 32 bytes', () => {
      // Arrange: Set up the secret and a long password, and encrypt the secret
      const longPassword = 'a'.repeat(50); // 50 bytes password
      const encryptedText = ergo.encrypt(secret, longPassword);
      const decryptedText = ergo.decrypt(encryptedText, longPassword);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should handle case where password is exactly 32 bytes', () => {
      const exact32BytesPassword = 'a'.repeat(32); // 32 bytes password
      const encryptedText = ergo.encrypt(secret, exact32BytesPassword);
      const decryptedText = ergo.decrypt(encryptedText, exact32BytesPassword);
      expect(decryptedText).toBe(secret);
    });
  });

  describe('getAssetBalance', () => {
    it('Should be defined', () => {
      expect(ergo.getAssetBalance).toBeDefined();
    });
    const account: ErgoAccount = { address: 'mockAddress' } as any;
    it('Should return balance as 0 when there are no unspent boxes', async () => {
      ergo['_assetMap'] = {
        ASSETNAME: { tokenId: 1 },
      } as any;
      patchGetAddressUnspentBoxes();
      const balance = await ergo.getAssetBalance(account, 'assetName');
      expect(balance).toBe('0');
    });

    it('Should return balance as 0 when there are no matching assets', async () => {
      ergo['_assetMap'] = {
        ASSETNAME: { tokenId: 1 },
      } as any;
      const utxos = [{ assets: [{ tokenId: 2, amount: '100' }] }];
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(utxos as any);
      const balance = await ergo.getAssetBalance(account, 'assetName');
      expect(balance).toBe('0');
    });

    it('Should return correct balance when there are matching assets', async () => {
      ergo['_assetMap'] = {
        ASSETNAME: { tokenId: 1 },
      } as any;
      const utxos = [
        { assets: [{ tokenId: '1', amount: 100 }] },
        { assets: [{ tokenId: '1', amount: 200 }] },
      ];
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(utxos as any);
      const balance = await ergo.getAssetBalance(account, 'assetName');
      expect(balance).toBe('300');
    });

    it('Should throw an error when no ergo asset is found', async () => {
      ergo['_assetMap'] = {};
      await expect(ergo.getAssetBalance(account, 'assetName')).rejects.toThrow(
        `assetName not found ${ergo['_chain']} Node!`,
      );
    });
    it('Should throw an error when getAddressUnspentBoxes fails', async () => {
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockRejectedValue(new Error('some error'));
      ergo['_assetMap'] = { ASSETNAME: {} } as any;
      await expect(ergo.getAssetBalance(account, 'assetName')).rejects.toThrow(
        `problem during finding account assets ${ergo['_chain']} Node!`,
      );
    });
  });

  describe('getBalance', () => {
    it('Should be defined', () => {
      expect(ergo.getBalance).toBeDefined();
    });
    let utxos: any = [];
    it('Should be defined', () => {
      expect(ergo.getBalance).toBeDefined();
    });

    it('Should return balance and assets when utxos is empty', () => {
      const result = ergo.getBalance(utxos);
      expect(result).toEqual({ assets: {}, balance: BigNumber(0) });
    });

    it('Should calculate balance and assets correctly', () => {
      utxos = [
        {
          value: '1000',
          assets: [
            { tokenId: 'token1', amount: '10' },
            { tokenId: 'token2', amount: '20' },
          ],
        },
        {
          value: '2000',
          assets: [
            { tokenId: 'token1', amount: '30' },
            { tokenId: 'token3', amount: '40' },
          ],
        },
      ];
      const expectedBalance = BigNumber(3000);
      const expectedAssets = {
        token1: BigNumber(40),
        token2: BigNumber(20),
        token3: BigNumber(40),
      };
      const result = ergo.getBalance(utxos);
      expect(result.balance.toString()).toBe(expectedBalance.toString());
      expect(result.assets.token1.toString()).toBe(
        expectedAssets.token1.toString(),
      );
      expect(result.assets.token2.toString()).toBe(
        expectedAssets.token2.toString(),
      );
      expect(result.assets.token3.toString()).toBe(
        expectedAssets.token3.toString(),
      );
    });
  });

  describe('loadAssets', () => {
    it('Should be defined', () => {
      expect(ergo['loadAssets']).toBeDefined();
    });
    it('Should load Assets and update assetMap object', async () => {
      ergo['_assetMap'] = {};
      patchGetAssetData();
      await ergo['loadAssets']();
      expect(ergo['_assetMap']).toEqual({
        '$BASS TOKEN': {
          tokenId:
            'ba553573f83c61be880d79db0f4068177fa75ab7c250ce3543f7e7aeb471a9d2',
          decimals: 7,
          name: '$Bass Token',
          symbol: '$bass'.toUpperCase(),
        },
        ERGO: {
          tokenId:
            '0000000000000000000000000000000000000000000000000000000000000000',
          decimals: 9,
          name: 'ERGO',
          symbol: 'ERG',
        },
      });
    });
  });

  describe('getAssetData', () => {
    it('Should be defined', () => {
      expect(ergo['getAssetData']).toBeDefined();
    });
    it('Should return all token with the details', async () => {
      patchGetTokens();
      expect(await ergo['getAssetData']()).toEqual({
        name: 'Spectrum Finance Ergo Token List',
        timestamp: '2024-04-02T08:05:42.697Z',
        version: {
          major: 2,
          minor: 0,
          patch: 0,
        },
        tags: {},
        keywords: ['spectrum finance', 'tokens', 'ergo tokens'],
        tokens: [
          {
            address:
              'ba553573f83c61be880d79db0f4068177fa75ab7c250ce3543f7e7aeb471a9d2',
            decimals: 7,
            name: '$Bass Token',
            ticker: '$bass',
            logoURI:
              'https://cloudflare-ipfs.com/ipfs/bafybeifjq7aaleq2eg4o4vhqsg2zjow6pkbb3upb7vpz6g24r777ikh5ua',
            project: '$Bass',
            description: 'Memecoin of the Ergo ecosystem',
          },
        ],
      });
    });
  });

  describe('loadPools', () => {
    it('Should be defined', () => {
      expect(ergo['loadPools']).toBeDefined();
    });
    it('Should push nothing to ammPools when no PoolData is provided', async () => {
      jest.spyOn(ergo as any, 'getPoolData').mockResolvedValue([] as any);
      ergo['ammPools'] = [];
      await ergo['loadPools']();
      expect(ergo['ammPools']).toEqual([]);
    });

    it('Should push nothing to ammPools when no PoolData is provided', async () => {
      jest
        .spyOn(ergo as any, 'getPoolData')
        .mockResolvedValueOnce([{ id: '1' }, { id: 2 }] as any);
      jest.spyOn(ergo as any, 'getPoolData').mockResolvedValueOnce([] as any);

      ergo['ammPools'] = [];
      await ergo['loadPools']();

      expect(ergo['ammPools']).toEqual([{ id: '1' }, { id: 2 }]);
    });

    it('Should not add duplicate pools to ammPools', async () => {
      const initialPools: any = [
        { id: 1, name: 'Pool 1' },
        { id: 2, name: 'Pool 2' },
      ];
      const newPools: any = [
        { id: 2, name: 'Pool 2' },
        { id: 3, name: 'Pool 3' },
      ];

      jest
        .spyOn(ergo as any, 'getPoolData')
        .mockResolvedValueOnce(initialPools)
        .mockResolvedValueOnce(newPools)
        .mockResolvedValueOnce([]);

      ergo['ammPools'] = [];

      await ergo['loadPools']();

      expect(ergo['ammPools']).toEqual([
        { id: 1, name: 'Pool 1' },
        { id: 2, name: 'Pool 2' },
        { id: 3, name: 'Pool 3' },
      ]);
    });
  });

  describe('loadPool', () => {
    beforeEach(() => {
      jest.spyOn(RustModule, 'load').mockResolvedValue;
      jest.spyOn(ergo, 'getPool').mockReturnValue({} as any);
    });
    it('Should be defined', () => {
      expect(ergo.loadPool).toBeDefined();
    });
    it('Should not update ammPools if pool with related id is found', async () => {
      const before = ergo['ammPools'].length;
      await ergo.loadPool('invalidPoolId');
      const after = ergo['ammPools'].length;

      expect(before).toEqual(after);
      expect(ergo.getPool).toHaveBeenCalledWith('invalidPoolId');
      expect(makeNativePools).not.toHaveBeenCalled();
    });
    it('Should add pool to ammPools if pool is not added before', async () => {
      const pool: any = {
        id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
        lp: {
          withAmount: (_sth: any) => {
            return {
              asset: {
                id: 'lpId',
                name: 'lpNmae',
                decimals: 0,
              },
              amount: BigInt(922336941265222),
            };
          },
        },
        x: {
          withAmount: (_sth: any) => {
            return {
              asset: {
                id: 'xId',
                name: 'xNmae',
                decimals: 9,
              },
              amount: BigInt(752313805260857),
            };
          },
          asset: {
            id: 'xId',
            name: 'xNmae',
            decimals: 9,
          },
        },
        y: {
          withAmount: (_sth: any) => {
            return {
              asset: {
                id: 'yId',
                name: 'yNmae',
                decimals: 3,
              },
              amount: BigInt(9322283969),
            };
          },
          asset: {
            id: 'yId',
            name: 'yNmae',
            decimals: 3,
          },
        },
        outputAmount: (_sth: any, _slippage: any) => {
          return 1;
        },
      };

      jest.spyOn(ergo, 'getPool').mockReturnValue(null as any);
      const mockGet = jest.fn().mockResolvedValue(pool);
      (makeNativePools as any).mockReturnValue({ get: mockGet });

      expect(ergo['ammPools'].length).toEqual(0);
      await ergo.loadPool('validPoolId');
      expect(ergo['ammPools'].length).toEqual(1);
      expect(makeNativePools).toHaveBeenCalledWith(ergo['_explorer']);
    });

    it('Should throw new Error if no pool is found with the related poolId from makeNativePools', async () => {
      const mockGet = jest.fn().mockReturnValue(null);
      (makeNativePools as any).mockReturnValue({ get: mockGet });
      jest.spyOn(ergo, 'getPool').mockReturnValue(null as any);

      await expect(ergo.loadPool('invalidPoolId')).rejects.toThrow(
        `can not get pool with this id: invalidPoolId`,
      );
    });
  });

  describe('getPoolData', () => {
    it('Should be defined', () => {
      expect(ergo['getPoolData']).toBeDefined();
    });
    it('Should call makeNativePools and getAll with correct parameters', async () => {
      const mockGetAll = jest.fn().mockResolvedValue([]);
      (makeNativePools as any).mockReturnValue({ getAll: mockGetAll });

      const limit = 10;
      const offset = 0;
      await ergo['getPoolData'](limit, offset);
      expect(makeNativePools).toHaveBeenCalledWith(ergo['_explorer']);
      expect(mockGetAll).toHaveBeenCalledWith({ limit, offset });
    });

    it('Should return the data from getAll method', async () => {
      const expectedData = [{ id: 1, name: 'Pool 1' }];
      const mockGetAll = jest.fn().mockResolvedValue(expectedData);
      (makeNativePools as any).mockReturnValue({ getAll: mockGetAll });
      const limit = 10;
      const offset = 0;
      const result = await ergo['getPoolData'](limit, offset);
      expect(result).toEqual(expectedData[0]);
    });

    it('Should handle errors from getAll method', async () => {
      const mockGetAll = jest.fn().mockRejectedValue(new Error('Test error'));
      (makeNativePools as any).mockReturnValue({ getAll: mockGetAll });
      const limit = 10;
      const offset = 0;
      await expect(ergo['getPoolData'](limit, offset)).rejects.toThrow(
        'Test error',
      );
    });
  });
  describe('storedTokenList', () => {
    it('Should be defined', () => {
      expect(ergo.storedTokenList).toBeDefined();
    });
    it('Should return the stored asset list', () => {
      const asset1: ErgoAsset = 1 as any;
      const asset2: ErgoAsset = 2 as any;
      const assetMap = {
        key1: asset1,
        key2: asset2,
      };
      ergo['_assetMap'] = assetMap;
      expect(ergo.storedTokenList).toEqual(assetMap);
    });
  });

  describe('swap', () => {
    const account: any = { address: 'address' };
    const baseToken: string = 'ERG';
    const quoteToken: string = 'SigUSD';
    const value: BigNumber = BigNumber(10);
    const output_address: string = 'output_address';
    const return_address: string = 'return_address';
    const slippage: number = 10;
    beforeEach(() => {
      jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },

        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue([pool]);
      jest
        .spyOn(NodeService.prototype, 'getBlockInfo')
        .mockResolvedValue({ header: { timestamp: 123456 } });
      jest.spyOn(ergo_utils, 'getBaseInputParameters').mockReturnValue({
        baseInput: BigNumber(1),
        baseInputAmount: BigNumber(1),
        minOutput: { amount: BigInt(1) },
      } as any);
    });
    afterEach(() => {
      jest.clearAllMocks();
    });
    const mockUtxos = [
      {
        value: '1000',
        assets: [{ amount: '500' }, { amount: '300' }],
      },
      {
        value: '2000',
        assets: [{ amount: '1500' }, { amount: '1300' }],
      },
    ];
    const poolWithOutputAmount0: any = {
      id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
      lp: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'lpId',
              name: 'lpName',
              decimals: 0,
            },
            amount: BigInt(922336941265222),
          };
        },
      },
      x: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'ERGId',
              name: 'ergo',
              decimals: 9,
            },
            amount: BigInt(752313805260857),
          };
        },
        asset: {
          id: 'ERGId',
          name: 'ergo',
          decimals: 9,
        },
      },
      y: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'SigUSDId',
              name: 'SigUSD',
              decimals: 3,
            },
            amount: BigInt(9322283969),
          };
        },
        asset: {
          id: 'SigUSDId',
          name: 'SigUSD',
          decimals: 3,
        },
      },
      outputAmount: (_sth: any, _slippage: any) => {
        return {
          amount: BigInt(0),
        };
      },
    };
    const pool: any = {
      id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
      lp: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'lpId',
              name: 'lpName',
              decimals: 0,
            },
            amount: BigInt(922336941265222),
          };
        },
      },
      x: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'ERGId',
              name: 'ergo',
              decimals: 9,
            },
            amount: BigInt(752313805260857),
          };
        },
        asset: {
          id: 'ERGId',
          name: 'ergo',
          decimals: 9,
        },
      },
      y: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'SigUSDId',
              name: 'SigUSD',
              decimals: 3,
            },
            amount: BigInt(9322283969),
          };
        },
        asset: {
          id: 'SigUSDId',
          name: 'SigUSD',
          decimals: 3,
        },
      },
      priceX: { numerator: BigInt(1) },
      priceY: { numerator: BigInt(2) },
      outputAmount: (_sth: any, _slippage: any) => {
        return {
          amount: BigInt(1),
        };
      },
    };

    it('Should be defined', () => {
      expect(ergo.swap).toBeDefined();
    });
    it('Should throw new Error if baseToken is available but quoteToken is not available on storedAssetList', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue([]);
      // ERG is available but SigUSD is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`${baseToken} or ${quoteToken} not found!`);
      expect(ergo.getPoolByToken).toHaveBeenCalledWith(baseToken, quoteToken);
    });

    it('Should throw new Error if quoteToken is available but baseToken is not available on storedAssetList', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue([]);
      // SigUSD is available but ERG is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
      ]);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`${baseToken} or ${quoteToken} not found!`);
      expect(ergo.getPoolByToken).toHaveBeenCalledWith(baseToken, quoteToken);
    });

    it(`Should throw new Error if 'from.amount === 0' and sell is 'false'`, async () => {
      jest
        .spyOn(ergo, 'getPoolByToken')
        .mockReturnValue([poolWithOutputAmount0]);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(
        `${value.multipliedBy(
          BigNumber(10).pow(pool.y.asset.decimals as number),
        )} asset from SigUSDId is not enough!`,
      );
    });
    it(`Should throw new Error if 'from.amount === 0' and sell is 'true'`, async () => {
      // to set sell 'true'
      const baseToken: string = 'SigUSD';
      const quoteToken: string = 'ERG';
      jest
        .spyOn(ergo, 'getPoolByToken')
        .mockReturnValue([poolWithOutputAmount0]);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(
        `${value.multipliedBy(
          BigNumber(10).pow(pool.x.asset.decimals as number),
        )} asset from ERGId is not enough!`,
      );
    });

    it('Should throw new Error if swapVariables are undefined', async () => {
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow('error in swap vars!');
      expect(ergo.getAddressUnspentBoxes).toHaveBeenCalledWith('address');
      expect(ergo_utils.getBaseInputParameters).toHaveBeenCalledWith(pool, {
        inputAmount: {
          asset: {
            id: 'ERGId',
            decimals: 9,
          },
          amount: pool.outputAmount(
            {
              asset: {
                id: 'SigUSDId',
              },
              amount: value
                .multipliedBy(
                  BigNumber(10).pow(pool.y.asset.decimals as number),
                )
                .toString(),
            },
            slippage,
          ).amount,
        },
        slippage: slippage || 10,
      });
    });

    it('Should throw new Error if output_address is not defined', async () => {
      jest.spyOn(ergo_utils, 'getInputs').mockReturnValue({} as any);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`output_address is not defined.`);
      expect(ergo.getAddressUnspentBoxes).toHaveBeenCalledWith('address');
    });

    it('Should throw new Error if any error occurs during submitting the tx', async () => {
      jest.spyOn(ergo_utils, 'getInputs').mockReturnValue({} as any);
      const account: any = {
        prover: {
          submit: jest.fn().mockResolvedValue({}),
        },
      };

      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          value,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`error during submit tx!`);
    });

    it('Should successfully swap tokens when sell is false', async () => {
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(mockUtxos as any);

      const account: any = {
        prover: {
          submit: jest.fn().mockResolvedValue({ id: 'id' }),
        },
      };

      const result = await ergo.swap(
        account,
        baseToken,
        quoteToken,
        value,
        output_address,
        return_address,
        slippage,
      );
      expect(result).toEqual({
        network: ergo.network,
        timestamp: 123456,
        latency: 0,
        base: baseToken,
        quote: quoteToken,
        amount: value
          .multipliedBy(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        rawAmount: value
          .multipliedBy(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        expectedOut: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        price: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(
            BigNumber(pool.outputAmount().amount.toString()).div(
              BigNumber(10).pow(pool.x.asset.decimals as number),
            ),
          )
          .toString(),
        gasPrice: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasPriceToken: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        gasLimit: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasCost: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        txHash: 'txId',
      });
    });

    it('Should successfully swap tokens when sell is true', async () => {
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(mockUtxos as any);

      const account: any = {
        prover: {
          submit: jest.fn().mockResolvedValue({ id: 'id' }),
        },
      };
      // to set sell 'true'
      const baseToken: string = 'SigUSD';
      const quoteToken: string = 'ERG';
      const result = await ergo.swap(
        account,
        baseToken,
        quoteToken,
        value,
        output_address,
        return_address,
        slippage,
      );
      expect(result).toEqual({
        network: ergo.network,
        timestamp: 123456,
        latency: 0,
        base: baseToken,
        quote: quoteToken,
        amount: value
          .multipliedBy(BigNumber(10).pow(pool.x.asset.decimals as number))
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        rawAmount: value
          .multipliedBy(BigNumber(10).pow(pool.x.asset.decimals as number))
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        expectedOut: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        price: BigNumber(1)
          .div(
            BigNumber(BigInt(1).toString())
              .div(BigNumber(10).pow(pool.x.asset.decimals as number))
              .div(
                BigNumber(pool.outputAmount().amount.toString()).div(
                  BigNumber(10).pow(pool.y.asset.decimals as number),
                ),
              ),
          )
          .toString(),
        gasPrice: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasPriceToken: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        gasLimit: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasCost: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        txHash: 'txId',
      });
    });
  });

  describe('estimate', () => {
    const baseToken: string = 'ERG';
    const quoteToken: string = 'SigUSD';
    const value: BigNumber = BigNumber(10);
    beforeEach(() => {
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },

        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue([pool]);
      jest
        .spyOn(ergo_utils, 'getBaseInputParameters')
        .mockReturnValue({ minOutput: { amount: BigInt(1) } } as any);
    });
    afterEach(() => {
      jest.clearAllMocks();
    });
    const pool: any = {
      id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
      lp: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'lpId',
              name: 'lpName',
              decimals: 0,
            },
            amount: BigInt(922336941265222),
          };
        },
      },
      x: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'ERGId',
              name: 'ergo',
              decimals: 9,
            },
            amount: BigInt(752313805260857),
          };
        },
        asset: {
          id: 'ERGId',
          name: 'ergo',
          decimals: 9,
        },
      },
      y: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'SigUSDId',
              name: 'SigUSD',
              decimals: 3,
            },
            amount: BigInt(9322283969),
          };
        },
        asset: {
          id: 'SigUSDId',
          name: 'SigUSD',
          decimals: 3,
        },
      },
      priceX: { numerator: BigInt(1) },
      priceY: { numerator: BigInt(2) },
      outputAmount: (_sth: any, _slippage: any) => {
        return {
          amount: BigInt(1),
        };
      },
    };

    it('Should be defined', () => {
      expect(ergo.estimate).toBeDefined();
    });
    it('Should throw new Error if pool is not found', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue([]);
      await expect(ergo.estimate(baseToken, quoteToken, value)).rejects.toThrow(
        `pool not found base on ${baseToken}, ${quoteToken}`,
      );
    });

    it('Should throw new Error if baseToken is available but quoteToken is not available on storedAssetList', async () => {
      // ERG is available but SigUSD is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
      await expect(ergo.estimate(baseToken, quoteToken, value)).rejects.toThrow(
        `${baseToken} or ${quoteToken} not found!`,
      );
      expect(ergo.getPoolByToken).toHaveBeenCalledWith(baseToken, quoteToken);
    });

    it('Should throw new Error if quoteToken is available but baseToken is not available on storedAssetList', async () => {
      // SigUSD is available but ERG is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
      ]);
      await expect(ergo.estimate(baseToken, quoteToken, value)).rejects.toThrow(
        `${baseToken} or ${quoteToken} not found!`,
      );
      expect(ergo.getPoolByToken).toHaveBeenCalledWith(baseToken, quoteToken);
    });

    it('Should ignore the rest of loop scope and return the base result if minOutput === BigInt(0)', async () => {
      jest.spyOn(ergo_utils, 'getBaseInputParameters').mockReturnValue({
        minOutput: { amount: BigInt(0) },
      } as any);
      expect(await ergo.estimate(baseToken, quoteToken, value)).toMatchObject({
        base: baseToken,
        quote: quoteToken,
        amount: '0',
        rawAmount: '0',
        expectedAmount: '0',
        price: '0',
        network: 'mainnet',
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        gasPrice: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasPriceToken: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        gasLimit: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasCost: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
      });
    });
    it('Should estimate successfully when sell is false', async () => {
      const result = await ergo.estimate(baseToken, quoteToken, value);
      expect(result).toMatchObject({
        base: baseToken,
        quote: quoteToken,
        amount: value
          .multipliedBy(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        rawAmount: value
          .multipliedBy(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        expectedAmount: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .toString(),
        price: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.y.asset.decimals as number))
          .div(
            BigNumber(pool.outputAmount().amount.toString()).div(
              BigNumber(10).pow(pool.x.asset.decimals as number),
            ),
          )
          .toString(),
        network: ergo.network,
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        gasPrice: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasPriceToken: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        gasLimit: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasCost: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
      });
    });
    it('Should estimate successfully when sell is true', async () => {
      // to set sell 'true'
      const baseToken: string = 'SigUSD';
      const quoteToken: string = 'ERG';
      const result = await ergo.estimate(baseToken, quoteToken, value);
      expect(result).toMatchObject({
        base: baseToken,
        quote: quoteToken,
        amount: value
          .multipliedBy(BigNumber(10).pow(pool.x.asset.decimals as number))
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        rawAmount: value
          .multipliedBy(BigNumber(10).pow(pool.x.asset.decimals as number))
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        expectedAmount: BigNumber(BigInt(1).toString())
          .div(BigNumber(10).pow(pool.x.asset.decimals as number))
          .toString(),
        price: BigNumber(1)
          .div(
            BigNumber(BigInt(1).toString())
              .div(BigNumber(10).pow(pool.x.asset.decimals as number))
              .div(
                BigNumber(pool.outputAmount().amount.toString()).div(
                  BigNumber(10).pow(pool.y.asset.decimals as number),
                ),
              ),
          )
          .toString(),
        network: ergo.network,
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        gasPrice: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasPriceToken: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
        gasLimit: BigNumber('2000').div(BigNumber(10).pow(9)).toNumber(),
        gasCost: BigNumber('2000').div(BigNumber(10).pow(9)).toString(),
      });
    });
  });

  describe('getPool', () => {
    it('Should be defined', () => {
      expect(ergo.getPool).toBeDefined();
    });
    it('Should find the pool with related id and return it', () => {
      // set a mock pool to check the id
      const poolToCheck: any = {
        id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
        lp: {
          withAmount: (_sth: any) => {
            return {
              asset: {
                id: 'lpId',
                name: 'lpName',
                decimals: 0,
              },
              amount: BigInt(922336941265222),
            };
          },
        },
      };
      expect(
        ergo.getPool(
          '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
        ),
      ).toEqual(undefined);
      ergo['ammPools'].push(poolToCheck);
      const result = ergo.getPool(
        '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
      );
      expect(result).toEqual(poolToCheck);
    });
  });
  describe('getPoolByToken', () => {
    beforeEach(() => {
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
    });
    const baseToken = 'ERG';
    const quoteToken = 'SigUSD';
    it('Should be defined', () => {
      expect(ergo.getPoolByToken).toBeDefined();
    });
    it('Should throw new Error if baseToken is available but quoteToken is not available on storedAssetList', () => {
      // ERG is available but SigUSD is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'ERGId',
          decimals: 9,
          name: 'ergo',
          symbol: 'ERG',
        },
      ]);
      expect(() => ergo.getPoolByToken(baseToken, quoteToken)).toThrow(
        `${baseToken} or ${quoteToken} not found!`,
      );
    });
    it('Should throw new Error if baseToken is available but quoteToken is not available on storedAssetList', () => {
      // SigUSD is available but ERG is not
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        {
          tokenId: 'SigUSDId',
          decimals: 9,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
      ]);
      expect(() => ergo.getPoolByToken(baseToken, quoteToken)).toThrow(
        `${baseToken} or ${quoteToken} not found!`,
      );
    });
    it('Should find poll when both base token and quote are valid in ammPools array', () => {
      const ergoRnsPool = {
        id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
        x: {
          asset: {
            id: 'ERGId',
            name: 'ERGO',
            decimals: 9,
          },
        },
        y: {
          asset: {
            id: 'SigUSDId',
            name: 'SigUSD',
            decimals: 3,
          },
        },
      } as any;
      ergo['ammPools'].push(ergoRnsPool);
      const result = ergo.getPoolByToken(baseToken, quoteToken);
      expect(result).toEqual([ergoRnsPool]);
      expect(result[0].id).toEqual(
        '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
      );
    });
  });

  describe('getTx', () => {
    it('Should be defined', () => {
      expect(ergo.getTx).toBeDefined();
    });

    it('Should find and return TX by Id', async () => {
      jest.spyOn(ergo['_node'], 'getTxsById').mockResolvedValue('TX' as any);
      const result = await ergo.getTx('id');
      expect(ergo['_node'].getTxsById).toHaveBeenCalledWith('id');
      expect(result).toEqual('TX');
    });
  });
});
