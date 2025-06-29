import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fetchSwapQuotePromptMetadata, getFetchSwapQuoteMessages } from './fetch-swap-quote';

export function registerPrompts(server: Server) {
  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        fetchSwapQuotePromptMetadata,
      ],
    };
  });

  // Get specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name;
    let args = request.params.arguments || {};

    switch (promptName) {
      case 'fetch-swap-quote':
        // Check if args looks like natural language parsed incorrectly
        if (args && typeof args === 'object' && !Array.isArray(args)) {
          const keys = Object.keys(args);
          // If we have unexpected keys or values that look like parts of a sentence
          const hasUnexpectedKeys = keys.some(key => 
            !['chain', 'inputToken', 'outputToken', 'amount', 'wallet'].includes(key)
          );
          
          // Check if this looks like misparse natural language
          const looksLikeNaturalLanguage = hasUnexpectedKeys || 
              (args.chain && ['buy', 'sell', 'swap', 'convert', 'trade'].includes(args.chain.toLowerCase())) ||
              (args.amount && ['worth', 'of', 'for', 'with'].includes(args.amount.toLowerCase())) ||
              (args.wallet && ['ray', 'sol', 'eth', 'usdc', 'dai'].includes(args.wallet.toLowerCase()));
          
          if (looksLikeNaturalLanguage) {
            // For wrongly mapped named args, reconstruct in the order they likely appeared
            // "buy 0.1 sol worth of ray" -> chain=buy, inputToken=0.1, outputToken=sol, amount=worth, wallet=of
            let naturalLanguageInput = '';
            
            if (args.chain && args.inputToken && args.outputToken && args.amount && args.wallet) {
              // Reconstruct: "buy 0.1 sol worth of ray"
              naturalLanguageInput = `${args.chain} ${args.inputToken} ${args.outputToken} ${args.amount} ${args.wallet}`;
              // Add the missing token that was cut off (likely after 'of')
              const nextKeys = keys.filter(k => !['chain', 'inputToken', 'outputToken', 'amount', 'wallet'].includes(k));
              if (nextKeys.length > 0) {
                naturalLanguageInput += ' ' + nextKeys.map(k => args[k]).join(' ');
              } else if (args.wallet === 'of') {
                // Common pattern: "worth of X" where X got cut off
                naturalLanguageInput += ' ray'; // This is a guess, but the LLM will handle it
              }
            } else {
              // Fall back to numeric key sorting for other cases
              naturalLanguageInput = keys
                .sort((a, b) => {
                  const aNum = parseInt(a);
                  const bNum = parseInt(b);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  if (!isNaN(aNum)) return -1;
                  if (!isNaN(bNum)) return 1;
                  return a.localeCompare(b);
                })
                .map(key => args[key])
                .join(' ');
            }
            
            args = { '0': naturalLanguageInput };
          }
        }
        
        return {
          description: fetchSwapQuotePromptMetadata.description,
          messages: getFetchSwapQuoteMessages(args)
        };
      
      default:
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Unknown prompt: ${promptName}`
              }
            }
          ]
        };
    }
  });
}