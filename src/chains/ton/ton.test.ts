import { Ton } from './ton';
import { TonApiClient } from '@ton-api/client';
import TonWeb from 'tonweb';
import { StonApiClient } from '@ston-fi/api';
import { Omniston } from '@ston-fi/omniston-sdk';
import { getTonConfig } from './ton.config';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import fse from 'fs-extra';
import { Address } from '@ton/ton';

jest.mock('@ton-api/client');
jest.mock('tonweb');
jest.mock('@ston-fi/api');
jest.mock('@ston-fi/omniston-sdk');
jest.mock('./ton.config');
jest.mock('../../services/config-manager-cert-passphrase');
jest.mock('fs-extra');

describe('Ton', () => {
    let ton: Ton;
    const network = 'testnet';
    const nodeUrl = 'http://mock.node.url';
    const assetListType = 'URL';
    const assetListSource = 'http://mock.asset.url';

    beforeEach(() => {
        jest.clearAllMocks();
        (getTonConfig as jest.Mock).mockReturnValue({
            nativeCurrencySymbol: 'TON',
            gasPrice: 1,
            gasLimit: 1,
            gasCost: 1,
            workchain: 0,
            network: {
                name: network,
                nodeURL: nodeUrl,
                assetListType,
                assetListSource,
                maxLRUCacheInstances: 10,
            },
            apiKey: 'mock-api-key',
            availableWalletVersions: ['v1r1', 'v2r1'],
        });
        ton = new Ton(network, nodeUrl, assetListType, assetListSource);
    });

    it('should initialize Ton instance correctly', async () => {
        expect(ton.nativeTokenSymbol).toBe('TON');
        expect(ton._network).toBe(network);
        expect(ton.nodeUrl).toBe(nodeUrl);
        expect(ton.config.apiKey).toBe('mock-api-key');
    });

    it('should initialize assets on init', async () => {
        const mockAssets = [{ symbol: 'TON', address: 'mock-address', decimals: 9 }];
        const omnistonInstance = Omniston as jest.MockedClass<typeof Omniston>;
        omnistonInstance.prototype.assetList.mockResolvedValue({ assets: mockAssets });

        await ton.init();

        expect(omnistonInstance.prototype.assetList).toHaveBeenCalledTimes(1);
        expect(ton._assetMap['TON']).toEqual({
            symbol: 'TON',
            assetId: 'mock-address',
            decimals: 9,
        });
    });

    it('should encrypt and decrypt mnemonic', () => {
        const mnemonic = 'mock mnemonic phrase';
        const password = 'mock-password';

        const encrypted = ton.encrypt(mnemonic, password);
        const decrypted = ton.decrypt(encrypted, password);

        expect(decrypted).toBe(mnemonic);
    });

    it('should fetch native balance', async () => {
        const mockBalance = 1000;
        const tonClientInstance = TonWeb.HttpProvider as jest.MockedClass<
            typeof TonWeb.HttpProvider
        >;
        tonClientInstance.prototype.getBalance.mockResolvedValue(mockBalance);

        const balance = await ton.getNativeBalance('mock-address');
        expect(balance).toBe(mockBalance.toString());
    });

    it('should handle asset balance fetching', async () => {
        const mockAssetsResponse = [
            { symbol: 'TOKEN1', balance: '1000', decimals: 2 },
        ];

        // Crie uma instância mockada de StonApiClient
        const stonClientInstance = new StonApiClient();

        // Use jest.spyOn para mockar o método na instância
        jest.spyOn(stonClientInstance, 'getWalletAssets').mockResolvedValue(mockAssetsResponse);

        // Substitua o stonfiClient da instância ton pela instância mockada
        (ton as any).stonfiClient = stonClientInstance;

        const balances = await ton.getAssetBalance('mock-account', ['TOKEN1', 'TOKEN2']);

        expect(balances['TOKEN1']).toBe('10'); // 1000 dividido por 10^2
        expect(balances['TOKEN2']).toBe('0');
    });

    it('should handle exceptions during asset fetching', async () => {
        const stonClientInstance = new StonApiClient();

        jest.spyOn(stonClientInstance, 'getWalletAssets').mockRejectedValue(
            new Error('account asset info not found'),
        );

        (ton as any).stonfiClient = stonClientInstance;

        const balances = await ton.getAssetBalance('mock-account', ['TOKEN1']);
        expect(balances['TOKEN1']).toBe('0');
    });

    it('should throw error if passphrase is missing during account retrieval', async () => {
        const passphraseMock = ConfigManagerCertPassphrase.readPassphrase as jest.Mock;
        passphraseMock.mockReturnValue(null);

        await expect(ton.getAccountFromAddress('mock-address')).rejects.toThrow(
            'missing passphrase',
        );
    });

    it('should retrieve transaction trace', async () => {
        const mockTrace = { txHash: 'mock-tx-hash' };
        const tonApiClientInstance = TonApiClient as jest.MockedClass<
            typeof TonApiClient
        >;
        tonApiClientInstance.prototype.traces.getTrace.mockResolvedValue(mockTrace);

        const trace = await ton.getTransaction('mock-event-hash');
        expect(trace).toEqual(mockTrace);
    });
});
