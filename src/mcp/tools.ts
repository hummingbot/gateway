import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import * as yaml from 'js-yaml';

import { ToolName, ToolParams } from './toolDefinitions';
import { GatewayApiClient } from './utils/api-client';

// Type for tool context
interface ToolContext {
  apiClient: GatewayApiClient;
  configPath: string;
}

// Type for individual tool handler
type ToolHandler<T extends ToolName> = (
  context: ToolContext,
  params: ToolParams<T>,
) => Promise<string>;

// Type for all handlers - partial to allow CoinGecko tools to be added dynamically
type ToolHandlers = {
  [K in ToolName]?: ToolHandler<K>;
};

// Gateway tool handlers
const GATEWAY_HANDLERS: Partial<ToolHandlers> = {
  quote_swap: async (context, params) => {
    const {
      chain,
      network,
      connector,
      address,
      base,
      quote,
      amount,
      side,
      slippage,
    } = params;

    try {
      const result = await context.apiClient.quoteSwap({
        chain,
        network,
        connector,
        address,
        base,
        quote,
        amount,
        side,
        slippage,
      });

      // Format as markdown
      return [
        `# Swap Quote`,
        '',
        `**Chain**: ${chain} (${network})`,
        `**Connector**: ${connector}`,
        `**Trade**: ${side} ${amount} ${side === 'BUY' ? quote : base} for ${side === 'BUY' ? base : quote}`,
        '',
        '## Expected Output',
        `- Amount: ${result.expectedOut}`,
        `- Price: ${result.price} ${quote}/${base}`,
        `- Price Impact: ${result.priceImpact}%`,
        '',
        '## Gas Estimates',
        `- Gas Cost: ${result.gasCost} ${result.gasToken}`,
        `- Gas Price: ${result.gasPrice} Gwei`,
        '',
        '## Route Details',
        '```json',
        JSON.stringify(result.routes, null, 2),
        '```',
      ].join('\n');
    } catch (error: any) {
      return [
        '# Error Getting Swap Quote',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- Gateway server not running (start with `pnpm start --passphrase=<YOUR_PASSPHRASE>`)',
        '- Invalid token symbols or addresses',
        '- Insufficient liquidity for the requested amount',
        '- Network connectivity issues',
      ].join('\n');
    }
  },

  execute_swap: async (context, params) => {
    const {
      chain,
      network,
      connector,
      address,
      base,
      quote,
      amount,
      side,
      slippage,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
    } = params;

    try {
      const result = await context.apiClient.executeSwap({
        chain,
        network,
        connector,
        address,
        base,
        quote,
        amount,
        side,
        slippage,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
      });

      return [
        `# Swap Executed`,
        '',
        `**Transaction Hash**: \`${result.txHash}\``,
        `**Status**: ${result.status}`,
        '',
        '## Trade Details',
        `- ${side} ${amount} ${side === 'BUY' ? quote : base} for ${side === 'BUY' ? base : quote}`,
        `- Expected Output: ${result.expectedOut}`,
        `- Gas Used: ${result.gasUsed}`,
        '',
        '## Next Steps',
        '1. Monitor transaction status using `get_transaction_status` tool',
        '2. Check updated balances with `get_balances` tool',
        '',
        `View on explorer: ${getExplorerUrl(chain, network, result.txHash)}`,
      ].join('\n');
    } catch (error: any) {
      return [
        '# Error Executing Swap',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- Insufficient token balance',
        '- Token not approved for spending',
        '- Slippage tolerance exceeded',
        '- Transaction reverted',
        '- Invalid gas parameters',
      ].join('\n');
    }
  },

  get_balances: async (context, params) => {
    const { chain, network, address } = params;

    try {
      const result = await context.apiClient.getBalances({
        chain,
        network,
        address,
      });

      const balances = result.balances || [];

      if (balances.length === 0) {
        return [
          `# Wallet Balances`,
          '',
          `**Address**: \`${address}\``,
          `**Chain**: ${chain} (${network})`,
          '',
          'No token balances found.',
        ].join('\n');
      }

      const balanceRows = balances
        .map(
          (token: any) =>
            `| ${token.symbol} | ${token.balance} | ${token.address || 'Native'} |`,
        )
        .join('\n');

      return [
        `# Wallet Balances`,
        '',
        `**Address**: \`${address}\``,
        `**Chain**: ${chain} (${network})`,
        '',
        '| Token | Balance | Contract Address |',
        '|-------|---------|------------------|',
        balanceRows,
      ].join('\n');
    } catch (error: any) {
      return [
        '# Error Getting Balances',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- Invalid wallet address',
        '- Gateway server not running',
        '- Network connectivity issues',
      ].join('\n');
    }
  },

  get_transaction_status: async (context, params) => {
    const { chain, network, txHash } = params;

    try {
      const result = await context.apiClient.getTransactionStatus({
        chain,
        network,
        txHash,
      });

      return [
        `# Transaction Status`,
        '',
        `**Transaction Hash**: \`${txHash}\``,
        `**Chain**: ${chain} (${network})`,
        '',
        '## Status',
        `- **Current Status**: ${result.status}`,
        `- **Block Number**: ${result.blockNumber || 'Pending'}`,
        `- **Confirmations**: ${result.confirmations || 0}`,
        '',
        '## Transaction Details',
        `- **From**: \`${result.from}\``,
        `- **To**: \`${result.to}\``,
        `- **Value**: ${result.value}`,
        `- **Gas Used**: ${result.gasUsed || 'Pending'}`,
        `- **Gas Price**: ${result.gasPrice}`,
        '',
        result.logs && result.logs.length > 0
          ? '## Event Logs\n```json\n' +
            JSON.stringify(result.logs, null, 2) +
            '\n```'
          : '',
      ]
        .join('\n')
        .trim();
    } catch (error: any) {
      return [
        '# Error Getting Transaction Status',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- Invalid transaction hash',
        '- Transaction not found',
        '- Network connectivity issues',
      ].join('\n');
    }
  },

  read_config: async (context, params) => {
    const { path } = params;

    try {
      const configPath = join(context.configPath, path);
      const content = readFileSync(configPath, 'utf-8');

      // Determine file type and parse accordingly
      const isJson = path.endsWith('.json');
      const config = isJson ? JSON.parse(content) : yaml.load(content);

      return [
        `# Configuration: ${path}`,
        '',
        '```' + (isJson ? 'json' : 'yaml'),
        isJson ? JSON.stringify(config, null, 2) : content,
        '```',
      ].join('\n');
    } catch (error: any) {
      return [
        '# Error Reading Configuration',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- File not found',
        '- Invalid file path',
        '- Permission denied',
        '',
        'Available configuration files:',
        '- `ethereum.yml` - Ethereum chain configuration',
        '- `solana.yml` - Solana chain configuration',
        '- `uniswap.yml` - Uniswap connector configuration',
        '- `jupiter.yml` - Jupiter connector configuration',
      ].join('\n');
    }
  },

  update_config: async (context, params) => {
    const { path, key, value } = params;

    try {
      const configPath = join(context.configPath, path);
      const content = readFileSync(configPath, 'utf-8');

      // Determine file type
      const isJson = path.endsWith('.json');
      const config = isJson ? JSON.parse(content) : yaml.load(content);

      // Update the configuration using dot notation
      const keys = key.split('.');
      let current = config;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      const oldValue = current[keys[keys.length - 1]];
      current[keys[keys.length - 1]] = value;

      // Write back to file
      const newContent = isJson
        ? JSON.stringify(config, null, 2)
        : yaml.dump(config);

      writeFileSync(configPath, newContent, 'utf-8');

      return [
        `# Configuration Updated`,
        '',
        `**File**: ${path}`,
        `**Key**: ${key}`,
        `**Old Value**: ${JSON.stringify(oldValue)}`,
        `**New Value**: ${JSON.stringify(value)}`,
        '',
        'Configuration has been successfully updated.',
      ].join('\n');
    } catch (error: any) {
      return [
        '# Error Updating Configuration',
        '',
        `**Error**: ${error.message}`,
        '',
        'Common issues:',
        '- Invalid file path',
        '- Invalid configuration key',
        '- Permission denied',
        '- Invalid YAML/JSON structure',
      ].join('\n');
    }
  },
};

