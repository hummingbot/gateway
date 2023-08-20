import request from 'supertest';
import { Tezos } from '../../../src/chains/tezos/tezos';
import { gatewayApp } from '../../../src/app';
let tezos: Tezos;

beforeAll(async () => {
    tezos = Tezos.getInstance('mainnet');
});

afterAll(async () => {
    await tezos.close();
});


describe('POST /chain/nextNonce', () => {
    it('should get a nonce value for a succesful query', async () => {
        const res = await request(gatewayApp)
            .post('/chain/nextNonce')
            .send({
                chain: 'tezos',
                network: 'mainnet',
                address: 'tz1QcqXfKyweGoGt8aeva4uNRPwY9b83CuJm',
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.nonce).toBeDefined();
    });
});

describe('POST /chain/nonce', () => {
    it('should get a nonce value for a succesful query', async () => {
        const res = await request(gatewayApp)
            .post('/chain/nonce')
            .send({
                chain: 'tezos',
                network: 'mainnet',
                address: 'tz1QcqXfKyweGoGt8aeva4uNRPwY9b83CuJm',
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.nonce).toBeDefined();
    });
});

describe('POST /chain/balances', () => {
    it('should return a json response', async () => {
        const res = await request(gatewayApp)
            .post(`/chain/balances`)
            .send({
                chain: 'tezos',
                network: 'mainnet',
                address: 'tz1burnburnburnburnburnburnburjAYjjX',
                tokenSymbols: ['CTEZ', 'USDT', 'XTZ'],
            })
            .set('Accept', 'application/json')
        expect(res.body.balances).toBeDefined();
    });
});

describe('GET /chain/tokens', () => {
    it('should return all the tokens', async () => {
        const res = await request(gatewayApp)
            .get(`/chain/tokens`)
            .query({
                chain: 'tezos',
                network: 'mainnet',
            })
            .set('Accept', 'application/json')
        expect(res.body.tokens).toBeDefined();
    });

    it('should return specific tokens', async () => {
        const res = await request(gatewayApp)
            .get(`/chain/tokens`)
            .query({
                chain: 'tezos',
                network: 'mainnet',
                tokenSymbols: ['CTEZ', 'USDT', 'XTZ'],
            })
            .set('Accept', 'application/json')
        expect(res.body.tokens).toBeDefined();
    });
});

describe('POST /chain/poll', () => {
    it('should get a txStatus value for a succesful query', async () => {
        const res = await request(gatewayApp)
            .post('/chain/poll')
            .send({
                chain: 'tezos',
                network: 'mainnet',
                txHash:
                    'onuDjdkN3dX1nfhn3LXyr7cgFbsn2G2WE5D5zVphkzBy5yWRGXw',
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.txStatus).toBeDefined();
    });
});

describe('POST /chain/allowances', () => {
    it('should get a approvals value for a succesful query', async () => {
        const res = await request(gatewayApp)
            .post('/chain/allowances')
            .send({
                chain: 'tezos',
                network: 'mainnet',
                address: 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV',
                spender: 'plenty',
                tokenSymbols: ['CTEZ', 'USDT']
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.approvals).toBeDefined();
    });
});