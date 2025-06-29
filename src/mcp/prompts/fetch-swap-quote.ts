import {
  PromptMessage,
  PromptArgument,
} from '@modelcontextprotocol/sdk/types.js';

// Define the prompt argument type
interface FetchSwapQuoteArgs {
  chain?: string;
  inputToken?: string;
  outputToken?: string;
  amount?: string;
  wallet?: string;
}

// Prompt metadata for listing
export const fetchSwapQuotePromptMetadata = {
  name: 'fetch-swap-quote',
  description:
    'Gather swap information and find the best pool with highest volume for a token swap',
  arguments: [
    {
      name: 'chain',
      description: 'Blockchain network (ethereum, solana, bsc, polygon, etc.)',
      required: false,
    },
    {
      name: 'inputToken',
      description: 'Input token symbol or name',
      required: false,
    },
    {
      name: 'outputToken',
      description: 'Output token symbol or name',
      required: false,
    },
    {
      name: 'amount',
      description: 'Amount to swap',
      required: false,
    },
    {
      name: 'wallet',
      description: 'Wallet address to use for the swap',
      required: false,
    },
  ] as PromptArgument[],
};

// Base prompt messages for when all information is available
const basePromptText = `You are a DeFi swap assistant. Now that you have all the required information, follow these steps to find the best swap route:

## Step 1: Identify Token Addresses
1. Use coingecko_get_search to find the tokens and get their CoinGecko IDs
2. Use coingecko_get_id_coins to get detailed token information including contract addresses for the specified chain

## Step 2: Find High-Volume Pools
Use CoinGecko's on-chain tools to find the best pools:
1. First, map the chain name to the GeckoTerminal network ID:
   - ethereum → eth
   - solana → solana
   - bsc → bsc
   - polygon → polygon
   - arbitrum → arbitrum
   - optimism → optimism
   - avalanche → avalanche

2. Use coingecko_get_tokens_networks_onchain_pools to get pools for each token:
   - Get pools for the input token
   - Get pools for the output token
   - Look for pools that contain both tokens

3. For each relevant pool found, use coingecko_get_address_networks_onchain_pools to get detailed pool information including:
   - 24h volume (h24_volume_usd)
   - Total liquidity (reserve_in_usd)
   - Pool address
   - DEX name

## Step 3: Select Best Pool
Analyze the pools and select the one with:
1. Highest 24h trading volume (indicates good liquidity and activity)
2. Sufficient total liquidity
3. Contains both input and output tokens

## Step 4: Get Swap Quote
Once you've identified the best pool:
1. Determine the DEX/connector from the pool data (e.g., uniswap, sushiswap, pancakeswap, raydium)
2. Map the chain to the correct network name for Gateway:
   - ethereum → mainnet
   - solana → mainnet-beta
   - bsc → bsc
   - polygon → polygon
   - etc.

3. Use the quote_swap tool with:
   - connector: The DEX name from the pool
   - network: The mapped network name
   - baseToken: The input token symbol
   - quoteToken: The output token symbol
   - amount: The swap amount
   - side: "SELL" (since we're selling the input token)
   - poolAddress: The specific pool address (optional but recommended)

## Step 5: Present Results
Show the user:
- Selected pool details (DEX, volume, liquidity)
- Swap quote details (expected output, price, price impact)
- Why this pool was selected (highest volume, best liquidity)

## Error Handling
- If tokens are not found on CoinGecko, ask user to verify the token names
- If no pools are found, suggest checking if the token pair exists on the selected chain
- If swap quote fails, provide alternative pools or suggest different chains

Since all required information has been provided, proceed directly with the analysis.`;

// Function to generate prompt messages with arguments
export function getFetchSwapQuoteMessages(
  args?: FetchSwapQuoteArgs,
): PromptMessage[] {
  // Handle case where args might be a string (natural language input)
  if (
    typeof args === 'string' ||
    (args && Object.keys(args).length === 1 && args['0'])
  ) {
    // Natural language input detected
    const userInput = typeof args === 'string' ? args : args['0'];
    const naturalLanguagePrompt = `The user wants help with a token swap. They said: "${userInput}"

Parse their request to understand:
1. What token they want to buy or sell
2. The amount (if specified)
3. The chain/network (if specified)
4. Any other details mentioned

Then ask for any missing information needed to complete the swap:
- Chain/Network (e.g., ethereum, solana, bsc, polygon)
- Input token (what they're swapping from)
- Output token (what they're swapping to)
- Amount to swap
- Wallet address (or offer to check gateway://wallet-list for available wallets)

Be conversational and helpful in gathering this information.`;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: naturalLanguagePrompt,
        },
      },
    ];
  }

  const { chain, inputToken, outputToken, amount, wallet } = args || {};

  // Check what information is missing
  const missingFields: string[] = [];
  if (!chain) missingFields.push('chain');
  if (!inputToken) missingFields.push('inputToken');
  if (!outputToken) missingFields.push('outputToken');
  if (!amount) missingFields.push('amount');
  if (!wallet) missingFields.push('wallet');

  // If critical information is missing, return a user prompt that instructs the assistant to elicit
  if (missingFields.length > 0) {
    const elicitationInstruction = `The user wants help with a token swap but hasn't provided all the required information yet.

Information provided so far:
${chain ? `✓ Chain: ${chain}` : '• Chain: Not specified'}
${inputToken ? `✓ Input Token: ${inputToken}` : '• Input Token: Not specified'}
${outputToken ? `✓ Output Token: ${outputToken}` : '• Output Token: Not specified'}
${amount ? `✓ Amount: ${amount}` : '• Amount: Not specified'}
${wallet ? `✓ Wallet: ${wallet}` : '• Wallet: Not specified'}

Ask the user to provide the missing information (${missingFields.join(', ')}) before proceeding with finding the best swap route. Be helpful and provide examples of valid values for each missing field.`;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: elicitationInstruction,
        },
      },
    ];
  }

  // All information provided, return the full workflow prompt
  const fullPrompt = `User wants to swap tokens with the following information:
- Chain: ${chain}
- Input Token: ${inputToken}
- Output Token: ${outputToken}
- Amount: ${amount}
- Wallet: ${wallet}

${basePromptText}`;

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: fullPrompt,
      },
    },
  ];
}
