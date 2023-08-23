import { TzktApiClient } from "../../../src/chains/tezos/tzkt.api.client";


describe('TzktApiClient', () => {
    let client: TzktApiClient;

    beforeAll(() => {
        client = new TzktApiClient('https://api.tzkt.io');
    });

    it('should return tzkt URL', () => {
        // Act
        const result = client.tzktURL;

        // Assert
        expect(result).toBe('https://api.tzkt.io');
    });

    it('should return account status', async () => {
        // Arrange
        const address = 'tz1bb299QQuWXuYbynKzPfdVftmZdAQrvrGN';

        // Act
        const result = await client.getAccountStatus(address);

        // Assert
        expect(result.balance).toBeGreaterThan(BigInt(0));
        expect(result.counter).toBeGreaterThan(0);
    });

    it('should return token balances', async () => {
        // Arrange
        const walletAddress = 'tz1burnburnburnburnburnburnburjAYjjX';
        const contractAddress = 'KT1SjXiUX63QvdNMcM2m492f7kuf8JxXRLp4';
        const tokenId = 0;

        // Act
        const result = await client.getTokens(walletAddress, contractAddress, tokenId);

        // Assert
        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].id).toBeGreaterThanOrEqual(0);
        expect(result[0].account).toBeDefined();
        expect(result[0].token).toBeDefined();
        expect(result[0].balance).toMatch(/^\d+$/);
    });

    it('should return transaction details', async () => {
        // Arrange
        const txHash = 'ono5vHGjBYNETnomTsMYXafaLHE1bAYsBiwKudyGbNciPKJWxA4';

        // Act
        const results = await client.getTransaction(txHash);

        // Assert
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

    it('should return block head', async () => {
        // Act
        const result = await client.getBlockHead();

        // Assert
        expect(result.chain).toBeDefined();
        expect(result.chainId).toBeDefined();
        expect(result.level).toBeGreaterThan(0);
    });
});
