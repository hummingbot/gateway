import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { LlmProvider } from '../llm/provider-interface';
import { GatewayMcpServer } from '../../server/mcp/server';
import { logger } from '../../common/utils/logger';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

interface ChatAppProps {
  llmProvider: LlmProvider;
  mcpServer: GatewayMcpServer;
  initialSystemPrompt?: string;
}

const ChatApp: React.FC<ChatAppProps> = ({ 
  llmProvider, 
  mcpServer,
  initialSystemPrompt = 'You are Gateway Code, an AI assistant that helps users interact with Gateway API for blockchain and DEX operations.' 
}) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: initialSystemPrompt, timestamp: Date.now() }
  ]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  const messagesEndRef = useRef<Box>(null);
  
  // Handle special commands and keyboard input
  useInput((input, key) => {
    if (key.escape) {
      // Show help overlay
      setShowHelp(!showHelp);
    } else if (key.ctrl && input === 'c') {
      // Exit the application
      exit();
    }
  });
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // This would be where we'd scroll to bottom in a real terminal implementation
    // For Ink, we rely on the terminal's natural scrolling
  }, [messages, streamedResponse]);
  
  // Process input when submitted
  const handleSubmit = async (value: string) => {
    // Don't process empty input
    if (!value.trim()) return;
    
    // Handle special commands
    if (handleSpecialCommands(value)) {
      setInput('');
      return;
    }
    
    // Add user message
    const userMessage = { role: 'user' as const, content: value, timestamp: Date.now() };
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
      const response = await llmProvider.streamCompletion(
        conversationHistory,
        { tools },
        (chunk) => {
          if (chunk.text) {
            setStreamedResponse(prev => prev + chunk.text);
          }
          
          if (chunk.toolCalls) {
            // Here we'd collect tool calls for later execution
            logger.debug('Tool call received:', chunk.toolCalls);
          }
        }
      );
      
      // Final response
      const assistantMessage = { 
        role: 'assistant' as const, 
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
              const index = updated.findIndex(tc => 
                tc.name === toolCall.name && 
                JSON.stringify(tc.arguments) === JSON.stringify(toolCall.arguments)
              );
              
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
    } catch (error) {
      logger.error('Error processing input:', error);
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: `Error: ${error.message}`, 
          timestamp: Date.now() 
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };
  
  // Handle special commands
  const handleSpecialCommands = (command: string): boolean => {
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
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">Gateway Code</Text>
        <Text color="gray"> - Interactive CLI</Text>
      </Box>
      
      {/* Chat messages */}
      <Box flexDirection="column" flexGrow={1} overflow="auto">
        {messages
          .filter(msg => msg.role !== 'system')
          .map((msg, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={msg.role === 'user' ? 'green' : 'blue'} bold>
                  {msg.role === 'user' ? 'You: ' : 'Assistant: '}
                </Text>
              </Box>
              <Box marginLeft={1}>
                <Text>{msg.content}</Text>
              </Box>
            </Box>
          ))}
        
        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <Box flexDirection="column" marginY={1}>
            <Text bold color="yellow">Tool Executions:</Text>
            {toolCalls.map((tool, i) => (
              <Box key={i} flexDirection="column" marginLeft={1} marginY={1}>
                <Text bold>{tool.name}</Text>
                <Box marginLeft={1}>
                  <Text color="gray">Arguments: {JSON.stringify(tool.arguments)}</Text>
                </Box>
                <Box marginLeft={1}>
                  {!tool.result ? (
                    <Text color="yellow">Pending...</Text>
                  ) : tool.result.status === 'pending' ? (
                    <Text color="yellow">
                      <Spinner type="dots" /> Executing...
                    </Text>
                  ) : tool.result.status === 'success' ? (
                    <Text color="green">
                      Result: {JSON.stringify(tool.result.data)}
                    </Text>
                  ) : (
                    <Text color="red">
                      Error: {tool.result.error}
                    </Text>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
        
        {/* Streamed response */}
        {streamedResponse && (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="blue" bold>Assistant: </Text>
            </Box>
            <Box marginLeft={1}>
              <Text>{streamedResponse}</Text>
            </Box>
          </Box>
        )}
        
        {/* Thinking indicator */}
        {isThinking && !streamedResponse && (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" /> Thinking...
            </Text>
          </Box>
        )}
        
        {/* Reference box for scrolling */}
        <Box ref={messagesEndRef} />
      </Box>
      
      {/* Input area */}
      <Box marginTop={1}>
        <Text color="green" bold>You: </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message or command..."
        />
      </Box>
      
      {/* Help overlay */}
      {showHelp && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="blue"
          padding={1}
          position={{ top: 'center', left: 'center' }}
          width={60}
          height={15}
        >
          <Text bold color="blue">Commands:</Text>
          <Box marginLeft={1} flexDirection="column">
            <Text>
              <Text color="yellow">exit, quit</Text> - Exit Gateway Code
            </Text>
            <Text>
              <Text color="yellow">clear</Text> - Clear conversation history
            </Text>
            <Text>
              <Text color="yellow">help</Text> - Show this help message
            </Text>
          </Box>
          <Text bold color="blue" marginTop={1}>Keyboard Shortcuts:</Text>
          <Box marginLeft={1} flexDirection="column">
            <Text>
              <Text color="yellow">Esc</Text> - Toggle help overlay
            </Text>
            <Text>
              <Text color="yellow">Ctrl+C</Text> - Exit Gateway Code
            </Text>
          </Box>
          <Text marginTop={1} color="gray">Press Esc to close this help</Text>
        </Box>
      )}
    </Box>
  );
};

export const startInkApp = (
  llmProvider: LlmProvider,
  mcpServer: GatewayMcpServer,
  options: { systemPrompt?: string } = {}
) => {
  // Render the Ink app
  const { waitUntilExit } = render(
    <ChatApp 
      llmProvider={llmProvider} 
      mcpServer={mcpServer}
      initialSystemPrompt={options.systemPrompt}
    />
  );
  
  // Return a promise that resolves when the app exits
  return waitUntilExit();
};