import { PromptName, PromptParams } from './promptDefinitions';

// Type for prompt context
interface PromptContext {
  // Add any context needed for prompts
}

// Type for individual prompt handler
type PromptHandler<T extends PromptName> = (context: PromptContext, params: PromptParams<T>) => Promise<string>;

// Type for all handlers
type PromptHandlers = {
  [K in PromptName]: PromptHandler<K>;
};

export const PROMPT_HANDLERS: PromptHandlers = {
  fetch_swap_quote: async (_context, params) => {
    const missingParams = [];

    // Check which parameters are missing
    if (!params.chain) missingParams.push('chain');
    if (!params.network) missingParams.push('network');
    if (!params.connector) missingParams.push('connector');
    if (!params.address) missingParams.push('wallet address');
    if (!params.base) missingParams.push('base token');
    if (!params.quote) missingParams.push('quote token');
    if (!params.amount) missingParams.push('amount');
    if (!params.side) missingParams.push('side (BUY/SELL)');

    if (missingParams.length > 0) {
      return [
        'I need some information to get you a swap quote.',
        '',
        `Missing parameters: ${missingParams.join(', ')}`,
        '',
        'Please provide:',
        '- **Chain**: ethereum (for all EVM chains) or solana',
        '- **Network**: For ethereum: mainnet, sepolia, arbitrum, avalanche, base, bsc, celo, optimism, polygon',
        '                For solana: mainnet-beta, devnet',
        '- **Connector**: For ethereum: uniswap, 0x',
        '                 For solana: jupiter, meteora, raydium',
        '- **Wallet address**: Your wallet address',
        '- **Base token**: The token you want to trade (e.g., WETH, USDC)',
        '- **Quote token**: The token to price against (e.g., USDC, USDT)',
        '- **Amount**: How much to trade',
        '- **Side**: BUY (buy base with quote) or SELL (sell base for quote)',
        '- **Slippage** (optional): Maximum acceptable slippage % (default: 1%)',
        '',
        'Example: "I want to buy 1 WETH with USDC on Ethereum mainnet using Uniswap"',
      ].join('\n');
    }

    // All parameters provided, guide to use the quote_swap tool
    return [
      'I have all the information needed for your swap quote.',
      '',
      '## Swap Details',
      `- **Chain**: ${params.chain} (${params.network})`,
      `- **DEX**: ${params.connector}`,
      `- **Trade**: ${params.side} ${params.amount} ${params.side === 'BUY' ? params.quote : params.base} for ${params.side === 'BUY' ? params.base : params.quote}`,
      `- **Wallet**: ${params.address}`,
      `- **Slippage**: ${params.slippage || 1}%`,
      '',
      'Now I will get you a quote using the quote_swap tool.',
      '',
      'The quote will include:',
      '- Expected output amount',
      '- Current price and price impact',
      '- Estimated gas costs',
      '- Routing details',
    ].join('\n');
  },

  execute_token_swap: async (_context, params) => {
    const missingParams = [];

    // Check required parameters
    if (!params.chain) missingParams.push('chain');
    if (!params.network) missingParams.push('network');
    if (!params.connector) missingParams.push('connector');
    if (!params.address) missingParams.push('wallet address');
    if (!params.base) missingParams.push('base token');
    if (!params.quote) missingParams.push('quote token');
    if (!params.amount) missingParams.push('amount');
    if (!params.side) missingParams.push('side (BUY/SELL)');

    if (missingParams.length > 0) {
      return [
        'To execute a token swap, I need some additional information.',
        '',
        `Missing: ${missingParams.join(', ')}`,
        '',
        'Please provide the complete swap details.',
      ].join('\n');
    }

    return [
      'I will help you execute this token swap.',
      '',
      '## Swap Execution Process',
      '',
      '### Step 1: Get Quote',
      'First, I will fetch a current quote for your swap to ensure you get the best price.',
      '',
      '### Step 2: Review Details',
      `- **Trade**: ${params.side} ${params.amount} ${params.side === 'BUY' ? params.quote : params.base} for ${params.side === 'BUY' ? params.base : params.quote}`,
      `- **Chain**: ${params.chain} (${params.network})`,
      `- **DEX**: ${params.connector}`,
      `- **Slippage**: ${params.slippage || 1}%`,
      '',
      '### Step 3: Pre-flight Checks',
      '1. Verify sufficient balance using get_balances tool',
      '2. Ensure token approval (if needed)',
      '3. Check network gas prices',
      '',
      '### Step 4: Execute Swap',
      'Once confirmed, I will execute the swap using the execute_swap tool.',
      '',
      '### Step 5: Monitor Transaction',
      'After execution, I will help you track the transaction status.',
      '',
      '**Important**: Make sure your Gateway server is running and your wallet is properly configured.',
    ].join('\n');
  },

  check_wallet_portfolio: async (_context, params) => {
    if (!params.address) {
      return [
        'I will help you check your wallet portfolio.',
        '',
        'Please provide:',
        '- **Wallet address**: Your wallet address (0x... for EVM chains, or Solana address)',
        '- **Chain** (optional): Specific chain to check (default: all supported chains)',
        '- **Network** (optional): Specific network (default: mainnet)',
        '',
        'Example: "Check portfolio for 0x742d35Cc6634C0532925a3b844Bc9e7595f7E123"',
      ].join('\n');
    }

    const chain = params.chain || 'all chains';
    const network = params.network || 'mainnet';

    return [
      'I will check your wallet portfolio.',
      '',
      `**Address**: ${params.address}`,
      `**Chain**: ${chain}`,
      `**Network**: ${network}`,
      '',
      'I will use the get_balances tool to fetch your token holdings.',
      '',
      'The report will include:',
      '- Token symbols and balances',
      '- Contract addresses',
      '- Native token balance',
      '',
      params.chain ? '' : 'To check all chains, I will query each supported chain individually.',
    ]
      .join('\n')
      .trim();
  },

  configure_gateway: async (_context, params) => {
    const action = params.action || 'view';

    if (action === 'view') {
      return [
        'I will help you view Gateway configurations.',
        '',
        '## Available Configuration Files',
        '',
        '### Chain Configurations',
        '- `ethereum.yml` - Ethereum network settings',
        '- `solana.yml` - Solana network settings',
        '',
        '### Connector Configurations',
        '- `uniswap.yml` - Uniswap DEX settings',
        '- `jupiter.yml` - Jupiter aggregator settings',
        '- `meteora.yml` - Meteora CLMM settings',
        '- `raydium.yml` - Raydium AMM/CLMM settings',
        '',
        'Use the read_config tool to view any configuration file.',
        '',
        'Example: read_config with path "ethereum.yml"',
      ].join('\n');
    }

    if (action === 'update') {
      if (!params.configFile) {
        return [
          'To update a configuration, please specify:',
          '- **Config file**: Which file to update (e.g., ethereum.yml)',
          '- **Setting path**: The configuration key (dot notation)',
          '- **New value**: The value to set',
          '',
          'Example: Update Ethereum RPC endpoint',
          '- File: ethereum.yml',
          '- Key: networks.mainnet.nodeURL',
          '- Value: https://your-new-rpc-endpoint.com',
        ].join('\n');
      }

      return [
        `I will help you update the ${params.configFile} configuration.`,
        '',
        '## Update Process',
        '',
        '1. First, I will read the current configuration',
        '2. Show you the current structure',
        '3. Help you identify the setting to change',
        '4. Update the configuration with your new value',
        '',
        'Configuration updates take effect after restarting the Gateway server.',
      ].join('\n');
    }

    if (action === 'setup') {
      return [
        'I will guide you through setting up Gateway.',
        '',
        '## Gateway Setup Steps',
        '',
        '### 1. Initial Setup',
        '- Run `./gateway-setup.sh` to create configuration files',
        '- This copies templates to the conf/ directory',
        '',
        '### 2. Configure Chains',
        '- Update RPC endpoints in chain config files',
        '- Set gas price levels',
        '- Configure token lists',
        '',
        '### 3. Configure Wallets',
        '- Add wallet addresses',
        '- Set up private keys (encrypted)',
        '- Use `gateway add-wallet` command',
        '',
        '### 4. Configure Connectors',
        '- Set DEX-specific parameters',
        '- Configure fee tiers',
        '- Set routing preferences',
        '',
        '### 5. Start Gateway',
        '- Run `pnpm start --passphrase=<YOUR_PASSPHRASE>`',
        '- Verify connectivity with health check',
        '',
        'Which step would you like help with?',
      ].join('\n');
    }

    return 'Invalid action. Please specify: view, update, or setup';
  },
};
