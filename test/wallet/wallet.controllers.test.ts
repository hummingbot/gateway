import { patch, unpatch } from '../services/patch';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { FastifyInstance } from 'fastify';

import {
  addWallet,
  getWallets,
  removeWallet,
} from '../../src/wallet/utils';

import { ConfigManagerCertPassphrase } from '../../src/services/config-manager-cert-passphrase';
// import { Cosmos } from '../../../src/chains/cosmos/cosmos';

let eth: Ethereum;
// let cosmos: Cosmos;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  eth = await Ethereum.getInstance('sepolia');
});

beforeEach(() =>
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a')
);

afterAll(async () => {
  await eth.close();
  // await cosmos.close();
});

afterEach(() => unpatch());

const oneAddress = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';

const onePrivateKey =
  '0000000000000000000000000000000000000000000000000000000000000001'; // noqa: mock

// encoding of onePrivateKey with the password 'a'
const encodedPrivateKey = {
  address: '7e5f4552091a69125d5dfcb7b8c2659029395bdf',
  id: '7bb58a6c-06d3-4ede-af06-5f4a5cb87f0b',
  version: 3,
  Crypto: {
    cipher: 'aes-128-ctr',
    cipherparams: { iv: '60276d7bf5fa57ce0ae8e65fc578c3ac' },
    ciphertext:
      'be98ee3d44744e1417531b15a7b1e47b945cfc100d3ff2680f757a824840fb67', // noqa: mock
    kdf: 'scrypt',
    kdfparams: {
      salt: '90b7e0017b4f9df67aa5f2de73495c14de086b8abb5b68ce3329596eb14f991c', // noqa: mock
      n: 131072,
      dklen: 32,
      p: 1,
      r: 8,
    },
    mac: '0cea1492f67ed43234b69100d873e17b4a289dd508cf5e866a3b18599ff0a5fc', // noqa: mock
  },
};

// const cosmosAddress = 'cosmos18nadm9qd4pz8pgffhvehc0dthuhpgevp4l3nar';
// const cosmosPrivateKey =
//   '218507defde7d91a9eba858437115b8aea68e3cbc7a4b68b3edac53d5ec89516'; // noqa: mock
// const encodedCosmosPrivateKey = {
//   keyAlgorithm: {
//     name: 'PBKDF2',
//     salt: 'PkkhCEpSae+dYup0Q2ZKpA==',
//     iterations: 500000,
//     hash: 'SHA-256',
//   },
//   cipherAlgorithm: { name: 'AES-GCM', iv: '1mBtuYgYHJ/xkkA7xdU1QQ==' },
//   ciphertext:
//     'F7M1ic/dSNHbD1MrU3gQlv9RCiHaSeyk1Rb63NkKSuOuIE1WeCvVLGha5LujsAJAkQ++Mts+h2Ub2OGCdoFkHRO1BMYF0djNDFmwJlKzd68=',
// };

describe('addWallet and getWallets', () => {
  it('add an Ethereum wallet', async () => {
    patch(eth, 'getWalletFromPrivateKey', () => {
      return {
        address: oneAddress,
      };
    });

    patch(eth, 'encrypt', () => {
      return JSON.stringify(encodedPrivateKey);
    });

    // Create a mock Fastify instance
    const mockFastify = {
      httpErrors: {
        internalServerError: (msg: string) => new Error(msg),
        badRequest: (msg: string) => new Error(msg)
      }
    } as unknown as FastifyInstance;

    await addWallet(mockFastify, {
      privateKey: onePrivateKey,
      chain: 'ethereum',
    });

    const wallets = await getWallets(mockFastify);

    const addresses: string[][] = wallets
      .filter((wallet) => wallet.chain === 'ethereum')
      .map((wallet) => wallet.walletAddresses);

    expect(addresses[0]).toContain(oneAddress);
  });

  it('fail to add a wallet to unknown chain', async () => {
    // Create a mock Fastify instance
    const mockFastify = {
      httpErrors: {
        internalServerError: (msg: string) => new Error(msg),
        badRequest: (msg: string) => new Error(msg)
      }
    } as unknown as FastifyInstance;

    await expect(
      addWallet(mockFastify, {
        privateKey: onePrivateKey,
        chain: 'shibainu',
      })
    ).rejects.toThrow('Unrecognized chain name: shibainu');
  });

});

describe('addWallet and removeWallets', () => {
  it('remove an Ethereum wallet', async () => {
    patch(eth, 'getWalletFromPrivateKey', () => {
      return {
        address: oneAddress,
      };
    });

    patch(eth, 'encrypt', () => {
      return JSON.stringify(encodedPrivateKey);
    });

    // Create a mock Fastify instance
    const mockFastify = {
      httpErrors: {
        internalServerError: (msg: string) => new Error(msg),
        badRequest: (msg: string) => new Error(msg),
        notFound: (msg: string) => new Error(msg)
      }
    } as unknown as FastifyInstance;

    await addWallet(mockFastify, {
      privateKey: onePrivateKey,
      chain: 'ethereum',
    });

    await removeWallet(mockFastify, { chain: 'ethereum', address: oneAddress });

    const wallets = await getWallets(mockFastify);

    const addresses: string[][] = wallets
      .filter((wallet) => wallet.chain === 'ethereum')
      .map((wallet) => wallet.walletAddresses);

    expect(addresses[0]).not.toContain(oneAddress);
  });

});
