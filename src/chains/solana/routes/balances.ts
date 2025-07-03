import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  getMint,
} from '@solana/spl-token';
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

export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const wallet = await solana.getWallet(address);

    // Call our new optimized getBalance function
    const balances = await getOptimizedBalance(solana, wallet, tokens);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to load wallet: ${error.message}`,
    );
  }
}

/**
 * Optimized getBalance function with batching, timeouts, and error handling improvements
 */
async function getOptimizedBalance(
  solana: Solana,
  wallet: Keypair,
  symbols?: string[],
): Promise<Record<string, number>> {
  const publicKey = wallet.publicKey;
  const balances: Record<string, number> = {};

  // Treat empty array as if no tokens were specified
  const effectiveSymbols =
    symbols && symbols.length === 0 ? undefined : symbols;

  // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
  if (
    !effectiveSymbols ||
    effectiveSymbols.some((s) => s.toUpperCase() === 'SOL')
  ) {
    try {
      const solBalance = await solana.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance * LAMPORT_TO_SOL;
      balances['SOL'] = solBalanceInSol;
    } catch (error) {
      logger.error(`Error fetching SOL balance: ${error.message}`);
      balances['SOL'] = 0; // Set SOL balance to 0 on error
    }
  }

  // Return early if only SOL balance was requested
  if (
    effectiveSymbols &&
    effectiveSymbols.length === 1 &&
    effectiveSymbols[0].toUpperCase() === 'SOL'
  ) {
    return balances;
  }

  // Get all token accounts for the provided address with timeout
  const tokenAccountsPromise = Promise.all([
    solana.connection.getTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID,
    }),
    solana.connection.getTokenAccountsByOwner(publicKey, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  // Set a timeout for the token accounts request
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error('Token accounts request timed out')),
      10000,
    );
  });

  let allAccounts = [];
  try {
    const [legacyAccounts, token2022Accounts] = (await Promise.race([
      tokenAccountsPromise,
      timeoutPromise,
    ])) as any;

    allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];
    logger.info(
      `Found ${allAccounts.length} token accounts for wallet ${publicKey.toString()}`,
    );
  } catch (error) {
    logger.error(`Error fetching token accounts: ${error.message}`);
    // If we couldn't fetch token accounts, return at least SOL balance
    return balances;
  }

  // Track tokens that were found and those that still need to be fetched
  const foundTokens = new Set<string>();
  const tokensToFetch = new Map<string, string>(); // Maps address -> display symbol

  // Create a mapping of all mint addresses to their token accounts
  const mintToAccount = new Map();
  for (const value of allAccounts) {
    try {
      const programId = value.account.owner;
      const parsedAccount = unpackAccount(
        value.pubkey,
        value.account,
        programId,
      );
      const mintAddress = parsedAccount.mint.toBase58();
      mintToAccount.set(mintAddress, { parsedAccount, value });
    } catch (error) {
      logger.warn(`Error unpacking account: ${error.message}`);
      continue;
    }
  }

  // Process tokens with timeout
  const processTokensPromise = (async () => {
    // Set up processing based on whether specific tokens are requested
    if (effectiveSymbols) {
      logger.info(
        `Processing ${effectiveSymbols.length} specifically requested tokens`,
      );

      for (const symbol of effectiveSymbols) {
        // Skip SOL as it's handled separately
        if (symbol.toUpperCase() === 'SOL') {
          foundTokens.add('SOL');
          continue;
        }

        // Check if it's a token symbol in our list
        const tokenBySymbol = solana.tokenList.find(
          (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
        );

        if (tokenBySymbol) {
          foundTokens.add(tokenBySymbol.symbol);

          // Check if we have this token in the wallet
          if (mintToAccount.has(tokenBySymbol.address)) {
            const { parsedAccount } = mintToAccount.get(tokenBySymbol.address);
            const amount = parsedAccount.amount;
            const uiAmount =
              Number(amount) / Math.pow(10, tokenBySymbol.decimals);
            balances[tokenBySymbol.symbol] = uiAmount;
            logger.debug(
              `Found balance for ${tokenBySymbol.symbol}: ${uiAmount}`,
            );
          } else {
            // Token not found in wallet, set balance to 0
            balances[tokenBySymbol.symbol] = 0;
            logger.debug(
              `No balance found for ${tokenBySymbol.symbol}, setting to 0`,
            );
          }
        }
        // If it looks like a Solana address, check if it matches a token in our list
        else if (symbol.length >= 32 && symbol.length <= 44) {
          try {
            const pubKey = new PublicKey(symbol);
            const mintAddress = pubKey.toBase58();

            // Find token in our list by address
            const token = solana.tokenList.find(
              (t) => t.address === mintAddress,
            );

            if (token) {
              foundTokens.add(token.symbol);

              // Check if we have this token in the wallet
              if (mintToAccount.has(mintAddress)) {
                const { parsedAccount } = mintToAccount.get(mintAddress);
                const amount = parsedAccount.amount;
                const uiAmount = Number(amount) / Math.pow(10, token.decimals);
                balances[token.symbol] = uiAmount;
                logger.debug(
                  `Found balance for ${token.symbol} (${mintAddress}): ${uiAmount}`,
                );
              } else {
                // Token not found in wallet, set balance to 0
                balances[token.symbol] = 0;
                logger.debug(
                  `No balance found for ${token.symbol} (${mintAddress}), setting to 0`,
                );
              }
            } else {
              // If token not in our list, use a default 9 decimals (common for Solana SPL tokens)
              if (mintToAccount.has(mintAddress)) {
                const { parsedAccount } = mintToAccount.get(mintAddress);
                const amount = parsedAccount.amount;
                const uiAmount = Number(amount) / Math.pow(10, 9);
                balances[mintAddress] = uiAmount;
                logger.debug(
                  `Found balance for unlisted token ${mintAddress}: ${uiAmount}`,
                );
              } else {
                // Address not found in wallet, set balance to 0
                balances[mintAddress] = 0;
                logger.debug(
                  `No balance found for unlisted token ${mintAddress}, setting to 0`,
                );
              }
            }
          } catch (e) {
            logger.warn(`Invalid token address format: ${symbol}`);
          }
        } else {
          logger.warn(
            `Token not recognized: ${symbol} (not a known symbol or valid address)`,
          );
        }
      }
    } else {
      // No symbols provided or empty array - check all tokens in token list with batching
      logger.info(
        `Checking balances for all ${solana.tokenList.length} tokens in the token list`,
      );

      // Process tokens in batches to avoid overwhelming the RPC provider
      const batchSize = 25; // Reasonable default batch size
      const tokenList = solana.tokenList;
      const totalTokens = tokenList.length;

      // Set a maximum time limit for the entire operation
      const maxScanTimeMs = 30000; // 30 seconds maximum for scanning
      const startTime = Date.now();
      let timeExceeded = false;

      logger.info(
        `Processing ${totalTokens} tokens in batches of ${batchSize} with ${maxScanTimeMs}ms time limit`,
      );

      for (let i = 0; i < totalTokens && !timeExceeded; i += batchSize) {
        // Check if we've exceeded the time limit
        if (Date.now() - startTime > maxScanTimeMs) {
          logger.warn(
            `Time limit of ${maxScanTimeMs}ms exceeded after checking ${i} tokens. Stopping scan.`,
          );
          timeExceeded = true;
          break;
        }

        const batch = tokenList.slice(i, i + batchSize);
        logger.debug(
          `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalTokens / batchSize)}`,
        );

        // Process tokens in the current batch
        for (const token of batch) {
          // Skip if already processed or is SOL
          if (token.symbol === 'SOL' || foundTokens.has(token.symbol)) {
            continue;
          }

          // Check if we have this token in the wallet
          if (mintToAccount.has(token.address)) {
            const { parsedAccount } = mintToAccount.get(token.address);
            const amount = parsedAccount.amount;
            const uiAmount = Number(amount) / Math.pow(10, token.decimals);

            // Only add tokens with non-zero balances
            if (uiAmount > 0) {
              balances[token.symbol] = uiAmount;
              logger.debug(
                `Found non-zero balance for ${token.symbol} (${token.address}): ${uiAmount}`,
              );
            }
          }
        }
      }
    }
  })();

  // Set a timeout for the entire token processing operation
  const processingTimeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      logger.warn('Token processing timed out, returning partial results');
      resolve();
    }, 20000); // 20 second timeout for entire processing
  });

  // Wait for processing to complete or timeout
  await Promise.race([processTokensPromise, processingTimeout]);

  // Filter out zero balances when no specific tokens are requested
  if (!symbols || (symbols && symbols.length === 0)) {
    const filteredBalances: Record<string, number> = {};

    // Keep SOL balance regardless of its value
    if ('SOL' in balances) {
      filteredBalances['SOL'] = balances['SOL'];
    }

    // Filter other tokens with zero balances
    Object.entries(balances).forEach(([key, value]) => {
      if (key !== 'SOL' && value > 0) {
        filteredBalances[key] = value;
      }
    });

    return filteredBalances;
  }

  return balances;
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
        tags: ['solana'],
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
      const { network, address, tokens } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens);
    },
  );
};

export default balancesRoute;
