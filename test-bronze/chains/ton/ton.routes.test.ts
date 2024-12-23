const request = require('supertest');
import { gatewayApp } from '../../../src/app';
import { Ton } from '../../../src/chains/ton/ton';
import {
    patch,
    setUpTempDir,
    tearDownTempDir,
    unpatch,
} from '../../../test/services/patch';
import { getTonConfig } from '../../../src/chains/ton/ton.config';
import {
    NETWORK_ERROR_CODE,
    NETWORK_ERROR_MESSAGE,
    UNKNOWN_ERROR_ERROR_CODE,
} from '../../../src/services/error-handler';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';

let ton: Ton;
const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
const CHAIN_NAME = 'ton';
const NETWORK = 'testnet';
const CONFIG = getTonConfig(NETWORK);
const NATIVE_TOKEN = CONFIG.nativeCurrencySymbol;
const NATIVE_TOKEN_ID = 0;
const USDC_TOKEN = 'USDC';
const USDC_TOKEN_ID = 10458941;
const ACCOUNT_ADDRESS =
    'FJZ4AJ3EWSNV4PXULFTTT4R5PLMNASEIMWEK5H4EY6E67RGJNSEY7OZEMA'; // noqa: mock
const MNEUMONIC =
    'share' +
    ' general' +
    ' gasp' +
    ' trial' +
    ' until' +
    ' jelly' +
    ' mobile' +
    ' category' +
    ' viable' +
    ' meadow' +
    ' civil' +
    ' pigeon' +
    ' dream' +
    ' vehicle' +
    ' process' +
    ' crack' +
    ' devote' +
    ' outside' +
    ' ankle' +
    ' mobile' +
    ' analyst' +
    ' stomach' +
    ' dignity' +
    ' above' +
    ' vast'; // mock
const ALGO_DECIMALS = 6;
const USDC_DECIMALS = 6;

beforeAll(() => {
    ton = Ton.getInstance(NETWORK);

    // Mock the 'algod' property for compatibility
    (ton as any).algod = {
        status: jest.fn().mockReturnValue({
            do: async () => ({
                'next-version-round': 12345, // Mocked block number
            }),
        }),
        accountInformation: jest.fn(),
        accountAssetInformation: jest.fn(),
        sendRawTransaction: jest.fn(),
        getTransactionParams: jest.fn().mockReturnValue({
            do: async () => ({
                fee: 0,
                firstRound: 1,
                lastRound: 10,
                genesisID: 'test-genesis',
                genesisHash: 'test-hash',
            }),
        }),
    };
});


beforeEach(() => {
    setUpTempDir('ton-tests');
    // patchCurrentBlockNumber();
    patchCertPassphrase();
});

afterEach(() => {
    tearDownTempDir();
    unpatch();
});

const patchCertPassphrase = () => {
    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
};

// // const patchCurrentBlockNumber = (
// //     withError: boolean = false,
// //     instance: Ton | undefined = undefined,
// //     expectedCurrentBlockNumber: number = EXPECTED_CURRENT_BLOCK_NUMBER
// // ) => {
//     instance = instance !== undefined ? instance : ton;
    // patch(instance.algod, 'status', () => {
    //     return withError
    //         ? {}
    //         : {
    //             do: async () => {
    //                 return { 'next-version-round': expectedCurrentBlockNumber };
    //             },
    //         };
    // });
// };

