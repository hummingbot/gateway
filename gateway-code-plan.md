# Gateway Code - Implementation Plan

## Overview

Gateway Code is a next-generation command center for Gateway that allows users to interact with Gateway's functions through LLMs (Large Language Models) using the Model Context Protocol (MCP). The goal is to create a CLI similar to Claude Code that exposes Gateway's chain and connector routes as tools that an LLM can leverage.

## Architecture

The architecture consists of three main components:

1. **MCP Server**: Integrated with Gateway API to expose its functionality as MCP-compatible tools
2. **Gateway Code CLI**: User-facing client that connects to LLMs and the MCP server
3. **LLM Integration Layer**: Handles communication with different LLM providers

```
┌─────────────────┐    ┌───────────────┐    ┌────────────────┐
│                 │    │               │    │                │
│  Gateway Code   │<-->│  LLM Provider │<-->│   MCP Server   │
│  CLI Client     │    │  (API)        │    │   (Gateway)    │
│                 │    │               │    │                │
└─────────────────┘    └───────────────┘    └────────────────┘
                                                    │
                                                    ▼
                                            ┌────────────────┐
                                            │                │
                                            │  Gateway API   │
                                            │  Endpoints     │
                                            │                │
                                            └────────────────┘
```

## Directory Structure

```
/code                  # Root directory for Gateway Code
  /server              # MCP server implementation
    /tools             # Tool definitions mapped from Gateway endpoints
      /swap            # Swap schema tools (works with any connector)
        quote-swap.ts  # Get price quotes for token swaps
        execute-swap.ts # Execute token swaps
      /chains          # Chain-specific tools (minimal for initial version)
      /system          # System tools (config, wallet)
    /mcp               # Core MCP server implementation
    server.ts          # Main server entrypoint
  
  /client              # CLI client
    /commands          # CLI commands
    /llm               # LLM provider integrations
    /ui                # Terminal UI components
    client.ts          # Main client entrypoint
  
  /common              # Shared code
    /types             # Shared type definitions
    /utils             # Utility functions
    /config            # Configuration management
    /wallet            # Shared wallet management (reusing Gateway wallet code)
    /certs             # Shared certificate management (reusing Gateway certs)
  
  package.json
  README.md
  tsconfig.json
```

## Implementation Plan

### Phase 1: Setup and Core Infrastructure

1. Set up project structure
2. Implement core MCP server functionality
3. Define base tool interfaces
4. Create basic CLI structure

### Phase 2: Gateway API Integration

1. Create swap schema tool wrappers
   - Implement `quote-swap` tool for price quotes from all connectors
     - Support for Raydium AMM, CLMM, and Launchpad
     - Support for Jupiter
     - Optional support for other connectors
   - Implement `execute-swap` tool for executing swaps (later phase)
   - Ensure proper certificate access for secure API calls

2. Create basic chain tools
   - Implement balance checking for wallets
   - Support basic blockchain status queries

3. Create system tools for configuration
   - Manage wallet access
   - Configure default settings
   - Integrate with Gateway's wallet management system
   - Reuse certificate handling code for secure operations

### Phase 3: LLM Integration

1. Implement LLM provider integration (at minimum: Claude, GPT-4)
   - Implement API clients for each provider
   - Handle authentication and rate limiting
   - Manage conversation history

2. Implement MCP client-server communication
   - Support both local and remote MCP servers
   - Implement secure communication protocols

### Phase 4: CLI Development

1. Implement interactive CLI interface
   - Terminal UI with conversation history
   - Tool execution visualization
   - Command history and session management
   - Transaction preview and confirmation dialogs

2. Implement configuration management
   - API key storage (secure)
   - Server configuration
   - User preferences
   - Shared configuration with Gateway server
   - Certificate management integration

### Phase 5: Testing and Documentation

1. Implement comprehensive testing
   - Unit tests for tools and core functionality
   - Integration tests with mock LLMs
   - End-to-end testing scenarios

2. Create detailed documentation
   - Installation and setup guide
   - Tool reference documentation
   - Example usage scenarios
   - Contribution guidelines

## Technical Specifications

### MCP Server Implementation

The MCP server will be built using the TypeScript SDK for MCP. It will:

1. Register Gateway API endpoints as tools
2. Handle authentication and session management
3. Translate between Gateway API responses and MCP tool responses
4. Support both stdio and HTTP transport mechanisms
5. Access Gateway's certificate system for secure API calls
6. Integrate with Gateway's wallet management system

Example tool definition:

