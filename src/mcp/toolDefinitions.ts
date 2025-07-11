import { z } from 'zod';

import {
  ParamChain,
  ParamNetwork,
  ParamAddress,
  ParamAmount,
  ParamSlippage,
  ParamTxHash,
  ParamSwapSide,
  ParamConfigPath,
  ParamConfigKey,
  ParamConfigValue,
  SwapBaseParams,
  TokenPairParams,
  GasParams,
} from './schema';

export const TOOL_DEFINITIONS = [
  {
    name: 'quote_swap' as const,
    description: [
      'Get a quote for swapping tokens on a DEX.',
      '',
      'Use this tool when you need to:',
      '- Get price quotes for token swaps',
      '- Check exchange rates between tokens',
      '- Estimate transaction costs',
      '- Compare prices across different DEXs',
      '',
      'Returns detailed swap information including:',
      '- Expected output amount',
      '- Price impact',
      '- Gas estimates',
      '- Route details',
    ].join('\n'),
    paramsSchema: {
      ...SwapBaseParams,
      ...TokenPairParams,
      amount: ParamAmount,
      side: ParamSwapSide,
      slippage: ParamSlippage,
    },
  },
  {
    name: 'execute_swap' as const,
    description: [
      'Execute a token swap on a DEX.',
      '',
      'Use this tool when you need to:',
      '- Perform actual token swaps',
      '- Execute trades based on quotes',
      '',
      'Important notes:',
      '- Requires prior approval for token spending',
      '- Transaction will be submitted to the blockchain',
      '- Monitor the returned transaction hash for status',
    ].join('\n'),
    paramsSchema: {
      ...SwapBaseParams,
      ...TokenPairParams,
      amount: ParamAmount,
      side: ParamSwapSide,
      slippage: ParamSlippage,
      ...GasParams,
    },
  },
  {
    name: 'get_balances' as const,
    description: [
      'Get token balances for a wallet address.',
      '',
      'Use this tool to:',
      '- Check wallet token holdings',
      '- Verify sufficient balance before swaps',
      '- Monitor portfolio values',
      '',
      'Returns all token balances for the specified address on the given chain.',
    ].join('\n'),
    paramsSchema: {
      chain: ParamChain,
      network: ParamNetwork,
      address: ParamAddress,
    },
  },
  {
    name: 'get_transaction_status' as const,
    description: [
      'Check the status of a transaction.',
      '',
      'Use this tool to:',
      '- Monitor swap execution status',
      '- Verify transaction completion',
      '- Get transaction details and logs',
    ].join('\n'),
    paramsSchema: {
      chain: ParamChain,
      network: ParamNetwork,
      txHash: ParamTxHash,
    },
  },
  {
    name: 'read_config' as const,
    description: [
      'Read Gateway configuration files.',
      '',
      'Use this tool to:',
      '- View current configuration settings',
      '- Check chain and connector configurations',
      '- Understand available networks and endpoints',
      '',
      'Supports reading any configuration file in the Gateway conf directory.',
    ].join('\n'),
    paramsSchema: {
      path: ParamConfigPath,
    },
  },
  {
    name: 'update_config' as const,
    description: [
      'Update Gateway configuration values.',
      '',
      'Use this tool to:',
      '- Modify chain settings',
      '- Update RPC endpoints',
      '- Change connector configurations',
      '',
      'Note: Changes are persisted to the configuration file.',
    ].join('\n'),
    paramsSchema: {
      path: ParamConfigPath,
      key: ParamConfigKey,
      value: ParamConfigValue,
    },
  },
] as const;

