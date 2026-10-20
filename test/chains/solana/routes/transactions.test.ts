/**
 * GET /chains/:chain/transactions through the real route: a page of a wallet's activity,
 * a malformed address refused as the caller's error, and a chain without a parser
 * answering 501.
 */
import { CP_AMM_PROGRAM_ID } from '@meteora-ag/cp-amm-sdk';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { FastifyInstance } from 'fastify';

import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';
import { discriminatorOf } from '../../../../src/chains/solana/solana-activity';

const WALLET = Keypair.generate().publicKey;
const MINT = Keypair.generate().publicKey.toBase58();

const swapTx = {
  transaction: {
    message: {
      accountKeys: [{ pubkey: WALLET }],
      instructions: [
        {
          programId: CP_AMM_PROGRAM_ID,
          accounts: [],
          data: bs58.encode(Uint8Array.from([...Buffer.from(discriminatorOf('swap'), 'hex'), ...Buffer.alloc(8)])),
        },
      ],
    },
  },
  meta: {
    fee: 5000,
    preBalances: [2_000_000_000],
    postBalances: [1_000_000_000 - 5000],
    preTokenBalances: [],
    postTokenBalances: [
      { accountIndex: 1, mint: MINT, owner: WALLET.toBase58(), uiTokenAmount: { amount: '2500000', decimals: 6 } },
    ],
    innerInstructions: [],
  },
};

describe('GET /chains/:chain/transactions', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it("names a swap and reports what the wallet's balances did", async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue({
      connection: {
        getSignaturesForAddress: jest.fn().mockResolvedValue([{ signature: 'sig1', slot: 7, blockTime: 9, err: null }]),
        getParsedTransaction: jest.fn().mockResolvedValue(swapTx),
      },
      getToken: jest.fn().mockResolvedValue({ symbol: 'TKN' }),
    } as any);

    const response = await fastify.inject({
      method: 'GET',
      url: `/chains/solana/transactions?network=mainnet-beta&address=${WALLET.toBase58()}&limit=5`,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      network: 'mainnet-beta',
      address: WALLET.toBase58(),
      transactions: [
        {
          signature: 'sig1',
          slot: 7,
          blockTime: 9,
          ok: true,
          kind: 'swap',
          protocol: 'meteora/amm',
          actions: [
            { kind: 'swap', protocol: 'meteora/amm', program: CP_AMM_PROGRAM_ID.toBase58(), instruction: 'swap' },
          ],
          changes: [
            { mint: MINT, symbol: 'TKN', decimals: 6, amount: '2.5' },
            { mint: 'SOL', symbol: 'SOL', decimals: 9, amount: '-1' },
          ],
          feeLamports: 5000,
        },
      ],
      scanned: 1,
      cursor: null,
    });
  });

  it('answers 400 for a malformed address', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/chains/solana/transactions?network=mainnet-beta&address=not-an-address',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Invalid Solana address: not-an-address');
  });

  it('refuses a cluster whose program ids it does not know', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: `/chains/solana/transactions?network=devnet&address=${WALLET.toBase58()}`,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe(
      'Transaction parsing knows mainnet-beta program ids only; devnet is not supported',
    );
  });

  it('answers 501 for a chain without a parser', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: `/chains/ethereum/transactions?address=0x0000000000000000000000000000000000000000`,
    });

    expect(response.statusCode).toBe(501);
  });
});
