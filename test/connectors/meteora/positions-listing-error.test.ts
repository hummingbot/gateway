/**
 * A failed position listing reports why it failed.
 *
 * Every failure used to be replaced by "Unable to fetch Meteora positions due to a
 * known SDK bug", so a node refusing getProgramAccounts (#616), or simply unreachable,
 * read as an upstream defect the user could do nothing about.
 */
import DLMM from '@meteora-ag/dlmm';
import { Keypair } from '@solana/web3.js';

import { Meteora } from '../../../src/connectors/meteora/meteora';

const WALLET = Keypair.generate().publicKey;
const meteora = () => Object.assign(Object.create(Meteora.prototype), { solana: { connection: {} } }) as Meteora;

afterEach(() => jest.restoreAllMocks());

describe('Meteora getAllPositionsForWallet', () => {
  it('reports the RPC error it was given', async () => {
    jest
      .spyOn(DLMM, 'getAllLbPairPositionsByUser')
      .mockRejectedValue(
        new Error('403 Forbidden: {"error":{"code":-32600,"message":"getProgramAccounts not supported"}}'),
      );

    await expect(meteora().getAllPositionsForWallet(WALLET)).rejects.toThrow(
      `Failed to list Meteora positions for ${WALLET.toBase58()}: 403 Forbidden: ` +
        `{"error":{"code":-32600,"message":"getProgramAccounts not supported"}}. The listing reads the DLMM ` +
        `program's accounts with getProgramAccounts, which some RPC nodes do not serve.`,
    );
  });

  it('leaves a rate limit as a 429', async () => {
    const rateLimited = Object.assign(new Error('Solana RPC rate limit exceeded'), { statusCode: 429 });
    jest.spyOn(DLMM, 'getAllLbPairPositionsByUser').mockRejectedValue(rateLimited);

    await expect(meteora().getAllPositionsForWallet(WALLET)).rejects.toBe(rateLimited);
  });
});
