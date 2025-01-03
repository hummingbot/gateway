import { Type, Static } from '@sinclair/typebox';

export const ConfigUpdateRequestSchema = Type.Object({
  configPath: Type.String({ description: 'Configuration path' }),
  configValue: Type.Union([
    Type.String(),
    Type.Number(),
    Type.Boolean(),
    Type.Object({}),
    Type.Array(Type.Any())
  ], { description: 'Configuration value' })
});

export const ConfigUpdateResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' })
});

export type ConfigUpdateRequest = Static<typeof ConfigUpdateRequestSchema>;
export type ConfigUpdateResponse = Static<typeof ConfigUpdateResponseSchema>;
