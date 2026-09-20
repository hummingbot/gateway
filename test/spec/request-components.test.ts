import fs from 'fs';
import path from 'path';

/**
 * The request half of the generated-client contract (GW-9).
 *
 * Gateway's request bodies used to be anonymous objects declared in the route file, so
 * nothing named them in the spec and a generated client had to hand-write every request
 * model. The `$id`'d shapes in src/schemas were no substitute: they are the *base* types
 * the unified routes compose from, and predate the refactor, so they carry a per-connector
 * `network` and neither `connector` nor `chainNetwork`. A client generated from those was
 * wrong the same way for every route.
 *
 * These read the committed spec rather than building the app, which means they check the
 * document consumers actually generate from — and equally means they cannot notice that
 * it is stale. A route change with no regeneration leaves every case here passing.
 * Catching that needs regeneration and a comparison, which is the `Check openapi.json is
 * regenerated` step in CI, not a test.
 */
const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../openapi.json'), 'utf8'));
const components: Record<string, any> = spec.components?.schemas ?? {};

const requestBodies = (): Array<{ method: string; route: string; op: any }> =>
  Object.entries(spec.paths as Record<string, any>).flatMap(([route, ops]) =>
    Object.entries(ops as Record<string, any>)
      .filter(([, op]) => op?.requestBody)
      .map(([method, op]) => ({ method, route, op })),
  );

const refOf = (op: any): string | undefined => {
  const schema = op.requestBody?.content?.['application/json']?.schema;
  const ref: string | undefined = schema?.$ref;
  return ref?.replace('#/components/schemas/', '');
};

const propsOf = (name: string): string[] => Object.keys(components[name]?.properties ?? {}).sort();

/** A GET's query fields — path parameters are part of the route, not of the query shape. */
const queryParams = (op: any): string[] =>
  (op.parameters ?? [])
    .filter((p: any) => p.in === 'query')
    .map((p: any) => p.name)
    .sort();

const tradingGets = (): Array<{ route: string; params: string[] }> =>
  Object.entries(spec.paths as Record<string, any>)
    .filter(([route]) => route.startsWith('/trading/'))
    .filter(([, ops]) => ops.get?.parameters)
    .map(([route, ops]) => ({ route, params: queryParams(ops.get) }));

/**
 * The component describing a GET's query, found by shape rather than by reference.
 *
 * A GET cannot point at its component the way a body does: @fastify/swagger expands a
 * querystring into `parameters`, so nothing in the operation carries a `$ref`. The
 * component is published all the same — registering a schema and referencing it are
 * independent — so it is identified here by having exactly the operation's fields.
 */
const componentsForGet = (params: string[]): string[] =>
  Object.keys(components).filter((name) => JSON.stringify(propsOf(name)) === JSON.stringify(params));

const componentForGet = (params: string[]): string | undefined => componentsForGet(params)[0];

/**
 * The component name a `/trading` GET must publish, derived from its own path.
 *
 * Matching by shape alone cannot tell twins apart: `/trading/amm/quote-swap` and
 * `/trading/clmm/quote-swap` have identical query fields, as do the two positions-owned
 * reads. Removing one twin's `$id` therefore left every case here passing, because the
 * other still matched — the component vanished from the spec and nothing said so. A name
 * is unique, so this pins each read to the class a client will actually reach for.
 */
const expectedComponentName = (route: string): string => {
  const [, , type, operation] = route.split('/');
  const pascal = (value: string) =>
    value
      .split('-')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join('');
  return `${pascal(type)}${pascal(operation)}Request`;
};

describe('OpenAPI request bodies are generatable', () => {
  it('names every /trading request body as a component', () => {
    const unnamed = requestBodies()
      .filter(({ route }) => route.startsWith('/trading/'))
      .filter(({ op }) => !refOf(op))
      .map(({ method, route }) => `${method.toUpperCase()} ${route}`);

    expect(unnamed).toEqual([]);
  });

  it('resolves every $ref in the spec to a component that exists', () => {
    const refs = new Set<string>(
      [...JSON.stringify(spec).matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    );
    const dangling = [...refs].filter((name) => !(name in components)).sort();

    expect(dangling).toEqual([]);
  });

  it.each(
    requestBodies()
      .filter(({ route }) => route.startsWith('/trading/'))
      .map(({ method, route, op }) => [`${method.toUpperCase()} ${route}`, refOf(op)!]),
  )('%s publishes the shape actually on the wire (%s)', (_label, component) => {
    const schema = components[component];
    expect(schema).toBeDefined();

    const props = Object.keys(schema.properties ?? {});
    // The two fields every unified trading call sends, and the two the stale base types
    // were missing. `network` is the field they had instead — its presence here would
    // mean a base type got published in place of the route's own body.
    expect(props).toContain('connector');
    expect(props).toContain('chainNetwork');
    expect(props).not.toContain('network');
  });

  // The reads are most of this API, and were the half GW-9 left behind: their fields
  // reach the spec as `parameters`, so it looked as though no component could describe
  // them. It can — publishing does not depend on being referenced — and until it did,
  // the names a client reaches for (ClmmQuoteSwapRequest, FetchPoolsRequest) were held
  // by pre-refactor bases carrying `network` and no `connector`.
  it.each(tradingGets().map(({ route, params }) => [route, params]))(
    'GET %s publishes a component matching its query',
    (route, params) => {
      // By name first: the name is what a generated client imports, and it is the half a
      // shape match cannot check, because two reads can share a shape.
      const name = expectedComponentName(route as string);
      expect(Object.keys(components)).toContain(name);

      // Then by shape, so the right name cannot be published over the wrong fields —
      // which is the trap GW-10 found, with `ClmmQuoteSwapRequest` held by a pre-refactor
      // base carrying `network` and no `connector`.
      expect(propsOf(name)).toEqual(params as string[]);

      const props = propsOf(name);
      expect(props).toContain('connector');
      expect(props).toContain('chainNetwork');
      expect(props).not.toContain('network');
    },
  );

  it('publishes nothing that no route serves', () => {
    // Every component is either referenced, or is a GET's query shape. A component that
    // is neither is a stale base: it generates a class, under a name a caller trusts,
    // for a shape Gateway never sends or accepts.
    //
    // Matching by shape is what makes this possible at all — a GET has no $ref to follow
    // — and it is also the limit: a stale schema whose fields happen to equal some GET's
    // query is excused. In practice that only reaches the single-field `{ network }`
    // shapes the chain routes use, because every stale trading base carries `network`
    // where the live ones carry `chainNetwork`.
    // Across the whole document, not just the paths: a nested `data` shape is referenced
    // by its parent component rather than by any operation.
    const referenced = new Set<string>(
      [...JSON.stringify(spec).matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    );
    // All matches, not the first: the AMM and CLMM reads of the same kind have identical
    // query shapes, so one lookup would leave the other looking like an orphan.
    const getShapes = new Set(
      Object.values(spec.paths as Record<string, any>)
        .filter((ops: any) => ops.get?.parameters)
        .flatMap((ops: any) => componentsForGet(queryParams(ops.get))),
    );
    const orphans = Object.keys(components)
      .filter((name) => !referenced.has(name) && !getShapes.has(name))
      .sort();

    expect(orphans).toEqual([]);
  });
});
