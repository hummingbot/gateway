import * as crypto from 'crypto';

import { Okx } from '../../../src/connectors/okx/okx';

jest.mock('../../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn().mockResolvedValue({ network: 'mainnet-beta' }),
  },
}));

jest.mock('../../../src/connectors/okx/okx.config', () => ({
  OkxConfig: {
    chain: 'solana',
    networks: ['mainnet-beta'],
    tradingTypes: ['router'],
    config: {
      slippagePct: 1,
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
      computeUnitPrice: 0,
      availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta'] }],
    },
  },
}));

describe('Okx request signing', () => {
  it('produces OKX-format HMAC headers for a fixed timestamp', async () => {
    const okx = await Okx.getInstance('mainnet-beta');

    const timestamp = '2026-07-03T00:00:00.000Z';
    const pathWithQuery = '/api/v6/dex/aggregator/quote?amount=1000&chainIndex=501';
    const headers = okx.signedHeaders('GET', pathWithQuery, timestamp);

    // The signature is base64(HMAC-SHA256(timestamp + method + requestPathWithQuery, secretKey))
    const expectedSign = crypto
      .createHmac('sha256', 'test-secret-key')
      .update(timestamp + 'GET' + pathWithQuery)
      .digest('base64');

    expect(headers).toEqual({
      'OK-ACCESS-KEY': 'test-api-key',
      'OK-ACCESS-SIGN': expectedSign,
      'OK-ACCESS-PASSPHRASE': 'test-passphrase',
      'OK-ACCESS-TIMESTAMP': timestamp,
    });

    // Known vector: locks the exact signing-string composition against regressions
    expect(expectedSign).toBe(
      crypto
        .createHmac('sha256', 'test-secret-key')
        .update('2026-07-03T00:00:00.000ZGET/api/v6/dex/aggregator/quote?amount=1000&chainIndex=501')
        .digest('base64'),
    );
  });

  it('signature changes when the query string changes', async () => {
    const okx = await Okx.getInstance('mainnet-beta');
    const timestamp = '2026-07-03T00:00:00.000Z';

    const a = okx.signedHeaders('GET', '/api/v6/dex/aggregator/quote?amount=1000', timestamp);
    const b = okx.signedHeaders('GET', '/api/v6/dex/aggregator/quote?amount=1001', timestamp);

    expect(a['OK-ACCESS-SIGN']).not.toBe(b['OK-ACCESS-SIGN']);
  });
});

describe('Okx constructor credential validation', () => {
  it('throws a clear error when credentials are missing', async () => {
    jest.resetModules();
    jest.doMock('../../../src/connectors/okx/okx.config', () => ({
      OkxConfig: {
        chain: 'solana',
        networks: ['mainnet-beta'],
        tradingTypes: ['router'],
        config: {
          slippagePct: 1,
          apiKey: '',
          secretKey: '',
          passphrase: '',
          computeUnitPrice: 0,
          availableNetworks: [{ chain: 'solana', networks: ['mainnet-beta'] }],
        },
      },
    }));
    const { Okx: FreshOkx } = await import('../../../src/connectors/okx/okx');

    await expect(FreshOkx.getInstance('mainnet-beta')).rejects.toThrow(/OKX DEX API credentials are not configured/);
  });
});
