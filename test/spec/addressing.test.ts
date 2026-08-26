import fs from 'fs';
import path from 'path';

/**
 * One way to say where a request applies.
 *
 * There used to be three, two of them inside a single router: `/pools/` took `chain` and
 * `network` separately, `/pools/find` took `chainNetwork`, and `/chains/{chain}/*` took a
 * path parameter plus a query. A caller had to learn which route wanted which, and the two
 * halves could disagree — `chain=solana&network=mainnet` names nothing.
 *
 * The rule is now: a route addressed by a `chain` path parameter keeps it; everything else
 * takes one `chainNetwork`. Wallets are the deliberate exception and are covered below.
 */
const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../openapi.json'), 'utf8'));

const fieldsOf = (op: any): Set<string> => {
  const params = (op.parameters ?? []).map((p: any) => p.name);
  let body = op.requestBody?.content?.['application/json']?.schema ?? {};
  if (body.$ref) body = spec.components.schemas[body.$ref.replace('#/components/schemas/', '')] ?? {};
  return new Set([...params, ...Object.keys(body.properties ?? {})]);
};

const operations = (): Array<{ label: string; route: string; op: any }> =>
  Object.entries(spec.paths as Record<string, any>).flatMap(([route, ops]) =>
    Object.entries(ops as Record<string, any>).map(([method, op]) => ({
      label: `${method.toUpperCase()} ${route}`,
      route,
      op,
    })),
  );

/** A wallet is a keypair, and a keypair works on every network of its chain. */
const WALLET_ROUTES = /^\/wallet\//;

describe('every route addresses a chain-network one way', () => {
  it.each(operations().map(({ label, route, op }) => [label, route, op]))('%s', (_label, route, op) => {
    const fields = fieldsOf(op);
    const addressed = ['chainNetwork', 'chain', 'network'].filter((f) => fields.has(f));
    if (addressed.length === 0) return;

    if ((route as string).startsWith('/chains/')) {
      // The chain is in the path, so the body names only the network.
      expect(fields.has('chainNetwork')).toBe(false);
      return;
    }

    if (WALLET_ROUTES.test(route as string)) {
      expect(addressed).toEqual(['chain']);
      return;
    }

    expect(addressed).toEqual(['chainNetwork']);
  });

  // Named separately because it is the pairing that used to be wrong: the same router
  // asked for the same thing two ways depending on which of its routes you reached.
  it('asks /pools and /tokens the same way on every one of their routes', () => {
    const inconsistent = operations()
      .filter(({ route }) => route.startsWith('/pools/') || route.startsWith('/tokens/'))
      .filter(({ op }) => {
        const fields = fieldsOf(op);
        return fields.has('chain') || fields.has('network') || !fields.has('chainNetwork');
      })
      .map(({ label }) => label);

    expect(inconsistent).toEqual([]);
  });

  // Fastify injects a schema default before the handler runs, so a defaulted
  // chainNetwork on a delete would pick a list and remove from it.
  it.each(
    operations()
      .filter(({ label }) => label.startsWith('DELETE') || label.startsWith('POST'))
      .filter(({ route }) => route.startsWith('/pools/') || route.startsWith('/tokens/'))
      .map(({ label, op }) => [label, op]),
  )('%s makes the caller name the chain-network', (_label, op) => {
    const schemas = [
      ...(op.parameters ?? []).map((p: any) => p.schema),
      ...Object.entries(
        (() => {
          let body = op.requestBody?.content?.['application/json']?.schema ?? {};
          if (body.$ref) body = spec.components.schemas[body.$ref.replace('#/components/schemas/', '')] ?? {};
          return body.properties ?? {};
        })(),
      )
        .filter(([name]) => name === 'chainNetwork')
        .map(([, schema]) => schema),
    ].filter(Boolean);

    const chainNetwork = schemas.find(
      (s: any) => Array.isArray(s?.enum) && s.enum.some((v: string) => v.includes('-')),
    );
    if (chainNetwork) expect(chainNetwork.default).toBeUndefined();
  });
});
