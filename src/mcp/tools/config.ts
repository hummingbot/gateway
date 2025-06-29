import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

import { GatewayApiClient } from '../utils/api-client';
import { ToolRegistry } from '../utils/tool-registry';

export function registerConfigTools(
  _server: Server,
  apiClient: GatewayApiClient,
) {
  // Tool: update_config
  ToolRegistry.registerTool(
    {
      name: 'update_config',
      description:
        'Update chain or connector configuration values and trigger Gateway server restart',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description:
              "Configuration namespace (e.g., 'server', 'ethereum', 'solana', 'uniswap')",
          },
          network: {
            type: 'string',
            description:
              "Optional: network name (e.g., 'mainnet', 'mainnet-beta'). Only used when namespace is a chain.",
          },
          path: {
            type: 'string',
            description:
              "Configuration path within the namespace/network (e.g., 'nodeURL', 'manualGasPrice')",
          },
          value: {
            description:
              'New configuration value (string, number, boolean, object, or array)',
          },
        },
        required: ['namespace', 'path', 'value'],
      },
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          namespace: string;
          network?: string;
          path: string;
          value: any;
        };

        const body: any = {
          namespace: args.namespace,
          path: args.path,
          value: args.value,
        };
        if (args.network) body.network = args.network;

        const result = await apiClient.post('/config/update', body);

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
                error: 'Failed to update configuration',
                message: error instanceof Error ? error.message : String(error),
                hint: 'Gateway server must be running to update configuration',
              }),
            },
          ],
        };
      }
    },
  );

  // Tool: update_tokens
  ToolRegistry.registerTool(
    {
      name: 'update_tokens',
      description: 'Add, update, or remove tokens from a token list',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'update', 'remove'],
            description: 'Action to perform on the token',
          },
          chain: {
            type: 'string',
            description: 'Blockchain (ethereum, solana)',
          },
          network: {
            type: 'string',
            description: 'Network name (mainnet, mainnet-beta, etc)',
          },
          symbol: {
            type: 'string',
            description: 'Token symbol',
          },
          name: {
            type: 'string',
            description: 'Token name (required for add/update)',
          },
          address: {
            type: 'string',
            description: 'Token contract address',
          },
          decimals: {
            type: 'number',
            description: 'Number of decimals (required for add/update)',
          },
        },
        required: ['action', 'chain', 'network', 'symbol', 'address'],
      },
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          action: 'add' | 'update' | 'remove';
          chain: string;
          network: string;
          symbol: string;
          name?: string;
          address: string;
          decimals?: number;
        };

        let result;

        if (args.action === 'add' || args.action === 'update') {
          // For add/update, we need all token details
          if (!args.name || args.decimals === undefined) {
            throw new Error(
              'Name and decimals are required for add/update operations',
            );
          }

          result = await apiClient.post('/tokens', {
            chain: args.chain,
            network: args.network,
            symbol: args.symbol,
            name: args.name,
            address: args.address,
            decimals: args.decimals,
          });
        } else {
          // For remove, we only need the address
          result = await apiClient.delete('/tokens', {
            chain: args.chain,
            network: args.network,
            address: args.address,
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  action: args.action,
                  token: args.symbol,
                  result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Failed to update token',
                message: error instanceof Error ? error.message : String(error),
                hint: 'Gateway server must be running to update tokens',
              }),
            },
          ],
        };
      }
    },
  );

  // Tool: update_wallets
  ToolRegistry.registerTool(
    {
      name: 'update_wallets',
      description: 'Add or remove wallets',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove'],
            description: 'Action to perform',
          },
          chain: {
            type: 'string',
            description: 'Blockchain network (ethereum, solana)',
          },
          privateKey: {
            type: 'string',
            description: 'Private key in hex format (required for add)',
          },
          address: {
            type: 'string',
            description: 'Wallet address (required for remove)',
          },
        },
        required: ['action', 'chain'],
      },
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          action: 'add' | 'remove';
          chain: string;
          privateKey?: string;
          address?: string;
        };

        let result;

        if (args.action === 'add') {
          if (!args.privateKey) {
            throw new Error('Private key is required for adding a wallet');
          }

          result = await apiClient.post('/wallet/add', {
            chain: args.chain,
            privateKey: args.privateKey,
          });
        } else {
          if (!args.address) {
            throw new Error('Address is required for removing a wallet');
          }

          await apiClient.delete('/wallet/remove', {
            chain: args.chain,
            address: args.address,
          });

          result = {
            message: `Wallet ${args.address} removed from ${args.chain}`,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  action: args.action,
                  chain: args.chain,
                  result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Failed to update wallet',
                message: error instanceof Error ? error.message : String(error),
                hint: 'Gateway server must be running to manage wallets',
              }),
            },
          ],
        };
      }
    },
  );
}