// Helper function to get blockchain explorer URL
function getExplorerUrl(
  chain: string,
  network: string,
  txHash: string,
): string {
  const explorers: Record<string, Record<string, string>> = {
    ethereum: {
      mainnet: 'https://etherscan.io/tx/',
      sepolia: 'https://sepolia.etherscan.io/tx/',
      polygon: 'https://polygonscan.com/tx/',
      arbitrum: 'https://arbiscan.io/tx/',
      optimism: 'https://optimistic.etherscan.io/tx/',
      base: 'https://basescan.org/tx/',
      bsc: 'https://bscscan.com/tx/',
      avalanche: 'https://snowtrace.io/tx/',
      celo: 'https://celoscan.io/tx/',
    },
    solana: {
      'mainnet-beta': 'https://solscan.io/tx/',
      devnet: 'https://solscan.io/tx/',
    },
  };

  const explorerBase = explorers[chain]?.[network];
  return explorerBase
    ? `${explorerBase}${txHash}`
    : `Unknown explorer for ${chain} ${network}`;
}

// Export combined handlers (Gateway + CoinGecko)
export const TOOL_HANDLERS: ToolHandlers = {
  ...GATEWAY_HANDLERS,
};

// CoinGecko tool handler factory - creates a handler that proxies to the subprocess
export function createCoinGeckoHandler(toolName: string): ToolHandler<any> {
  return async (_context, _params) => {
    // This handler will be called by the server.ts when a CoinGecko tool is invoked
    // The actual implementation is handled by the CoinGecko subprocess via ToolRegistry
    throw new Error(
      `CoinGecko handler for ${toolName} should be handled by ToolRegistry, not called directly`,
    );
  };
}