// const patchGetAssetData = () => {
//     patch(ton, 'getAssetData', async () => {
//         return [
//             {
//                 id: NATIVE_TOKEN_ID.toString(),
//                 is_liquidity_token: false,
//                 name: CHAIN_NAME,
//                 unit_name: NATIVE_TOKEN,
//                 decimals: ALGO_DECIMALS,
//                 total_amount: null,
//                 url: 'https://api.ston.fi.org',
//                 is_verified: true,
//                 clawback_address: '',
//                 liquidity_in_usd: '744662.849801994861',
//                 last_day_volume_in_usd: '58.407348762305',
//                 last_week_volume_in_usd: '2261.387003578427',
//                 last_day_price_change: '-0.156310',
//                 is_stable: false,
//                 is_wrapped: false,
//             },
//             {
//                 id: USDC_TOKEN_ID.toString(),
//                 is_liquidity_token: false,
//                 name: 'USDC',
//                 unit_name: USDC_TOKEN,
//                 decimals: USDC_DECIMALS,
//                 total_amount: '18446744073709551615',
//                 url: 'https://centre.io',
//                 is_verified: true,
//                 clawback_address:
//                     'XM2W7VZODABS6RAL3FENBRKCOF6XLOQZZWIVVZTBYCVH2ADRYKN53CQLXM',
//                 liquidity_in_usd: '210464.272543000000',
//                 last_day_volume_in_usd: '8.000000000000',
//                 last_week_volume_in_usd: '6198.073873000000',
//                 last_day_price_change: '0.000000',
//                 is_stable: false,
//                 is_wrapped: false,
//             },
//         ];
//     });
// };

describe('GET /chain/config', () => {
    it('should return 200 and the result dictionary should include the ton config', async () => {
        await request(gatewayApp)
            .get(`/chain/config`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                resp.body.alogrand === CONFIG;
            });
    });
});

describe('GET /chain/status', () => {
    it('should return 200 with network info when chain provided', async () => {
        await request(gatewayApp)
            .get(`/chain/status`)
            .query({ chain: CHAIN_NAME, network: NETWORK })
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect({
                network: NETWORK,
                currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
                nativeCurrency: NATIVE_TOKEN,
            });
    });

    it('should return 200 with a status list, if an instance is already instantiated', async () => {
        await request(gatewayApp)
            .get(`/chain/status`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect([
                {
                    network: NETWORK,
                    currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
                    nativeCurrency: NATIVE_TOKEN,
                },
            ]);

        // const mainnetTonChain = Ton.getInstance('mainnet');
        const mainnetBlockNumber = EXPECTED_CURRENT_BLOCK_NUMBER + 1;
        // patchCurrentBlockNumber(false, mainnetTonChain, mainnetBlockNumber);

        await request(gatewayApp)
            .get(`/chain/status`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect([
                {
                    network: 'mainnet',
                    currentBlockNumber: mainnetBlockNumber,
                    nativeCurrency: NATIVE_TOKEN,
                },
                {
                    network: NETWORK,
                    currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
                    nativeCurrency: NATIVE_TOKEN,
                },
            ]);
    });
});

describe('POST /chain/poll', () => {
    const expectedTransactionHash =
        '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'; // noqa: mock
    const expectedTransactionFee = 1000;
    const expectedTransactionBlock = 99;

    it('should get a NETWORK_ERROR_CODE when the network is unavailable', async () => {
        // patch(ton.algod, 'pendingTransactionInformation', () => {
        //     const error: any = new Error('something went wrong');
        //     error.code = 'NETWORK_ERROR';
        //     throw error;
        // });

        await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                txHash: expectedTransactionHash,
            })
            .expect(503)
            .expect((res) => {
                expect(res.body.errorCode).toEqual(NETWORK_ERROR_CODE);
                expect(res.body.message).toEqual(NETWORK_ERROR_MESSAGE);
            });
    });

    it('should get a UNKNOWN_ERROR_ERROR_CODE when an unknown error is thrown', async () => {
        // patch(ton.algod, 'pendingTransactionInformation', () => {
        //     throw new Error();
        // });

        await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                txHash: expectedTransactionHash,
            })
            .expect(503)
            .expect((res) => {
                expect(res.body.errorCode).toEqual(UNKNOWN_ERROR_ERROR_CODE);
            });
    });

    it('should return a null txBlock if transaction is still in mempool', async () => {
        // patch(ton.algod, 'pendingTransactionInformation', (_: any) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 // partial response
        //                 txn: {
        //                     fee: expectedTransactionFee,
        //                 },
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                txHash: expectedTransactionHash,
            })
            .expect(200)
            .expect({
                currentBlock: EXPECTED_CURRENT_BLOCK_NUMBER,
                txBlock: null,
                txHash: expectedTransactionHash,
                fee: expectedTransactionFee,
            });
    });

    it('should return a txBlock if transaction is in a block and still on the algod node', async () => {
        // patch(ton.algod, 'pendingTransactionInformation', (_: any) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 // partial response
        //                 'confirmed-round': expectedTransactionBlock,
        //                 txn: {
        //                     fee: expectedTransactionFee,
        //                 },
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                txHash: expectedTransactionHash,
            })
            .expect(200)
            .expect({
                currentBlock: EXPECTED_CURRENT_BLOCK_NUMBER,
                txBlock: expectedTransactionBlock,
                txHash: expectedTransactionHash,
                fee: expectedTransactionFee,
            });
    });

    it('should return a txBlock if transaction is in a block and no longer on the algod node', async () => {
        // TODO <...> !!!
        // patch(ton.algod, 'pendingTransactionInformation', (_: any) => {
        //     const error: any = new Error('something went wrong');
        //     error.message =
        //         'could not find the transaction in the transaction pool or in the last 1000 confirmed rounds';
        //     error.status = 404;
        //     throw error;
        // });

        // patch(ton.indexer, 'lookupTransactionByID', (_: any) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 // partial response
        //                 'current-round': EXPECTED_CURRENT_BLOCK_NUMBER,
        //                 transaction: {
        //                     'confirmed-round': expectedTransactionBlock,
        //                     fee: expectedTransactionFee,
        //                 },
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                txHash: expectedTransactionHash,
            })
            .expect(200)
            .expect({
                currentBlock: EXPECTED_CURRENT_BLOCK_NUMBER,
                txBlock: expectedTransactionBlock,
                txHash: expectedTransactionHash,
                fee: expectedTransactionFee,
            });
    });
});

