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

// Type exports for type safety
export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

export type ToolDefinition<T extends ToolName> = Extract<
  (typeof TOOL_DEFINITIONS)[number],
  { name: T }
>;

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
