import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

import { ajvOptions } from '../../src/services/schema-keywords';

// Mirrors the app's AJV configuration so schemas that validate in production
// (including the x- vendor extensions) also validate under test.
export const fastifyWithTypeProvider = () => {
  return Fastify({ ajv: ajvOptions }).withTypeProvider<TypeBoxTypeProvider>();
};
