import { TonController } from '../../../src/chains/ton/ton.controller';
import { Ton } from '../../../src/chains/ton/ton';
import { patch } from '../../../test/services/patch';
import {
    AssetsRequest,
    PollRequest,
    OptInRequest,
} from '../../../src/chains/ton/ton.requests';
import {
    TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../../src/services/error-handler';

export interface BalanceRequest {
    chain: string;
    network: string;
    address: string;
    tokenSymbols: string[];
}

let ton: Ton;

const NETWORK = 'testnet';
const MOCK_TX_HASH = 'mock-tx-hash';
const MOCK_ADDRESS = 'mock-address';
const MOCK_ASSET_SYMBOL = 'TON';

beforeAll(async () => {
    ton = Ton.getInstance(NETWORK);
    patch(ton, 'getCurrentBlockNumber', async () => ({
        seqno: 100,
    }));
    patch(ton, 'getTransaction', async (_txHash: string) => ({
        transaction: {
            block: '(0,0,200)',
            totalFees: '1000000000',
        },
        txHash: MOCK_TX_HASH,
    }));
    patch(ton, 'getAccountFromAddress', async () => ({
        publicKey: 'mock-public-key',
        secretKey: 'mock-secret-key',
    }));
    patch(ton, 'getAssetBalance', async () => ({
        TON: '1000',
        USDC: '500',
    }));
    patch(ton, 'getAssetForSymbol', (symbol: string) => {
        console.log(`Mocked getAssetForSymbol called with symbol: ${symbol}`);
        if (symbol === MOCK_ASSET_SYMBOL) {
            return { assetId: { address: 'mock-asset-address' }, decimals: 9 };
        }
        return null;
    });
    patch(ton, 'storedAssetList', () => [
        {
            assetId: { address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', blockchain: 607 },
            symbol: 'TON',
            decimals: 9,
        },
        {
            assetId: { address: 'kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di', blockchain: 607 },
            symbol: 'AIOTX',
            decimals: 9,
        },
    ]);
    patch(ton, 'optIn', async () => ({ txnID: 'mock-txn-id' }));

    await ton.init();
});

// beforeEach(() => {
//     unpatch();
// });
//
// afterEach(() => {
//     unpatch();
// });

describe('TonController - poll', () => {
    // TXHASH UNDEFINED
    // it('Should return poll response for a valid transaction', async () => {
    //     const req: PollRequest = {
    //         txHash: MOCK_TX_HASH,
    //         network: NETWORK,
    //     };
    //
    //     const response = await TonController.poll(ton, req);
    //     expect(response).toHaveProperty('currentBlock', 100);
    //     expect(response).toHaveProperty('txBlock', 200);
    //     expect(response).toHaveProperty('txHash', MOCK_TX_HASH);
    //     expect(response).toHaveProperty('fee', 1);
    // });

    it('Should throw an error if transaction is not found', async () => {
        patch(ton, 'getTransaction', async () => null);

        const req: PollRequest = {
            txHash: MOCK_TX_HASH,
            network: NETWORK,
        };

        await expect(TonController.poll(ton, req)).rejects.toThrow('No transaction');
    });
});

describe('TonController - balances', () => {
    it('Should return balances for a valid address', async () => {
        const req: BalanceRequest = {
            chain: 'ton',
            network: NETWORK,
            address: MOCK_ADDRESS,
            tokenSymbols: ['TON', 'USDC'],
        };

        const response = await TonController.balances(ton, req);
        expect(response).toHaveProperty('balances');
        expect(response.balances).toEqual({ TON: '1000', USDC: '500' });
    });
});

describe('TonController - getTokens', () => {
    it('Should return all tokens when no symbols are specified', async () => {
        const req: AssetsRequest = {
            network: NETWORK,
        };
        const response = await TonController.getTokens(ton, req);
        expect(response).toHaveProperty('assets');
        expect(response.assets).toEqual([
            {
                assetId: {
                    address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
                    blockchain: 607,
                },
                symbol: 'TON',
                decimals: 9,
            },
            {
                assetId: {
                    address: 'kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di',
                    blockchain: 607,
                },
                symbol: 'AIOTX',
                decimals: 9,
            },
        ]);
    });

    it('Should return specific tokens when symbols are specified', async () => {
        const req: AssetsRequest = {
            network: NETWORK,
            assetSymbols: ['TON'],
        };

        const response = await TonController.getTokens(ton, req);
        expect(response).toHaveProperty('assets');
        expect(response.assets).toEqual([
            { assetId: { address: 'mock-asset-address' }, decimals: 9 },
        ]);
    });

    it('Should throw an error for unsupported symbols', async () => {
        patch(ton, 'getAssetForSymbol', (symbol: string) => {
            return null;
        });

        const req: AssetsRequest = {
            network: NETWORK,
            assetSymbols: ['INVALID'],
        };

        await expect(TonController.getTokens(ton, req)).rejects.toThrow('Unsupported symbol: INVALID');
    });
});

describe('TonController - approve', () => {
    it('Should return transaction response for a valid opt-in request', async () => {
        const req: OptInRequest = {
            network: NETWORK,
            address: MOCK_ADDRESS,
            assetSymbol: MOCK_ASSET_SYMBOL,
        };

        const response = await TonController.approve(req);
        expect(response).toHaveProperty('assetId');
        expect(response.assetId).toEqual({ address: 'mock-asset-address' });
        expect(response).toHaveProperty('transactionResponse');
        expect(response.transactionResponse).toHaveProperty('txnID', 'mock-txn-id');
    });

    it('Should throw an error if the asset is not supported', async () => {
        patch(ton, 'getAssetForSymbol', () => undefined);

        const req: OptInRequest = {
            network: NETWORK,
            address: MOCK_ADDRESS,
            assetSymbol: 'INVALID',
        };

        await expect(TonController.approve(req)).rejects.toThrow(
            TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + 'INVALID'
        );
    });
});
