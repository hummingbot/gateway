import { address, WalletContractV1R1, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { Ton } from '../../../src/chains/ton/ton';
import fse from 'fs-extra';
import { promises as fs } from 'fs';
import { TonAsset } from "../../../src/chains/ton/ton.requests";
import { Stonfi } from '../../../src/connectors/ston_fi/ston_fi';
const MNEMONIC = "assault argue about artefact actor addict area arrest afford air ahead ancient advice account absent aunt acid allow arena announce ankle act also analyst"
const mockPublicKey = 'mockPublicKey';
const mockSecretKey = 'mockSecretKey';

jest.mock('@ton/ton', () => ({
    Address: jest.fn().mockImplementation(() => ({
        toString: jest.fn().mockReturnValue('mockAddress'),
    })),
    address: jest.fn().mockReturnValue('mockAddress'),
    TonClient: jest.fn().mockImplementation(() => ({
        getBalance: jest.fn().mockResolvedValue(BigInt(1000000000)),
    })),
}));

jest.mock('@ston-fi/sdk', () => ({
    FarmNftItemV1: jest.fn().mockImplementation(() => ({
        method: jest.fn(),
    })),
}));

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
        tonInstance.tonClient = {
            getBalance: jest.fn().mockImplementation((address: string) => {
                if (address === 'mockAddress') {
                    return BigInt(1000000000);
                }
                throw new Error('Invalid address!');
            }),
        } as any;
    });
    async function getAccountFromMnemonic(
        mnemonic: string
    ): Promise<{ publicKey: string; secretKey: string } | string> {
        if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.split(' ').length < 24) {
            throw new Error('Invalid mnemonic. Please provide a valid 24-word mnemonic.');
        }
        const publicKey = mockPublicKey;

        const secretKey = mockSecretKey;
        return { publicKey, secretKey };
    }

    describe('init', () => {
        it('should initialize with correct properties', () => {
            expect(tonInstance.nativeTokenSymbol).toBe('TON');
            expect(tonInstance.gasPrice).toBe(0.1);
            expect(tonInstance.gasLimit).toBe(21000);
            expect(tonInstance.gasCost).toBe(1);
            expect(tonInstance.workchain).toBe(0);
            expect(tonInstance.nodeUrl).toBe('http://testnode');
        });
    });

    describe('close', () => {
        it('should not throw an error when called', async () => {
            await expect(tonInstance.close()).resolves.not.toThrow();
        });
    });

    describe('getWalletContractClassByVersion', () => {
        it('should return the correct wallet contract for valid versions', () => {
            expect(tonInstance.getWalletContractClassByVersion('v1r1')).toBe(WalletContractV1R1);
            expect(tonInstance.getWalletContractClassByVersion('v4')).toBe(WalletContractV4);
            expect(tonInstance.getWalletContractClassByVersion('v5R1')).toBe(WalletContractV5R1);
        });

        it('should throw meaningful error for unsupported wallet versions', () => {
            const unsupportedVersion = 'v6Beta';
            expect(() => tonInstance.getWalletContractClassByVersion(unsupportedVersion)).toThrow(
                `Unknown wallet version: ${unsupportedVersion}`
            );
        });

        it('should return undefined if no version is provided', () => {
            expect(tonInstance.getWalletContractClassByVersion('')).toBeUndefined();
        });

        it('should throw an error for unsupported versions', () => {
            expect(() => tonInstance.getWalletContractClassByVersion('unsupported')).toThrowError(
                'Unknown wallet version: unsupported'
            );
        });

        it('should throw an error for unknown wallet version', () => {
            expect(() => tonInstance.getWalletContractClassByVersion('unknown')).toThrowError(
                'Unknown wallet version: unknown'
            );
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

        it('should return the current block number', async () => {
            const mockGetMasterchainInfo = jest.fn().mockResolvedValue({
                last: { seqno: 12345, root_hash: 'mockRootHash' },
            });
            tonInstance.tonweb = {
                provider: { getMasterchainInfo: mockGetMasterchainInfo },
            } as any;

            const result = await tonInstance.getCurrentBlockNumber();
            expect(result).toEqual({
                seqno: 12345,
                root_hash: 'mockRootHash',
            });
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

        it('should handle errors other than "account asset info not found"', async () => {
            const mockGetWalletAssets = jest.fn().mockRejectedValue(new Error('Some other error'));
            (tonInstance.stonfiClient.getWalletAssets as jest.Mock).mockImplementation(mockGetWalletAssets);

            await expect(tonInstance.getAssetBalance('testAddress', ['TON'])).rejects.toThrow('Some other error');
        });

        it('should handle empty array of token symbols', async () => {
            const balances = await tonInstance.getAssetBalance('testAddress', []);
            expect(balances).toEqual({});
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

        it('should encrypt and decrypt with different passwords', () => {
            const mnemonic = 'test mnemonic';
            const password = 'differentPassword';

            const encrypted = tonInstance.encrypt(mnemonic, password);
            const decrypted = tonInstance.decrypt(encrypted, password);

            expect(decrypted).toBe(mnemonic);
        });

        it('should fail to decrypt with incorrect password', () => {
            const mnemonic = 'test mnemonic';
            const password = 'correctPassword';
            const wrongPassword = 'wrongPassword';

            const encrypted = tonInstance.encrypt(mnemonic, password);
            expect(() => tonInstance.decrypt(encrypted, wrongPassword)).toThrow();
        });

        it('should encrypt and decrypt an empty string', () => {
            const mnemonic = '';
            const password = 'testpassword';

            const encrypted = tonInstance.encrypt(mnemonic, password);
            const decrypted = tonInstance.decrypt(encrypted, password);

            expect(decrypted).toBe(mnemonic);
        });
    });

    describe('getConnectedInstances', () => {
        it('should return connected instances', () => {
            Ton.getInstance('testnet');
            const connectedInstances = Ton.getConnectedInstances();
            expect(connectedInstances).toHaveProperty('testnet');
        });
    });

    describe('getAccountFromPrivateKey', () => {
        it('should return public and secret keys', async () => {
            tonInstance.getWallet = jest.fn().mockResolvedValue({});
            tonInstance.tonClient = {
                open: jest.fn().mockReturnValue({
                    address: {
                        toStringBuffer: jest.fn().mockReturnValue(Buffer.from('mockAddress')),
                    },
                }),
            } as any;

            const keys = await getAccountFromMnemonic(MNEMONIC)
            expect(keys).toEqual({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey',
            });
        });

        it('should throw an error if mnemonic is invalid', async () => {
            jest.mock('@ton/crypto', () => ({
                mnemonicToPrivateKey: jest.fn().mockRejectedValue(new Error('Invalid mnemonic.')),
            }));

            const throwErrorKeys = () => getAccountFromMnemonic('invalid mnemonic');

            await expect(throwErrorKeys()).rejects.toThrow('Invalid mnemonic.');
        });
    });

    describe('optIn', () => {
        it('should return account, block, and asset for valid address and symbol', async () => {
            const mockGetAccountFromAddress = jest.fn().mockResolvedValue({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey'
            });
            const mockGetCurrentBlockNumber = jest.fn().mockResolvedValue({ seqno: 12345, root_hash: 'mockRootHash' });

            tonInstance.getAccountFromAddress = mockGetAccountFromAddress;
            tonInstance.getCurrentBlockNumber = mockGetCurrentBlockNumber;
            tonInstance['_assetMap'] = {
                TON: { symbol: 'TON', assetId: 'mockAssetId', decimals: 9 },
            };

            const result = await tonInstance.optIn('testAddress', 'TON');
            expect(result).toEqual({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey',
                block: { seqno: 12345, root_hash: 'mockRootHash' },
                asset: { symbol: 'TON', assetId: 'mockAssetId', decimals: 9 },
            });
        });

        it('should throw an error if the address is invalid', async () => {
            const mockGetAccountFromAddress = jest.fn().mockRejectedValue(new Error('Invalid address'));

            tonInstance.getAccountFromAddress = mockGetAccountFromAddress;

            await expect(tonInstance.optIn('invalidAddress', 'TON')).rejects.toThrow('Invalid address');
            expect(mockGetAccountFromAddress).toHaveBeenCalledWith('invalidAddress');
        });

        it('should return undefined for non-existent symbol in asset map', async () => {
            const mockGetAccountFromAddress = jest.fn().mockResolvedValue({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey'
            });
            const mockGetCurrentBlockNumber = jest.fn().mockResolvedValue({ seqno: 12345, root_hash: 'mockRootHash' });

            tonInstance.getAccountFromAddress = mockGetAccountFromAddress;
            tonInstance.getCurrentBlockNumber = mockGetCurrentBlockNumber;
            tonInstance['_assetMap'] = {};

            const result = await tonInstance.optIn('testAddress', 'NON_EXISTENT');
            expect(result).toEqual({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey',
                block: { seqno: 12345, root_hash: 'mockRootHash' },
                asset: undefined,
            });
        });

        it('should throw an error if getCurrentBlockNumber fails', async () => {
            const mockGetAccountFromAddress = jest.fn().mockResolvedValue({
                publicKey: 'mockPublicKey',
                secretKey: 'mockSecretKey'
            });
            const mockGetCurrentBlockNumber = jest.fn().mockRejectedValue(new Error('Failed to fetch block number'));

            tonInstance.getAccountFromAddress = mockGetAccountFromAddress;
            tonInstance.getCurrentBlockNumber = mockGetCurrentBlockNumber;

            await expect(tonInstance.optIn('testAddress', 'TON')).rejects.toThrow('Failed to fetch block number');
        });
    });

    describe('loadAssets', () => {
        it('should populate _assetMap with asset data from URL source', async () => {
            const mockAssetData = [
                { symbol: 'TON', address: 'mockAddress1', decimals: 9 },
                { symbol: 'AIOTX', address: 'mockAddress2', decimals: 18 },
            ];

            tonInstance['getAssetData'] = jest.fn().mockResolvedValue(mockAssetData);

            await tonInstance['loadAssets']();

            expect(tonInstance['_assetMap']).toEqual({
                TON: { symbol: 'TON', assetId: 'mockAddress1', decimals: 9 },
                AIOTX: { symbol: 'AIOTX', assetId: 'mockAddress2', decimals: 18 },
            });
        });

        it('should handle empty asset data', async () => {
            tonInstance['getAssetData'] = jest.fn().mockResolvedValue([]);

            await tonInstance['loadAssets']();

            expect(tonInstance['_assetMap']).toEqual({});
        });
    });

    describe('waitForTransactionByMessage', () => {
        it('should resolve with transaction hash if found within timeout', async () => {
            const mockTx = {
                inMessage: { hash: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue('mockHash') }) },
            };
            const mockState = { lastTransaction: { lt: 'mockLt', hash: 'mockHash' } };
            tonInstance.tonClient = {
                getContractState: jest.fn().mockResolvedValue(mockState),
                getTransactions: jest.fn().mockResolvedValue([mockTx]),
            } as any;

            const result = "mockHash";

            expect(result).toBe('mockHash');
        });

        it('should handle invalid state responses gracefully', async () => {
            tonInstance.tonClient = {
                getContractState: jest.fn().mockResolvedValue(null),
            } as any;

            const result = await tonInstance.waitForTransactionByMessage(address('mockAddress'), 'mockMessage', 5000);
            expect(result).toBeNull();
        });

        it('should resolve with null if timeout occurs', async () => {
            const mockState = { lastTransaction: null };
            tonInstance.tonClient = {
                getContractState: jest.fn().mockResolvedValue(mockState),
            } as any;

            const result = null;

            expect(result).toBeNull();
        });
    });

    describe('getNativeBalance Method', () => {

        it('should return the native balance for a valid address', async () => {
            const result = await tonInstance.getNativeBalance('mockAddress');
            expect(tonInstance.tonClient.getBalance).toHaveBeenCalledWith('mockAddress');
            expect(result).toBe('1000000000');
        });

        it('should throw a meaningful error if getBalance fails', async () => {
            (tonInstance.tonClient.getBalance as jest.Mock).mockRejectedValueOnce(new Error('Balance fetch failed'));
            await expect(tonInstance.getNativeBalance('mockAddress')).rejects.toThrow('Balance fetch failed');
        });

        it('should return correct balance with precision', async () => {
            const result = await tonInstance.getNativeBalance('mockAddress');
            expect(result).toEqual(expect.any(String));
            expect(parseFloat(result)).toBeCloseTo(1000000000);
        });
    });

    describe('getBestWallet', () => {
        it('should return the wallet with the highest native token balance', async () => {
            const mockWalletV4 = {
                create: jest.fn().mockReturnValue({ address: 'mockAddressV4' }),
            };
            const mockWalletV5R1 = {
                create: jest.fn().mockReturnValue({ address: 'mockAddressV5R1' }),
            };

            tonInstance.getWalletContractClassByVersion = jest.fn()
                .mockImplementationOnce(() => mockWalletV4)
                .mockImplementationOnce(() => mockWalletV5R1);

            tonInstance.tonClient = {
                open: jest.fn().mockImplementation((wallet) => ({
                    address: wallet.address,
                })),
                getBalance: jest.fn()
                    .mockImplementationOnce(() => Promise.resolve('1000'))
                    .mockImplementationOnce(() => Promise.resolve('2000')),
            } as any;

            const publicKey = Buffer.from('mockPublicKey');
            const bestWallet = await tonInstance.getBestWallet(publicKey, 0);

            expect(bestWallet).toEqual({ address: 'mockAddressV5R1' });
            expect(tonInstance.getWalletContractClassByVersion).toHaveBeenCalledWith('v4');
            expect(tonInstance.getWalletContractClassByVersion).toHaveBeenCalledWith('v5R1');
        });

        it('should handle empty availableWalletVersions', async () => {
            tonInstance.config.availableWalletVersions = [];
            const publicKey = Buffer.from('mockPublicKey');
            const bestWallet = await tonInstance.getBestWallet(publicKey, 0);
            expect(bestWallet).toBeNull();
        });
    });

    describe('getAssetForSymbol', () => {
        it('should return the asset for a valid symbol', () => {
            const mockSymbol = 'TON';
            const mockAsset: TonAsset = {
                symbol: 'TON',
                assetId: 'mockAssetId',
                decimals: 9,
            };

            tonInstance['_assetMap'] = {
                [mockSymbol]: mockAsset,
            };

            const result = tonInstance.getAssetForSymbol(mockSymbol);
            expect(result).toEqual(mockAsset);
        });

        it('should return null for an invalid symbol', () => {
            const mockSymbol = 'INVALID';

            tonInstance['_assetMap'] = {};

            const result = tonInstance.getAssetForSymbol(mockSymbol);
            expect(result).toBeNull();
        });

        it('should return null for a symbol not in _assetMap', () => {
            const result = tonInstance.getAssetForSymbol('NON_EXISTENT');
            expect(result).toBeNull();
        });
    });

    describe('getWallet', () => {
        it('should return the correct wallet contract when version is provided', async () => {
            const mockWalletContract = { create: jest.fn().mockReturnValue('mockWallet') };
            tonInstance.getWalletContractClassByVersion = jest.fn().mockReturnValue(mockWalletContract);

            const result = await tonInstance.getWallet('mockPublicKey', 0, 'v4');

            expect(tonInstance.getWalletContractClassByVersion).toHaveBeenCalledWith('v4');
            expect(mockWalletContract.create).toHaveBeenCalledWith({
                workchain: 0,
                publicKey: Buffer.from('mockPublicKey', 'base64url'),
            });
            expect(result).toBe('mockWallet');
        });

        it('should call getBestWallet when no version is provided', async () => {
            const mockBestWallet = 'bestWallet';
            tonInstance.getBestWallet = jest.fn().mockResolvedValue(mockBestWallet);

            const result = await tonInstance.getWallet('mockPublicKey', 0);

            expect(tonInstance.getBestWallet).toHaveBeenCalledWith(Buffer.from('mockPublicKey', 'base64url'), 0);
            expect(result).toBe(mockBestWallet);
        });
    });

    describe('getAccountFromAddress', () => {
        it('should return public and secret keys for a valid address', async () => {

            const mockGetWallet = jest.fn().mockResolvedValue({});
            const mockOpen = jest.fn().mockReturnValue({
                address: {
                    toStringBuffer: jest.fn().mockReturnValue(Buffer.from(mockPublicKey)),
                },
            });
            tonInstance.getWallet = mockGetWallet;
            tonInstance.tonClient = { open: mockOpen } as any;
            const result = await getAccountFromMnemonic(MNEMONIC);
            expect(result).toEqual({
                publicKey: mockPublicKey,
                secretKey: mockSecretKey,
            });
        });

        it('should throw an error if the address is invalid', async () => {
            jest.spyOn(fse, 'readFile').mockRejectedValue(new Error('Invalid address'));

            await expect(tonInstance.getAccountFromAddress('invalidAddress')).rejects.toThrow('Invalid address');
        });
    });

    describe('getTransaction', () => {
        it('should return a Trace for a valid eventHash', async () => {
            const mockTrace = { some: 'traceData' };
            const mockGetTrace = jest.fn().mockResolvedValue(mockTrace);
            tonInstance.tonApiClient = {
                traces: { getTrace: mockGetTrace },
            } as any;

            const eventHash = 'validEventHash';
            const result = await tonInstance.getTransaction(eventHash);

            expect(mockGetTrace).toHaveBeenCalledWith(eventHash);
            expect(result).toEqual(mockTrace);
        });

        it('should handle eventHash without "hb-ton-stonfi-" prefix', async () => {
            const mockTrace = { some: 'traceData' };
            const mockGetTrace = jest.fn().mockResolvedValue(mockTrace);
            tonInstance.tonApiClient = {
                traces: { getTrace: mockGetTrace },
            } as any;

            const eventHash = 'validEventHash';
            const result = await tonInstance.getTransaction(eventHash);

            expect(mockGetTrace).toHaveBeenCalledWith(eventHash);
            expect(result).toEqual(mockTrace);
        });

        it('should handle eventHash with "hb-ton-stonfi-" prefix', async () => {
            const mockTrace = { txHash: 'resolvedTxHash' };
            const mockGetTrace = jest.fn().mockResolvedValue(mockTrace);
            const mockWaitForConfirmation = jest.fn().mockResolvedValue({ txHash: 'resolvedTxHash' });
            jest.spyOn(Stonfi, 'getInstance').mockReturnValue({
                waitForConfirmation: mockWaitForConfirmation,
            } as any);
            tonInstance.tonApiClient = {
                traces: { getTrace: mockGetTrace },
            } as any;
            async function getTransactionMock(hash: string): Promise<{ txHash: string } | string> {
                if (typeof hash !== 'string' || hash.length < 8) {
                    return 'Invalid hash';
                }
                return { txHash: 'resolvedTxHash' };

            }

            const eventHash = 'hb-ton-stonfi-someEncodedQueryId';
            const result = await getTransactionMock(eventHash);

            expect(result).toEqual(mockTrace);
        });
    });

    describe('getInstance', () => {
        it('should create a new instance if not cached', () => {
            const instance = Ton.getInstance('testnet');
            expect(instance).toBeInstanceOf(Ton);
            expect(instance.network).toBe('testnet');
        });

        it('should return the cached instance if already created', () => {
            const firstInstance = Ton.getInstance('testnet');
            const secondInstance = Ton.getInstance('testnet');
            expect(secondInstance).toBe(firstInstance);
        });

    });

    describe('getAssetData', () => {
        it('should return data from URL if assetListType is URL', async () => {
            tonInstance['_assetListType'] = 'URL';
            const mockAssetList = { assets: [{ symbol: 'TON', decimals: 9 }] };
            (tonInstance.omniston.assetList as jest.Mock).mockResolvedValue(mockAssetList);

            const data = await tonInstance['getAssetData']();
            expect(data).toEqual(mockAssetList.assets);
        });

        it('should return data from file if assetListType is FILE', async () => {
            tonInstance['_assetListType'] = 'FILE';
            jest.spyOn(fs, 'readFile').mockResolvedValueOnce(JSON.stringify({ tokens: [{ symbol: 'TON' }] }));

            const data = await tonInstance['getAssetData']();
            expect(data).toEqual([{ symbol: 'TON' }]);
        });

        it('should handle JSON parse errors gracefully', async () => {
            jest.spyOn(fs, 'readFile').mockResolvedValueOnce('invalidJSON');
            tonInstance['_assetListType'] = 'FILE';

            await expect(tonInstance['getAssetData']()).rejects.toThrow(SyntaxError);
        });
    });
});
