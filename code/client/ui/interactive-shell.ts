/**
 * Interactive Shell
 * Provides an interactive CLI interface for Gateway Code.
 */

import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { LlmProvider } from '../llm/provider-interface';
import { GatewayMcpServer } from '../../server/mcp/server';
import { logger } from '../../common/utils/logger';

interface InteractiveShellOptions {
  mcpServer: GatewayMcpServer;
  llmProvider: LlmProvider;
  historySize?: number;
}

export class InteractiveShell {
  private mcpServer: GatewayMcpServer;
  private llmProvider: LlmProvider;
  private history: string[] = [];
  private historySize: number;
  private rl: readline.Interface;
  
  constructor(options: InteractiveShellOptions) {
    this.mcpServer = options.mcpServer;
    this.llmProvider = options.llmProvider;
    this.historySize = options.historySize || 50;
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('gateway-code> '),
      historySize: this.historySize
    });
  }
  
  /**
   * Start the interactive shell
   */
  async start(): Promise<void> {
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
      console.log(chalk.blue('\nGoodbye! Gateway Code session ended.'));
      process.exit(0);
    });
  }
  
  /**
   * Display welcome message
   */
  private displayWelcomeMessage(): void {
    console.log(chalk.bold.blue('\n┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.blue('│                Gateway Code CLI                      │'));
    console.log(chalk.bold.blue('└─────────────────────────────────────────────────────┘'));
    console.log('');
    console.log(`Using ${chalk.yellow(this.llmProvider.getName())} as LLM provider`);
    console.log('Type your questions or commands below:');
    console.log('');
    console.log(chalk.gray('Type "help" for available commands or "exit" to quit'));
    console.log('');
  }
  
  /**
   * Handle special shell commands
   * @param input User input
   * @returns true if handled as special command
   */
  private handleSpecialCommands(input: string): boolean {
    const command = input.toLowerCase();
    
    switch (command) {
      case 'exit':
      case 'quit':
        console.log(chalk.blue('Goodbye! Gateway Code session ended.'));
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
  private async processUserInput(input: string): Promise<void> {
    const spinner = ora('Thinking...').start();
    
    try {
      // Prepare conversation
      const messages = [
        {
          role: 'system' as const,
          content: 'You are Gateway Code, an AI assistant that helps users interact with Gateway API for blockchain and DEX operations. Your goal is to understand user requests and translate them into appropriate Gateway API calls.'
        },
        {
          role: 'user' as const,
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
      const response = await this.llmProvider.streamCompletion(
        messages,
        {
          tools: tools,
          temperature: 0.7
        },
        (chunk) => {
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
            logger.debug('Tool call received:', chunk.toolCalls);
          }
        }
      );
      
      console.log('\n');
      
      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          console.log(chalk.yellow(`\nExecuting tool: ${toolCall.name}`));
          console.log(chalk.gray(`Arguments: ${JSON.stringify(toolCall.arguments, null, 2)}`));
          
          // Here we'd execute the tool call through MCP server
          // For now, just show a mock response
          console.log(chalk.green('\nTool result:'));
          console.log(JSON.stringify({
            status: 'success',
            data: {
              result: 'Mock result for ' + toolCall.name
            }
          }, null, 2));
        }
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Error processing input: ${error.message}`));
      logger.error('Error processing input', error);
    }
  }
  
  /**
   * Display help information
   */
  private displayHelp(): void {
    console.log(chalk.bold('Available Commands:'));
    console.log(chalk.cyan('  help') + '           - Display this help message');
    console.log(chalk.cyan('  exit') + '           - Exit the Gateway Code CLI');
    console.log(chalk.cyan('  clear') + '          - Clear the screen');
    console.log(chalk.cyan('  history') + '        - Show command history');
    console.log(chalk.cyan('  config set <key> <value>') + ' - Set configuration option');
    console.log(chalk.cyan('  config get <key>') + '      - Get configuration option');
    console.log('');
    console.log(chalk.bold('Examples:'));
    console.log('  "Show my ETH balance"');
    console.log('  "Swap 1 ETH for USDC on Uniswap"');
    console.log('  "Get the price of SOL"');
  }
  
  /**
   * Display command history
   */
  private displayHistory(): void {
    if (this.history.length === 0) {
      console.log(chalk.gray('No command history yet.'));
      return;
    }
    
    console.log(chalk.bold('Command History:'));
    this.history.forEach((cmd, i) => {
      console.log(chalk.gray(`${i + 1}:`) + ` ${cmd}`);
    });
  }
  
  /**
   * Handle config commands
   * @param command Config command (e.g., "set provider claude")
   */
  private handleConfigCommand(command: string): void {
    const parts = command.trim().split(' ');
    
    if (parts.length === 0) {
      console.log(chalk.red('Invalid config command. Try "config set key value" or "config get key".'));
      return;
    }
    
    const action = parts[0].toLowerCase();
    
    if (action === 'set' && parts.length >= 3) {
      const key = parts[1];
      const value = parts.slice(2).join(' ');
      
      console.log(chalk.green(`Config ${key} set to: ${value}`));
      // Here we'd actually set the config
      
    } else if (action === 'get' && parts.length >= 2) {
      const key = parts[1];
      
      console.log(chalk.blue(`Config ${key}:`), 'mock-value');
      // Here we'd actually get the config
      
    } else {
      console.log(chalk.red('Invalid config command. Try "config set key value" or "config get key".'));
    }
  }
}