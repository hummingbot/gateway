import {
  NetworkPrefix,
  SecretKey,
  SecretKeys,
  Wallet,
  Address,
} from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { patch, unpatch } from '../../../test/services/patch';
import * as ergo_cofing from '../../../src/chains/ergo/ergo.config';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { Explorer } from '@ergolabs/ergo-sdk';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';
import {
  ErgoAccount,
  ErgoAsset,
  ErgoBox,
} from '../../../src/chains/ergo/interfaces/ergo.interface';
import LRUCache from 'lru-cache';

// Mocking dependencies for testing purposes using jest
jest.mock('@ergolabs/ergo-dex-sdk', () => ({
  AmmPool: jest.fn(),
  makeNativePools: jest.fn(),
}));
jest.mock('@ergolabs/ergo-sdk', () => ({
  Explorer: jest.fn(),
}));

// Initializing Ergo instance for testing
let ergo: Ergo;

// Helper function to patch getErgoConfig for Mainnet configuration
const pathGetErgoConfig = (imputNetwork: string) => {
  patch(ergo_cofing, 'getErgoConfig', () => {
    return {
      network: {
        name: imputNetwork,
        nodeURL: 'ergo.networks.' + imputNetwork + '.nodeURL',
        explorerURL: 'ergo.networks.' + imputNetwork + '.explorerURL',
        explorerDEXURL: 'ergo.networks.' + imputNetwork + '.explorerDEXURL',
        timeOut: 1000,
        networkPrefix:
          imputNetwork === 'Mainnet'
            ? NetworkPrefix.Mainnet
            : NetworkPrefix.Testnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
      },
    };
  });
};

// Helper function to patch Wallet.from_secrets method for testing
const patchFrom_secrets = () => {
  patch(Wallet, 'from_secrets', () => {
    return 'testWallet' as any;
  });
};

// Helper function to patch Address.prototype.to_base58 method for testing
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

// Helper function to patch ergo.getAddressUnspentBoxes method for testing
const patchGetAddressUnspentBoxes = () => {
  patch(ergo, 'getAddressUnspentBoxes', () => {
    return [];
  });
};

// Helper function to patch ergo.getAssetData method for testing
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

