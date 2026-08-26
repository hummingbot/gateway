import fs from 'fs';
import path from 'path';

import { OPERATION_IDS } from '../../src/services/operation-ids';

/**
 * Every operation is named, and named the same way twice running.
 *
 * `operationId` is the method name in a generated client. Gateway declared none, so every
 * generator invented one from the method and path — meaning a caller's `client.foo()` was
 * renamed by any path change, the same churn the component names were given `$id`s to
 * avoid. The names are chosen in `operation-ids.ts` rather than derived, and that only
 * holds while the table and the route table agree, in both directions.
 */
const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../openapi.json'), 'utf8'));

const operations = (): Array<{ method: string; route: string; op: any }> =>
  Object.entries(spec.paths as Record<string, any>).flatMap(([route, ops]) =>
    Object.entries(ops as Record<string, any>).map(([method, op]) => ({ method, route, op })),
  );

describe('every operation carries a chosen name', () => {
  it.each(operations().map(({ method, route, op }) => [`${method.toUpperCase()} ${route}`, op]))(
    '%s has an operationId',
    (_label, op) => {
      expect(typeof op.operationId).toBe('string');
      expect(op.operationId.length).toBeGreaterThan(0);
    },
  );

  // A duplicate is worse than a missing one: two operations collapse into a single method
  // on the generated client, and which one survives is the generator's choice.
  it('gives no two operations the same name', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const { method, route, op } of operations()) {
      const previous = seen.get(op.operationId);
      if (previous) collisions.push(`${op.operationId}: ${previous} and ${method.toUpperCase()} ${route}`);
      seen.set(op.operationId, `${method.toUpperCase()} ${route}`);
    }

    expect(collisions).toEqual([]);
  });

  // Both directions. A route with no entry is unnamed; an entry with no route is a name
  // a caller may already depend on, left pointing at nothing.
  it('has an entry for every route and a route for every entry', () => {
    const routes = new Set(operations().map(({ method, route }) => `${method.toUpperCase()} ${route}`));
    const entries = new Set(Object.keys(OPERATION_IDS));

    expect([...routes].filter((key) => !entries.has(key)).sort()).toEqual([]);
    expect([...entries].filter((key) => !routes.has(key)).sort()).toEqual([]);
  });

  it('publishes the name the table chose, not one derived from the path', () => {
    for (const { method, route, op } of operations()) {
      expect(op.operationId).toBe(OPERATION_IDS[`${method.toUpperCase()} ${route}`]);
    }
  });
});

describe('every operation describes how it fails', () => {
  // Three of 56 declared any non-2xx response, so a generated client had no error model at
  // all — while `code` is the field callers branch on to decide whether to retry.
  it.each(operations().map(({ method, route, op }) => [`${method.toUpperCase()} ${route}`, op]))(
    '%s declares 400 and 500',
    (_label, op) => {
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['400', '500']));
    },
  );

  it('points them all at one published envelope', () => {
    expect(spec.components.schemas.ErrorResponse).toBeDefined();
    expect(Object.keys(spec.components.schemas.ErrorResponse.properties)).toEqual(
      expect.arrayContaining(['statusCode', 'error', 'message', 'code']),
    );

    for (const { op } of operations()) {
      for (const status of ['400', '500']) {
        expect(op.responses[status].content['application/json'].schema.$ref).toBe('#/components/schemas/ErrorResponse');
      }
    }
  });

  // The tag becomes a class name in most generators, so a singular stray puts two chain
  // routes in a class of their own.
  it('tags every operation with a declared tag', () => {
    const declared = new Set((spec.tags ?? []).map((tag: any) => tag.name));
    const used = new Set(operations().flatMap(({ op }) => op.tags ?? []));

    expect([...used].filter((tag) => !declared.has(tag)).sort()).toEqual([]);
  });
});