```typescript
// Quote swap tool that works with any connector implementing the swap schema
server.tool(
  "quote-swap",
  {
    chain: z.string().describe("Blockchain chain (e.g., solana)"),
    network: z.string().describe("Blockchain network (e.g., mainnet, devnet)"),
    connector: z.string().describe("DEX connector (e.g., raydium, jupiter)"),
    marketType: z.enum(["amm", "clmm", "launchpad"]).optional().describe("Market type (for Raydium: amm, clmm, or launchpad)"),
    marketAddress: z.string().optional().describe("Market address (pool address, required for some connectors)"),
    baseToken: z.object({
      address: z.string().describe("Base token address"),
      symbol: z.string().optional().describe("Base token symbol")
    }),
    quoteToken: z.object({
      address: z.string().describe("Quote token address"),
      symbol: z.string().optional().describe("Quote token symbol")
    }),
    amount: z.string().describe("Amount to swap (in base token decimals)"),
    side: z.enum(["BUY", "SELL"]).describe("Trade side (BUY or SELL)")
  },
  async (params) => {
    // Use the shared certificate and wallet systems
    const certManager = getCertificateManager();
    
    // Get secure HTTP options with certificates
    const httpOptions = certManager.getSecureHttpOptions();
    
    // Determine the correct endpoint based on connector and market type
    let endpoint = `${params.connector}`;
    
    // For Raydium, we need to specify the market type
    if (params.connector === 'raydium' && params.marketType) {
      endpoint += `/${params.marketType}`;
    }
    
    // Add the quote-swap endpoint
    endpoint += `/quote-swap`;
    
    // Call Gateway API endpoint
    const response = await fetch(`https://localhost:15888/${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Add certificate headers if needed
        ...httpOptions.headers
      },
      body: JSON.stringify({
        chain: params.chain,
        network: params.network,
        connector: params.connector,
        marketAddress: params.marketAddress,
        baseToken: params.baseToken,
        quoteToken: params.quoteToken,
        amount: params.amount,
        side: params.side
      }),
      // Add certificate validation options
      ...httpOptions.requestOptions
    });
    
    const data = await response.json();
    
    // Format the price information for display
    const formatPriceInfo = (data) => {
      const { price, estimatedPriceImpact } = data.quote;
      const baseSymbol = params.baseToken.symbol || 'Base Token';
      const quoteSymbol = params.quoteToken.symbol || 'Quote Token';
      
      return `
Price: 1 ${baseSymbol} = ${price} ${quoteSymbol}
Price Impact: ${estimatedPriceImpact}%
Connector: ${params.connector.toUpperCase()}${params.marketType ? ` (${params.marketType.toUpperCase()})` : ''}
Chain: ${params.chain} (${params.network})
      `.trim();
    };
    
    // Format response according to MCP
    return {
      content: [
        { 
          type: "text", 
          text: formatPriceInfo(data)
        }
      ]
    };
  }
);
```

### LLM Integration

The LLM integration layer will:

1. Support multiple LLM providers through a common interface
2. Handle API key management and authentication
3. Format prompts according to each provider's requirements
4. Process model responses and extract tool calls

Example LLM integration:

```typescript
interface LLMProvider {
  generateResponse(prompt: string, options: ModelOptions): Promise<LLMResponse>;
  extractToolCalls(response: LLMResponse): ToolCall[];
}

class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async generateResponse(prompt: string, options: ModelOptions): Promise<LLMResponse> {
    // Call Claude API
    // ...
  }
  
  extractToolCalls(response: LLMResponse): ToolCall[] {
    // Extract tool calls from Claude response
    // ...
  }
}
```

### CLI Client

The CLI client will:

1. Provide an interactive terminal interface
2. Manage conversation history
3. Handle user input and display model responses
4. Execute tool calls and display results
5. Manage configuration and settings
6. Access certificates and wallet system seamlessly
7. Provide transaction previews before execution
8. Show detailed wallet balance and transaction status information

### User Experience with Price Checks

Here are examples of how users can interact with Gateway Code for price checking:

**Example 1: Simple Price Check on Jupiter**
```
User> What's the current price of SOL in USDC on Jupiter?

Assistant> I'll check the current price of SOL in USDC on Jupiter.

