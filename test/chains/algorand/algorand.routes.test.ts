import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { Algorand } from '../../../src/chains/algorand/algorand';
import { patch, unpatch } from '../../services/patch';
import { getAlgorandConfig } from '../../../src/chains/algorand/algorand.config';
import {
  NETWORK_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
} from '../../../src/services/error-handler';

let algorand: Algorand;
const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
const CHAIN_NAME = 'algorand';
const NETWORK = 'mainnet';
const CONFIG = getAlgorandConfig(NETWORK);
const NATIVE_CURRENCY = CONFIG.nativeCurrencySymbol;

beforeAll(async () => {
  algorand = Algorand.getInstance(NETWORK);
  patchCurrentBlockNumber();
  await algorand.init();
});

beforeEach(() => {
  patchCurrentBlockNumber();
});

afterEach(() => {
  unpatch();
});

const patchCurrentBlockNumber = (
  withError: boolean = false,
  instance: Algorand | undefined = undefined,
  expectedCurrentBlockNumber: number = EXPECTED_CURRENT_BLOCK_NUMBER
) => {
  instance = instance !== undefined ? instance : algorand;
  patch(instance.algod, 'status', () => {
    return withError
      ? {}
      : {
          do: async () => {
            return { 'next-version-round': expectedCurrentBlockNumber };
          },
        };
  });
};

describe('GET /network/config', () => {
  it('should return 200 and the result dictionary should include the algorand config', async () => {
    await request(gatewayApp)
      .get(`/network/config`)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((resp) => {
        resp.body.alogrand === CONFIG;
      });
  });
});

describe('GET /network/status', () => {
  it('should return 200 with network info when chain provided', async () => {
    await request(gatewayApp)
      .get(`/network/status`)
      .query({ chain: CHAIN_NAME, network: NETWORK })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect({
        network: NETWORK,
        currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
        nativeCurrency: NATIVE_CURRENCY,
      });
  });
  it('should return 200 with a status list, if an instance is already instantiated', async () => {
    await request(gatewayApp)
      .get(`/network/status`)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect([
        {
          network: NETWORK,
          currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
          nativeCurrency: NATIVE_CURRENCY,
        },
      ]);

    const testnetAlgorandChain = Algorand.getInstance('testnet');
    const testnetBlockNumber = EXPECTED_CURRENT_BLOCK_NUMBER + 1;
    patchCurrentBlockNumber(false, testnetAlgorandChain, testnetBlockNumber);

    await request(gatewayApp)
      .get(`/network/status`)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect([
        {
          network: 'testnet',
          currentBlockNumber: testnetBlockNumber,
          nativeCurrency: NATIVE_CURRENCY,
        },
        {
          network: NETWORK,
          currentBlockNumber: EXPECTED_CURRENT_BLOCK_NUMBER,
          nativeCurrency: NATIVE_CURRENCY,
        },
      ]);
  });
});

describe('POST /algorand/poll', () => {
  const expectedTransactionHash =
    '0x2faeb1aa55f96c1db55f643a8cf19b0f76bf091d0b7d1b068d2e829414576362'; // noqa: mock
  const expectedTransactionFee = 1000;
  const expectedTransactionBlock = 99;

  it('should get a NETWORK_ERROR_CODE when the network is unavailable', async () => {
    patch(algorand.algod, 'pendingTransactionInformation', () => {
      const error: any = new Error('something went wrong');
      error.code = 'NETWORK_ERROR';
      throw error;
    });

    await request(gatewayApp)
      .post('/algorand/poll')
      .send({
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
    patch(algorand.algod, 'pendingTransactionInformation', () => {
      throw new Error();
    });

    await request(gatewayApp)
      .post('/algorand/poll')
      .send({
        network: NETWORK,
        txHash: expectedTransactionHash,
      })
      .expect(503)
      .expect((res) => {
        expect(res.body.errorCode).toEqual(UNKNOWN_ERROR_ERROR_CODE);
      });
  });

  it('should return a null txBlock if transaction is still in mempool', async () => {
    patch(algorand.algod, 'pendingTransactionInformation', (_: any) => {
      return {
        do: async () => {
          return {
            // partial response
            txn: {
              fee: expectedTransactionFee,
            },
          };
        },
      };
    });

    await request(gatewayApp)
      .post('/algorand/poll')
      .send({
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
    patch(algorand.algod, 'pendingTransactionInformation', (_: any) => {
      return {
        do: async () => {
          return {
            // partial response
            'confirmed-round': expectedTransactionBlock,
            txn: {
              fee: expectedTransactionFee,
            },
          };
        },
      };
    });

    await request(gatewayApp)
      .post('/algorand/poll')
      .send({
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
    patch(algorand.algod, 'pendingTransactionInformation', (_: any) => {
      const error: any = new Error('something went wrong');
      error.message =
        'could not find the transaction in the transaction pool or in the last 1000 confirmed rounds';
      error.status = 404;
      throw error;
    });

    patch(algorand.indexer, 'lookupTransactionByID', (_: any) => {
      return {
        do: async () => {
          return {
            // partial response
            'current-round': EXPECTED_CURRENT_BLOCK_NUMBER,
            transaction: {
              'confirmed-round': expectedTransactionBlock,
              fee: expectedTransactionFee,
            },
          };
        },
      };
    });

    await request(gatewayApp)
      .post('/algorand/poll')
      .send({
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