describe('test managing Ton wallets', () => {
    test('adding and removing a wallet', async () => {
        await request(gatewayApp)
            .get('/wallet')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect([]);

        await request(gatewayApp)
            .post('/wallet/add')
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                privateKey: MNEUMONIC,
            })
            .expect(200)
            .expect({
                address: ACCOUNT_ADDRESS,
            });

        await request(gatewayApp)
            .get('/wallet')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect([
                {
                    chain: CHAIN_NAME,
                    walletAddresses: [ACCOUNT_ADDRESS],
                },
            ]);

        await request(gatewayApp)
            .delete('/wallet/remove')
            .send({
                chain: CHAIN_NAME,
                address: ACCOUNT_ADDRESS,
            })
            .expect(200);

        await request(gatewayApp)
            .get('/wallet')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect([
                {
                    chain: CHAIN_NAME,
                    walletAddresses: [],
                },
            ]);
    });
});

describe('POST /chain/balances', () => {
    const expectedBalance = '9';

    it('should return 200 with correct balance for native token', async () => {
        // patch(ton.algod, 'accountInformation', (_: any) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 amount:
        //                     parseFloat(expectedBalance) * parseFloat(`1e${ALGO_DECIMALS}`),
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp).post('/wallet/add').send({
            chain: CHAIN_NAME,
            network: NETWORK,
            privateKey: MNEUMONIC,
        });

        await request(gatewayApp)
            .post(`/chain/balances`)
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                address: ACCOUNT_ADDRESS,
                tokenSymbols: [NATIVE_TOKEN],
            })
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toHaveProperty('timestamp');
                expect(resp.body).toHaveProperty('latency');
                expect(resp.body.network).toEqual(NETWORK);
                expect(resp.body.balances[NATIVE_TOKEN]).toEqual(expectedBalance);
            });
    });

    it('should return 200 with correct balance for non-native token', async () => {
        // patch(ton.algod, 'accountAssetInformation', (_: any, __: any) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 'asset-holding': {
        //                     amount: Math.round(
        //                         parseFloat(expectedBalance) * parseFloat(`1e${USDC_DECIMALS}`)
        //                     ),
        //                 },
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp).post('/wallet/add').send({
            chain: CHAIN_NAME,
            network: NETWORK,
            privateKey: MNEUMONIC,
        });

        await request(gatewayApp)
            .post(`/chain/balances`)
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                address: ACCOUNT_ADDRESS,
                tokenSymbols: [USDC_TOKEN],
            })
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toHaveProperty('timestamp');
                expect(resp.body).toHaveProperty('latency');
                expect(resp.body.network).toEqual(NETWORK);
                expect(resp.body.balances).toEqual({ USDC: expectedBalance });
            });
    });

    it('should return 200 with zero balance', async () => {
        // patch(ton.algod, 'accountAssetInformation', (_: any, __: any) => {
        //     const error: any = new Error('account asset info not found');
        //     error.code = 404;
        //     throw error;
        // });

        await request(gatewayApp).post('/wallet/add').send({
            chain: CHAIN_NAME,
            network: NETWORK,
            privateKey: MNEUMONIC,
        });

        await request(gatewayApp)
            .post(`/chain/balances`)
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
                address: ACCOUNT_ADDRESS,
                tokenSymbols: [USDC_TOKEN],
            })
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toHaveProperty('timestamp');
                expect(resp.body).toHaveProperty('latency');
                expect(resp.body.network).toEqual(NETWORK);
                expect(resp.body.balances).toEqual({ USDC: '0' });
            });
    });

    it('should return 404 when parameters are invalid/incomplete', async () => {
        await request(gatewayApp)
            .post(`/chain/balances`)
            .send({
                chain: CHAIN_NAME,
                network: NETWORK,
            })
            .expect(404);
    });
});

