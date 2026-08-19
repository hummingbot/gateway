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
  },
};
