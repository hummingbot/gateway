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
import { makeNativePools } from '@patternglobal/ergo-dex-sdk';
import { BigNumber } from 'bignumber.js';
import * as ergo_utils from '../../../src/chains/ergo/ergo.util';

jest.mock('@patternglobal/ergo-dex-sdk', () => ({
  AmmPool: jest.fn(),
  makeNativePools: jest.fn(),
  makeWrappedNativePoolActionsSelector: jest.fn(),
  swapVars: jest
    .fn()
    .mockReturnValueOnce(undefined)
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
    getNetworkContext: jest.fn().mockReturnValue({} as any),
  }),
  AssetAmount: jest.fn(),
  publicKeyFromAddress: jest.fn().mockReturnValueOnce(undefined),
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
// Clean up mocks after each test
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
    // expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  it('Should initialize with testnet configuration', () => {
    // Arrange: Mock the return value of getErgoConfig to simulate testnet configuration
    patchGetErgoConfig('testnet');

    // Act: Create a new instance of Ergo with 'testnet' configuration
    const ergo = new Ergo('testnet');

    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('testnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Testnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    // expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  describe('get node', () => {
    it('Should initialize node correctly and return the correct node', () => {
      // Assert: Validate the initialization state of node instance and check the returned value
      expect(ergo.node).toBeInstanceOf(NodeService);
      expect(ergo.node).toEqual({
        nodeURL: 'ergo.networks.mainnet.nodeURL',
        timeout: 1000,
      });
    });
  });

  describe('get network', () => {
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
    it('Should return the stored asset list', () => {
      // Arrange: Create mock assets and populate _assetMap
      const asset1: ErgoAsset = 1 as any;
      const asset2: ErgoAsset = 2 as any;
      const assetMap = {
        key1: asset1,
        key2: asset2,
      };

      // Act: Set _assetMap directly
      ergo['_assetMap'] = assetMap;

      // Assert: Validate the stored asset list returned by storedAssetList
      expect(ergo.storedAssetList).toEqual(Object.values(assetMap));
    });
  });

  describe('ready', () => {
    it('Should return the ready state', () => {
      expect(ergo.ready()).toBe(false);
      ergo['_ready'] = true;
      expect(ergo.ready()).toBe(true);
    });
  });

  describe('getNetworkHeight', () => {
    it('Should call getNetworkHeight method from node', async () => {
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(1);
      await ergo.getNetworkHeight();
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('Should initialize assets and pools in init method', async () => {
      // Arrange: Mock the loadAssets & loadPools methods to return a fixed value
      jest.spyOn(ergo as any, 'loadAssets').mockResolvedValue({});
      jest.spyOn(ergo as any, 'loadPools').mockResolvedValue({});

      // Act: Call the init method to initialize assets and pools
      await ergo.init();

      // Assert: Ensure the loadAssets & loadPools methods were called during initialization
      expect(ergo['loadAssets']).toHaveBeenCalled();
      expect(ergo['loadPools']).toHaveBeenCalled();
      expect(ergo.ready()).toBe(true);
    });
  });

  describe('close', () => {
    it('Should close correctly', async () => {
      // Act and Assert: Call the close method and expect that the close method resolves without any errors or values
      await expect(ergo.close()).resolves.toBeUndefined();
    });
  });

  describe('getInstance', () => {
    const mockNetwork = 'testnet';

    beforeEach(() => {
      // Arrange: Mock the function to get the configuration for the 'testnet' network
      patchGetErgoConfig('testnet');
      // Arrange: Clear the singleton and mock instances
      Ergo['_instances'] = undefined as any;
    });

    it('Should initialize the LRUCache if not already initialized', () => {
      // Act: Call the getInstance method with the mock network
      Ergo.getInstance(mockNetwork);

      // Assert: Expect that the _instances property is defined and _instances is an instance of LRUCache
      expect(Ergo['_instances']).toBeDefined();
      expect(Ergo['_instances']).toBeInstanceOf(LRUCache);
    });

    it('Should set and return a new Ergo instance if not in the cache', () => {
      // Act: Call the getInstance method with the mock network
      const instance = Ergo.getInstance(mockNetwork);

      // Assert: Expect that the returned instance is an instance of Ergo, the cache contains the mock network key and the instance in the cache matches the returned instance
      expect(instance).toBeInstanceOf(Ergo);
      expect(Ergo['_instances'].has(mockNetwork)).toBe(true);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance);
    });

    it('Should return an existing Ergo instance from the cache', () => {
      // Act: Call the getInstance method twice with the mock network
      const instance1 = Ergo.getInstance(mockNetwork);
      const instance2 = Ergo.getInstance(mockNetwork);

      // Assert: Expect that both calls return the same instance and the cache contains the mock network key
      expect(instance1).toBe(instance2);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance1);
    });

    it('Should throw an error if an unexpected network is provided', () => {
      // Act and Assert: Expect that calling getInstance with an invalid network throws an error
      expect(() => Ergo.getInstance('invalidNetwork')).toThrow(
        'network should be `mainnet` or `testnet`',
      );
    });
  });

  describe('getConnectedInstances', () => {
    let mockErgoInstance1: Ergo;
    let mockErgoInstance2: Ergo;

    beforeEach(() => {
      // Arrange: Create mock Ergo instances
      mockErgoInstance1 = new Ergo('testnet') as any;
      mockErgoInstance2 = new Ergo('mainnet') as any;

      // Arrange: Initialize the _instances LRUCache with mock instances
      Ergo['_instances'] = new LRUCache<string, Ergo>({
        max: 10,
      });
      Ergo['_instances'].set('testnet', mockErgoInstance1);
      Ergo['_instances'].set('mainnet', mockErgoInstance2);
    });

    it('Should return all connected instances', () => {
      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to match the mock instances
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'mainnet',
        'testnet',
      ]);
      expect(connectedInstances['testnet']).toBe(mockErgoInstance1);
      expect(connectedInstances['mainnet']).toBe(mockErgoInstance2);
    });

    it('Should return an empty object if there are no instances', () => {
      // Arrange: Clear the _instances LRUCache
      Ergo['_instances'] = undefined as any;

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to be an empty object
      expect(connectedInstances).toEqual({});
    });

    it('Should return only valid instances', () => {
      // Arrange: Set an invalid (null) instance in the _instances LRUCache
      Ergo['_instances'].set('', null as any);

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();
      // Assert: Expect the valid instances to be returned and invalid instances to be excluded
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
    it('Should return the current block number incremented by one', async () => {
      // Arrange: Mock the getNetworkHeight method to return a fixed value
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(17);

      const blockNumber = await ergo.getCurrentBlockNumber();

      // Assert: Validate the returned block number
      expect(blockNumber).toEqual(18);
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled;
    });
  });

  describe('getAddressUnspentBoxes', () => {
    const mockAddress = '9j2s7d8f4s8s8o8s0q8f5s8d7f8s0d4r5';

    it('Should return an empty arry when length of nodeBoxes is 0', async () => {
      // Arrange: Mock the getUnspentBoxesByAddress method to return an empty array
      await patchErgo_node();
      const utxos = await ergo.getAddressUnspentBoxes(mockAddress);
      expect(utxos).toEqual([]);
    });

    it('Should retrieve all unspent boxes for the given address', async () => {
      // Arrange: Mock the getUnspentBoxesByAddress method to return 3 boxes
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
      // Act: Call the getAddressUnspentBoxes method
      const result = await ergo.getAddressUnspentBoxes(mockAddress);
      // Assert: Validate that an empty array is returned
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
    it('Should return an account with address and wallet from secret key', () => {
      const secret =
        '591811a0d6361f18e42549b32e65b98c9a63d6aad369d1056a97ca81f2a980d5';
      patchFrom_secrets();
      patchTo_base58();
      // Arrange: Mock get_address method
      const mockGetAddress = jest.fn().mockReturnValue(new Address());
      const mockSecretKeyInstance = {
        get_address: mockGetAddress,
      } as unknown as SecretKey;
      jest
        .spyOn(SecretKey, 'dlog_from_bytes')
        .mockReturnValue(mockSecretKeyInstance);
      // Arrange: Mock add method for SecretKeys
      const mockAdd = jest.fn();
      jest.spyOn(SecretKeys.prototype, 'add').mockImplementation(mockAdd);

      const result = ergo.getAccountFromSecretKey(secret);
      // Assert: Validate the returned address and wallet
      expect(result.address).toBe('testAddress');
      expect(result.wallet).toBe('testWallet');
    });
  });

  describe('getAccountFromMnemonic', () => {
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
    it('Should encrypt a secret with a given password', () => {
      // Arrange: Set up the secret and password
      const secret = 'mySecret';
      const password = 'myPassword';

      const encryptedText = ergo.encrypt(secret, password);
      // Assert: Verify the encrypted text format
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });

    it('Should produce different encryption outputs for different secrets', () => {
      // Arrange: Set up the password
      const password = 'myPassword';

      // Act: Call the encrypt method with two different secrets
      const encryptedText1 = ergo.encrypt('secret1', password);
      const encryptedText2 = ergo.encrypt('secret2', password);

      // Assert: Verify that the encrypted texts are different
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different encryption outputs for different passwords', () => {
      // Arrange: Set up the secret
      const secret = 'mySecret';

      // Act: Call the encrypt method with two different passwords
      const encryptedText1 = ergo.encrypt(secret, 'password1');
      const encryptedText2 = ergo.encrypt(secret, 'password2');

      // Assert: Verify that the encrypted texts are different
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different IVs for different encryptions', () => {
      // Arrange: Set up the secret and password
      const secret = 'mySecret';
      const password = 'myPassword';

      // Act: Call the encrypt method twice with the same secret and password
      const encryptedText1 = ergo.encrypt(secret, password);
      const encryptedText2 = ergo.encrypt(secret, password);

      // Extract IVs from the encrypted texts
      const [iv1] = encryptedText1.split(':');
      const [iv2] = encryptedText2.split(':');

      // Assert: Verify that the IVs are different
      expect(iv1).not.toBe(iv2);
    });

    it('Should handle edge case where password is longer than 32 bytes', () => {
      // Arrange: Set up the secret and a long password
      const secret = 'mySecret';
      const longPassword = 'a'.repeat(50); // 50 bytes password

      // Act: Call the encrypt method
      const encryptedText = ergo.encrypt(secret, longPassword);

      // Assert: Verify the encrypted text format
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });
  });

  describe('decrypt', () => {
    it('Should decrypt an encrypted secret correctly', () => {
      // Arrange: Set up the secret and password, and encrypt the secret
      const secret = 'mySecret';
      const password = 'myPassword';
      const encryptedText = ergo.encrypt(secret, password);
      // Act: Call the decrypt method
      const decryptedText = ergo.decrypt(encryptedText, password);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should fail to decrypt with wrong password', () => {
      // Arrange: Set up the secret, correct password, wrong password, and encrypt the secret
      const secret = 'mySecret';
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
      const secret = 'mySecret';
      const longPassword = 'a'.repeat(50); // 50 bytes password
      const encryptedText = ergo.encrypt(secret, longPassword);
      // Act: Call the decrypt method
      const decryptedText = ergo.decrypt(encryptedText, longPassword);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should handle case where password is exactly 32 bytes', () => {
      const secret = 'mySecret';
      const exact32BytesPassword = 'a'.repeat(32); // 32 bytes password
      const encryptedText = ergo.encrypt(secret, exact32BytesPassword);
      const decryptedText = ergo.decrypt(encryptedText, exact32BytesPassword);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });
  });

  describe('getAssetBalance', () => {
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
    it('Should load Assets and update assetMap object', async () => {
      // Arrange: Set up the assetMap and mock the getAssetData method
      ergo['_assetMap'] = {};
      patchGetAssetData();

      // Act: Call the loadAssets method
      await ergo['loadAssets']();

      // Assert: Verify that the assetMap is updated correctly
      expect(ergo['_assetMap']).toEqual({
        '$BASS TOKEN': {
          tokenId:
            'ba553573f83c61be880d79db0f4068177fa75ab7c250ce3543f7e7aeb471a9d2',
          decimals: 7,
          name: '$Bass Token',
          symbol: '$bass',
        },
      });
    });
  });

  describe('getAssetData', () => {
    it('Should return all token with the details', async () => {
      patchGetTokens();
      // Act & Assert: Validate the returned data structure
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
    it('Should push nothing to ammPools when no PoolData is provided', async () => {
      // Arrange: Mock getPoolData to return an empty array
      jest.spyOn(ergo as any, 'getPoolData').mockResolvedValue([] as any);
      ergo['ammPools'] = [];

      await ergo['loadPools']();
      expect(ergo['ammPools']).toEqual([]);
    });

    it('Should push nothing to ammPools when no PoolData is provided', async () => {
      // Arrange: Mock getPoolData to return specific pool data
      jest
        .spyOn(ergo as any, 'getPoolData')
        .mockResolvedValueOnce([{ id: '1' }, { id: 2 }] as any);
      jest.spyOn(ergo as any, 'getPoolData').mockResolvedValueOnce([] as any);

      ergo['ammPools'] = [];
      await ergo['loadPools']();

      expect(ergo['ammPools']).toEqual([{ id: '1' }, { id: 2 }]);
    });

    it('Should not add duplicate pools to ammPools', async () => {
      // Arrange: Mock getPoolData to simulate incremental pool data loading
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
    it('Should call makeNativePools and getAll with correct parameters', async () => {
      const mockGetAll = jest.fn().mockResolvedValue([]);
      (makeNativePools as any).mockReturnValue({ getAll: mockGetAll });

      const limit = 10;
      const offset = 0;
      // Act: Call the method under test
      await ergo['getPoolData'](limit, offset);

      // Assert: Ensure makeNativePools and getAll were called with correct parameters
      expect(makeNativePools).toHaveBeenCalledWith(ergo['_explorer']);
      expect(mockGetAll).toHaveBeenCalledWith({ limit, offset });
    });

    it('Should return the data from getAll method', async () => {
      const expectedData = [{ id: 1, name: 'Pool 1' }];
      const mockGetAll = jest.fn().mockResolvedValue(expectedData);
      (makeNativePools as any).mockReturnValue({ getAll: mockGetAll });
      const limit = 10;
      const offset = 0;
      // Act: Call the method under test
      const result = await ergo['getPoolData'](limit, offset);
      // Assert: Verify the method returns expected data
      expect(result).toEqual(expectedData[0]);
    });

    it('Should handle errors from getAll method', async () => {
      // Arrange: Mock getAll method to simulate error
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
    it('Should return the stored asset list', () => {
      // Arrange: Create mock assets and populate _assetMap
      const asset1: ErgoAsset = 1 as any;
      const asset2: ErgoAsset = 2 as any;
      const assetMap = {
        key1: asset1,
        key2: asset2,
      };

      // Act: Set _assetMap directly
      ergo['_assetMap'] = assetMap;
      // Assert: Validate the stored asset list returned by storedAssetList
      expect(ergo.storedTokenList).toEqual(assetMap);
    });
  });

  describe('swap', () => {
    const account: any = {};
    const baseToken: string = 'baseToken';
    const quoteToken: string = 'quoteToken';
    const amount: BigNumber = BigNumber(10);
    const output_address: string = 'output_address';
    const return_address: string = 'return_address';
    // const slippage: number =
    beforeEach(() => {
      jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
    });
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
              id: 'xId',
              name: 'xName',
              decimals: 9,
            },
            amount: BigInt(752313805260857),
          };
        },
        asset: {
          id: 'xId',
          name: 'xName',
          decimals: 9,
        },
      },
      y: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'yId',
              name: 'yName',
              decimals: 3,
            },
            amount: BigInt(9322283969),
          };
        },
        asset: {
          id: 'yId',
          name: 'yName',
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
              id: 'xId',
              name: 'xName',
              decimals: 9,
            },
            amount: BigInt(752313805260857),
          };
        },
        asset: {
          id: 'xId',
          name: 'xName',
          decimals: 9,
        },
      },
      y: {
        withAmount: (_sth: any) => {
          return {
            asset: {
              id: 'yId',
              name: 'yName',
              decimals: 3,
            },
            amount: BigInt(9322283969),
          };
        },
        asset: {
          id: 'yId',
          name: 'yName',
          decimals: 3,
        },
      },
      outputAmount: (_sth: any, _slippage: any) => {
        return {
          amount: BigInt(1),
        };
      },
    };

    it('Shoukd be defined', () => {
      expect(ergo.swap).toBeDefined();
    });
    it('Should throw new Error if pool is not found base on baseToken and quoteToken', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue(null as any);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          amount,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`pool not found base on ${baseToken}, ${quoteToken}`);
    });

    it(`Should throw new Error if 'from.amount === 0' and sell is 'true'`, async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue(poolWithOutputAmount0);
      patchGetErgoConfig('mainnet');
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          amount,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`${amount} asset from xId is not enough!`);
    });
    it(`Should throw new Error if 'from.amount === 0' and sell is 'false'`, async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue(poolWithOutputAmount0);
      patchGetErgoConfig('mainnet');
      // to set sell false
      const baseToken = 'xId';
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          amount,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`${amount} asset from yId is not enough!`);
    });

    it('Should throw new Error if swapVariables are undefined', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue(pool);
      jest
        .spyOn(BigNumber.prototype, 'multipliedBy')
        .mockReturnValue(BigNumber(2));
      // jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
      patchGetErgoConfig('mainnet');
      jest
        .spyOn(ergo_utils, 'getBaseInputParameters')
        .mockReturnValue({} as any);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          amount,
          output_address,
          return_address,
        ),
      ).rejects.toThrow('error in swap vars!');
    });
    it('Should throw new Error if output_address is not defined', async () => {
      jest.spyOn(ergo, 'getPoolByToken').mockReturnValue(pool);
      jest
        .spyOn(BigNumber.prototype, 'multipliedBy')
        .mockReturnValue(BigNumber(2));
      // jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
      patchGetErgoConfig('mainnet');
      jest.spyOn(ergo_utils, 'getBaseInputParameters').mockReturnValue({
        baseInput: BigNumber(1),
        baseInputAmount: BigNumber(1),
        minOutput: {},
      } as any);
      jest.spyOn(ergo_utils, 'getInputs').mockReturnValue({} as any);
      await expect(
        ergo.swap(
          account,
          baseToken,
          quoteToken,
          amount,
          output_address,
          return_address,
        ),
      ).rejects.toThrow(`output_address is not defined.`);
    });
  });
});
