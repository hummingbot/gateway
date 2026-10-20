/**
 * Route coverage for the signer seam (#673, #682): every route that sends a
 * transaction is listed with its build twin (or the task that adds one), and only
 * the seam signs.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { FastifyInstance } from 'fastify';

import '../mocks/app-mocks';

import { gatewayApp } from '../../src/app';
import { isSensitivePath } from '../../src/services/gateway-security';
import { NON_SENDING_ROUTES, TRANSACTION_ROUTES } from '../../src/wallet/signers/transaction-routes';

describe('transaction routes and their build twins', () => {
  let fastify: FastifyInstance;
  const writeRoutes: string[] = [];

  beforeAll(async () => {
    fastify = gatewayApp;
    fastify.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) {
        if (method === 'POST' || method === 'DELETE') writeRoutes.push(`${method} ${route.url}`);
      }
    });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  const listed = () => [
    ...TRANSACTION_ROUTES.map((r) => `POST ${r.url}`),
    ...TRANSACTION_ROUTES.flatMap((r) => (r.buildTwin ? [`POST ${r.buildTwin}`] : [])),
    ...NON_SENDING_ROUTES,
  ];

  it('classifies every registered POST and DELETE route as sending a transaction or not', () => {
    // A new route fails here until it is listed: as a transaction route with its build
    // twin, as a build twin, or in NON_SENDING_ROUTES.
    expect([...new Set(writeRoutes)].filter((r) => !listed().includes(r)).sort()).toEqual([]);
  });

  it('lists no route that is not registered', () => {
    expect(listed().filter((r) => !writeRoutes.includes(r))).toEqual([]);
  });

  it('names a registered build twin, or the task that adds one, for every chain a route serves', () => {
    for (const route of TRANSACTION_ROUTES) {
      if (route.buildTwin) {
        expect(writeRoutes).toContain(`POST ${route.buildTwin}`);
      }
      for (const chain of route.chains) {
        const servedByTwin = route.buildTwin !== undefined && route.gaps?.[chain] === undefined;
        const gapTask = route.gaps?.[chain];
        expect({ url: route.url, chain, covered: servedByTwin || /^INV-\d+$/.test(gapTask ?? '') }).toEqual({
          url: route.url,
          chain,
          covered: true,
        });
      }
    }
  });

  it('gates every transaction route and its twin behind API auth when Gateway is exposed', () => {
    const paths = TRANSACTION_ROUTES.flatMap((r) => [r.url, r.buildTwin].filter((p): p is string => !!p)).map((p) =>
      p.replace(':chain', 'solana'),
    );
    expect(paths.filter((p) => !isSensitivePath(p))).toEqual([]);
  });
});

describe('only the signer seam signs', () => {
  const SRC = join(__dirname, '../../src');

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
    });

  const filesMatching = (pattern: RegExp): string[] =>
    sources(SRC)
      .filter((path) => pattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
      .sort();

  it('decrypts key files only in the local backend', () => {
    expect(filesMatching(/\bdecryptSecret\(|\.fromEncryptedJson\(/)).toEqual([
      'services/secure-keystore.ts', // where decryptSecret is defined
      'wallet/signers/local.ts',
    ]);
  });

  it('loads a decrypted key only in the local backend', () => {
    expect(filesMatching(/\bloadSolanaKeypair\(|\bloadEthereumWallet\(/)).toEqual(['wallet/signers/local.ts']);
  });

  it('asks the Ledger to sign only in the hardware backend', () => {
    expect(filesMatching(/\.signSolanaMessageBytes\(|\.signEthereumTransaction\(/)).toEqual([
      'wallet/signers/hardware.ts',
    ]);
  });

  it('broadcasts a caller-built Solana transaction only from submit', () => {
    expect(filesMatching(/\.sendAndConfirmRawTransaction\(/)).toEqual(['chains/solana/routes/submit.ts']);
  });

  it('never hands a stored Ethereum wallet to a contract: every EVM send goes through the chokepoint', () => {
    expect(filesMatching(/ethereum\.getWallet\(/)).toEqual([]);
  });
});
