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

async function main() {
  const { gatewayApp } = await import('../src/app');

  await gatewayApp.ready();
  const spec = (gatewayApp as any).swagger();

  const outPath = path.resolve(__dirname, '..', 'openapi.json');
  fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);

  const paths = Object.keys(spec.paths ?? {});
  console.log(`OpenAPI spec written to ${outPath} (${paths.length} paths)`);

  await gatewayApp.close();
}

main().catch((e) => {
  console.error('Failed to generate the OpenAPI spec:', e);
  process.exit(1);
});
