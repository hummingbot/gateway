import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackAccount, getMint } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  BalanceRequestType,
  BalanceResponseType,
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

// Define the LAMPORT_TO_SOL constant for easier access
const LAMPORT_TO_SOL = 1 / Math.pow(10, 9);

interface TokenAccount {
  parsedAccount: any;
  value: any;
}

/**
 * Main entry point for getting Solana balances
 */
export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
  fetchAll?: boolean,
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const publicKey = new PublicKey(address);

    const balances = await getBalances(solana, publicKey, tokens, fetchAll);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

/**
 * Get balances for a given public key
 */
async function getBalances(
  solana: Solana,
  publicKey: PublicKey,
  symbols?: string[],
  fetchAll: boolean = false,
): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};

  // Treat empty array as if no tokens were specified
  const effectiveSymbols = symbols && symbols.length === 0 ? undefined : symbols;

  // Always fetch SOL balance if no specific tokens or SOL is requested
  if (!effectiveSymbols || effectiveSymbols.some((s) => s.toUpperCase() === 'SOL')) {
    balances['SOL'] = await getSolBalance(solana, publicKey);
  }

  // Return early if only SOL was requested
  if (effectiveSymbols && effectiveSymbols.length === 1 && effectiveSymbols[0].toUpperCase() === 'SOL') {
    return balances;
  }

  // Fetch all token accounts
  const tokenAccounts = await fetchTokenAccounts(solana, publicKey);
  if (tokenAccounts.size === 0) {
    return handleEmptyTokenAccounts(balances, effectiveSymbols);
  }

  // Process tokens based on request type
  if (effectiveSymbols) {
    // Specific tokens requested
    await processSpecificTokens(solana, tokenAccounts, effectiveSymbols, balances);
  } else if (fetchAll) {
    // Fetch all tokens in wallet
    await processAllTokens(solana, tokenAccounts, balances);
  } else {
    // Default: only tokens in token list
    await processTokenListOnly(solana, tokenAccounts, balances);
  }

  // Filter results if no specific tokens were requested
  if (!effectiveSymbols) {
    return filterZeroBalances(balances);
  }

  return balances;
}

/**
 * Get SOL balance for a public key
 */
async function getSolBalance(solana: Solana, publicKey: PublicKey): Promise<number> {
  try {
    const solBalance = await solana.connection.getBalance(publicKey);
    return solBalance * LAMPORT_TO_SOL;
  } catch (error) {
    logger.error(`Error fetching SOL balance: ${error.message}`);
    return 0;
  }
}

/**
 * Fetch all token accounts for a public key
 */