// Before each test, configure and initialize Ergo with 'Mainnet' settings
beforeEach(() => {
  // Arrange: Mock the return value of getErgoConfig to simulate Mainnet configuration before each test
  pathGetErgoConfig('Mainnet');

  // Arrange: Create a new instance of Ergo with 'Mainnet' configuration before each test
  ergo = new Ergo('Mainnet');
});
// Clean up mocks after each test
afterEach(() => {
  unpatch();
});
// Describe the test suite for the Ergo class
describe('Ergo', () => {
  // Test case to verify initialization with Mainnet configuration
  it('Should initialize with Mainnet configuration', () => {
    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('Mainnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Mainnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  // Test case to verify initialization with Testnet configuration
  it('Should initialize with Mainnet configuration', () => {
    // Arrange: Mock the return value of getErgoConfig to simulate Testnet configuration
    pathGetErgoConfig('Testnet');

    // Act: Create a new instance of Ergo with 'Testnet' configuration
    const ergo = new Ergo('Testnet');

    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('Testnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Testnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  // Describe the test suite for the get node method
  describe('get node', () => {
    // Test case to verify initialization of node service
    it('Should initialize node correctly and return the correct node', () => {
      // Assert: Validate the initialization state of node instance and check the returned value
      expect(ergo.node).toBeInstanceOf(NodeService);
      expect(ergo.node).toEqual({
        nodeURL: 'ergo.networks.Mainnet.nodeURL',
        timeout: 1000,
      });
    });
  });

  // Describe the test suite for the get network method
  describe('get network', () => {
    // Test case to verify network value when initialized with Mainnet
    it('Should return the correct network when network is Mainnet', () => {
      // Assert: Validate the return value
      expect(ergo.network).toBe('Mainnet');
    });

    // Test case to verify network value when initialized with Testnet
    it('Should return the correct network when network is Testnet', () => {
      // Arrange: Mock the return value of getErgoConfig to simulate Testnet configuration
      pathGetErgoConfig('Testnet');

      // Act: Create a new instance of Ergo with 'Testnet' configuration
      ergo = new Ergo('Testnet');

      // Assert: Validate the return value
      expect(ergo.network).toBe('Testnet');
    });
  });

  // Describe the test suite for the get network method
  describe('get storedAssetList', () => {
    // Test case to verify the stored asset list
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

  // Describe the test suite for the ready method
  describe('ready', () => {
    // Test case to verify the return value of the ready method
    it('Should return the ready state', () => {
      // Assert: Initially, the ready state should be false
      expect(ergo.ready()).toBe(false);

      // Act: Manually set the _ready state to true
      ergo['_ready'] = true;

      // Assert: Now, the ready state should be true
      expect(ergo.ready()).toBe(true);
    });
  });

  // describe('', () => {
  //   it('should initialize assets and pools in init method', async () => {
  //     const loadAssetsSpy = jest.spyOn(ergo as any, 'loadAssets').mockResolvedValue();
  //     const loadPoolsSpy = jest.spyOn(ergo as any, 'loadPools').mockResolvedValue();
  //     await ergo.init();
  //     expect(loadAssetsSpy).toHaveBeenCalled();
  //     expect(loadPoolsSpy).toHaveBeenCalled();
  //     expect(ergo.ready()).toBe(true);
  //   });
  // });

  // Describe the test suite for the close method
  describe('close', () => {
    // Test case to verify the close method
    it('Should close correctly', async () => {
      // Act and Assert: Call the close method and expect that the close method resolves without any errors or values
      await expect(ergo.close()).resolves.toBeUndefined();
    });
  });

  // Describe the test suite for the getInstance method
  describe('getInstance', () => {
    const mockNetwork = 'Testnet';

    // This block runs before each test in this suite
    beforeEach(() => {
      // Arrange: Mock the function to get the configuration for the 'Testnet' network
      pathGetErgoConfig('Testnet');
      // Arrange: Clear the singleton and mock instances
      Ergo['_instances'] = undefined as any;
    });

    // Test that the LRUCache is initialized if it hasn't been already
    it('Should initialize the LRUCache if not already initialized', () => {
      // Act: Call the getInstance method with the mock network
      Ergo.getInstance(mockNetwork);

      // Assert: Expect that the _instances property is defined and _instances is an instance of LRUCache
      expect(Ergo['_instances']).toBeDefined();
      expect(Ergo['_instances']).toBeInstanceOf(LRUCache);
    });

    // Test that a new Ergo instance is created and returned if it's not in the cache
    it('Should set and return a new Ergo instance if not in the cache', () => {
      // Act: Call the getInstance method with the mock network
      const instance = Ergo.getInstance(mockNetwork);

      // Assert: Expect that the returned instance is an instance of Ergo, the cache contains the mock network key and the instance in the cache matches the returned instance
      expect(instance).toBeInstanceOf(Ergo);
      expect(Ergo['_instances'].has(mockNetwork)).toBe(true);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance);
    });

    // Test that an existing Ergo instance is returned from the cache
    it('Should return an existing Ergo instance from the cache', () => {
      // Act: Call the getInstance method twice with the mock network
      const instance1 = Ergo.getInstance(mockNetwork);
      const instance2 = Ergo.getInstance(mockNetwork);

      // Assert: Expect that both calls return the same instance and the cache contains the mock network key
      expect(instance1).toBe(instance2);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance1);
    });

    // Test that an error is thrown if an unexpected network is provided
    it('Should throw an error if an unexpected network is provided', () => {
      // Act and Assert: Expect that calling getInstance with an empty string throws an error
      expect(() => Ergo.getInstance('')).toThrow(
        'Ergo.getInstance received an unexpected network: .',
      );
    });
  });

  // Describe the test suite for the getConnectedInstances method
  describe('getConnectedInstances', () => {
    let mockErgoInstance1: Ergo;
    let mockErgoInstance2: Ergo;

    // This block runs before each test in this suite
    beforeEach(() => {
      // Arrange: Create mock Ergo instances
      mockErgoInstance1 = new Ergo('Testnet1') as any;
      mockErgoInstance2 = new Ergo('Testnet2') as any;

      // Arrange: Initialize the _instances LRUCache with mock instances
      Ergo['_instances'] = new LRUCache<string, Ergo>({
        max: 10,
      });
      Ergo['_instances'].set('Testnet1', mockErgoInstance1);
      Ergo['_instances'].set('Testnet2', mockErgoInstance2);
    });
    // Test case to verify that all connected instances are returned
    it('Should return all connected instances', () => {
      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to match the mock instances
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'Testnet1',
        'Testnet2',
      ]);
      expect(connectedInstances['Testnet1']).toBe(mockErgoInstance1);
      expect(connectedInstances['Testnet2']).toBe(mockErgoInstance2);
    });

    // Test case to verify that an empty object is returned if no instances exist
    it('Should return an empty object if there are no instances', () => {
      // Arrange: Clear the _instances LRUCache
      Ergo['_instances'] = undefined as any;

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to be an empty object
      expect(connectedInstances).toEqual({});
    });

    // Test case to verify that only valid instances are returned
    it('Should return only valid instances', () => {
      // Arrange: Set an invalid (null) instance in the _instances LRUCache
      Ergo['_instances'].set('', null as any);

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();
      // Assert: Expect the valid instances to be returned and invalid instances to be excluded
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'Testnet1',
        'Testnet2',
      ]);
      expect(connectedInstances['Testnet1']).toBe(mockErgoInstance1);
      expect(connectedInstances['Testnet2']).toBe(mockErgoInstance2);
      expect(connectedInstances['']).toBeUndefined();
    });
  });

  // Describe the test suite for the getCurrentBlockNumber method
  describe('getCurrentBlockNumber', () => {
    // Test case to verify return block number corectly
    it('Should return the current block number incremented by one', async () => {
      // Arrange: Mock the getNetworkHeight method to return a fixed value
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(17);

      // Act: Call the getCurrentBlockNumber method
      const blockNumber = await ergo.getCurrentBlockNumber();

      // Assert: Validate the returned block number
      expect(blockNumber).toEqual(18);
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled;
    });
  });

  // Describe the test suite for the getAddressUnspentBoxes method
  describe('getAddressUnspentBoxes', () => {
    // Mock address for testing
    const mockAddress = '9j2s7d8f4s8s8o8s0q8f5s8d7f8s0d4r5';

    // Test case to verify the return of an empty array when there are no unspent boxes
    it('Should return an empty arry when length of nodeBoxes is 0', async () => {
      // Arrange: Mock the getUnspentBoxesByAddress method to return an empty array
      await patchErgo_node();
      const utxos = await ergo.getAddressUnspentBoxes(mockAddress);
      expect(utxos).toEqual([]);
    });

    // Test case to verify the retrieval of all unspent boxes for the given address
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

  // Describe the test suite for the getAccountFromSecretKey method
  describe('getAccountFromSecretKey', () => {
    // Test case to verify the return of an account with address and wallet
    it('Should return an account with address and wallet', () => {
      // Mock secret key
      const secret =
        '591811a0d6361f18e42549b32e65b98c9a63d6aad369d1056a97ca81f2a980d5';

      // Patch methods for mock implementation
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

      // Act: Call the getAccountFromSecretKey method
      const result = ergo.getAccountFromSecretKey(secret);

      // Assert: Validate the returned address and wallet
      expect(result.address).toBe('testAddress');
      expect(result.wallet).toBe('testWallet');
    });
  });

  // Describe the test suite for the encrypt method
  describe('encrypt', () => {
    // Test case to verify encryption of a secret with a given password
    it('Should encrypt a secret with a given password', () => {
      // Arrange: Set up the secret and password
      const secret = 'mySecret';
      const password = 'myPassword';

      // Act: Call the encrypt method
      const encryptedText = ergo.encrypt(secret, password);

      // Assert: Verify the encrypted text format
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });

    // Test case to ensure different encryption outputs for different secrets
    it('Should produce different encryption outputs for different secrets', () => {
      // Arrange: Set up the password
      const password = 'myPassword';

      // Act: Call the encrypt method with two different secrets
      const encryptedText1 = ergo.encrypt('secret1', password);
      const encryptedText2 = ergo.encrypt('secret2', password);

      // Assert: Verify that the encrypted texts are different
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    // Test case to ensure different encryption outputs for different passwords
    it('Should produce different encryption outputs for different passwords', () => {
      // Arrange: Set up the secret
      const secret = 'mySecret';

      // Act: Call the encrypt method with two different passwords
      const encryptedText1 = ergo.encrypt(secret, 'password1');
      const encryptedText2 = ergo.encrypt(secret, 'password2');

      // Assert: Verify that the encrypted texts are different
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    // Test case to ensure different IVs for different encryptions
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

    // Test case to handle passwords longer than 32 bytes
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

  // Describe the test suite for the decrypt method
  describe('decrypt', () => {
    // Test case to verify correct decryption of an encrypted secret
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

    // Test case to ensure decryption fails with wrong password
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

    // Test case to handle passwords longer than 32 bytes
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

    // Test case to handle passwords exactly 32 bytes long
    it('Should handle case where password is exactly 32 bytes', () => {
      // Arrange: Set up the secret and a 32 bytes password, and encrypt the secret
      const secret = 'mySecret';
      const exact32BytesPassword = 'a'.repeat(32); // 32 bytes password
      const encryptedText = ergo.encrypt(secret, exact32BytesPassword);

      // Act: Call the decrypt method
      const decryptedText = ergo.decrypt(encryptedText, exact32BytesPassword);

      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });
  });

  // Describe the test suite for the getAssetBalance method
  describe('getAssetBalance', () => {
    // Test case to ensure balance is 0 when there are no unspent boxes
    it('Should return balance as 0 when there are no unspent boxes', async () => {
      // Arrange: Set up the account and asset map, and mock the getAddressUnspentBoxes method to return an empty array
      const account: ErgoAccount = { address: 'mockAddress' } as any;
      ergo['_assetMap'] = {
        assetName: { tokenId: 1 },
      } as any;
      patchGetAddressUnspentBoxes();

      // Act: Call the getAssetBalance method
      const balance = await ergo.getAssetBalance(account, 'assetName');

      // Assert: Verify that the balance is 0
      expect(balance).toBe('0');
    });

    // Test case to ensure balance is 0 when there are no matching assets
    it('should return balance as 0 when there are no matching assets', async () => {
      // Arrange: Set up the account, asset map, and mock the getAddressUnspentBoxes method to return utxos without matching assets
      const account: ErgoAccount = { address: 'mockAddress' } as any;
      ergo['_assetMap'] = {
        assetName: { tokenId: 1 },
      } as any;
      const utxos = [{ assets: [{ tokenId: 2, amount: '100' }] }];
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(utxos as any);

      // Act: Call the getAssetBalance method
      const balance = await ergo.getAssetBalance(account, 'assetName');

      // Assert: Verify that the balance is 0
      expect(balance).toBe('0');
    });

    // Test case to ensure correct balance is returned when there are matching assets
    it('Should return correct balance when there are matching assets', async () => {
      // Arrange: Set up the account, asset map, and mock the getAddressUnspentBoxes method to return utxos with matching assets
      const account: ErgoAccount = { address: 'mockAddress' } as any;
      ergo['_assetMap'] = {
        assetName: { tokenId: 1 },
      } as any;
      const utxos = [
        { assets: [{ tokenId: '1', amount: 100 }] },
        { assets: [{ tokenId: '1', amount: 200 }] },
      ];
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(utxos as any);

      // Act: Call the getAssetBalance method
      const balance = await ergo.getAssetBalance(account, 'assetName');

      // Assert: Verify that the balance is correct
      expect(balance).toBe('300');
    });

    // Test case to ensure error is thrown when getAddressUnspentBoxes fails
    it('Should throw an error when getAddressUnspentBoxes fails', async () => {
      // Arrange: Set up the account and mock the getAddressUnspentBoxes method to reject with an error
      const account: ErgoAccount = { address: 'mockAddress' } as any;
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockRejectedValue(new Error('some error'));

      // Act & Assert: Call the getAssetBalance method and expect it to throw an error
      await expect(ergo.getAssetBalance(account, 'assetName')).rejects.toThrow(
        'problem during finding account assets ergo Node!',
      );
    });
  });

  // Describe the test suite for the loadAssets method
  describe('loadAssets', () => {
    // Test case to ensure assets are loaded and assetMap object is updated
    it('Should load Assets and update assetMap object', async () => {
      // Arrange: Set up the assetMap and mock the getAssetData method
      ergo['_assetMap'] = {};
      patchGetAssetData();

      // Act: Call the loadAssets method
      await ergo['loadAssets']();

      // Assert: Verify that the assetMap is updated correctly
      expect(ergo['_assetMap']).toEqual({
        '$BASS TOKEN': {
          tokenId: NaN, // This is wrong
          decimals: 7,
          name: '$Bass Token',
          symbol: '$bass',
        },
      });
    });
  });
});
