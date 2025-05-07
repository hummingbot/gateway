/**
 * Ethereum Balance Tool
 * Gets token balances for an Ethereum wallet.
 */

import { z } from 'zod';
import { BaseTool } from '../base-tool';
import { McpServerConfig } from '../../mcp/config';

// Define the parameters schema
const parametersSchema = z.object({
  network: z.string().describe('Ethereum network (e.g., mainnet, goerli, sepolia)'),
  tokenSymbols: z.array(z.string()).optional().describe('Array of token symbols to get balances for. If not provided, gets balances for all tokens.'),
  address: z.string().describe('Ethereum wallet address')
});

// Define the response type
interface BalanceResponse {
  network: string;
  timestamp: number;
  latency: number;
  balances: Array<{
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
  }>;
}

export class EthereumBalanceTool extends BaseTool<z.infer<typeof parametersSchema>, BalanceResponse> {
  name = 'ethereum-balance';
  description = 'Get token balances for an Ethereum wallet';
  category = 'ethereum';
  parameters = parametersSchema;
  
  constructor(config: McpServerConfig) {
    super(config);
  }
  
  async execute(params: z.infer<typeof parametersSchema>): Promise<BalanceResponse> {
    // Construct the API endpoint
    let endpoint = `ethereum/balances?network=${params.network}&address=${params.address}`;
    
    // Add token symbols if provided
    if (params.tokenSymbols && params.tokenSymbols.length > 0) {
      endpoint += `&tokenSymbols=${params.tokenSymbols.join(',')}`;
    }
    
    // Call the Gateway API
    return this.callGatewayApi<BalanceResponse>(endpoint);
  }
}