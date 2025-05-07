"use strict";
/**
 * Solana Balance Tool
 * Gets token balances for a Solana wallet.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBalanceTool = void 0;
const zod_1 = require("zod");
const base_tool_1 = require("../base-tool");
// Define the parameters schema
const parametersSchema = zod_1.z.object({
    network: zod_1.z.string().describe('Solana network (e.g., mainnet, devnet, testnet)'),
    tokenSymbols: zod_1.z.array(zod_1.z.string()).optional().describe('Array of token symbols to get balances for. If not provided, gets balances for all tokens.'),
    address: zod_1.z.string().describe('Solana wallet address')
});
class SolanaBalanceTool extends base_tool_1.BaseTool {
    constructor(config) {
        super(config);
        this.name = 'solana-balance';
        this.description = 'Get token balances for a Solana wallet';
        this.category = 'solana';
        this.parameters = parametersSchema;
    }
    async execute(params) {
        // Construct the API endpoint
        let endpoint = `solana/balances?network=${params.network}&address=${params.address}`;
        // Add token symbols if provided
        if (params.tokenSymbols && params.tokenSymbols.length > 0) {
            endpoint += `&tokenSymbols=${params.tokenSymbols.join(',')}`;
        }
        // Call the Gateway API
        return this.callGatewayApi(endpoint);
    }
}
exports.SolanaBalanceTool = SolanaBalanceTool;
//# sourceMappingURL=solana-balance.js.map