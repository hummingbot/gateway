/**
 * Interactive Shell
 * Provides an interactive CLI interface for Gateway Code.
 */
import { LlmProvider } from '../llm/provider-interface';
import { GatewayMcpServer } from '../../server/mcp/server';
interface InteractiveShellOptions {
    mcpServer: GatewayMcpServer;
    llmProvider: LlmProvider;
    historySize?: number;
}
export declare class InteractiveShell {
    private mcpServer;
    private llmProvider;
    private history;
    private historySize;
    private rl;
    constructor(options: InteractiveShellOptions);
    /**
     * Start the interactive shell
     */
    start(): Promise<void>;
    /**
     * Display welcome message
     */
    private displayWelcomeMessage;
    /**
     * Handle special shell commands
     * @param input User input
     * @returns true if handled as special command
     */
    private handleSpecialCommands;
    /**
     * Process user input with LLM
     * @param input User input
     */
    private processUserInput;
    /**
     * Display help information
     */
    private displayHelp;
    /**
     * Display command history
     */
    private displayHistory;
    /**
     * Handle config commands
     * @param command Config command (e.g., "set provider claude")
     */
    private handleConfigCommand;
}
export {};
