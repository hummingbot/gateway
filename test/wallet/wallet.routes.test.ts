import { gatewayApp } from '../../src/app';
import { patch, unpatch } from '../services/patch';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
import { GetWalletResponse } from '../../src/wallet/schemas';

let eth: Ethereum;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  eth = await Ethereum.getInstance('sepolia');
  await gatewayApp.ready();
});

beforeEach(() =>
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a')
);

afterAll(async () => {
  await eth.close();
  await gatewayApp.close();
});

afterEach(() => unpatch());

const twoAddress = '0x2b5ad5c4795c026514f8317c7a215e218dccd6cf';

const twoPrivateKey =
  '0000000000000000000000000000000000000000000000000000000000000002'; // noqa: mock

// encoding of twoPrivateKey with the password 'a'
const encodedPrivateKey = {
  address: '2b5ad5c4795c026514f8317c7a215e218dccd6cf',
  id: '116e3405-ea6c-40ba-93c0-6a835ad2ea99',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: 'dccf7a5f7d66bc6a61cf4fda422dcd55' },
    ciphertext:
      'ce561ad92c6a507a9399f51d64951b763f01b4956f15fd298ceb7a1174d0394a', // noqa: mock
    kdf: 'scrypt',
    kdfparams: {
      salt: 'a88d99c6d01150af02861ebb1ace3b633a33b2a20561fe188a0c260a84d1ba99', // noqa: mock
      n: 131072,
      dklen: 32,
      p: 1,
      r: 8,
    },
    mac: '684b0111ed08611ad993c76b4524d5dcda18b26cb930251983c36f40160eba8f', // noqa: mock
  },
};

describe('POST /wallet/add', () => {
  it('return 200 for well formed ethereum request', async () => {
    patch(eth, 'getWalletFromPrivateKey', () => {
      return {
        address: twoAddress,
      };
    });

    patch(eth, 'encrypt', () => {
      return JSON.stringify(encodedPrivateKey);
    });

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: {
        privateKey: twoPrivateKey,
        chain: 'ethereum',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });
});

describe('DELETE /wallet/remove', () => {
  it('return 200 for well formed ethereum request', async () => {
    patch(eth, 'getWalletFromPrivateKey', () => {
      return {
        address: twoAddress,
      };
    });

    patch(eth, 'encrypt', () => {
      return JSON.stringify(encodedPrivateKey);
    });

    // Add wallet first
    await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: {
        privateKey: twoPrivateKey,
        chain: 'ethereum',
      }
    });

    // Then delete it
    const response = await gatewayApp.inject({
      method: 'DELETE',
      url: '/wallet/remove',
      payload: {
        address: twoAddress,
        chain: 'ethereum',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });

  it('return 404 for ill-formed request', async () => {
    const response = await gatewayApp.inject({
      method: 'DELETE',
      url: '/wallet/delete',
      payload: {}
    });
    
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /wallet', () => {
  it('return 200 for well formed ethereum request', async () => {
    patch(eth, 'getWalletFromPrivateKey', () => {
      return {
        address: twoAddress,
      };
    });

    patch(eth, 'encrypt', () => {
      return JSON.stringify(encodedPrivateKey);
    });

    // Add wallet first
    await gatewayApp.inject({
      method: 'POST',
      url: '/wallet/add',
      payload: {
        privateKey: twoPrivateKey,
        chain: 'ethereum',
      }
    });

    // Then get wallets
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/wallet'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);

    const wallets: GetWalletResponse[] = JSON.parse(response.payload);
    const addresses: string[][] = wallets
      .filter((wallet) => wallet.chain === 'ethereum')
      .map((wallet) => wallet.walletAddresses);

    expect(addresses[0]).toContain(twoAddress);
  });
});