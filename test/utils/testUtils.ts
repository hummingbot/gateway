import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

export const fastifyWithTypeProvider = () => {
  return Fastify().withTypeProvider<TypeBoxTypeProvider>();
};
