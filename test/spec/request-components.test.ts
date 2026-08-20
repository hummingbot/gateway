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
 * These read the committed spec rather than building the app, so they also catch a spec
 * that was not regenerated after a route changed.
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
});
