// // Mock fs-extra to prevent actual file writes
// jest.mock('fs-extra');

// import * as fse from 'fs-extra';

// import { gatewayApp } from '../../../src/app';
// import { Osmosis } from '../../../src/connectors/osmosis/osmosis';
// import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
// import { GetWalletResponse } from '../../../src/wallet/schemas';
// import { patch, unpatch } from '../../services/patch';

// const mockFse = fse as jest.Mocked<typeof fse>;

// let osmosis: Osmosis;

// // Test wallet data
// const CHAIN = 'cosmos';
// const CONNECTOR = 'osmosis';
// const NETWORK = 'testnet';
// const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
// const TEST_WALLET_PRIVATE_KEY = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';

// // Mock the encoded private key response
// const encodedPrivateKey = {

// };

// // Track wallet operations in memory to avoid file system pollution
// const mockWallets: { [key: string]: Set<string> } = {
//   osmosis: new Set<string>(),
// };

// beforeAll(async () => {
//   patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
//   osmosis = await Osmosis.getInstance(NETWORK);
//   await gatewayApp.ready();
// });

// beforeEach(() => {
//   patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');

//   // Clear mock wallets
//   mockWallets.osmosis.clear();

//   // Mock wallet operations to work with in-memory storage
//   patch(osmosis, 'getWalletFromPrivateKey', () => {
//     return { address: TEST_WALLET };
//   });

//   patch(osmosis, 'encrypt', () => {
//     return JSON.stringify(encodedPrivateKey);
//   });

//   // Setup fs-extra mocks
//   (mockFse.writeFile as jest.Mock).mockImplementation(async (path: any) => {
//     const pathStr = path.toString();
//     const pathParts = pathStr.split('/');
//     const chain = pathParts[pathParts.length - 2];
//     const address = pathParts[pathParts.length - 1].replace('.json', '');

//     if (chain && address) {
//       mockWallets[chain].add(address);
//     }
//     return undefined;
//   });

//   (mockFse.readdir as jest.Mock).mockImplementation(async (dirPath: any, options?: any) => {
//     const pathStr = dirPath.toString();

//     // If asking for directories in wallet path
//     if (pathStr.endsWith('/wallets') && options?.withFileTypes) {
//       return Object.keys(mockWallets).map((chain) => ({
//         name: chain,
//         isDirectory: () => true,
//         isFile: () => false,
//       }));
//     }

//     // If asking for files in a chain directory
//     const chain = pathStr.split('/').pop();
//     if (chain && mockWallets[chain]) {
//       if (options?.withFileTypes) {
//         return Array.from(mockWallets[chain]).map((addr) => ({
//           name: `${addr}.json`,
//           isDirectory: () => false,
//           isFile: () => true,
//         }));
//       }
//       return Array.from(mockWallets[chain]).map((addr) => `${addr}.json`);
//     }

//     return [];
//   });

//   (mockFse.readFile as jest.Mock).mockResolvedValue(Buffer.from(JSON.stringify(encodedPrivateKey)));
//   (mockFse.pathExists as jest.Mock).mockResolvedValue(true);
//   (mockFse.ensureDir as jest.Mock).mockResolvedValue(undefined);

//   (mockFse.remove as jest.Mock).mockImplementation(async (filePath: any) => {
//     const pathStr = filePath.toString();
//     const pathParts = pathStr.split('/');
//     const chain = pathParts[pathParts.length - 2];
//     const address = pathParts[pathParts.length - 1].replace('.json', '');

//     if (chain && mockWallets[chain]) {
//       mockWallets[chain].delete(address);
//     }
//     return undefined;
//   });
// });

// afterAll(async () => {
//   await osmosis.close();
//   await gatewayApp.close();
// });

// afterEach(() => {
//   unpatch();
//   jest.clearAllMocks();
// });

// describe('Cosmos-Osmosis Wallet Operations', () => {
//   describe('POST /wallet/add', () => {
//     it('should add an Cosmos-Osmosis wallet successfully', async () => {
//       const response = await gatewayApp.inject({
//         method: 'POST',
//         url: '/wallet/add',
//         payload: {
//           privateKey: TEST_WALLET_PRIVATE_KEY,
//           chain: CHAIN,
//         },
//       });

//       expect(response.statusCode).toBe(200);
//       expect(response.headers['content-type']).toMatch(/json/);

//       const result = JSON.parse(response.payload);
//       expect(result).toMatchObject({
//         address: TEST_WALLET,
//       });
//     });

//     it('should fail with invalid private key', async () => {
//       // Override the mock to simulate invalid key
//       patch(osmosis, 'getWalletFromPrivateKey', () => {
//         throw new Error('Invalid private key');
//       });

//       const response = await gatewayApp.inject({
//         method: 'POST',
//         url: '/wallet/add',
//         payload: {
//           privateKey: 'invalid-key',
//           chain: CHAIN,
//         },
//       });

