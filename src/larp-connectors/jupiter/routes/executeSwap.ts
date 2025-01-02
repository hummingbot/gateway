import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { VersionedTransaction } from '@solana/web3.js';
import { QuoteResponse, SwapResponse } from '@jup-ag/api';
import { Wallet } from '@coral-xyz/anchor';
import { JupiterController } from '../jupiter.controller';
import { GetSwapQuoteController } from './quoteSwap';
import { priorityFeeMultiplier } from '../../solana/solana.controller';

export class ExecuteSwapController extends JupiterController {
  constructor() {
    super();
  }

  async getSwapObj(wallet: Wallet, quote: QuoteResponse): Promise<SwapResponse> {
    const swapObj = await this.jupiterQuoteApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          autoMultiplier: Math.max(priorityFeeMultiplier, 3),
        },
      },
    });
    return swapObj;
  }

  async executeSwap(
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
  ): Promise<{
    signature: string;
    totalInputSwapped: number;
    totalOutputSwapped: number;
    fee: number;
  }> {
    await this.loadJupiter();

    const quoteController = new GetSwapQuoteController();
    const quote = await quoteController.getQuote(
      inputTokenSymbol,
      outputTokenSymbol,
      amount,
      slippagePct,
    );

    console.log('Wallet:', this.wallet.publicKey.toBase58());

    const swapObj = await this.getSwapObj(this.wallet, quote);

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));

    transaction.sign([this.wallet.payer]);

    const { value: simulatedTransactionResponse } = await this.connectionPool.getNextConnection().simulateTransaction(
      transaction,
      {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
      },
    );
    const { err, logs } = simulatedTransactionResponse;

    if (err) {
      console.error('Simulation Error:');
      console.error({ err, logs });
      throw new Error('Transaction simulation failed');
    }

    const serializedTransaction = Buffer.from(transaction.serialize());
    const signature = await this.sendAndConfirmRawTransaction(
      serializedTransaction,
      this.wallet.payer.publicKey.toBase58(),
      swapObj.lastValidBlockHeight,
    );

    let inputBalanceChange: number, outputBalanceChange: number, fee: number;

    if (quote.inputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: inputBalanceChange, fee } = await this.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: inputBalanceChange, fee } = await this.extractTokenBalanceChangeAndFee(
        signature,
        quote.inputMint,
        this.keypair.publicKey.toBase58(),
      ));
    }

    if (quote.outputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: outputBalanceChange } = await this.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: outputBalanceChange } = await this.extractTokenBalanceChangeAndFee(
        signature,
        quote.outputMint,
        this.keypair.publicKey.toBase58(),
      ));
    }

    const totalInputSwapped = Math.abs(inputBalanceChange);
    const totalOutputSwapped = Math.abs(outputBalanceChange);

    return { signature, totalInputSwapped, totalOutputSwapped, fee };
  }
}

export default function executeSwapRoute(fastify: FastifyInstance, folderName: string) {
  const controller = new ExecuteSwapController();

  fastify.post(`/${folderName}/execute-swap`, {
    schema: {
      tags: [folderName],
      description: 'Execute a swap on Jupiter',
      body: Type.Object({
        inputTokenSymbol: Type.String(),
        outputTokenSymbol: Type.String(),
        amount: Type.Number(),
        slippagePct: Type.Optional(Type.Number({ default: 1, minimum: 0, maximum: 100 })),
      }),
      response: {
        200: Type.Object({
          signature: Type.String(),
          totalInputSwapped: Type.Number(),
          totalOutputSwapped: Type.Number(),
          fee: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { inputTokenSymbol, outputTokenSymbol, amount, slippagePct } = request.body as {
        inputTokenSymbol: string;
        outputTokenSymbol: string;
        amount: number;
        slippagePct?: number;
      };
      fastify.log.info(`Executing Jupiter swap from ${inputTokenSymbol} to ${outputTokenSymbol}`);
      const result = await controller.executeSwap(
        inputTokenSymbol,
        outputTokenSymbol,
        amount,
        slippagePct,
      );
      return result;
    },
  });
}
