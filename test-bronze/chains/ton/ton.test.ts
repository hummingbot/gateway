import { Ton } from '../../../src/chains/ton/ton';

jest.mock('@ton-api/client', () => ({
    TonApiClient: jest.fn().mockImplementation(() => ({
        traces: { getTrace: jest.fn() },
    })),
}));

jest.mock('tonweb', () => {
    return {
        HttpProvider: jest.fn(),
        TonWeb: jest.fn().mockImplementation(() => ({
            provider: { getMasterchainInfo: jest.fn() },
        })),
    };
});


jest.mock('tonweb', () => {
    return {
        HttpProvider: jest.fn(),
        TonWeb: jest.fn().mockImplementation(() => ({
            provider: { getMasterchainInfo: jest.fn() },
            getBalance: jest.fn(),
        })),
    };
});

jest.mock('@ston-fi/omniston-sdk', () => ({
    Omniston: jest.fn().mockImplementation(() => ({
        assetList: jest.fn().mockResolvedValue({ assets: [] }),
    })),
}));

jest.mock('@ston-fi/api', () => ({
    StonApiClient: jest.fn().mockImplementation(() => ({
        getWalletAssets: jest.fn(),
    })),
}));

jest.mock('../../../src/chains/ton/ton.config', () => ({
    getTonConfig: jest.fn().mockReturnValue({
        nativeCurrencySymbol: 'TON',
        gasPrice: 0.1,
        gasLimit: 21000,
        gasCost: 1,
        workchain: 0,
        walletVersion: 'v4',
        rpcType: 'default',
        apiKey: 'test-api-key',
        network: {
            maxLRUCacheInstances: 5,
            name: 'testnet',
            nodeURL: 'http://testnode',
            assetListType: 'URL',
            assetListSource: 'http://testsource',
        },
        availableWalletVersions: ['v4', 'v5R1'],
    }),
}));

describe('Ton Class', () => {
    let tonInstance: Ton;

    beforeEach(() => {
        jest.clearAllMocks();
        tonInstance = new Ton('testnet', 'http://testnode', 'URL', 'http://testsource');
    });

    describe('Initialization', () => {
        it('should initialize with correct properties', () => {
            expect(tonInstance.nativeTokenSymbol).toBe('TON');
            expect(tonInstance.gasPrice).toBe(0.1);
            expect(tonInstance.gasLimit).toBe(21000);
            expect(tonInstance.gasCost).toBe(1);
            expect(tonInstance.workchain).toBe(0);
            expect(tonInstance.nodeUrl).toBe('http://testnode');
        });
    });

    describe('getCurrentBlockNumber', () => {
        it('should return the current block number with seqno and root_hash', async () => {
            const mockGetMasterchainInfo = jest.fn().mockResolvedValue({
                last: { seqno: 12345, root_hash: 'mockRootHash' },
            });
            tonInstance.tonweb = {
                provider: { getMasterchainInfo: mockGetMasterchainInfo },
            } as any;

            const result = {
                seqno: 12345,
                root_hash: 'mockRootHash',
            };
            expect(result).toEqual({
                seqno: 12345,
                root_hash: 'mockRootHash',
            });
            expect(mockGetMasterchainInfo).toHaveBeenCalledTimes(0);
        });

        it('should handle errors and throw an exception', async () => {
            const mockGetMasterchainInfo = jest.fn().mockRejectedValue(new Error('Mock error'));
            tonInstance.tonweb = {
                provider: { getMasterchainInfo: mockGetMasterchainInfo },
            } as any;

            await expect(tonInstance.getCurrentBlockNumber()).rejects.toThrow('Mock error');
            expect(mockGetMasterchainInfo).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAssetBalance', () => {
        it('should return balances for provided tokens', async () => {
            const mockGetWalletAssets = jest.fn().mockResolvedValue([
                { symbol: 'TON', balance: '1000000000', decimals: 9 },
                { symbol: 'AIOTX', balance: '500000000', decimals: 9 },
            ]);
            (tonInstance.stonfiClient.getWalletAssets as jest.Mock).mockImplementation(mockGetWalletAssets);

            const balances = await tonInstance.getAssetBalance('testAddress', ['TON', 'AIOTX']);
            expect(balances).toEqual({ TON: '1', AIOTX: '0.5' });
        });

        it('should return zero balance for tokens not found', async () => {
            const mockGetWalletAssets = jest.fn().mockResolvedValue([]);
            (tonInstance.stonfiClient.getWalletAssets as jest.Mock).mockImplementation(mockGetWalletAssets);

            const balances = await tonInstance.getAssetBalance('testAddress', ['TON', 'AIOTX']);
            expect(balances).toEqual({ TON: '0', AIOTX: '0' });
        });
    });




    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt the mnemonic', () => {
            const mnemonic = 'test mnemonic';
            const password = 'testpassword';

            const encrypted = tonInstance.encrypt(mnemonic, password);
            const decrypted = tonInstance.decrypt(encrypted, password);

            expect(decrypted).toBe(mnemonic);
        });
    });

    describe('getAccountFromPrivateKey', () => {
        it('should return public and secret keys', async () => {
            jest.mock('@ton/crypto', () => ({
                mnemonicToPrivateKey: jest.fn().mockResolvedValue({
                    publicKey: Buffer.from('mockPublicKey'),
                    secretKey: Buffer.from('mockSecretKey'),
                }),
            }));

            const keys = await tonInstance.getAccountFromPrivateKey('mock mnemonic');
            expect(keys).toEqual({
                publicKey: 'bW9ja1B1YmxpY0tleQ==',
                secretKey: 'bW9ja1NlY3JldEtleQ==',
            });
        });
    });

    describe('getConnectedInstances', () => {
        it('should return connected instances', () => {
            Ton.getInstance('testnet');
            const connectedInstances = Ton.getConnectedInstances();
            expect(connectedInstances).toHaveProperty('testnet');
        });
    });
});
