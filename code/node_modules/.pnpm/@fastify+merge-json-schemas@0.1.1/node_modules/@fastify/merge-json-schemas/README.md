# @fastify/merge-json-schema

__merge-json-schema__ is a javascript library that build a logical product (AND) for multiple [JSON schemas](https://json-schema.org/draft/2020-12/json-schema-core#name-introduction).

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
  - [mergeSchemas(schemas, options)](#mergeschemasschemas-options)
  - [resolvers](#resolvers)
  - [defaultResolver](#defaultresolver)
- [License](#license)

<a name="installation"></a>

## Installation

```bash
npm install @fastify/merge-json-schema
```

<a name="usage"></a>

## Usage

```javascript
const assert = require('node:assert')
const { mergeSchemas } = require('merge-json-schema')

const schema1 = {
  $id: 'schema1',
  type: 'object',
  properties: {
    foo: { type: 'string', enum: ['foo1', 'foo2'] },
    bar: { type: 'string', minLength: 3 }
  }
}

const schema2 = {
  $id: 'schema1',
  type: 'object',
  properties: {
    foo: { type: 'string', enum: ['foo1', 'foo3'] },
    bar: { type: 'string', minLength: 5 }
  },
  required: ['foo']
}

const mergedSchema = mergeSchemas([schema1, schema2])
assert.deepStrictEqual(mergedSchema, {
  $id: 'schema1',
  type: 'object',
  properties: {
    foo: { type: 'string', enum: ['foo1'] },
    bar: { type: 'string', minLength: 5 }
  },
  required: ['foo']
})
```

<a name="api"></a>

## API

<a name="merge-schemas"></a>

#### mergeSchemas(schemas, options)

Builds a logical conjunction (AND) of multiple [JSON schemas](https://json-schema.org/draft/2020-12/json-schema-core#name-introduction).

- `schemas` __\<objects[]\>__ - list of JSON schemas to merge.
- `options` __\<object\>__ - optional options.
  - `resolvers` __\<object\>__ - custom resolvers for JSON schema keywords. Each key is the name of a JSON schema keyword. Each value is a resolver function. See [keywordResolver](#keywordresolver-keyword-values-mergedschema-parentschemas-options).
  - `defaultResolver` __\<function\>__ - custom default resolver for JSON schema keywords. See [keywordResolver](#keywordresolver-keyword-values-mergedschema-parentschemas-options).
  - `onConflict` __\<string\>__ - action to take when a conflict is found. Used by the default `defaultResolver`. Default is `throw`. Possible values are:
    - `throw` - throws an error if found a multiple different schemas for the same keyword.
    - `ignore` - do nothing if found a multiple different schemas for the same keyword.
    - `first` - use the value of the first schema if found a multiple different schemas for the same keyword.

#### resolvers

A list of default resolvers that __merge-json-schema__ uses to merge JSON schemas. You can override the default resolvers by passing a list of custom resolvers in the `options` argument of `mergeSchemas`. See [keywordResolver](#keywordresolver-keyword-values-mergedschema-parentschemas-options).

#### defaultResolver

A default resolver that __merge-json-schema__ uses to merge JSON schemas. Default resolver is used when no custom resolver is defined for a JSON schema keyword. By default, the default resolver works as follows:

- If only one schema contains the keyword, the value of the keyword is used as the merged value.
- If multiple schemas contain the exact same value for the keyword, the value of the keyword is used as the merged value.
- If multiple schemas contain different values for the keyword, it throws an error.

#### keywordResolver (keyword, values, mergedSchema, parentSchemas, options)

__merge-json-schema__ uses a set of resolvers to merge JSON schemas. Each resolver is associated with a JSON schema keyword. The resolver is called when the keyword is found in the schemas to merge. The resolver is called with the following arguments:

- `keyword` __\<string\>__ - the name of the keyword to merge.
- `values` __\<any[]\>__ - the values of the keyword to merge. The length of the array is equal to the number of schemas to merge. If a schema does not contain the keyword, the value is `undefined`.
- `mergedSchema` __\<object\>__ - an instance of the merged schema.
- `parentSchemas` __\<object[]\>__ - the list of parent schemas.
- `options` __\<object\>__ - the options passed to `mergeSchemas`.

The resolver must set the merged value of the `keyword` in the `mergedSchema` object.

__Example:__ resolver for the `minNumber` keyword.

```javascript
function minNumberResolver (keyword, values, mergedSchema) {
  mergedSchema[keyword] = Math.min(...values)
}
```

<a name="license"></a>

## License

MIT
