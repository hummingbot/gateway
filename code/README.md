# Gateway Code

Gateway Code is a next-generation command center for Hummingbot Gateway that allows users to interact with Gateway's functions through Large Language Models (LLMs) using the Model Context Protocol (MCP). It features a modern, responsive terminal UI built with Ink, providing a seamless chat experience in your terminal.

## Features

- 💬 **Natural Language Interface**: Interact with Gateway using natural language prompts
- 🔧 **Tool Integration**: Access all Gateway chain and connector functionality as LLM tools
- 🔄 **Multiple LLM Support**: Use different LLM providers (Claude, GPT-4, DeepSeek)
- 🔒 **Secure**: Store API keys securely and manage authentication
- 📚 **Self-Documenting**: Get help and examples for any Gateway feature
- 🖥️ **Modern UI**: Responsive terminal UI with streaming responses and tool visualizations

## Prerequisites

- Node.js 18 or later
- pnpm package manager (`npm install -g pnpm`)
- Hummingbot Gateway running locally or remotely
- API key for a supported LLM provider:
  - Anthropic Claude (recommended)
  - OpenAI GPT-4
  - DeepSeek

## Installation

### Option 1: Using Gateway Setup (Recommended)

The easiest way to install Gateway Code is through the main Gateway setup script:

```bash
# Clone the Gateway repository
git clone https://github.com/hummingbot/gateway.git
cd gateway

# Run the setup script
./gateway-setup.sh

# When prompted, choose 'Y' to set up Gateway Code
```

### Option 2: Manual Installation

```bash
# Clone the Gateway repository
git clone https://github.com/hummingbot/gateway.git
cd gateway

# Build the main Gateway project
pnpm install
pnpm build

# Build Gateway Code specifically
cd code
pnpm install
pnpm build
```

## Quick Start

1. Start Gateway server:
   ```bash
   pnpm start --dev
   ```

2. Start Gateway Code in a new terminal with your LLM API key:
   ```bash
   GATEWAY_CODE_API_KEY=your_api_key pnpm gateway-code
   ```

3. Or specify options directly:
   ```bash
   pnpm gateway-code --provider claude --api-key your_api_key
   ```

4. Start using Gateway Code with natural language:
   ```
   > Show me the balance of my Ethereum wallet 0x123...
   ```

## Architecture

Gateway Code consists of three main components:

1. **MCP Server**: Integrated with Gateway API to expose functionality as MCP tools
2. **Gateway Code CLI**: User-facing client that connects to LLMs and the MCP server
3. **LLM Integration Layer**: Handles communication with different LLM providers

## Available Commands

Gateway Code supports several special commands:

- `help` - Show available commands
- `clear` - Clear the conversation history
- `exit` or `quit` - Exit Gateway Code
- `config set provider <name>` - Set the LLM provider
- `config set api-key <key>` - Set the LLM API key

## Development

For active development:

```bash
# Start in development mode with auto-reload
cd code
pnpm dev
```

This will start Gateway Code with automatic reloading when files change.

## Troubleshooting

### Missing Types

If you encounter typescript errors about missing types, ensure:

1. All dependencies are installed: `pnpm install`
2. TypeScript config is properly set up in `tsconfig.json`
3. Type declarations are available (@types/*)

### JSX/TSX Issues

For problems with JSX files:

1. Make sure `tsconfig.json` has correct JSX configuration:
   ```json
   {
     "compilerOptions": {
       "jsx": "react",
       "allowSyntheticDefaultImports": true
     }
   }
   ```

2. Ensure you have React types installed: `pnpm add -D @types/react`

### Module Resolution Issues

If TypeScript can't find modules:

1. Check that `moduleResolution` is set to `node` in `tsconfig.json`
2. Verify the import paths (use relative paths like `./file` for local files)
3. Make sure `esModuleInterop` and `allowSyntheticDefaultImports` are enabled

## Contributing

We welcome contributions to Gateway Code! Please see our [Contributing Guide](../CONTRIBUTING.md) for more information.

## License

Gateway Code is licensed under [Apache License 2.0](LICENSE).