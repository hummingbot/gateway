/**
 * Write the OpenAPI spec to openapi.json without starting a server.
 *
 * The previous `generate:openapi` curled http://localhost:15888/docs/json, so
 * regenerating meant standing up a Gateway first — which kept the committed spec
 * from being refreshed in CI, and let it drift from the routes. @fastify/swagger
 * can produce the document from the route table alone once the app is ready, so
 * this needs nothing running.
 *
 * Run with: pnpm generate:openapi
 */
import fs from 'fs';
import path from 'path';

// The app builds an HTTPS server unless it is in dev mode, and HTTPS needs the
// cert passphrase. Spec generation touches no sockets, so force dev mode before
// importing the app.
process.env.GATEWAY_TEST_MODE = 'dev';

/**
 * The port the shipped template configures, rather than the one this machine runs on.
 *
 * `servers[0].url` is built from `server.port`, so a developer who moved Gateway off the
 * default wrote their port into the committed spec — the same way the wallet defaults
 * were written in, and with the same effect: the artifact could not match what another
 * machine produces.
 */
function templateServerPort(): number {
  const template = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'templates', 'server.yml'), 'utf8');
  const match = template.match(/^port:\s*(\d+)/m);
  if (!match) {
    throw new Error("No `port` in src/templates/server.yml; the spec would carry this machine's port.");
  }
  return Number(match[1]);
}

/**
 * Replace this machine's configured wallets with the placeholders the templates ship.
 *
 * The execute routes default `walletAddress` to the chain config's `defaultWallet`, which
 * is right at runtime — a caller who omits it means "the wallet I configured" — and wrong
 * in a committed artifact. The spec is checked in and vendored by consumers, so whoever
 * regenerated it last had their address published, and the file could never match what
 * another machine or CI produces. `src/templates/chains/*.yml` already use these
 * placeholders; this makes the artifact agree with them.
 */
function withoutLocalWallets(json: string): string {
  const placeholders: Array<[string, string]> = [];

  try {
    const { getSolanaChainConfig } = require('../src/chains/solana/solana.config');
    placeholders.push([getSolanaChainConfig().defaultWallet, '<solana-wallet-address>']);
  } catch {
    // No Solana config here; nothing of its to redact.
  }
  try {
    const { getEthereumChainConfig } = require('../src/chains/ethereum/ethereum.config');
    placeholders.push([getEthereumChainConfig().defaultWallet, '<ethereum-wallet-address>']);
  } catch {
    // Likewise for Ethereum.
  }

  return placeholders.reduce(
    (text, [wallet, placeholder]) => (wallet && !wallet.startsWith('<') ? text.split(wallet).join(placeholder) : text),
    json,
  );
}

async function main() {
  const { gatewayApp } = await import('../src/app');

  await gatewayApp.ready();
  const spec = (gatewayApp as any).swagger();

  // The document describes Gateway, not this checkout of it.
  spec.servers = [{ url: `http://localhost:${templateServerPort()}` }];

  const outPath = path.resolve(__dirname, '..', 'openapi.json');
  fs.writeFileSync(outPath, `${withoutLocalWallets(JSON.stringify(spec, null, 2))}\n`);

  const paths = Object.keys(spec.paths ?? {});
  console.log(`OpenAPI spec written to ${outPath} (${paths.length} paths)`);

  await gatewayApp.close();
}

main().catch((e) => {
  console.error('Failed to generate the OpenAPI spec:', e);
  process.exit(1);
});