// CoinGecko tool definitions (predefined from server.yml)
export const COINGECKO_TOOL_DEFINITIONS = [
  {
    name: 'coingecko_get_search' as const,
    description: 'Search for coins, categories and markets listed on CoinGecko',
    paramsSchema: {
      query: z.string().describe('search query'),
    },
  },
  {
    name: 'coingecko_get_id_coins' as const,
    description:
      'Query all the metadata (image, websites, socials, description, contract address, etc.) and market data (price, ATH, exchange tickers, etc.) of a coin from the CoinGecko coin page based on a particular coin ID',
    paramsSchema: {
      id: z.string().describe('coin ID'),
      localization: z
        .boolean()
        .optional()
        .describe('include all the localized languages in the response, default: true'),
      tickers: z.boolean().optional().describe('include tickers data, default: true'),
      market_data: z.boolean().optional().describe('include market data, default: true'),
      community_data: z.boolean().optional().describe('include community data, default: true'),
      developer_data: z.boolean().optional().describe('include developer data, default: true'),
      sparkline: z.boolean().optional().describe('include sparkline 7 days data, default: false'),
    },
  },
  {
    name: 'coingecko_get_simple_price' as const,
    description: 'Query the prices of one or more coins by using their unique Coin API IDs',
    paramsSchema: {
      ids: z.string().describe("coins' IDs, comma-separated if querying more than 1 coin"),
      vs_currencies: z.string().describe('target currency of coins, comma-separated if querying more than 1 currency'),
      include_market_cap: z.boolean().optional().describe('include market capitalization, default: false'),
      include_24hr_vol: z.boolean().optional().describe('include 24hr volume, default: false'),
      include_24hr_change: z.boolean().optional().describe('include 24hr change, default: false'),
      include_last_updated_at: z
        .boolean()
        .optional()
        .describe('include last updated price time in UNIX, default: false'),
      precision: z.string().optional().describe('decimal place for currency price value'),
    },
  },
  {
    name: 'coingecko_get_tokens_networks_onchain_pools' as const,
    description: 'Query top pools based on the provided token contract address on a network',
    paramsSchema: {
      network: z.string().describe('network ID'),
      token_address: z.string().describe('token contract address'),
      include: z.string().optional().describe('attributes to include, comma-separated if more than one to include'),
      page: z.number().optional().describe('page through results, default: 1'),
    },
  },
  {
    name: 'coingecko_get_address_networks_onchain_pools' as const,
    description: 'Query the specific pool based on the provided network and pool address',
    paramsSchema: {
      network: z.string().describe('network ID'),
      address: z.string().describe('pool contract address'),
      include: z.string().optional().describe('attributes to include, comma-separated if more than one to include'),
    },
  },
  {
    name: 'coingecko_get_search_onchain_pools' as const,
    description: 'Search for pools on a network',
    paramsSchema: {
      network: z.string().describe('network ID'),
      query: z.string().describe('search query'),
      include: z.string().optional().describe('attributes to include, comma-separated if more than one to include'),
      page: z.number().optional().describe('page through results, default: 1'),
    },
  },
  {
    name: 'coingecko_get_address_networks_onchain_tokens' as const,
    description: 'Query specific token data based on the provided token contract address on a network',
    paramsSchema: {
      network: z.string().describe('network ID'),
      address: z.string().describe('token contract address'),
      include: z.string().optional().describe('attributes to include'),
    },
  },
  {
    name: 'coingecko_get_networks_onchain_dexes' as const,
    description:
      'Query all the supported decentralized exchanges (DEXs) based on the provided network on GeckoTerminal',
    paramsSchema: {
      network: z.string().describe('network ID'),
      page: z.number().optional().describe('page through results, default: 1'),
    },
  },
  {
    name: 'coingecko_get_networks_onchain_trending_pools' as const,
    description: 'Query all the trending pools across all networks on GeckoTerminal',
    paramsSchema: {
      include: z.string().optional().describe('attributes to include, comma-separated if more than one to include'),
      page: z.number().optional().describe('page through results, default: 1'),
    },
  },
  {
    name: 'coingecko_get_pools_networks_onchain_info' as const,
    description:
      'Query pool metadata (base and quote token details, image, socials, websites, description, contract address, etc.) based on a provided pool contract address on a network',
    paramsSchema: {
      network: z.string().describe('network ID'),
      pool_address: z.string().describe('pool contract address'),
    },
  },
  {
    name: 'coingecko_get_coins_markets' as const,
    description: 'Query all the supported coins with price, market cap, volume and market related data',
    paramsSchema: {
      vs_currency: z.string().describe('target currency of coins and market data'),
      ids: z.string().optional().describe("coins' IDs, comma-separated if querying more than 1 coin"),
      category: z.string().optional().describe("filter based on coins' category"),
      order: z.string().optional().describe('sort result by field, default: market_cap_desc'),
      per_page: z.number().optional().describe('total results per page, default: 100'),
      page: z.number().optional().describe('page through results, default: 1'),
      sparkline: z.boolean().optional().describe('include sparkline 7 days data, default: false'),
      price_change_percentage: z.string().optional().describe('include price change percentage timeframe'),
    },
  },
  {
    name: 'coingecko_get_search_trending' as const,
    description: 'Query trending search coins, NFTs and categories on CoinGecko in the last 24 hours',
    paramsSchema: {},
  },
] as const;

// Type exports for type safety
export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'] | (typeof COINGECKO_TOOL_DEFINITIONS)[number]['name'];

// Combined tool definitions for type extraction
type AllToolDefinitions = typeof TOOL_DEFINITIONS | typeof COINGECKO_TOOL_DEFINITIONS;

export type ToolDefinition<T extends ToolName> = Extract<AllToolDefinitions[number], { name: T }>;

// Helper type to extract params from schema
type ZodifyRecord<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ToolParams<T extends ToolName> =
  ToolDefinition<T> extends {
    paramsSchema: Record<string, any>;
  }
    ? ZodifyRecord<ToolDefinition<T>['paramsSchema']>
    : Record<string, never>;
