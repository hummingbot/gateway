import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { ensureTokenSaved } from '../../services/token-pool-autosave';
import { FindTokenQuery, FindTokenQuerySchema, Token, TokenSchema } from '../schemas';
import { handleTokenError } from '../token-error-handler';
import { fetchTokenInfo } from '../token-lookup-helper';

export const saveTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: FindTokenQuery;
    Reply: { message: string; token: Token };
  }>(
    '/save/:address',
    {
      schema: {
        description: 'Find token from GeckoTerminal and save it to the token list',
        tags: ['/tokens'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Token contract address',
              examples: ['So11111111111111111111111111111111111111112', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
            },
          },
          required: ['address'],
        },
        querystring: FindTokenQuerySchema,
        response: {
          200: Type.Object({
            message: Type.String(),
            token: TokenSchema,
          }),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork } = request.query;

      try {
        const coinGeckoService = CoinGeckoService.getInstance();
        const { chain, network } = coinGeckoService.parseChainNetwork(chainNetwork);

        // ensureTokenSaved is the one writer into the token list, so this route gets the
        // same guarantees the swap paths do rather than a second implementation of them:
        //
        //   - the chain names the token, not an indexer. name, symbol and decimals all
        //     live on-chain, so an indexer can only be missing, stale or rate-limited —
        //     and it is likeliest to be missing for exactly the tokens someone is trying
        //     to save by hand, the ones too new to be listed.
        //   - it checks for an existing entry BY ADDRESS. The check here used to be by
        //     symbol, which was wrong in both directions: a new address whose symbol was
        //     already taken reported "already exists" and silently saved nothing, and a
        //     token whose symbol had changed upstream was saved a second time.
        //   - it refuses to write a token whose on-chain symbol belongs to a different
        //     address, so wrapped SOL reporting its symbol as SOL cannot repoint the SOL
        //     that every pool in the list pairs against.
        //   - it checksums EVM addresses, which is why the ethers import went away.
        //
        // GeckoTerminal stays as the fallback, for a mint with no Token-2022 extension
        // and no Metaplex account, or an ERC-20 that never implemented name()/symbol().
        // This route is a deliberate, user-initiated write, so the extra call is fine
        // here in a way it would not be mid-swap.
        const token = await ensureTokenSaved(chain, network, address, async (addr) => {
          const info = await fetchTokenInfo(chainNetwork, addr);
          return info ? { name: info.name, symbol: info.symbol, address: info.address, decimals: info.decimals } : null;
        });

        if (!token) {
          throw fastify.httpErrors.notFound(
            `Could not name token ${address} on ${chain}/${network}: no on-chain metadata, and no fallback data. ` +
              `Add it explicitly with POST /tokens if you know its symbol and decimals.`,
          );
        }

        logger.info(`Saved token ${token.symbol} (${token.address}) to ${chain}/${network}`);

        return {
          message: `Token ${token.symbol} has been added to the token list for ${chain}/${network}`,
          token,
        };
      } catch (error: any) {
        handleTokenError(fastify, error, 'Failed to find and save token');
      }
    },
  );
};

export default saveTokenRoute;
