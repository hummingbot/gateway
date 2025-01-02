import { FastifyInstance } from 'fastify';
import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import BN from "bn.js";
import {
  SolanaController,
  SolanaAddressSchema,
  BadRequestResponseSchema,
} from '../solana.controller';

// Define the BalanceResponse schema using TypeBox
const BalanceResponseSchema = Type.Array(
  Type.Object({
    address: Type.String(),
    symbol: Type.String(),
    amount: Type.String(),
  })
);

// Infer the BalanceResponse type from the schema
type BalanceResponse = Static<typeof BalanceResponseSchema>;

export class GetBalanceController extends SolanaController {
  private balanceValidator = TypeCompiler.Compile(BalanceResponseSchema);

  async getBalance(address?: string, symbols?: string[]): Promise<BalanceResponse> {
    const publicKey = address ? new PublicKey(address) : new PublicKey(this.getWallet().publicKey);

    // Convert symbols to uppercase for case-insensitive matching
    const upperCaseSymbols = symbols?.map(s => s.toUpperCase());

    // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
    const balances: BalanceResponse = [];

    if (!upperCaseSymbols || upperCaseSymbols.includes("SOL")) {
      const solBalance = await this.connectionPool.getNextConnection().getBalance(publicKey);
      balances.push({
        address: "11111111111111111111111111111111",
        symbol: "SOL",
        amount: (solBalance / 1e9).toString(), // Convert lamports to SOL
      });
    }

    // Fetch the token list
    const tokenList = this.getTokenList();
    const tokenDefs = tokenList.reduce((acc, token) => {
      if (!upperCaseSymbols || upperCaseSymbols.includes(token.symbol.toUpperCase())) {
        acc[token.address] = { name: token.symbol, decimals: token.decimals };
      }
      return acc;
    }, {});

    // Get all token accounts for the provided address
    const accounts = await this.connectionPool.getNextConnection().getTokenAccountsByOwner(
      publicKey, // Use the provided address
      { programId: TOKEN_PROGRAM_ID }
    );

    // Loop through all the token accounts and fetch the requested tokens
    for (const value of accounts.value) {
      const parsedTokenAccount = unpackAccount(value.pubkey, value.account);
      const mint = parsedTokenAccount.mint;
      const tokenDef = tokenDefs[mint.toBase58()];
      if (tokenDef === undefined) continue;

      const amount = parsedTokenAccount.amount;
      const uiAmount = new BN(amount.toString()).div(new BN(10).pow(new BN(tokenDef.decimals))).toString();

      // Push requested tokens' info to the balances array
      balances.push({
        address: mint.toBase58(),
        symbol: tokenDef.name,
        amount: uiAmount,
      });
    }

    // Validate the balances array before returning
    if (!this.balanceValidator.Check(balances)) {
      throw new Error('Balance response does not match the expected schema');
    }

    return balances;
  }
}

export default function getBalanceRoute(fastify: FastifyInstance, folderName: string) {
    const controller = new GetBalanceController();
  
    fastify.get(`/${folderName}/balance`, {
      schema: {
        tags: [folderName],
        description: 'Get token balances for the specified wallet address or the user\'s wallet if not provided',
        querystring: Type.Object({
          address: Type.Optional(SolanaAddressSchema),
          symbols: Type.Optional(Type.Array(Type.String(), { default: ["SOL"] }))
        }),
        response: {
          200: BalanceResponseSchema,
          400: BadRequestResponseSchema
        }
      },
      handler: async (request, reply) => {
        const { address, symbols } = request.query as { address?: string; symbols?: string[] };
        fastify.log.info(`Getting token balances for address: ${address || 'user wallet'}`);
        try {
          const result = await controller.getBalance(address, symbols);
          reply.send(result); // Use reply.send() to let Fastify handle the serialization
        } catch (error) {
          fastify.log.error(error);
          reply.status(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching token balances'
          });
        }
      }
  });
}