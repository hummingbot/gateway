import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import {
  MetaDaoExecuteConditionalSwapRequest,
  MetaDaoExecuteConditionalSwapRequestType,
  MetaDaoExecuteConditionalSwapResponse,
  MetaDaoExecuteConditionalSwapResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { MetaDao } from '../metadao';

export const executeConditionalSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MetaDaoExecuteConditionalSwapRequestType;
    Reply: MetaDaoExecuteConditionalSwapResponseType;
  }>(
    '/execute-conditional-swap',
    {
      schema: {
        description: 'Execute a conditional market swap on MetaDAO (PASS or FAIL market)',
        tags: ['/connector/metadao'],
        body: MetaDaoExecuteConditionalSwapRequest,
        response: {
          200: MetaDaoExecuteConditionalSwapResponse,
        },
      },
    },
    async (request): Promise<MetaDaoExecuteConditionalSwapResponseType> => {
      const { dao: daoAddress, proposal: proposalAddress, market, side, amount, slippagePct = 0.5 } = request.body;
      const network = request.body.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);
        const solana = metadao.getSolana();

        // Get wallet
        const walletAddress = request.body.walletAddress || getSolanaChainConfig().defaultWallet;
        if (!walletAddress) {
          throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
        }

        const wallet = await solana.getWallet(walletAddress);
        const traderPubkey = new PublicKey(walletAddress);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);

        // Check pool state
        const poolStateType = metadao.getPoolStateType(daoAccount);
        if (poolStateType !== 'futarchy') {
          throw fastify.httpErrors.badRequest('Conditional swaps are only available when a proposal market is active');
        }

        // Fetch proposal and validate state
        const proposalAccount = await metadao.getProposal(proposalAddress);
        const proposalState = metadao.getProposalState(proposalAccount);

        if (proposalState !== 'pending') {
          throw fastify.httpErrors.badRequest(`Proposal is not in active trading state (current: ${proposalState})`);
        }

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        const pdas = {
          question: proposalAccount.question,
          baseVault: proposalAccount.baseVault,
          quoteVault: proposalAccount.quoteVault,
          passBaseMint: proposalAccount.passBaseMint,
          passQuoteMint: proposalAccount.passQuoteMint,
          failBaseMint: proposalAccount.failBaseMint,
          failQuoteMint: proposalAccount.failQuoteMint,
        };

        let tokenIn: string;
        let tokenOut: string;

        if (side === 'BUY') {
          if (market === 'PASS') {
            tokenIn = pdas.passQuoteMint.toString();
            tokenOut = pdas.passBaseMint.toString();
          } else {
            tokenIn = pdas.failQuoteMint.toString();
            tokenOut = pdas.failBaseMint.toString();
          }
        } else {
          if (market === 'PASS') {
            tokenIn = pdas.passBaseMint.toString();
            tokenOut = pdas.passQuoteMint.toString();
          } else {
            tokenIn = pdas.failBaseMint.toString();
            tokenOut = pdas.failQuoteMint.toString();
          }
        }

        const pool = market === 'PASS' ? metadao.getPassPool(daoAccount) : metadao.getFailPool(daoAccount);

        if (!pool) {
          throw fastify.httpErrors.internalServerError(`${market} pool not found`);
        }

        const rawBaseAmount = metadao.toRawAmount(amount, baseDecimals);
        const slippageMultiplier = 1 - slippagePct / 100;
        const maxSlippageMultiplier = 1 + slippagePct / 100;

        let rawInputAmount = rawBaseAmount;
        let rawMinOutput = metadao
          .calculateSwapOutput(
            rawInputAmount,
            pool.baseReserves,
            pool.quoteReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          )
          .output.muln(Math.floor(slippageMultiplier * 10000))
          .divn(10000);
        let swapType: 'BUY' | 'SELL' = 'SELL';
        let amountIn = amount;
        let amountOut = metadao.fromRawAmount(rawMinOutput, quoteDecimals);

        if (side === 'BUY') {
          swapType = 'BUY';
          const rawRequiredInput = metadao.calculateSwapInputForOutput(
            rawBaseAmount,
            pool.quoteReserves,
            pool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          rawInputAmount = rawRequiredInput.muln(Math.floor(maxSlippageMultiplier * 10000)).divn(10000);
          rawMinOutput = rawBaseAmount;
          amountIn = metadao.fromRawAmount(rawInputAmount, quoteDecimals);
          amountOut = amount;
        }

        // Build conditional swap instruction
        const swapIx = await metadao.buildConditionalSwapIx({
          dao: new PublicKey(daoAddress),
          proposal: new PublicKey(proposalAddress),
          trader: traderPubkey,
          market: market.toLowerCase() as 'pass' | 'fail',
          swapType: swapType.toLowerCase() as 'buy' | 'sell',
          inputAmount: rawInputAmount,
          minOutputAmount: rawMinOutput,
        });

        // Build and send transaction
        const connection = solana.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const createInputAtaIx = await metadao.buildCreateAtaIx(traderPubkey, new PublicKey(tokenIn));
        const createOutputAtaIx = await metadao.buildCreateAtaIx(traderPubkey, new PublicKey(tokenOut));

        const transaction = new Transaction({
          feePayer: traderPubkey,
          blockhash,
          lastValidBlockHeight,
        }).add(createInputAtaIx, createOutputAtaIx, swapIx);

        // Sign and send
        transaction.sign(wallet);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        );

        const status = confirmation.value.err ? -1 : 1;

        return {
          signature,
          status,
          data: {
            market,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            fee: 0,
            baseTokenBalanceChange: side === 'BUY' ? amountOut : -amountIn,
            quoteTokenBalanceChange: side === 'BUY' ? -amountIn : amountOut,
          },
        };
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error executing conditional swap for DAO ${daoAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to execute conditional swap: ${error}`);
      }
    },
  );
};
