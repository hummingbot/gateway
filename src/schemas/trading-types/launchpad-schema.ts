import { Type, Static } from '@sinclair/typebox';

// Type definitions for Launchpad operations

// Schema for getting mint information
export const GetMintInfoRequest = Type.Object({
  network: Type.Optional(Type.String()),
  mintId: Type.String({ description: 'Token mint address' }),
}, { $id: 'GetMintInfoRequest' });
export type GetMintInfoRequestType = Static<typeof GetMintInfoRequest>;

// Schema for mint data returned from the API
export const SocialInfoSchema = Type.Object({
  website: Type.Optional(Type.String()),
  twitter: Type.Optional(Type.String()),
  discord: Type.Optional(Type.String()),
  telegram: Type.Optional(Type.String()),
  github: Type.Optional(Type.String()),
}, { $id: 'SocialInfo' });
export type SocialInfo = Static<typeof SocialInfoSchema>;

export const TokenMetadataSchema = Type.Object({
  name: Type.String(),
  symbol: Type.String(),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  decimals: Type.Number(),
  totalSupply: Type.Number(),
}, { $id: 'TokenMetadata' });
export type TokenMetadata = Static<typeof TokenMetadataSchema>;

export const MarketInfoSchema = Type.Object({
  circulatingSupply: Type.Optional(Type.Number()),
  marketCap: Type.Optional(Type.Number()),
  fullyDilutedValuation: Type.Optional(Type.Number()),
  launchDate: Type.Optional(Type.String()),
  initialPrice: Type.Optional(Type.Number()),
  currentPrice: Type.Optional(Type.Number()),
}, { $id: 'MarketInfo' });
export type MarketInfo = Static<typeof MarketInfoSchema>;

export const MintInfoSchema = Type.Object({
  mintAddress: Type.String(),
  metadata: TokenMetadataSchema,
  creatorAddress: Type.String(),
  creationDate: Type.String(),
  marketInfo: Type.Optional(MarketInfoSchema),
  socialInfo: Type.Optional(SocialInfoSchema),
  status: Type.String({ enum: ['active', 'pending', 'completed'] }),
}, { $id: 'MintInfo' });
export type MintInfo = Static<typeof MintInfoSchema>;

export const GetMintInfoResponse = Type.Object({
  mintInfo: MintInfoSchema,
}, { $id: 'GetMintInfoResponse' });
export type GetMintInfoResponseType = Static<typeof GetMintInfoResponse>;

// Schema for creating a new mint
export const CreateMintRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String({ description: 'Creator wallet address' }),
  name: Type.String({ description: 'Token name' }),
  symbol: Type.String({ description: 'Token symbol' }),
  decimals: Type.Optional(Type.Number({ default: 6, minimum: 0, maximum: 9 })),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  initialSupply: Type.Number({ description: 'Initial token supply' }),
  website: Type.Optional(Type.String()),
  twitter: Type.Optional(Type.String()),
  discord: Type.Optional(Type.String()),
  telegram: Type.Optional(Type.String()),
  github: Type.Optional(Type.String()),
}, { $id: 'CreateMintRequest' });
export type CreateMintRequestType = Static<typeof CreateMintRequest>;

export const CreateMintResponse = Type.Object({
  signature: Type.String(),
  mintAddress: Type.String(),
  fee: Type.Number(),
}, { $id: 'CreateMintResponse' });
export type CreateMintResponseType = Static<typeof CreateMintResponse>;

// Schema for buying tokens from a launchpad
export const BuyTokensRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  mintAddress: Type.String({ description: 'Token mint address to buy' }),
  amount: Type.Number({ description: 'Amount to purchase in native token (SOL)' }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100, default: 1 })),
}, { $id: 'BuyTokensRequest' });
export type BuyTokensRequestType = Static<typeof BuyTokensRequest>;

export const BuyTokensResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  price: Type.Number(),
}, { $id: 'BuyTokensResponse' });
export type BuyTokensResponseType = Static<typeof BuyTokensResponse>;

// Schema for selling tokens back to a launchpad
export const SellTokensRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  mintAddress: Type.String({ description: 'Token mint address to sell' }),
  amount: Type.Number({ description: 'Amount of tokens to sell' }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100, default: 1 })),
}, { $id: 'SellTokensRequest' });
export type SellTokensRequestType = Static<typeof SellTokensRequest>;

export const SellTokensResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  price: Type.Number(),
}, { $id: 'SellTokensResponse' });
export type SellTokensResponseType = Static<typeof SellTokensResponse>;