describe('GET /chain/tokens', () => {
    it('should return 200 with all assets if assetSymbols not provided', async () => {
        await request(gatewayApp)
            .get(`/chain/tokens`)
            .query({
                network: NETWORK,
            })
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toEqual({
                    assets: [
                        {
                            symbol: NATIVE_TOKEN,
                            assetId: NATIVE_TOKEN_ID,
                            decimals: ALGO_DECIMALS,
                        },
                        {
                            symbol: USDC_TOKEN,
                            assetId: USDC_TOKEN_ID,
                            decimals: USDC_DECIMALS,
                        },
                    ],
                });
            });
    });

    it('should return 200 with the requested asset', async () => {
        await request(gatewayApp)
            .get(`/chain/tokens`)
            .query({
                network: NETWORK,
                assetSymbols: [USDC_TOKEN],
            })
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toEqual({
                    assets: [
                        {
                            symbol: USDC_TOKEN,
                            assetId: USDC_TOKEN_ID,
                            decimals: USDC_DECIMALS,
                        },
                    ],
                });
            });
    });
});

describe('POST /chain/approve', () => {
    it('should return 200 with the approve response', async () => {
        const expectedTransactionId =
            'RVZ24ML6UE3OFXFN5ID3L65EHSRAYYX3FCCTKQP3P3P5K73Y65CQ';

        // patch(ton.algod, 'getTransactionParams', () => {
        //     return {
        //         do: async () => {
        //             return {
        //                 fee: 0,
        //                 firstRound: 29228608,
        //                 flatFee: false,
        //                 genesisHash: 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
        //                 genesisID: 'testnet-v1.0',
        //                 lastRound: 29229608,
        //             };
        //         },
        //     };
        // });
        //
        // patch(ton.algod, 'sendRawTransaction', (_: Uint8Array) => {
        //     return {
        //         do: async () => {
        //             return {
        //                 txId: expectedTransactionId,
        //             };
        //         },
        //     };
        // });

        await request(gatewayApp).post('/wallet/add').send({
            chain: CHAIN_NAME,
            network: NETWORK,
            privateKey: MNEUMONIC,
        });

        await request(gatewayApp)
            .post('/chain/approve')
            .send({
                network: NETWORK,
                address: ACCOUNT_ADDRESS,
                assetSymbol: USDC_TOKEN,
            })
            .expect('Content-Type', /json/)
            .expect(200)
            .expect((resp) => {
                expect(resp.body.network).toEqual(NETWORK);
                expect(resp.body.assetId).toEqual(USDC_TOKEN_ID);
                expect(resp.body.transactionResponse).toEqual({
                    txId: expectedTransactionId,
                });
            });
    });
});
