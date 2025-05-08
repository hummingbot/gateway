import {KeyringPair} from '@polkadot/keyring/types';
import { Type, Static } from '@sinclair/typebox';
import {
  BalanceRequestSchema,
  BalanceResponseSchema,
  EstimateGasRequestSchema,
  EstimateGasResponseSchema,
  PollRequestSchema,
  PollResponseSchema,
  StatusRequestSchema,
  StatusResponseSchema,
  TokensRequestSchema,
  TokensResponseSchema
} from '../../schemas/chain-schema';

/**
 * Represents a Polkadot account with its address and keys
 */
export interface PolkadotAccount {
  /** The public address of the account */
  address: string;
  /** The public key in hex format */
  publicKey: string;
  /** Optional keyring pair for signing transactions */
  keyringPair?: KeyringPair;
}

/**
 * Polkadot balance request schema
 */
export const PolkadotBalanceRequestSchema = Type.Composite([
  BalanceRequestSchema
], { $id: 'PolkadotBalanceRequest' });
export type PolkadotBalanceRequest = Static<typeof PolkadotBalanceRequestSchema>;

/**
 * Polkadot balance response schema
 */
export const PolkadotBalanceResponseSchema = Type.Composite([
  BalanceResponseSchema
], { $id: 'PolkadotBalanceResponse' });
export type PolkadotBalanceResponse = Static<typeof PolkadotBalanceResponseSchema>;

/**
 * Polkadot estimate gas request schema
 */
export const PolkadotEstimateGasRequestSchema = Type.Composite([
  EstimateGasRequestSchema
], { $id: 'PolkadotEstimateGasRequest' });
export type PolkadotEstimateGasRequest = Static<typeof PolkadotEstimateGasRequestSchema>;

/**
 * Polkadot estimate gas response schema
 */
export const PolkadotEstimateGasResponseSchema = Type.Composite([
  EstimateGasResponseSchema
], { $id: 'PolkadotEstimateGasResponse' });
export type PolkadotEstimateGasResponse = Static<typeof PolkadotEstimateGasResponseSchema>;

/**
 * Polkadot poll request schema
 */
export const PolkadotPollRequestSchema = Type.Composite([
  PollRequestSchema
], { $id: 'PolkadotPollRequest' });
export type PolkadotPollRequest = Static<typeof PolkadotPollRequestSchema>;

/**
 * Polkadot poll response schema
 */
export const PolkadotPollResponseSchema = Type.Composite([
  PollResponseSchema
], { $id: 'PolkadotPollResponse' });
export type PolkadotPollResponse = Static<typeof PolkadotPollResponseSchema>;

/**
 * Polkadot status request schema
 */
export const PolkadotStatusRequestSchema = Type.Composite([
  StatusRequestSchema
], { $id: 'PolkadotStatusRequest' });
export type PolkadotStatusRequest = Static<typeof PolkadotStatusRequestSchema>;

/**
 * Polkadot status response schema
 */
export const PolkadotStatusResponseSchema = Type.Composite([
  StatusResponseSchema
], { $id: 'PolkadotStatusResponse' });
export type PolkadotStatusResponse = Static<typeof PolkadotStatusResponseSchema>;

/**
 * Polkadot tokens request schema
 */
export const PolkadotTokensRequestSchema = Type.Composite([
  TokensRequestSchema
], { $id: 'PolkadotTokensRequest' });
export type PolkadotTokensRequest = Static<typeof PolkadotTokensRequestSchema>;

/**
 * Polkadot tokens response schema
 */
export const PolkadotTokensResponseSchema = Type.Composite([
  TokensResponseSchema
], { $id: 'PolkadotTokensResponse' });
export type PolkadotTokensResponse = Static<typeof PolkadotTokensResponseSchema>;
