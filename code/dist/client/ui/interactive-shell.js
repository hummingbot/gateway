"use strict";
/**
 * Interactive Shell
 * Provides an interactive CLI interface for Gateway Code.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractiveShell = void 0;
const readline_1 = __importDefault(require("readline"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const logger_1 = require("../../common/utils/logger");
class InteractiveShell {
    constructor(options) {
        this.history = [];
        this.mcpServer = options.mcpServer;
        this.llmProvider = options.llmProvider;
        this.historySize = options.historySize || 50;
        this.rl = readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk_1.default.green('gateway-code> '),
            historySize: this.historySize
        });
    }
    /**
     * Start the interactive shell
     */
    async start() {
        this.displayWelcomeMessage();
        this.rl.prompt();
        this.rl.on('line', async (line) => {
            const input = line.trim();
            if (!input) {
                this.rl.prompt();
                return;
            }
            // Add to history
            this.history.push(input);
            if (this.history.length > this.historySize) {
                this.history.shift();
            }
            // Handle special commands
            if (this.handleSpecialCommands(input)) {
                this.rl.prompt();
                return;
            }
            // Handle normal input
            await this.processUserInput(input);
            this.rl.prompt();
        });
        this.rl.on('close', () => {
            console.log(chalk_1.default.blue('\nGoodbye! Gateway Code session ended.'));
            process.exit(0);
        });
    }
    /**
     * Display welcome message
     */
    displayWelcomeMessage() {
        console.log(chalk_1.default.bold.blue('\n┌─────────────────────────────────────────────────────┐'));
        console.log(chalk_1.default.bold.blue('│                Gateway Code CLI                      │'));
        console.log(chalk_1.default.bold.blue('└─────────────────────────────────────────────────────┘'));
        console.log('');
        console.log(`Using ${chalk_1.default.yellow(this.llmProvider.getName())} as LLM provider`);
        console.log('Type your questions or commands below:');
        console.log('');
        console.log(chalk_1.default.gray('Type "help" for available commands or "exit" to quit'));
        console.log('');
    }
    /**
     * Handle special shell commands
     * @param input User input
     * @returns true if handled as special command
     */
    handleSpecialCommands(input) {
        const command = input.toLowerCase();
        switch (command) {
            case 'exit':
            case 'quit':
                console.log(chalk_1.default.blue('Goodbye! Gateway Code session ended.'));
                process.exit(0);
                return true;
            case 'help':
                this.displayHelp();
                return true;
            case 'clear':
                console.clear();
                this.displayWelcomeMessage();
                return true;
            case 'history':
                this.displayHistory();
                return true;
            default:
                if (command.startsWith('config ')) {
                    this.handleConfigCommand(input.substring(7));
                    return true;
                }
                return false;
        }
    }
    /**
     * Process user input with LLM
     * @param input User input
     */
    async processUserInput(input) {
        const spinner = (0, ora_1.default)('Thinking...').start();
        try {
            // Prepare conversation
            const messages = [
                {
                    role: 'system',
                    content: 'You are Gateway Code, an AI assistant that helps users interact with Gateway API for blockchain and DEX operations. Your goal is to understand user requests and translate them into appropriate Gateway API calls.'
                },
                {
                    role: 'user',
                    content: input
                }
            ];
            // Get available tools from MCP server
            // This is a placeholder - actual implementation would fetch tools from MCP server
            const tools = [
                {
                    name: 'ethereum-balance',
                    description: 'Get token balances for an Ethereum wallet',
                    parameters: {
                        network: { type: 'string', description: 'Ethereum network' },
                        address: { type: 'string', description: 'Wallet address' }
                    }
                },
                {
                    name: 'uniswap-quote-swap',
                    description: 'Get a quote for swapping tokens on Uniswap',
                    parameters: {
                        chain: { type: 'string', description: 'Blockchain chain' },
                        network: { type: 'string', description: 'Blockchain network' }
                    }
                }
            ];
            // Stream completion for better UX
            spinner.stop();
            let isFirstChunk = true;
            const response = await this.llmProvider.streamCompletion(messages, {
                tools: tools,
                temperature: 0.7
            }, (chunk) => {
                if (isFirstChunk) {
                    process.stdout.write('\n');
                    isFirstChunk = false;
                }
                if (chunk.text) {
                    process.stdout.write(chunk.text);
                }
                if (chunk.toolCalls) {
                    // Here we'd handle and execute tool calls
                    // For now, just log them
                    logger_1.logger.debug('Tool call received:', chunk.toolCalls);
                }
            });
            console.log('\n');
            // Handle tool calls
            if (response.toolCalls && response.toolCalls.length > 0) {
                for (const toolCall of response.toolCalls) {
                    console.log(chalk_1.default.yellow(`\nExecuting tool: ${toolCall.name}`));
                    console.log(chalk_1.default.gray(`Arguments: ${JSON.stringify(toolCall.arguments, null, 2)}`));
                    // Here we'd execute the tool call through MCP server
                    // For now, just show a mock response
                    console.log(chalk_1.default.green('\nTool result:'));
                    console.log(JSON.stringify({
                        status: 'success',
                        data: {
                            result: 'Mock result for ' + toolCall.name
                        }
                    }, null, 2));
                }
            }
        }
        catch (error) {
            spinner.stop();
            console.error(chalk_1.default.red(`Error processing input: ${error.message}`));
            logger_1.logger.error('Error processing input', error);
        }
    }
    /**
     * Display help information
     */
    displayHelp() {
        console.log(chalk_1.default.bold('Available Commands:'));
        console.log(chalk_1.default.cyan('  help') + '           - Display this help message');
        console.log(chalk_1.default.cyan('  exit') + '           - Exit the Gateway Code CLI');
        console.log(chalk_1.default.cyan('  clear') + '          - Clear the screen');
        console.log(chalk_1.default.cyan('  history') + '        - Show command history');
        console.log(chalk_1.default.cyan('  config set <key> <value>') + ' - Set configuration option');
        console.log(chalk_1.default.cyan('  config get <key>') + '      - Get configuration option');
        console.log('');
        console.log(chalk_1.default.bold('Examples:'));
        console.log('  "Show my ETH balance"');
        console.log('  "Swap 1 ETH for USDC on Uniswap"');
        console.log('  "Get the price of SOL"');
    }
    /**
     * Display command history
     */
    displayHistory() {
        if (this.history.length === 0) {
            console.log(chalk_1.default.gray('No command history yet.'));
            return;
        }
        console.log(chalk_1.default.bold('Command History:'));
        this.history.forEach((cmd, i) => {
            console.log(chalk_1.default.gray(`${i + 1}:`) + ` ${cmd}`);
        });
    }
    /**
     * Handle config commands
     * @param command Config command (e.g., "set provider claude")
     */
    handleConfigCommand(command) {
        const parts = command.trim().split(' ');
        if (parts.length === 0) {
            console.log(chalk_1.default.red('Invalid config command. Try "config set key value" or "config get key".'));
            return;
        }
        const action = parts[0].toLowerCase();
        if (action === 'set' && parts.length >= 3) {
            const key = parts[1];
            const value = parts.slice(2).join(' ');
            console.log(chalk_1.default.green(`Config ${key} set to: ${value}`));
            // Here we'd actually set the config
        }
        else if (action === 'get' && parts.length >= 2) {
            const key = parts[1];
            console.log(chalk_1.default.blue(`Config ${key}:`), 'mock-value');
            // Here we'd actually get the config
        }
        else {
            console.log(chalk_1.default.red('Invalid config command. Try "config set key value" or "config get key".'));
        }
    }
}
exports.InteractiveShell = InteractiveShell;
//# sourceMappingURL=interactive-shell.js.map