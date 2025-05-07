#!/usr/bin/env node
"use strict";
/**
 * Gateway Code CLI
 * Main entry point for the Gateway Code command-line interface.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const minimist_1 = __importDefault(require("minimist"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const server_1 = require("../server/mcp/server");
const provider_factory_1 = require("./llm/provider-factory");
const logger_1 = require("../common/utils/logger");
const interactive_shell_1 = require("./ui/interactive-shell");
// Get the root path
const rootPath = () => path_1.default.resolve(__dirname, '..');
// Load environment variables
dotenv_1.default.config();
// Define CLI arguments
const usage = `
${chalk_1.default.bold('Gateway Code CLI')} - Interact with Gateway using natural language

${chalk_1.default.bold('Usage:')}
  gateway-code [options]

${chalk_1.default.bold('Options:')}
  --gateway-url, -g  Gateway API URL (default: http://localhost:15888)
  --provider, -p     LLM provider: claude, openai, deepseek (default: claude)
  --api-key, -k      LLM API key (can also use GATEWAY_CODE_API_KEY env var)
  --verbose, -v      Enable verbose logging
  --help, -h         Show this help message

${chalk_1.default.bold('Environment Variables:')}
  GATEWAY_CODE_API_KEY  Alternative to --api-key
`;
// Parse command line arguments
const argv = (0, minimist_1.default)(process.argv.slice(2), {
    string: ['gateway-url', 'provider', 'api-key'],
    boolean: ['verbose', 'help'],
    alias: {
        g: 'gateway-url',
        p: 'provider',
        k: 'api-key',
        v: 'verbose',
        h: 'help'
    },
    default: {
        'gateway-url': 'http://localhost:15888',
        provider: 'claude',
        verbose: false,
        help: false
    }
});
// Show help if requested
if (argv.help) {
    console.log(usage);
    process.exit(0);
}
// Configure logger
logger_1.logger.configure({
    level: argv.verbose ? 'debug' : 'info',
    timestamp: true,
    colorize: true
});
// Import the models configuration manager
const models_config_1 = require("./config/models-config");
// Get the models configuration manager instance
const modelsConfig = models_config_1.ModelsConfigManager.getInstance(path_1.default.dirname(path_1.default.dirname(__dirname)));
// Get API key from arguments, environment, or configuration
let apiKey = argv['api-key'] || process.env.GATEWAY_CODE_API_KEY;
// If no API key is provided via args or env, try to get it from config
if (!apiKey) {
    apiKey = modelsConfig.getApiKey(argv.provider);
}
// Validate required arguments
if (!apiKey) {
    console.error(chalk_1.default.red('Error: API key is required. Set it with --api-key or GATEWAY_CODE_API_KEY environment variable, or configure it in conf/<provider>.yml'));
    console.log(usage);
    process.exit(1);
}
const providerType = argv.provider;
if (!provider_factory_1.LlmProviderFactory.getSupportedProviders().includes(providerType)) {
    console.error(chalk_1.default.red(`Error: Unsupported provider: ${argv.provider}`));
    console.error(chalk_1.default.yellow(`Supported providers: ${provider_factory_1.LlmProviderFactory.getSupportedProviders().join(', ')}`));
    process.exit(1);
}
// Main function to start the CLI
async function main() {
    try {
        // Show welcome banner
        console.log(chalk_1.default.bold.blue('\n┌─────────────────────────────────────────────────────┐'));
        console.log(chalk_1.default.bold.blue('│                Gateway Code CLI                      │'));
        console.log(chalk_1.default.bold.blue('└─────────────────────────────────────────────────────┘'));
        console.log('');
        console.log(`Connecting to Gateway at: ${chalk_1.default.yellow(argv['gateway-url'])}`);
        console.log(`Using provider: ${chalk_1.default.yellow(argv.provider)}`);
        console.log('');
        // Start MCP server
        const gatewayUrl = new URL(argv['gateway-url']);
        const mcpServer = new server_1.GatewayMcpServer({
            gatewayApiUrl: gatewayUrl.origin,
            gatewayApiPort: parseInt(gatewayUrl.port || '15888')
        });
        await mcpServer.start();
        // Get provider configuration
        const providerConfig = modelsConfig.getProviderConfig(providerType);
        // Initialize LLM provider with configuration
        const llmProvider = provider_factory_1.LlmProviderFactory.getProvider(providerType, {
            apiKey: apiKey,
            baseUrl: providerConfig?.baseUrl,
            model: providerConfig?.models?.find(m => m.default)?.name,
            organization: providerConfig?.organizationId
        });
        // Define system prompt
        const systemPrompt = `You are Gateway Code, an AI assistant that helps users interact with Gateway API for blockchain and DEX operations. Gateway is a platform that lets users interact with blockchain networks and their decentralized exchanges (DEXs). 

Your goal is to understand user requests and provide helpful responses, using Gateway tools when appropriate. Before executing any transactions, always explain what will happen and ask for confirmation.

Current connection: ${argv['gateway-url']}
Current provider: ${argv.provider}`;
        // Start interactive shell
        const shell = new interactive_shell_1.InteractiveShell({
            mcpServer,
            llmProvider
        });
        await shell.start();
    }
    catch (error) {
        logger_1.logger.error('Error starting Gateway Code:', error);
        console.error(chalk_1.default.red(`Failed to start Gateway Code: ${error.message}`));
        process.exit(1);
    }
}
// Run the main function
main().catch((error) => {
    logger_1.logger.error('Unhandled error:', error);
    console.error(chalk_1.default.red('An unexpected error occurred:'), error.message || error);
    process.exit(1);
});
//# sourceMappingURL=client.js.map