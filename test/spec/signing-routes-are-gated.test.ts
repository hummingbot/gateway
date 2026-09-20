import fs from 'fs';
import path from 'path';

import { isSensitivePath } from '../../src/services/gateway-security';

// The API-token gate works off a hand-written list of path patterns, and a hand-written
// list drifts: /chains/* was left off it entirely, so an unauthenticated network request
// to POST /chains/ethereum/approve could have the hot wallet sign an unlimited allowance
// to any address — draining every ERC-20 it held — on a Gateway whose operator had set
// GATEWAY_API_KEY and every reason to believe it was closed.
//
// This derives the list that matters from the spec instead of restating it. A route that
// broadcasts a transaction answers with the identifier of the transaction it just signed;
// a route that merely reports on one is given that identifier by the caller. So: any
// operation that returns a `signature` it was not handed is a signing route, and every
// signing route must be behind the gate. Adding one and forgetting the pattern fails here.

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../../openapi.json'), 'utf8'));
const components = spec.components.schemas;

const propertyNames = (schema: any, seen: string[] = []): Set<string> => {
  const found = new Set<string>();
  if (!schema || typeof schema !== 'object') return found;
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    if (seen.includes(name)) return found;
    return propertyNames(components[name], [...seen, name]);
  }
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    found.add(key);
    for (const nested of propertyNames(value, seen)) found.add(nested);
  }
  for (const key of ['items', 'allOf', 'anyOf', 'oneOf']) {
    const value = (schema as any)[key];
    for (const entry of Array.isArray(value) ? value : [value]) {
      for (const nested of propertyNames(entry, seen)) found.add(nested);
    }
  }
  return found;
};

const responseProps = (operation: any) =>
  propertyNames(operation?.responses?.['200']?.content?.['application/json']?.schema);
const requestProps = (operation: any) => propertyNames(operation?.requestBody?.content?.['application/json']?.schema);

const signingRoutes: string[] = [];
const reportingRoutes: string[] = [];
for (const [route, operations] of Object.entries<any>(spec.paths)) {
  for (const [method, operation] of Object.entries<any>(operations)) {
    if (method === 'parameters') continue;
    if (!responseProps(operation).has('signature')) continue;
    (requestProps(operation).has('signature') ? reportingRoutes : signingRoutes).push(
      route.replace(/\{(\w+)\}/g, 'ethereum'),
    );
  }
}

describe('every route that signs a transaction is behind the API-token gate', () => {
  it('finds signing routes to check', () => {
    // Guards the guard: a spec that stopped naming `signature` would make this whole file
    // vacuous, and it would still pass.
    expect(signingRoutes.length).toBeGreaterThan(10);
  });

  it.each(signingRoutes)('gated: %s', (route) => {
    expect(isSensitivePath(route)).toBe(true);
  });

  it('does not gate a route that only reports on a signature it was given', () => {
    // /chains/{chain}/poll is how a bot follows a transaction it already sent. Gating it
    // would break polling for a co-located bot without protecting anything: it signs
    // nothing.
    expect(reportingRoutes).toEqual(['/chains/ethereum/poll']);
    expect(isSensitivePath('/chains/solana/poll')).toBe(false);
  });
});
