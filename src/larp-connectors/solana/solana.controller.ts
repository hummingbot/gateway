import {
  Connection,
  Keypair,
  clusterApiUrl,
  Cluster,
  Transaction,
  ComputeBudgetProgram,
  SignatureStatus,
  Signer,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import { Type } from '@sinclair/typebox';
import { Client, UtlConfig, Token } from '@solflare-wallet/utl-sdk';
import { TokenInfoResponse } from './routes/listTokens';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { config } from 'dotenv';

// Add accounts from https://triton.one/solana-prioritization-fees/ to track general fees
const PRIORITY_FEE_ACCOUNTS = [
  '4qGj88CX3McdTXEviEaqeP2pnZJxRTsZFWyU3Mrnbku4',
  '2oLNTQKRb4a2117kFi6BYTUDu3RPrMVAHFhCfPKMosxX',
  'xKUz6fZ79SXnjGYaYhhYTYQBoRUBoCyuDMkBa1tL3zU',
  'GASeo1wEK3Rwep6fsAt212Jw9zAYguDY5qUwTnyZ4RH',
  'B8emFMG91JJsBELV4XVkTNe3YTs85x4nCqub7dRZUY1p',
  'DteH7aNKykAG2b2KQo7DD9XvLBfNgAuf2ixj5HC7ppTk',
  '5HngGmYzvSuh3XyU11brHDpMTHXQQRQQT4udGFtQSjgR',
  'GD37bnQdGkDsjNqnVGr9qWTnQJSKMHbsiXX9tXLMUcaL',
  '4po3YMfioHkNP4mL4N46UWJvBoQDS2HFjzGm1ifrUWuZ',
  '5veMSa4ks66zydSaKSPMhV7H2eF88HvuKDArScNH9jaG',
];

const GET_SIGNATURES_FOR_ADDRESS_LIMIT = 100;

interface PriorityFeeRequestPayload {
  method: string;
  params: string[][];
  id: number;
  jsonrpc: string;
}

interface PriorityFeeResponse {
  jsonrpc: string;
  result: Array<{
    prioritizationFee: number;
    slot: number;
  }>;
  id: number;
}

interface PriorityFeeEstimates {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
}

// Update the TOKEN_LIST_FILE constant
const TOKEN_LIST_FILE =
  process.env.SOLANA_NETWORK === 'devnet'
    ? 'lists/devnet-tokenlist.json'
    : 'lists/mainnet-tokenlist.json';

export let priorityFeeMultiplier: number = 1;

export const SolanaAddressSchema = Type.String({
  pattern: '^[1-9A-HJ-NP-Za-km-z]{32,44}$',
  description: 'Solana address in base58 format',
});

export const BadRequestResponseSchema = Type.Object({
  statusCode: Type.Number(),
  error: Type.String(),
  message: Type.String(),
});

export type SolanaNetworkType = 'mainnet-beta' | 'devnet';

class ConnectionPool {
  private connections: Connection[] = [];
  private currentIndex: number = 0;

  constructor(urls: string[]) {
    this.connections = urls.map((url) => new Connection(url, { commitment: 'confirmed' }));
  }

  public getNextConnection(): Connection {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }

  public getAllConnections(): Connection[] {
    return this.connections;
  }
}

export class SolanaController {
  protected network: string;
  protected connectionPool: ConnectionPool;
  protected keypair: Keypair | null = null;
  protected tokenList: any = null;
  private utl: Client;
  private tokenInfoValidator: ReturnType<typeof TypeCompiler.Compile>;
  private static solanaLogged: boolean = false;

  constructor() {
    this.network = this.validateSolanaNetwork(process.env.SOLANA_NETWORK);
    config(); // Load environment variables

    // Parse comma-separated RPC URLs
    const rpcUrlsString = process.env.SOLANA_RPC_URLS;
    const rpcUrls: string[] = [];

    if (rpcUrlsString) {
      // Split and trim URLs, filter out empty strings
      const urls = rpcUrlsString
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url !== '');
      rpcUrls.push(...urls);
    }

    // Add default cluster URL if no URLs provided
    if (rpcUrls.length === 0) {
      rpcUrls.push(clusterApiUrl(this.network as Cluster));
    }

    // Initialize connection pool
    this.connectionPool = new ConnectionPool(rpcUrls);

    this.loadWallet();
    this.loadTokenList();
    this.initializeUtl();
    this.tokenInfoValidator = TypeCompiler.Compile(TokenInfoResponse);

    // Log once only if the server is running
    if (!SolanaController.solanaLogged && process.env.START_SERVER === 'true') {
      console.log(`Solana connector initialized:
        - Network: ${this.network}
        - RPC URLs:\n${rpcUrls.map((url) => `\t\t${url}`).join('\n')}
        - Wallet Public Key: ${this.keypair.publicKey.toBase58()}
        - Token List: ${TOKEN_LIST_FILE}
      `);
      SolanaController.solanaLogged = true;
    }
  }

  public validateSolanaNetwork(network: string | undefined): SolanaNetworkType {
    if (!network || (network !== 'mainnet-beta' && network !== 'devnet')) {
      throw new Error('Invalid SOLANA_NETWORK. Must be either "mainnet-beta" or "devnet"');
    }
    return network;
  }

  public validateSolanaAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  protected loadWallet(): void {
    const walletPath = process.env.SOLANA_WALLET_JSON;
    if (!walletPath) {
      throw new Error('SOLANA_WALLET_JSON environment variable is not set');
    }
    try {
      const secretKeyArray = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (error) {
      throw new Error(`Failed to load wallet JSON: ${error.message}`);
    }
  }

  protected loadTokenList(): void {
    const tokenListPath = path.join(__dirname, TOKEN_LIST_FILE);
    try {
      this.tokenList = JSON.parse(fs.readFileSync(tokenListPath, 'utf8'));
    } catch (error) {
      console.error(`Failed to load token list ${TOKEN_LIST_FILE}: ${error.message}`);
      this.tokenList = { content: [] };
    }
  }

  private initializeUtl(): void {
    const connectionUrl =
      this.network === 'devnet'
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';

    const config = new UtlConfig({
      chainId: this.network === 'devnet' ? 103 : 101,
      timeout: 2000,
      connection: this.connectionPool.getNextConnection(), // Use connection from pool
      apiUrl: 'https://token-list-api.solana.cloud',
      cdnUrl: 'https://cdn.jsdelivr.net/gh/solflare-wallet/token-list/solana-tokenlist.json',
    });
    this.utl = new Client(config);
  }

  public getWallet(): { publicKey: string; network: string } {
    return {
      publicKey: this.keypair.publicKey.toBase58(),
      network: this.network,
    };
  }

  public getTokenList(): any {
    // Ensure the token list contains symbols
    return (
      this.tokenList.content.map((token) => ({
        address: token.address,
        chainId: token.chainId,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
      })) || []
    );
  }

  public async getTokenByAddress(tokenAddress: string, useApi: boolean = false): Promise<Token> {
    if (useApi && this.network !== 'mainnet-beta') {
      throw new Error('API usage is only allowed on mainnet-beta');
    }

    const publicKey = new PublicKey(tokenAddress);
    let token: Token;

    if (useApi) {
      token = await this.utl.fetchMint(publicKey);
    } else {
      const tokenList = this.getTokenList();
      const foundToken = tokenList.find((t) => t.address === tokenAddress);
      if (!foundToken) {
        throw new Error('Token not found in the token list');
      }
      token = foundToken as Token;
    }

    // Validate the token object against the schema
    if (!this.tokenInfoValidator.Check(token)) {
      throw new Error('Token info does not match the expected schema');
    }

    return token;
  }

  public async getTokenBySymbol(symbol: string): Promise<Token> {
    const tokenList = this.getTokenList();
    const foundToken = tokenList.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());

    if (!foundToken) {
      throw new Error('Token not found in the token list');
    }

    // Validate the token object against the schema
    if (!this.tokenInfoValidator.Check(foundToken)) {
      throw new Error('Token info does not match the expected schema');
    }

    return foundToken as Token;
  }

  async fetchEstimatePriorityFees(rcpURL: string): Promise<PriorityFeeEstimates> {
    try {
      const maxPriorityFee = parseInt(process.env.MAX_PRIORITY_FEE);
      const minPriorityFee = parseInt(process.env.MIN_PRIORITY_FEE);

      // Only include params that are defined
      const params: string[][] = [];
      params.push(PRIORITY_FEE_ACCOUNTS);
      const payload: PriorityFeeRequestPayload = {
        method: 'getRecentPrioritizationFees',
        params: params,
        id: 1,
        jsonrpc: '2.0',
      };

      const response = await fetch(rcpURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        throw new Error(`Failed to fetch fees: ${response.status}`);
      }

      const data: PriorityFeeResponse = await response.json();

      // Process the response to categorize fees
      const fees = data.result.map((item) => item.prioritizationFee);

      // Filter out fees lower than the minimum fee for calculations
      const nonZeroFees = fees.filter((fee) => fee >= minPriorityFee);
      nonZeroFees.sort((a, b) => a - b); // Sort non-zero fees in ascending order

      if (nonZeroFees.length === 0) {
        nonZeroFees.push(minPriorityFee); // Add one entry of min fee if no fees are available
      }

      const min = Math.min(...nonZeroFees);
      const low = nonZeroFees[Math.floor(nonZeroFees.length * 0.2)];
      const medium = nonZeroFees[Math.floor(nonZeroFees.length * 0.4)];
      const high = nonZeroFees[Math.floor(nonZeroFees.length * 0.6)];
      const veryHigh = nonZeroFees[Math.floor(nonZeroFees.length * 0.8)];
      const unsafeMax = Math.max(...nonZeroFees);

      const result = {
        min: Math.max(min, minPriorityFee),
        low: Math.max(Math.min(low, maxPriorityFee), minPriorityFee),
        medium: Math.max(Math.min(medium, maxPriorityFee), minPriorityFee),
        high: Math.max(Math.min(high, maxPriorityFee), minPriorityFee),
        veryHigh: Math.max(Math.min(veryHigh, maxPriorityFee), minPriorityFee),
        unsafeMax: Math.max(Math.min(unsafeMax, maxPriorityFee), minPriorityFee),
      };

      console.debug('[PRIORITY FEES] Calculated priority fees:', result);

      return result;
    } catch (error) {
      console.error(`Failed to fetch estimate priority fees: ${error.message}`);
      throw new Error(`Failed to fetch estimate priority fees: ${error.message}`);
    }
  }

  public async confirmTransaction(
    signature: string,
    connection: Connection,
    timeout: number = 3000,
  ): Promise<boolean> {
    try {
      const confirmationPromise = new Promise<boolean>(async (resolve, reject) => {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignatureStatuses',
          params: [
            [signature],
            {
              searchTransactionHistory: true,
            },
          ],
        };

        const response = await fetch(connection.rpcEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          reject(new Error(`HTTP error! status: ${response.status}`));
          return;
        }

        const data = await response.json();

        if (data.result && data.result.value && data.result.value[0]) {
          const status: SignatureStatus = data.result.value[0];
          if (status.err !== null) {
            reject(new Error(`Transaction failed with error: ${JSON.stringify(status.err)}`));
            return;
          }
          const isConfirmed =
            status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
          resolve(isConfirmed);
        } else {
          resolve(false);
        }
      });

      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error confirming transaction:', error.message);
      throw new Error(`Failed to confirm transaction: ${error.message}`);
    }
  }

  public async confirmTransactionByAddress(
    address: string,
    signature: string,
    connection: Connection,
    timeout: number = 3000,
  ): Promise<boolean> {
    try {
      const confirmationPromise = new Promise<boolean>(async (resolve, reject) => {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [
            address,
            {
              limit: GET_SIGNATURES_FOR_ADDRESS_LIMIT, // Adjust the limit as needed
              until: signature,
            },
          ],
        };

        const response = await fetch(connection.rpcEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          reject(new Error(`HTTP error! status: ${response.status}`));
          return;
        }

        const data = await response.json();

        if (data.result) {
          const transactionInfo = data.result.find((entry) => entry.signature === signature);

          if (!transactionInfo) {
            resolve(false);
            return;
          }

          if (transactionInfo.err !== null) {
            reject(
              new Error(`Transaction failed with error: ${JSON.stringify(transactionInfo.err)}`),
            );
            return;
          }

          const isConfirmed =
            transactionInfo.confirmationStatus === 'confirmed' ||
            transactionInfo.confirmationStatus === 'finalized';
          resolve(isConfirmed);
        } else {
          resolve(false);
        }
      });

      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error confirming transaction using signatures:', error.message);
      throw new Error(`Failed to confirm transaction using signatures: ${error.message}`);
    }
  }

  async sendAndConfirmTransaction(tx: Transaction, signers: Signer[] = []): Promise<string> {
    const priorityFeesEstimate = await this.fetchEstimatePriorityFees(
      this.connectionPool.getNextConnection().rpcEndpoint,
    );

    const validFeeLevels = ['min', 'low', 'medium', 'high', 'veryHigh', 'unsafeMax'];
    const priorityFeeLevel = process.env.PRIORITY_FEE_LEVEL || 'medium';

    // Ensure the priorityFeeLevel is valid, otherwise default to 'medium'
    const selectedPriorityFee = validFeeLevels.includes(priorityFeeLevel)
      ? priorityFeesEstimate[priorityFeeLevel]
      : priorityFeesEstimate.medium;

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: selectedPriorityFee * Math.max(priorityFeeMultiplier, 1),
    });

    tx.instructions.push(priorityFeeInstruction);

    const blockhashAndContext = await this.connectionPool
      .getNextConnection()
      .getLatestBlockhashAndContext('confirmed');
    const lastValidBlockHeight = blockhashAndContext.value.lastValidBlockHeight;
    const blockhash = blockhashAndContext.value.blockhash;

    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);

    const signature = await this.sendAndConfirmRawTransaction(
      tx.serialize(),
      signers[0].publicKey.toBase58(),
      lastValidBlockHeight,
    );

    // Decrease priority fee multiplier if transaction is successful
    this.decreasePriorityFeeMultiplier();

    return signature;
  }

  async sendAndConfirmRawTransaction(
    rawTx: Buffer | Uint8Array | Array<number>,
    payerAddress: string,
    lastValidBlockHeight: number,
  ): Promise<string> {
    let blockheight = await this.connectionPool
      .getNextConnection()
      .getBlockHeight({ commitment: 'confirmed' });

    let signature: string;
    let signatures: string[];
    let confirmations: boolean[];

    while (blockheight <= lastValidBlockHeight + 50) {
      const sendRawTransactionResults = await Promise.allSettled(
        this.connectionPool.getAllConnections().map((conn) =>
          conn.sendRawTransaction(rawTx, {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 0,
          }),
        ),
      );

      const successfulResults = sendRawTransactionResults.filter(
        (result) => result.status === 'fulfilled',
      );

      if (successfulResults.length > 0) {
        // Map all successful results to get their values (signatures)
        signatures = successfulResults.map((result) => result.value);
      } else {
        // All promises failed
        console.error('All connections failed to send the transaction.');
        throw new Error('All connections failed to send the transaction.');
      }

      // Verify all signatures match
      if (!signatures.every((sig) => sig === signatures[0])) {
        console.error('Signatures do not match across connections.');
        throw new Error('Signature mismatch between connections.');
      }

      signature = signatures[0];

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check confirmation across all connections
      const confirmTransactionResults = await Promise.allSettled(
        this.connectionPool
          .getAllConnections()
          .flatMap((conn) => [
            this.confirmTransaction(signature, conn),
            this.confirmTransactionByAddress(payerAddress, signature, conn),
          ]),
      );

      const successfulConfirmations = confirmTransactionResults.filter(
        (result) => result.status === 'fulfilled',
      );

      const rejectedConfirmations = confirmTransactionResults.filter(
        (result) => result.status === 'rejected',
      );

      rejectedConfirmations.forEach((result) => {
        if (result.status === 'rejected' && result.reason.message.includes('InstructionError')) {
          console.error(result.reason.message);
          throw new Error(result.reason.message);
        }
      });

      if (successfulConfirmations.length > 0) {
        // Map all successful results to get their values (signatures)
        confirmations = successfulConfirmations.map((result) => result.value);
      } else {
        // All promises failed
        console.error('All connections failed to confirm the transaction.');
        throw new Error('All connections failed to confirm the transaction.');
      }

      if (confirmations.some((confirmed) => confirmed)) {
        return signature;
      }

      blockheight = await this.connectionPool
        .getNextConnection()
        .getBlockHeight({ commitment: 'confirmed' });
    }

    console.error('Transaction could not be confirmed within the valid block height range.');
    this.increasePriorityFeeMultiplier();
    throw new TransactionExpiredBlockheightExceededError(signature);
  }

  async extractTokenBalanceChangeAndFee(
    signature: string,
    mint: string,
    owner: string,
  ): Promise<{ balanceChange: number; fee: number }> {
    let txDetails;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        txDetails = await this.connectionPool.getNextConnection().getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails) {
          break; // Exit loop if txDetails is not null
        } else {
          throw new Error('Transaction details are null');
        }
      } catch (error) {
        if (attempt < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // Return default values after 10 attempts
          console.error(`Error fetching transaction details: ${error.message}`);
          return { balanceChange: 0, fee: 0 };
        }
      }
    }

    const preTokenBalances = txDetails.meta?.preTokenBalances || [];
    const postTokenBalances = txDetails.meta?.postTokenBalances || [];

    const preBalance =
      preTokenBalances.find((balance) => balance.mint === mint && balance.owner === owner)
        ?.uiTokenAmount.uiAmount || 0;

    const postBalance =
      postTokenBalances.find((balance) => balance.mint === mint && balance.owner === owner)
        ?.uiTokenAmount.uiAmount || 0;

    const balanceChange = postBalance - preBalance;
    const fee = (txDetails.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL

    return { balanceChange, fee };
  }

  async extractAccountBalanceChangeAndFee(
    signature: string,
    accountIndex: number,
  ): Promise<{ balanceChange: number; fee: number }> {
    let txDetails;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        txDetails = await this.connectionPool.getNextConnection().getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails) {
          break; // Exit loop if txDetails is not null
        } else {
          throw new Error('Transaction details are null');
        }
      } catch (error) {
        if (attempt < 19) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // Return default values after 10 attempts
          console.error(`Error fetching transaction details: ${error.message}`);
          return { balanceChange: 0, fee: 0 };
        }
      }
    }

    const preBalances = txDetails.meta?.preBalances || [];
    const postBalances = txDetails.meta?.postBalances || [];

    const balanceChange =
      Math.abs(postBalances[accountIndex] - preBalances[accountIndex]) / 1_000_000_000;
    const fee = (txDetails.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL

    return { balanceChange, fee };
  }

  private increasePriorityFeeMultiplier(): void {
    priorityFeeMultiplier += 3;
    console.debug(`[PRIORITY FEE] Increased priorityFeeMultiplier to: ${priorityFeeMultiplier}`);
  }

  private decreasePriorityFeeMultiplier(): void {
    if (priorityFeeMultiplier <= 1) {
      priorityFeeMultiplier = 1;
      console.debug(
        `[PRIORITY FEE] Set priorityFeeMultiplier to minimum value: ${priorityFeeMultiplier}`,
      );
      return;
    }

    if (priorityFeeMultiplier > 1) {
      priorityFeeMultiplier -= 1;
      console.debug(`[PRIORITY FEE] Decreased priorityFeeMultiplier to: ${priorityFeeMultiplier}`);
    }
  }
}
