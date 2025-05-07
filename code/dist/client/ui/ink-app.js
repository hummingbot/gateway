"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startInkApp = void 0;
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const ink_text_input_1 = __importDefault(require("ink-text-input"));
const ink_spinner_1 = __importDefault(require("ink-spinner"));
const logger_1 = require("../../common/utils/logger");
const ChatApp = ({ llmProvider, mcpServer, initialSystemPrompt = 'You are Gateway Code, an AI assistant that helps users interact with Gateway API for blockchain and DEX operations.' }) => {
    const { exit } = (0, ink_1.useApp)();
    const [input, setInput] = (0, react_1.useState)('');
    const [messages, setMessages] = (0, react_1.useState)([
        { role: 'system', content: initialSystemPrompt, timestamp: Date.now() }
    ]);
    const [toolCalls, setToolCalls] = (0, react_1.useState)([]);
    const [isThinking, setIsThinking] = (0, react_1.useState)(false);
    const [streamedResponse, setStreamedResponse] = (0, react_1.useState)('');
    const [showHelp, setShowHelp] = (0, react_1.useState)(false);
    const messagesEndRef = (0, react_1.useRef)(null);
    // Handle special commands and keyboard input
    (0, ink_1.useInput)((input, key) => {
        if (key.escape) {
            // Show help overlay
            setShowHelp(!showHelp);
        }
        else if (key.ctrl && input === 'c') {
            // Exit the application
            exit();
        }
    });
    // Auto-scroll to bottom when messages change
    (0, react_1.useEffect)(() => {
        // This would be where we'd scroll to bottom in a real terminal implementation
        // For Ink, we rely on the terminal's natural scrolling
    }, [messages, streamedResponse]);
    // Process input when submitted
    const handleSubmit = async (value) => {
        // Don't process empty input
        if (!value.trim())
            return;
        // Handle special commands
        if (handleSpecialCommands(value)) {
            setInput('');
            return;
        }
        // Add user message
        const userMessage = { role: 'user', content: value, timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setStreamedResponse('');
        setIsThinking(true);
        try {
            // Get all messages except system for display
            const displayMessages = messages
                .filter(m => m.role !== 'system')
                .map(m => ({ role: m.role, content: m.content }));
            // Prepare conversation history for LLM
            const conversationHistory = [
                // System prompt
                messages[0],
                // Previous messages
                ...displayMessages.map(m => ({ role: m.role, content: m.content })),
                // User's new message
                { role: 'user', content: value }
            ];
            // Get available tools from MCP server
            // In a real implementation, we would fetch these from mcpServer
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
            // Stream LLM response
            const response = await llmProvider.streamCompletion(conversationHistory, { tools }, (chunk) => {
                if (chunk.text) {
                    setStreamedResponse(prev => prev + chunk.text);
                }
                if (chunk.toolCalls) {
                    // Here we'd collect tool calls for later execution
                    logger_1.logger.debug('Tool call received:', chunk.toolCalls);
                }
            });
            // Final response
            const assistantMessage = {
                role: 'assistant',
                content: streamedResponse || response.text,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, assistantMessage]);
            setStreamedResponse('');
            // Handle tool calls
            if (response.toolCalls && response.toolCalls.length > 0) {
                const newToolCalls = response.toolCalls.map(tc => ({
                    name: tc.name,
                    arguments: tc.arguments,
                    result: { status: 'pending' }
                }));
                setToolCalls(prev => [...prev, ...newToolCalls]);
                // Here we would execute the tool calls through MCP server
                // and update the results
                for (let i = 0; i < newToolCalls.length; i++) {
                    const toolCall = newToolCalls[i];
                    // Simulate tool execution
                    // In a real implementation, we would call mcpServer.executeTool()
                    setTimeout(() => {
                        setToolCalls(prev => {
                            const updated = [...prev];
                            const index = updated.findIndex(tc => tc.name === toolCall.name &&
                                JSON.stringify(tc.arguments) === JSON.stringify(toolCall.arguments));
                            if (index !== -1) {
                                updated[index] = {
                                    ...updated[index],
                                    result: {
                                        status: 'success',
                                        data: {
                                            result: `Mock result for ${toolCall.name}`
                                        }
                                    }
                                };
                            }
                            return updated;
                        });
                    }, 1000);
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing input:', error);
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: `Error: ${error.message}`,
                    timestamp: Date.now()
                }
            ]);
        }
        finally {
            setIsThinking(false);
        }
    };
    // Handle special commands
    const handleSpecialCommands = (command) => {
        const cmd = command.trim().toLowerCase();
        if (cmd === 'exit' || cmd === 'quit') {
            exit();
            return true;
        }
        if (cmd === 'clear') {
            setMessages([messages[0]]);
            setToolCalls([]);
            return true;
        }
        if (cmd === 'help') {
            setShowHelp(true);
            return true;
        }
        return false;
    };
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", padding: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { bold: true, color: "blue" }, "Gateway Code"),
            react_1.default.createElement(ink_1.Text, { color: "gray" }, " - Interactive CLI")),
        react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1, overflow: "auto" },
            messages
                .filter(msg => msg.role !== 'system')
                .map((msg, i) => (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: 1 },
                react_1.default.createElement(ink_1.Box, null,
                    react_1.default.createElement(ink_1.Text, { color: msg.role === 'user' ? 'green' : 'blue', bold: true }, msg.role === 'user' ? 'You: ' : 'Assistant: ')),
                react_1.default.createElement(ink_1.Box, { marginLeft: 1 },
                    react_1.default.createElement(ink_1.Text, null, msg.content))))),
            toolCalls.length > 0 && (react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginY: 1 },
                react_1.default.createElement(ink_1.Text, { bold: true, color: "yellow" }, "Tool Executions:"),
                toolCalls.map((tool, i) => (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginLeft: 1, marginY: 1 },
                    react_1.default.createElement(ink_1.Text, { bold: true }, tool.name),
                    react_1.default.createElement(ink_1.Box, { marginLeft: 1 },
                        react_1.default.createElement(ink_1.Text, { color: "gray" },
                            "Arguments: ",
                            JSON.stringify(tool.arguments))),
                    react_1.default.createElement(ink_1.Box, { marginLeft: 1 }, !tool.result ? (react_1.default.createElement(ink_1.Text, { color: "yellow" }, "Pending...")) : tool.result.status === 'pending' ? (react_1.default.createElement(ink_1.Text, { color: "yellow" },
                        react_1.default.createElement(ink_spinner_1.default, { type: "dots" }),
                        " Executing...")) : tool.result.status === 'success' ? (react_1.default.createElement(ink_1.Text, { color: "green" },
                        "Result: ",
                        JSON.stringify(tool.result.data))) : (react_1.default.createElement(ink_1.Text, { color: "red" },
                        "Error: ",
                        tool.result.error)))))))),
            streamedResponse && (react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginBottom: 1 },
                react_1.default.createElement(ink_1.Box, null,
                    react_1.default.createElement(ink_1.Text, { color: "blue", bold: true }, "Assistant: ")),
                react_1.default.createElement(ink_1.Box, { marginLeft: 1 },
                    react_1.default.createElement(ink_1.Text, null, streamedResponse)))),
            isThinking && !streamedResponse && (react_1.default.createElement(ink_1.Box, null,
                react_1.default.createElement(ink_1.Text, { color: "yellow" },
                    react_1.default.createElement(ink_spinner_1.default, { type: "dots" }),
                    " Thinking..."))),
            react_1.default.createElement(ink_1.Box, { ref: messagesEndRef })),
        react_1.default.createElement(ink_1.Box, { marginTop: 1 },
            react_1.default.createElement(ink_1.Text, { color: "green", bold: true }, "You: "),
            react_1.default.createElement(ink_text_input_1.default, { value: input, onChange: setInput, onSubmit: handleSubmit, placeholder: "Type a message or command..." })),
        showHelp && (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: "blue", padding: 1, position: { top: 'center', left: 'center' }, width: 60, height: 15 },
            react_1.default.createElement(ink_1.Text, { bold: true, color: "blue" }, "Commands:"),
            react_1.default.createElement(ink_1.Box, { marginLeft: 1, flexDirection: "column" },
                react_1.default.createElement(ink_1.Text, null,
                    react_1.default.createElement(ink_1.Text, { color: "yellow" }, "exit, quit"),
                    " - Exit Gateway Code"),
                react_1.default.createElement(ink_1.Text, null,
                    react_1.default.createElement(ink_1.Text, { color: "yellow" }, "clear"),
                    " - Clear conversation history"),
                react_1.default.createElement(ink_1.Text, null,
                    react_1.default.createElement(ink_1.Text, { color: "yellow" }, "help"),
                    " - Show this help message")),
            react_1.default.createElement(ink_1.Text, { bold: true, color: "blue", marginTop: 1 }, "Keyboard Shortcuts:"),
            react_1.default.createElement(ink_1.Box, { marginLeft: 1, flexDirection: "column" },
                react_1.default.createElement(ink_1.Text, null,
                    react_1.default.createElement(ink_1.Text, { color: "yellow" }, "Esc"),
                    " - Toggle help overlay"),
                react_1.default.createElement(ink_1.Text, null,
                    react_1.default.createElement(ink_1.Text, { color: "yellow" }, "Ctrl+C"),
                    " - Exit Gateway Code")),
            react_1.default.createElement(ink_1.Text, { marginTop: 1, color: "gray" }, "Press Esc to close this help")))));
};
const startInkApp = (llmProvider, mcpServer, options = {}) => {
    // Render the Ink app
    const { waitUntilExit } = (0, ink_1.render)(react_1.default.createElement(ChatApp, { llmProvider: llmProvider, mcpServer: mcpServer, initialSystemPrompt: options.systemPrompt }));
    // Return a promise that resolves when the app exits
    return waitUntilExit();
};
exports.startInkApp = startInkApp;
//# sourceMappingURL=ink-app.js.map