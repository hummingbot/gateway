import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { GatewayApiClient } from '../utils/api-client';
import { ToolRegistry } from '../utils/tool-registry';

export function registerTradingTools(
  _server: Server,
  apiClient: GatewayApiClient,
) {
  // Tool: quote_swap
  ToolRegistry.registerTool(
    {
      name: 'quote_swap',
      description: 'Get a quote for a token swap on a DEX',
      inputSchema: {
        type: 'object',
        properties: {
          connector: {
            type: 'string',
            description:
              "DEX connector (e.g., 'uniswap', 'jupiter', 'raydium/amm')",
          },
          network: {
            type: 'string',
            description: "Network name (e.g., 'mainnet', 'mainnet-beta')",
          },
          baseToken: {
            type: 'string',
            description: 'Base token symbol',
          },
          quoteToken: {
            type: 'string',
            description: 'Quote token symbol',
          },
          amount: {
            type: 'number',
            description: 'Amount to swap',
          },
          side: {
            type: 'string',
            enum: ['BUY', 'SELL'],
            description: 'Trade side',
          },
          slippagePct: {
            type: 'number',
            description: 'Optional: slippage tolerance in percent',
          },
          poolAddress: {
            type: 'string',
            description: 'Optional: specific pool address',
          },
        },
        required: [
          'connector',
          'network',
          'baseToken',
          'quoteToken',
          'amount',
          'side',
        ],
      },
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          network: string;
          baseToken: string;
          quoteToken: string;
          amount: number;
          side: 'BUY' | 'SELL';
          slippagePct?: number;
          poolAddress?: string;
        };

        // Determine the connector path
        const connectorPath = args.connector.includes('/')
          ? args.connector
          : `${args.connector}`;

        const result = await apiClient.get(
          `/connectors/${connectorPath}/quote-swap`,
          {
            network: args.network,
            baseToken: args.baseToken,
            quoteToken: args.quoteToken,
            amount: args.amount,
            side: args.side,
            slippagePct: args.slippagePct,
            poolAddress: args.poolAddress,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Failed to get swap quote',
                message: error instanceof Error ? error.message : String(error),
                hint: 'Gateway server must be running to quote swaps',
              }),
            },
          ],
        };
      }
    },
  );

  // Tool: execute_swap
  ToolRegistry.registerTool(
    {
      name: 'execute_swap',
      description: 'Execute a token swap on a DEX',
      inputSchema: {
        type: 'object',
        properties: {
          connector: {
            type: 'string',
            description:
              "DEX connector (e.g., 'uniswap', 'jupiter', 'raydium/amm')",
          },
          network: {
            type: 'string',
            description: "Network name (e.g., 'mainnet', 'mainnet-beta')",
          },
          walletAddress: {
            type: 'string',
            description: 'Wallet address to execute the swap from',
          },
          baseToken: {
            type: 'string',
            description: 'Base token symbol',
          },
          quoteToken: {
            type: 'string',
            description: 'Quote token symbol',
          },
          amount: {
            type: 'number',
            description: 'Amount to swap',
          },
          side: {
            type: 'string',
            enum: ['BUY', 'SELL'],
            description: 'Trade side',
          },
          slippagePct: {
            type: 'number',
            description: 'Optional: slippage tolerance in percent',
          },
          poolAddress: {
            type: 'string',
            description: 'Optional: specific pool address',
          },
          priorityFeePerCU: {
            type: 'number',
            description:
              'Optional: priority fee (lamports/CU for Solana, Gwei for Ethereum)',
          },
          computeUnits: {
            type: 'number',
            description: 'Optional: compute units for transaction',
          },
        },
        required: [
          'connector',
          'network',
          'walletAddress',
          'baseToken',
          'quoteToken',
          'amount',
          'side',
        ],
      },
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          network: string;
          walletAddress: string;
          baseToken: string;
          quoteToken: string;
          amount: number;
          side: 'BUY' | 'SELL';
          slippagePct?: number;
          poolAddress?: string;
          priorityFeePerCU?: number;
          computeUnits?: number;
        };

        const connectorPath = args.connector.includes('/')
          ? args.connector
          : `${args.connector}`;

        const result = await apiClient.post(
          `/connectors/${connectorPath}/execute-swap`,
          {
            network: args.network,
            walletAddress: args.walletAddress,
            baseToken: args.baseToken,
            quoteToken: args.quoteToken,
            amount: args.amount,
            side: args.side,
            slippagePct: args.slippagePct,
            poolAddress: args.poolAddress,
            priorityFeePerCU: args.priorityFeePerCU,
            computeUnits: args.computeUnits,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Failed to execute swap',
                message: error instanceof Error ? error.message : String(error),
                hint: 'Gateway server must be running to execute swaps',
              }),
            },
          ],
        };
      }
    },
  );
}
