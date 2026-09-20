/**
 * Schema vocabulary the route schemas use beyond plain JSON Schema, declared to AJV.
 *
 * Fastify runs AJV in strict mode, which rejects a schema carrying a keyword or
 * format it does not know — including the `x-` vendor extensions and annotations
 * below, which are legal OpenAPI but meaningless to a validator. Declaring them
 * keeps strict mode on for real mistakes while letting them reach the spec.
 */
export const SCHEMA_VENDOR_KEYWORDS = [
  // Names the connectors that actually honor an optional field. Several unified
  // routes accept parameters only some connectors implement (approximateIfNoExactOut
  // on Solana routers, indicativePrice on 0x, page/includeUnverified on Meteora,
  // sortDirection/verifiedOnly on Orca); AJV strips a field the chosen connector
  // ignores, so without this the only record of which connector honors what would
  // be prose in a description.
  'x-connectors',
];

/**
 * Marks a numeric field as a decimal quantity — a token amount, price, fee, or
 * percentage — rather than a counter or identifier.
 *
 * It does not change the wire format: the value stays a JSON number, and JS has
 * no decimal type to widen it to. What it does is carry the intent into the
 * OpenAPI document, so a generated client can map the field to its language's
 * decimal type (Python's Decimal, for one) instead of a float. Validation is a
 * no-op — every JSON number qualifies.
 */
export const DECIMAL_FORMAT = {
  decimal: {
    type: 'number' as const,
    validate: () => true,
  },
};

/** AJV options for every Fastify instance in the app (and in tests). */
export const ajvOptions = {
  customOptions: {
    keywords: SCHEMA_VENDOR_KEYWORDS,
    formats: DECIMAL_FORMAT,
    // Fastify defaults this to true, which STRIPS a property the schema does not
    // declare. Combined with `additionalProperties: false` on the request components,
    // stripping is the wrong half of the pair: AJV would quietly delete the key and the
    // route would run on what was left. `slippagePc: 5` on an execute-swap was dropped
    // that way and the trade went out at the connector's configured slippage — the
    // caller's stated tolerance, silently ignored. False makes the declaration mean what
    // it says: an undeclared key is a 400, not a deletion.
    removeAdditional: false,
  },
};

/**
 * Names the property a request was rejected for.
 *
 * AJV's message for `additionalProperties` is "must NOT have additional properties",
 * which tells a caller that something is wrong and not what. That is the whole point of
 * rejecting the key rather than dropping it: `slippagePc` for `slippagePct` is a typo
 * someone has to see. The offending name is in the error's params and nowhere in its
 * message, so this puts it there.
 *
 * Every other keyword keeps Fastify's own wording, which callers and tests already match
 * on ("body must have required property 'connector'").
 */
export const schemaErrorFormatter = (errors: any[], dataVar: string): Error => {
  const rendered = errors.map((error) => {
    if (error.keyword === 'additionalProperties') {
      return `${dataVar} has an unknown property '${error.params?.additionalProperty}'`;
    }
    return `${dataVar}${error.instancePath} ${error.message}`;
  });
  return new Error(rendered.join(', '));
};
