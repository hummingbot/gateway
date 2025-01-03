import { Type, Static } from '@sinclair/typebox';
import { AvailableNetworks } from '../services/config-manager-types';

export const ConnectorSchema = Type.Object({
  name: Type.String({ description: 'Connector name' }),
  trading_type: Type.Array(Type.String()),
  chain_type: Type.String(),
  available_networks: Type.Array(Type.String()),
  additional_spenders: Type.Optional(Type.Array(Type.String())),
  additional_add_wallet_prompts: Type.Optional(Type.Record(Type.String(), Type.String()))
});

export const ConnectorsResponseSchema = Type.Object({
  connectors: Type.Array(ConnectorSchema)
});

export type ConnectorsResponse = Static<typeof ConnectorsResponseSchema>;
