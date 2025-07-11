import { z } from 'zod';

import {
  ParamChain,
  ParamNetwork,
  ParamConnector,
  ParamAddress,
  ParamTokenSymbol,
  ParamAmount,
  ParamSlippage,
  ParamSwapSide,
} from './schema';

export const PROMPT_DEFINITIONS = [
  {
    name: 'fetch_swap_quote' as const,
    description: [
      'Interactive prompt to help users get a swap quote.',
      '',
      'This prompt guides users through the process of getting a token swap quote,',
      'collecting all necessary information step by step if not provided initially.',
    ].join('\n'),
    paramsSchema: {
      chain: ParamChain.optional(),
      network: ParamNetwork.optional(),
      connector: ParamConnector.optional(),
      address: ParamAddress.optional(),
      base: ParamTokenSymbol.optional(),
      quote: ParamTokenSymbol.optional(),
      amount: ParamAmount.optional(),
      side: ParamSwapSide.optional(),
      slippage: ParamSlippage.optional(),
    },
  },
  {
    name: 'execute_token_swap' as const,
    description: [
      'Interactive prompt to execute a token swap.',
      '',
      'This prompt helps users execute token swaps by:',
      '1. Getting a quote first',
      '2. Confirming the swap details',
      '3. Executing the transaction',
      '4. Monitoring the transaction status',
    ].join('\n'),
    paramsSchema: {
      chain: ParamChain.optional(),
      network: ParamNetwork.optional(),
      connector: ParamConnector.optional(),
      address: ParamAddress.optional(),
      base: ParamTokenSymbol.optional(),
      quote: ParamTokenSymbol.optional(),
      amount: ParamAmount.optional(),
      side: ParamSwapSide.optional(),
      slippage: ParamSlippage.optional(),
    },
  },
  {
    name: 'check_wallet_portfolio' as const,
    description: [
      'Check wallet balances and portfolio value.',
      '',
      'This prompt helps users view their token holdings across different chains.',
    ].join('\n'),
    paramsSchema: {
      address: ParamAddress.optional(),
      chain: ParamChain.optional(),
      network: ParamNetwork.optional(),
    },
  },
  {
    name: 'configure_gateway' as const,
    description: [
      'Guide users through Gateway configuration.',
      '',
      'This prompt helps users:',
      '- View current configurations',
      '- Update RPC endpoints',
      '- Configure wallet settings',
      '- Set up new chains or connectors',
    ].join('\n'),
    paramsSchema: {
      action: z.enum(['view', 'update', 'setup']).optional().describe('The configuration action to perform'),
      configFile: z.string().optional().describe('The configuration file to work with'),
    },
  },
] as const;

// Type exports
export type PromptName = (typeof PROMPT_DEFINITIONS)[number]['name'];

export type PromptDefinition<T extends PromptName> = Extract<(typeof PROMPT_DEFINITIONS)[number], { name: T }>;

// Helper type to extract params from schema
type ZodifyRecord<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type PromptParams<T extends PromptName> =
  PromptDefinition<T> extends {
    paramsSchema: Record<string, any>;
  }
    ? ZodifyRecord<PromptDefinition<T>['paramsSchema']>
    : Record<string, never>;
