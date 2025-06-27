import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { GetPromptRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function registerMarketAnalyzerPrompt(server: Server) {
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "market-analyzer") {
      return null;
    }

    const { token = "bitcoin", dex = "jupiter", network = "mainnet" } = request.params.arguments || {};

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a crypto market analyzer that combines CoinGecko market data with DEX pricing information.

Your task is to analyze the token "${token}" and provide insights by:

1. First, use the CoinGecko tools to:
   - Get current price and market data for ${token}
   - Check if it's trending or has notable activity
   - Get basic token information (market cap, volume, etc.)

2. Then, use the Gateway tools to:
   - Check available DEX connectors
   - Get a quote for swapping ${token} on ${dex} (${network})
   - Compare DEX prices with centralized exchange prices from CoinGecko

3. Provide a summary that includes:
   - Current market price from CoinGecko
   - DEX price quote from ${dex}
   - Price difference/arbitrage opportunity
   - Market trends and volume analysis
   - Recommendations based on the data

Start by discovering available tools using gateway_list_tools and coingecko_list_api_endpoints.`,
          },
        },
      ],
    };
  });
}