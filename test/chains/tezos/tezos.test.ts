import fs from 'fs';
import { TezosToolkit } from '@taquito/taquito';
import { Tezos } from '../../../src/chains/tezos/tezos';
import path from 'path';

describe('Tezos', () => {
    const network = 'mainnet';
    let tezos: Tezos;

    beforeAll(() => {
        tezos = new Tezos(network);
    });

    afterAll(async () => {
        await tezos.close();
    });

    it('should return mainnet instance of Tezos', () => {
        expect(Tezos.getInstance(network).chain).toBe('mainnet');
    });

    it('should return all connected instances of Tezos', () => {
        expect(Tezos.getConnectedInstances()).toHaveProperty('mainnet');
    });

    it('should create an instance of Tezos', () => {
        expect(tezos).toBeInstanceOf(Tezos);
    });

    it('should have the correct network', () => {
        expect(tezos.chain).toEqual(network);
    });

    it('should have the correct native token symbol', () => {
        expect(tezos.nativeTokenSymbol).toEqual('XTZ');
    });

    it('should have a gas price of 123456', () => {
        expect(tezos.gasPrice).toEqual(123456);
    });

    it('should have a gas limit of 100000', () => {
        expect(tezos.gasLimitTransaction).toEqual(100000);
    });

    it('should have a request count of 0', () => {
        expect(tezos.requestCount).toEqual(0);
    });

    it('should have a metrics log interval of 300000', () => {
        expect(tezos.metricsLogInterval).toEqual(300000);
    });

    describe('counting requests', () => {
        it('should increment request count by 1', () => {
            tezos.requestCounter({ action: 'request' });
        });
        it('should return 1 counted requests', () => {
            expect(tezos.requestCount).toEqual(1);
        });
    });

    describe('Tezos Base', () => {

        beforeAll(async () => {
            await tezos.init();
        });

        it('should be ready', () => {
            expect(tezos.ready()).toBeTruthy();
        });

        it('should have a provider', () => {
            expect(tezos.provider).toBeDefined();
        });

        it('should get contract instance from address', async () => {
            const contract = await tezos.getContract('KT1GRSvLoikDsXujKgZPsGLX8k8VvR2Tq95b');
            expect(contract).toBeDefined();
        });

        it('should get contract storage from address', async () => {
            const storage = await tezos.getContractStorage('KT1GRSvLoikDsXujKgZPsGLX8k8VvR2Tq95b');
            expect(storage).toBeDefined();
        });

        it('should return the pending transactions in the mempool', async () => {
            const txs = await tezos.getPendingTransactions();
            expect(txs).toBeDefined();
        }, 15000);

        it('should returns tokens for a given list source from a URL', async () => {
            const tokens = await tezos.getTokenList('https://api.tzkt.io/v1/tokens?limit=1', 'URL');
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should returns tokens for a given list source from configs', async () => {
            const tokens = await tezos.getTokenList(tezos.tokenListSource, 'FILE');
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should return a stored tokens list', async () => {
            expect(tezos.storedTokenList.length).toBeGreaterThan(0);
        });

        it('should return a token object for a symbol', async () => {
            const token = tezos.getTokenForSymbol('CTez');
            expect(token).toHaveProperty('name');
            expect(token).toHaveProperty('symbol');
            expect(token).toHaveProperty('address');
            expect(token).toHaveProperty('decimals');
            expect(token).toHaveProperty('standard');
            expect(token).toHaveProperty('tokenId');
        });

        it('should returns the native balance, convert BigNumber to string', async () => {
            const balance = await tezos.getNativeBalance('tz1burnburnburnburnburnburnburjAYjjX');
            expect(balance).toHaveProperty('value');
            expect(balance).toHaveProperty('decimals');
        });

        it('should get the current nonce for an address', async () => {
            const nonce = await tezos.getNonce('tz1bb299QQuWXuYbynKzPfdVftmZdAQrvrGN');
            expect(nonce).toBeGreaterThan(0);
        });

        it('should get token balance of an address', async () => {
            const balance = await tezos.getTokenBalance(
                'KT1GRSvLoikDsXujKgZPsGLX8k8VvR2Tq95b',
                'tz1burnburnburnburnburnburnburjAYjjX',
                0,
                18
            );
            expect(balance).toHaveProperty('value');
            expect(balance).toHaveProperty('decimals');
        });

        it('should return FA2 token operator for an address', async () => {
            const allowance = await tezos.getTokenAllowance(
                'KT1914CUZ7EegAFPbfgQMRkw8Uz5mYkEz2ui',
                'tz1QcqXfKyweGoGt8aeva4uNRPwY9b83CuJm',
                'KT1PvEyN1xCFCgorN92QCfYjw3axS6jawCiJ',
                'FA2',
                0,
                8
            );
            expect(allowance).toHaveProperty('value');
            expect(allowance).toHaveProperty('decimals');
        });

        it('should return transaction details', async () => {
            const txHash = 'ono5vHGjBYNETnomTsMYXafaLHE1bAYsBiwKudyGbNciPKJWxA4';
            const results = await tezos.getTransaction(txHash);
            for (const result of results) {
                expect(result.id).toBeGreaterThanOrEqual(0);
                expect(result.level).toBeGreaterThan(0);
                expect(result.timestamp).toEqual("2023-04-26T06:14:17Z");
                expect(result.block).toMatch(/^[a-zA-Z0-9]+$/);
                expect(result.hash).toMatch(/^[a-zA-Z0-9]+$/);
                expect(result.counter).toBeGreaterThanOrEqual(0);
                expect(result.sender).toBeDefined();
                expect(result.gasLimit).toBeGreaterThanOrEqual(0);
                expect(result.gasUsed).toBeGreaterThanOrEqual(0);
                expect(result.storageLimit).toBeGreaterThanOrEqual(0);
                expect(result.storageUsed).toBeGreaterThanOrEqual(0);
                expect(result.bakerFee).toBeGreaterThanOrEqual(0);
                expect(result.storageFee).toBeGreaterThanOrEqual(0);
                expect(result.allocationFee).toBeGreaterThanOrEqual(0);
                expect(result.target).toBeDefined();
                expect(result.amount).toBeGreaterThanOrEqual(0);
                expect(result.parameter ? result.parameter : {}).toBeDefined();
                expect(result.storage ? result.storage : {}).toBeDefined();
                expect(result.status).toBeDefined();
                expect(result.hasInternals).toBeDefined();
            }
        });

        it('should return current block number', async () => {
            const result = await tezos.getCurrentBlockNumber();
            expect(result).toBeGreaterThan(0);
        });

        it('should get wallet from a private key', async () => {
            const privateKey = 'edsk31vznjHSSpGExDMHYASz45VZqXN4DPxvsa4hAyY8dHM28cZzp6';
            const wallet = await tezos.getWalletFromPrivateKey(privateKey);
            expect(wallet).toBeInstanceOf(TezosToolkit);
        });

        it('should return a saved wallet by address', async () => {
            const filePath = 'conf/wallets/tezos/tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV.json';
            if (!fs.existsSync(filePath)) {
                const folderPath = path.dirname(filePath);
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                fs.writeFileSync(filePath, JSON.stringify({
                    iv: '5cf30a9ba40187fac996b290e2a73226',
                    encryptedPrivateKey: '10f17ae70245bdafc0bf98684008d98bc255b51ebc896cad64af3fa7d1e8412184e5908af80a31bbf474ec69273ca5117bbf6eb2ca5b5686236c5f9c1417a3c4'
                }));
            }
            const wallet = await tezos.getWallet('tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV', 'password');
            expect(wallet).toBeInstanceOf(TezosToolkit);
            fs.rmSync(filePath);
        });

        describe('should be able to encrypt/decrypt private key', () => {
            let returnedEncryptedPK: string;
            it('should return an encrypted private key', async () => {
                returnedEncryptedPK = tezos.encrypt(
                    'edsk31vznjHSSpGExDMHYASz45VZqXN4DPxvsa4hAyY8dHM28cZzp6',
                    'password'
                );
                const encryptedPK = JSON.parse(returnedEncryptedPK);
                expect(encryptedPK.iv).toMatch(/^[a-zA-Z0-9]+$/);
                expect(encryptedPK.encryptedPrivateKey).toMatch(/^[a-zA-Z0-9]+$/);
            });

            it('should return a decrypted private key', async () => {
                const privateKey = tezos.decrypt(
                    returnedEncryptedPK,
                    'password'
                );
                expect(privateKey).toBe('edsk31vznjHSSpGExDMHYASz45VZqXN4DPxvsa4hAyY8dHM28cZzp6');
            });
        });
    });
});
