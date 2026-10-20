/**
 * The balances route passes a caller's error through as it is, and turns only an
 * unexpected failure into a 500. A malformed address is the caller's error.
 */
import { FastifyInstance } from 'fastify';

import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

const MALFORMED = 'not-a-solana-address';

describe('POST /chains/solana/balances errors', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  afterEach(() => jest.restoreAllMocks());

  // The real getBalances, on an instance with no connection: the address is refused
  // before anything is read.
  const realSolana = () => {
    const instance = Object.create(Solana.prototype);
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(instance);
  };

  const post = (address: string) =>
    fastify.inject({
      method: 'POST',
      url: '/chains/solana/balances',
      payload: { network: 'mainnet-beta', address, tokens: ['SOL'] },
    });

  it('answers 400 for a malformed address', async () => {
    realSolana();

    const response = await post(MALFORMED);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe(`Invalid Solana address: ${MALFORMED}`);
  });

  it('keeps any 4xx from getBalances a 4xx', async () => {
    const notFound = Object.assign(new Error('gone'), { statusCode: 404, name: 'NotFoundError' });
    jest.spyOn(Solana, 'getInstance').mockResolvedValue({ getBalances: jest.fn().mockRejectedValue(notFound) } as any);

    const response = await post('11111111111111111111111111111111');

    expect(response.statusCode).toBe(404);
  });
});
