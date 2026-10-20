import { executeQuote as zeroX } from '../../src/connectors/0x/router-routes/executeQuote';
import { executeQuote as dflow } from '../../src/connectors/dflow/router-routes/executeQuote';
import { executeQuote as jupiter } from '../../src/connectors/jupiter/router-routes/executeQuote';
import { executeQuote as meteoraDbc } from '../../src/connectors/meteora/launch-routes/executeQuote';
import { executeQuote as okx } from '../../src/connectors/okx/router-routes/executeQuote';
import { executeQuote as pancakeswap } from '../../src/connectors/pancakeswap/router-routes/executeQuote';
import { executeQuote as pump } from '../../src/connectors/pump/router-routes/executeQuote';
import { executeQuote as titan } from '../../src/connectors/titan/router-routes/executeQuote';
import { executeQuote as uniswap } from '../../src/connectors/uniswap/router-routes/executeQuote';
import { quoteCache } from '../../src/services/quote-cache';

/**
 * A quoteId is only good at the connector that priced it. Every connector's execute path
 * must refuse another connector's cached quote before it touches a chain or a wallet —
 * its shape and signing path are not the ones this connector would build for.
 */
describe('executeQuote refuses a quote another connector cached', () => {
  const executors: Array<[string, typeof jupiter]> = [
    ['0x', zeroX],
    ['dflow', dflow],
    ['jupiter', jupiter],
    ['meteora-dbc', meteoraDbc],
    ['okx', okx],
    ['pancakeswap', pancakeswap],
    ['pump', pump],
    ['titan', titan],
    ['uniswap', uniswap],
  ];

  it.each(executors)('%s', async (connector, executeQuote) => {
    const quoteId = `quote-from-another-connector-${connector}`;
    quoteCache.set(quoteId, `not-${connector}`, { network: 'mainnet', slippagePct: 1 }, { slippagePct: 1 });

    await expect(executeQuote('wallet', 'mainnet', quoteId)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Quote not found or expired',
    });

    quoteCache.delete(quoteId);
  });
});