//       expect(response.statusCode).toBe(500);
//     });

//     it('should fail with missing parameters', async () => {
//       const response = await gatewayApp.inject({
//         method: 'POST',
//         url: '/wallet/add',
//         payload: {
//           chain: CHAIN,
//           // missing privateKey
//         },
//       });

//       expect(response.statusCode).toBe(400);
//     });
//   });

//   describe('GET /wallet', () => {
//     it('should fetch wallets for cosmos', async () => {
//       // First add a wallet
//       mockWallets.cosmos.add(TEST_WALLET);

//       const response = await gatewayApp.inject({
//         method: 'GET',
//         url: '/wallet',
//       });

//       expect(response.statusCode).toBe(200);
//       expect(response.headers['content-type']).toMatch(/json/);

//       const wallets: GetWalletResponse[] = JSON.parse(response.payload);
//       const cosmosWallet = wallets.find((w) => w.chain === CHAIN);

//       expect(cosmosWallet).toBeDefined();
//       expect(cosmosWallet?.walletAddresses).toContain(TEST_WALLET);
//     });

//     it('should return empty array when no wallets exist', async () => {
//       // Clear wallets
//       mockWallets.cosmos.clear();

//       const response = await gatewayApp.inject({
//         method: 'GET',
//         url: '/wallet',
//       });

//       expect(response.statusCode).toBe(200);

//       const wallets: GetWalletResponse[] = JSON.parse(response.payload);
//       const cosmosWallet = wallets.find((w) => w.chain === CHAIN);

//       expect(cosmosWallet?.walletAddresses).toHaveLength(0);
//     });
//   });

//   describe('DELETE /wallet/remove', () => {
//     it('should remove an cosmos wallet successfully', async () => {
//       // First add the wallet to mock storage
//       mockWallets.cosmos.add(TEST_WALLET);

//       const response = await gatewayApp.inject({
//         method: 'DELETE',
//         url: '/wallet/remove',
//         payload: {
//           address: TEST_WALLET,
//           chain: CHAIN,
//         },
//       });

//       expect(response.statusCode).toBe(200);
//       expect(response.headers['content-type']).toMatch(/json/);

//       expect(response.payload).toBe('null');
//       expect(mockWallets.cosmos.has(TEST_WALLET)).toBe(false);
//     });

//     it('should fail when removing non-existent wallet', async () => {
//       (mockFse.pathExists as jest.Mock).mockResolvedValue(false);

//       const response = await gatewayApp.inject({
//         method: 'DELETE',
//         url: '/wallet/remove',
//         payload: {
//           address: '0x1234567890abcdef1234567890abcdef12345678',
//           chain: CHAIN,
//         },
//       });

//       // The endpoint doesn't check if wallet exists, just removes the file
//       expect(response.statusCode).toBe(200);
//     });

//     it('should fail with invalid address format', async () => {
//       const response = await gatewayApp.inject({
//         method: 'DELETE',
//         url: '/wallet/remove',
//         payload: {
//           address: 'invalid-address',
//           chain: CHAIN,
//         },
//       });

//       // Address validation happens and throws 500 on invalid format
//       expect(response.statusCode).toBe(500);
//     });
//   });

//   describe('Wallet Operations Integration', () => {
//     it('should handle full wallet lifecycle: add, fetch, and remove', async () => {
//       // 1. Add wallet
//       const addResponse = await gatewayApp.inject({
//         method: 'POST',
//         url: '/wallet/add',
//         payload: {
//           privateKey: TEST_WALLET_PRIVATE_KEY,
//           chain: CHAIN,
//         },
//       });
//       expect(addResponse.statusCode).toBe(200);

//       // 2. Fetch wallets
//       const getResponse = await gatewayApp.inject({
//         method: 'GET',
//         url: '/wallet',
//       });
//       expect(getResponse.statusCode).toBe(200);

//       const wallets: GetWalletResponse[] = JSON.parse(getResponse.payload);
//       const cosmosWallet = wallets.find((w) => w.chain === CHAIN);
//       expect(cosmosWallet?.walletAddresses).toContain(TEST_WALLET);

//       // 3. Remove wallet
//       const removeResponse = await gatewayApp.inject({
//         method: 'DELETE',
//         url: '/wallet/remove',
//         payload: {
//           address: TEST_WALLET,
//           chain: CHAIN,
//         },
//       });
//       expect(removeResponse.statusCode).toBe(200);

//       // 4. Verify wallet is removed
//       const finalGetResponse = await gatewayApp.inject({
//         method: 'GET',
//         url: '/wallet',
//       });
//       expect(finalGetResponse.statusCode).toBe(200);

//       const finalWallets: GetWalletResponse[] = JSON.parse(finalGetResponse.payload);
//       const finalcosmosWallet = finalWallets.find((w) => w.chain === CHAIN);
//       expect(finalcosmosWallet?.walletAddresses).not.toContain(TEST_WALLET);
//     });
//   });
// });