[Tool Call: quote-swap]
Parameters:
- chain: solana
- network: mainnet
- connector: jupiter
- baseToken: {address: "So11111111111111111111111111111111111111112", symbol: "SOL"}
- quoteToken: {address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC"}
- amount: "1000000000"  # 1 SOL in lamports
- side: "SELL"

Result:
Price: 1 SOL = 142.53 USDC
Price Impact: 0.04%
Connector: JUPITER
Chain: solana (mainnet)
```

**Example 2: Comparing Raydium Market Types**
```
User> Compare the price of SOL/USDC across different Raydium market types

Assistant> I'll compare SOL/USDC prices across Raydium's different market types.

[Tool Call: quote-swap for AMM]
Parameters:
- chain: solana
- network: mainnet
- connector: raydium
- marketType: "amm"
- baseToken: {address: "So11111111111111111111111111111111111111112", symbol: "SOL"}
- quoteToken: {address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC"}
- amount: "1000000000"
- side: "SELL"

[Tool Call: quote-swap for CLMM]
Parameters: (similar with marketType: "clmm")

[Tool Call: quote-swap for Launchpad]
Parameters: (similar with marketType: "launchpad")

I've compared SOL/USDC prices across Raydium's different market types:

Raydium AMM: 1 SOL = 142.49 USDC (0.05% price impact)
Raydium CLMM: 1 SOL = 142.51 USDC (0.03% price impact)
Raydium Launchpad: 1 SOL = 141.95 USDC (0.12% price impact)

The Concentrated (CLMM) pool currently offers the best price with the lowest price impact.
```

## Dependencies

- **MCP TypeScript SDK**: For implementing the MCP server
- **Anthropic/OpenAI JS SDKs**: For LLM API integration
- **Fastify or Express**: For HTTP server implementation
- **Ink with React**: For terminal UI components
- **Node-Keytar**: For secure credentials storage
- **Gateway Core**: Reuse wallet and certificate management from Gateway
- **ethers.js/web3.js**: For Ethereum blockchain interactions
- **@solana/web3.js**: For Solana blockchain interactions

## Security Considerations

1. **API Key Management**: Securely store and manage LLM API keys
2. **Authentication**: Implement proper authentication between components
3. **Input Validation**: Validate all user and LLM inputs before processing
4. **Rate Limiting**: Implement rate limiting for API calls
5. **Data Privacy**: Ensure user data remains private and is not unnecessarily shared with LLMs
6. **Certificate Access**: Share the same certificate management as the Gateway server, ensuring secure access to Gateway API
7. **Wallet Integration**: Access the same wallet infrastructure as Gateway, ensuring consistent and secure wallet management

## Getting Started (Post-Implementation)

```bash
# Clone and set up Gateway with Gateway Code
git clone https://github.com/hummingbot/gateway.git
cd gateway
./gateway-setup.sh
# When prompted, choose yes to set up Gateway Code

# Start the Gateway API server
pnpm start

# In another terminal, start Gateway Code
pnpm gateway-code --provider claude --api-key <YOUR_API_KEY>

# Or set your API key as an environment variable
export GATEWAY_CODE_API_KEY=<YOUR_API_KEY>
pnpm gateway-code

# Configure your LLM provider (if not set via command line)
> config set provider claude
> config set api-key <YOUR_API_KEY>

# Start using Gateway Code with natural language
> Show me the balance of my Ethereum wallet 0x123...
> What's the price of SOL/USDC on Jupiter?
> Get a price quote for MPLX/SOL on Raydium launchpad
> Compare the price of SOL/USDC on Raydium AMM vs CLMM
> What's the best place to swap 10 SOL for USDC?
```

## Roadmap for Future Development

1. **Plugin System**: Allow third-party plugins to extend Gateway Code
2. **Web Interface**: Develop a web-based interface in addition to CLI
3. **Advanced Conversation Management**: Implement features like conversation branching and summarization
4. **Local LLM Support**: Add support for running local LLMs
5. **Multi-user Support**: Enable team collaboration features
6. **Enhanced Wallet Management**: Advanced multi-wallet and multi-chain support
7. **Transaction History**: Track and query past transactions with natural language
8. **Smart Contract Integration**: Direct interaction with custom smart contracts
9. **Network Analysis**: Chain and protocol analytics through natural language queries

## Conclusion

Gateway Code represents a significant evolution in how users interact with Gateway. By leveraging LLMs through the Model Context Protocol, we can create a more intuitive, powerful, and flexible command center that makes blockchain interactions more accessible to users of all technical levels.

Gateway Code's tight integration with Gateway's core systems—particularly the certificate and wallet management—ensures a secure, consistent experience. By sharing these critical systems rather than reimplementing them, Gateway Code maintains the security standards of Gateway while adding the power of natural language understanding and generation.

This approach not only streamlines development but also provides users with a familiar, trusted environment for exploring blockchain interactions through natural language.