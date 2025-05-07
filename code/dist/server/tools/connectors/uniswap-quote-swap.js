"use strict";
/**
 * Uniswap Quote Swap Tool
 * Gets a quote for swapping tokens on Uniswap.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniswapQuoteSwapTool = void 0;
const zod_1 = require("zod");
const base_tool_1 = require("../base-tool");
// Define the parameters schema
const parametersSchema = zod_1.z.object({
    chain: zod_1.z.string().describe('Blockchain chain (e.g., ethereum)'),
    network: zod_1.z.string().describe('Blockchain network (e.g., mainnet, goerli)'),
    connector: zod_1.z.literal('uniswap').describe('DEX connector (uniswap)'),
    quote: zod_1.z.object({
        marketAddress: zod_1.z.string().optional().describe('Market address (CLMM pool address or null)'),
        baseToken: zod_1.z.object({
            address: zod_1.z.string().describe('Base token address'),
            symbol: zod_1.z.string().optional().describe('Base token symbol')
        }),
        quoteToken: zod_1.z.object({
            address: zod_1.z.string().describe('Quote token address'),
            symbol: zod_1.z.string().optional().describe('Quote token symbol')
        }),
        amount: zod_1.z.string().describe('Amount to swap (in base token decimals)'),
        side: zod_1.z.enum(['BUY', 'SELL']).describe('Trade side (BUY or SELL)'),
        type: zod_1.z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']).optional().describe('Quote type (EXACT_INPUT or EXACT_OUTPUT)')
    })
});
class UniswapQuoteSwapTool extends base_tool_1.BaseTool {
    constructor(config) {
        super(config);
        this.name = 'uniswap-quote-swap';
        this.description = 'Get a quote for swapping tokens on Uniswap';
        this.category = 'uniswap';
        this.parameters = parametersSchema;
    }
    async execute(params) {
        // Call the Gateway API
        return this.callGatewayApi('uniswap/clmm/quote-swap', 'POST', {
            chain: params.chain,
            network: params.network,
            connector: params.connector,
            ...params.quote
        });
    }
}
exports.UniswapQuoteSwapTool = UniswapQuoteSwapTool;
//# sourceMappingURL=uniswap-quote-swap.js.map