async function fetchTokenAccounts(solana: Solana, publicKey: PublicKey): Promise<Map<string, TokenAccount>> {
  const tokenAccountsMap = new Map<string, TokenAccount>();

  try {
    const tokenAccountsPromise = Promise.all([
      solana.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      solana.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Token accounts request timed out')), 10000);
    });

    const [legacyAccounts, token2022Accounts] = (await Promise.race([tokenAccountsPromise, timeoutPromise])) as any;

    const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
    logger.info(`Found ${allAccounts.length} token accounts for ${publicKey.toString()}`);

    // Create mapping of mint addresses to token accounts
    for (const value of allAccounts) {
      try {
        const programId = value.account.owner;
        const parsedAccount = unpackAccount(value.pubkey, value.account, programId);
        const mintAddress = parsedAccount.mint.toBase58();
        tokenAccountsMap.set(mintAddress, { parsedAccount, value });
      } catch (error) {
        logger.warn(`Error unpacking account: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error fetching token accounts: ${error.message}`);
  }

  return tokenAccountsMap;
}

/**
 * Handle case when no token accounts are found
 */
function handleEmptyTokenAccounts(
  balances: Record<string, number>,
  effectiveSymbols?: string[],
): Record<string, number> {
  if (effectiveSymbols) {
    // Set all requested tokens to 0
    for (const symbol of effectiveSymbols) {
      if (symbol.toUpperCase() !== 'SOL') {
        balances[symbol] = 0;
      }
    }
  }
  return balances;
}

/**
 * Process specific tokens requested by the user
 */
async function processSpecificTokens(
  solana: Solana,
  tokenAccounts: Map<string, TokenAccount>,
  symbols: string[],
  balances: Record<string, number>,
): Promise<void> {
  for (const symbol of symbols) {
    if (symbol.toUpperCase() === 'SOL') continue;

    // Try to find token by symbol
    const tokenInfo = solana.tokenList.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());

    if (tokenInfo) {
      // Token found in list
      const balance = getTokenBalance(tokenAccounts.get(tokenInfo.address), tokenInfo.decimals);
      balances[tokenInfo.symbol] = balance;
    } else if (isValidSolanaAddress(symbol)) {
      // Try as mint address
      const tokenAccount = tokenAccounts.get(symbol);
      if (tokenAccount) {
        const balance = await getTokenBalanceWithMintInfo(solana, tokenAccount, symbol);
        balances[symbol] = balance;
      } else {
        balances[symbol] = 0;
      }
    } else {
      logger.warn(`Token not recognized: ${symbol}`);
      balances[symbol] = 0;
    }
  }
}

/**
 * Process all tokens in wallet (fetchAll=true)
 */
async function processAllTokens(
  solana: Solana,
  tokenAccounts: Map<string, TokenAccount>,
  balances: Record<string, number>,
): Promise<void> {
  logger.info('Processing all token accounts (fetchAll=true)');

  for (const [mintAddress, tokenAccount] of tokenAccounts) {
    try {
      // Check if token is in our list
      const tokenInfo = solana.tokenList.find((t) => t.address === mintAddress);

      if (tokenInfo) {
        const balance = getTokenBalance(tokenAccount, tokenInfo.decimals);
        balances[tokenInfo.symbol] = balance;
      } else {
        // Fetch mint info for unknown token
        const balance = await getTokenBalanceWithMintInfo(solana, tokenAccount, mintAddress);
        if (balance > 0) {
          balances[mintAddress] = balance;
        }
      }
    } catch (error) {
      logger.warn(`Error processing token ${mintAddress}: ${error.message}`);
    }
  }
}

/**
 * Process only tokens that are in the token list (default behavior)
 */
async function processTokenListOnly(
  solana: Solana,
  tokenAccounts: Map<string, TokenAccount>,
  balances: Record<string, number>,
): Promise<void> {
  logger.info(`Checking balances for ${solana.tokenList.length} tokens in token list`);

  for (const tokenInfo of solana.tokenList) {
    if (tokenInfo.symbol === 'SOL') continue;

    const tokenAccount = tokenAccounts.get(tokenInfo.address);
    if (tokenAccount) {
      const balance = getTokenBalance(tokenAccount, tokenInfo.decimals);
      if (balance > 0) {
        balances[tokenInfo.symbol] = balance;
      }
    }
  }
}

/**
 * Get token balance from a token account
 */
function getTokenBalance(tokenAccount: TokenAccount | undefined, decimals: number): number {
  if (!tokenAccount) return 0;

  const amount = tokenAccount.parsedAccount.amount;
  return Number(amount) / Math.pow(10, decimals);
}

/**
 * Get token balance with mint info lookup
 */
async function getTokenBalanceWithMintInfo(
  solana: Solana,
  tokenAccount: TokenAccount,
  mintAddress: string,
): Promise<number> {
  try {
    const programId = tokenAccount.value.account.owner;
    const mintInfo = await Promise.race([
      getMint(solana.connection, new PublicKey(mintAddress), undefined, programId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Mint info timeout')), 1000)),
    ]);

    const amount = tokenAccount.parsedAccount.amount;
    return Number(amount) / Math.pow(10, mintInfo.decimals);
  } catch (error) {
    // Use default 9 decimals if mint info fails
    logger.debug(`Failed to get mint info for ${mintAddress}, using default decimals`);
    const amount = tokenAccount.parsedAccount.amount;
    return Number(amount) / Math.pow(10, 9);
  }
}

/**
 * Check if a string is a valid Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter out zero balances (except SOL)
 */
function filterZeroBalances(balances: Record<string, number>): Record<string, number> {
  const filtered: Record<string, number> = {};

  // Always include SOL
  if ('SOL' in balances) {
    filtered['SOL'] = balances['SOL'];
  }

  // Add non-zero balances
  for (const [key, value] of Object.entries(balances)) {
    if (key !== 'SOL' && value > 0) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  // Example address for Solana tokens
  const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC on Solana
  const BONK_MINT_ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK on Solana

  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          'Get token balances for a Solana address. If no tokens specified or empty array provided, returns non-zero balances for tokens from the token list that are found in the wallet (includes SOL even if zero). If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
        tags: ['/chain/solana'],
        body: {
          ...BalanceRequestSchema,
          properties: {
            ...BalanceRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            address: { type: 'string', examples: [walletAddressExample] },
            tokens: {
              type: 'array',
              items: { type: 'string' },
              description:
                'A list of token symbols (SOL, USDC, BONK) or token mint addresses. Both formats are accepted and will be automatically detected. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances (with the exception of SOL).',
              examples: [
                ['SOL', 'USDC', 'BONK'],
                ['SOL', USDC_MINT_ADDRESS, BONK_MINT_ADDRESS],
              ],
            },
            fetchAll: {
              type: 'boolean',
              description: 'Whether to fetch all tokens in wallet, not just those in token list. Defaults to false.',
              default: false,
              examples: [false, true],
            },
          },
        },
        response: {
          200: {
            ...BalanceResponseSchema,
            description: 'Token balances for the specified address',
            examples: [
              {
                balances: {
                  SOL: 1.5,
                  USDC: 100.0,
                  BONK: 50000.0,
                },
              },
              {
                balances: {
                  SOL: 1.5,
                  USDC: 100.0,
                  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 25.0, // Full mint address used for tokens not in token list
                },
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { network, address, tokens, fetchAll } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens, fetchAll);
    },
  );
};

export default balancesRoute;
