import { Type } from '@sinclair/typebox';

/**
 * A monetary quantity: a decimal string on the wire, a number in the code.
 *
 * Every money field used to be `DecimalNumber({ })`, which the spec emits
 * as `"type": "number"` — an IEEE 754 double. A value that is an exact decimal on-chain
 * (an atomic integer over 10^decimals) arrived as the nearest representable double, so a
 * fee of 0.000037 was published as 0.00003700000000250725 and an input of 0.01 as
 * 0.010000000000000002. The `format: 'decimal'` annotation was a hint no JSON parser acts
 * on; it did not change what was on the wire.
 *
 * It defeated the consumer's own care. hummingbot-api models these as `Decimal`, which
 * would be exact — but the value had already lost precision before pydantic saw it:
 * `Decimal(str(0.00003700000000250725))` keeps the noise, `Decimal('0.000037')` does not.
 * And the error is relative, so it grows with the number: a wei-denominated amount above
 * ~9e15 cannot round-trip through a double at all.
 *
 * The static type stays `number` deliberately. These schemas are the domain types the
 * connectors compute with — they multiply, compare and log them — and making that
 * `string` would smear parsing through every one of them for no gain. Fastify serializes
 * a number into a string-typed field, so the wire carries `"0.000037"` while the code
 * carries `0.000037`: the conversion happens once, at the boundary, where it belongs.
 *
 * `format: 'decimal'` is kept because the model generators on both sides map
 * `string` + that format to `Decimal`, which is what carries the exactness past the wire
 * and into the caller.
 *
 * REQUESTS deliberately stay `Type.Number`. A string there would arrive as a string while
 * the type still said number, and the handler would do arithmetic on it — worse than the
 * problem. That half needs parsing at each boundary and is a separate change.
 */
export const DecimalNumber = (options: Record<string, unknown> = {}) =>
  Type.Unsafe<number>(Type.String({ format: 'decimal', ...options }));
