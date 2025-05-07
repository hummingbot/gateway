/**
 * Uniswap Quote Swap Tool
 * Gets a quote for swapping tokens on Uniswap.
 */

import { z } from 'zod';
import { BaseTool } from '../base-tool';
import { McpServerConfig } from '../../mcp/config';

// Define the parameters schema
const parametersSchema = z.object({
  chain: z.string().describe('Blockchain chain (e.g., ethereum)'),
  network: z.string().describe('Blockchain network (e.g., mainnet, goerli)'),
  connector: z.literal('uniswap').describe('DEX connector (uniswap)'),
  quote: z.object({
    marketAddress: z.string().optional().describe('Market address (CLMM pool address or null)'),
    baseToken: z.object({
      address: z.string().describe('Base token address'),
      symbol: z.string().optional().describe('Base token symbol')
    }),
    quoteToken: z.object({
      address: z.string().describe('Quote token address'),
      symbol: z.string().optional().describe('Quote token symbol')
    }),
    amount: z.string().describe('Amount to swap (in base token decimals)'),
    side: z.enum(['BUY', 'SELL']).describe('Trade side (BUY or SELL)'),
    type: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']).optional().describe('Quote type (EXACT_INPUT or EXACT_OUTPUT)')
  })
});

// Define the response type
interface QuoteResponse {
  network: string;
  timestamp: number;
  latency: number;
  quote: {
    price: string;
    guaranteedPrice: string;
    estimatedPriceImpact: string;
    estimatedGas: string;
    gasPrice: string;
    gasCost: string;
    gasCostInUSD: string;
    routeParams: {
      route: string;
      routerAddress: string;
      expectedAmountOut: string;
      expectedAmountIn: string;
      slippage: string;
      path: string[];
    };
  };
}

export class UniswapQuoteSwapTool extends BaseTool<z.infer<typeof parametersSchema>, QuoteResponse> {
  name = 'uniswap-quote-swap';
  description = 'Get a quote for swapping tokens on Uniswap';
  category = 'uniswap';
  parameters = parametersSchema;
  
  constructor(config: McpServerConfig) {
    super(config);
  }
  
  async execute(params: z.infer<typeof parametersSchema>): Promise<QuoteResponse> {
    // Call the Gateway API
    return this.callGatewayApi<QuoteResponse>(
      'uniswap/clmm/quote-swap',
      'POST',
      {
        chain: params.chain,
        network: params.network,
        connector: params.connector,
        ...params.quote
      }
    );
  }
}