import { Type, Static } from '@sinclair/typebox';

// Network schema
export const NetworkSchema = Type.Object({
  chain: Type.String(),
  networks: Type.Array(Type.String())
});

// Connector schema
export const ConnectorSchema = Type.Object({
  name: Type.String(),
  trading_types: Type.Array(Type.String()),
  available_networks: Type.Array(NetworkSchema)
});

// Connectors response schema
export const ConnectorsResponseSchema = Type.Object({
  connectors: Type.Array(ConnectorSchema)
});

// TypeScript types
export type Network = Static<typeof NetworkSchema>;
export type Connector = Static<typeof ConnectorSchema>;
export type ConnectorsResponse = Static<typeof ConnectorsResponseSchema>;