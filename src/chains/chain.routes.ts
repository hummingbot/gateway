/**
 * Chain routes, parameterized by chain.
 *
 * These used to be registered once per chain (/chains/solana/poll,
 * /chains/ethereum/poll, ...), which made the route table grow with every chain
 * and forced any client that wanted to be chain-agnostic — or any generated
 * client — to hardcode the chain list. The handlers were already chain-agnostic:
 * both chains' operations return the same shared response schemas, so the only
 * thing per-chain about them is which function to call.
 *
 * EVM-only operations (allowances, approve) stay on /chains/ethereum: a
 * parameterized route that 400s for Solana would be worse than a path that
 * simply does not exist there.
 */
import sensible from '@fastify/sensible';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { BuildTransactionResponse, ChainBuildTransactionResponse } from '../schemas/build-schema';
import {
  BalanceRequestSchema,
  BalanceRequestType,
  BalanceResponseSchema,
  BuildTransactionRequestSchema,
  BuildTransactionRequestType,
  EstimateGasRequestSchema,
  EstimateGasRequestType,
  EstimateGasResponseSchema,
  PollRequestSchema,
  PollRequestType,
  PollResponseSchema,
  StatusRequestSchema,
  StatusRequestType,
  StatusResponseSchema,
  SubmitRequestSchema,
  SubmitRequestType,
  SubmitResponseSchema,
  UnwrapRequestSchema,
  UnwrapRequestType,
  WrapRequestSchema,
  WrapRequestType,
  WrapResponseSchema,
} from '../schemas/chain-schema';
import { httpErrors } from '../services/error-handler';

import { configuredDefaultWallet } from './default-wallet';
import {
  getEthereumChainConfig,
  getEthereumNetworkConfig,
  networks as ethereumNetworks,
} from './ethereum/ethereum.config';
import { captureEvmTransaction } from './ethereum/evm-build-mode';
import { allowancesRoute } from './ethereum/routes/allowances';
import { approveRoute } from './ethereum/routes/approve';
import { getEthereumBalances } from './ethereum/routes/balances';
import { estimateGasEthereum } from './ethereum/routes/estimate-gas';
import { pollEthereumTransaction } from './ethereum/routes/poll';
import { getEthereumStatus } from './ethereum/routes/status';
import { submitEthereumTransaction } from './ethereum/routes/submit';
import { unwrapEthereum } from './ethereum/routes/unwrap';
import { wrapEthereum } from './ethereum/routes/wrap';
import { getSolanaBalances } from './solana/routes/balances';
import { buildSolanaTransaction } from './solana/routes/build-transaction';
import { estimateGasSolana } from './solana/routes/estimate-gas';
import { pollSolanaTransaction } from './solana/routes/poll';
import { getSolanaStatus } from './solana/routes/status';
import { submitSolanaTransaction } from './solana/routes/submit';
import { unwrapSolana } from './solana/routes/unwrap';
import { wrapSolana } from './solana/routes/wrap';
import { getSolanaChainConfig, getSolanaNetworkConfig, networks as solanaNetworks } from './solana/solana.config';

interface ChainOps {
  networks: readonly string[];
  defaultNetwork: () => string;
  status: (fastify: FastifyInstance, network: string) => Promise<any>;
  estimateGas: (fastify: FastifyInstance, network: string) => Promise<any>;
  balances: (fastify: FastifyInstance, network: string, address: string, tokens?: string[]) => Promise<any>;
  poll: (fastify: FastifyInstance, network: string, signature: string) => Promise<any>;
  /**
   * Build an unsigned transaction from caller-supplied instructions (the generic half
   * of build/sign/submit, #682). Optional, like submit.
   */
  buildTransaction?: (
    fastify: FastifyInstance,
    network: string,
    walletAddress: string,
    instructions: BuildTransactionRequestType['instructions'],
    minComputeUnits?: number,
    references?: string[],
    shape?: Pick<BuildTransactionRequestType, 'feePayer' | 'memo' | 'priority'>,
  ) => Promise<any>;
  /**
   * Broadcast a caller-signed transaction (the submit half of build/sign/submit, #682).
   * Optional: chains without build support do not implement it, and the route reports
   * that clearly instead of the path not existing.
   */
  submit?: (
    fastify: FastifyInstance,
    network: string,
    signedTransaction: string,
    extraSigners?: { pubkey: string; signature: string }[],
  ) => Promise<any>;
  wrap: (fastify: FastifyInstance, network: string, address: string, amount: string) => Promise<any>;
  unwrap: (fastify: FastifyInstance, network: string, address: string, amount?: string) => Promise<any>;
  /**
   * Run an operation (wrap, unwrap) in build mode and return the transaction it would have
   * sent, unsigned. Optional: a chain whose wrap signs outside its build chokepoint has none.
   */
  captureBuild?: (run: () => Promise<unknown>) => Promise<any>;
  /** EVM chains require an explicit unwrap amount; Solana unwraps the full balance. */
  unwrapRequiresAmount: boolean;
}

const CHAINS: Record<string, ChainOps> = {
  solana: {
    networks: solanaNetworks,
    defaultNetwork: () => getSolanaChainConfig().defaultNetwork,
    status: (fastify, network) => getSolanaStatus(fastify, network),
    estimateGas: (_fastify, network) => estimateGasSolana(network),
    balances: (fastify, network, address, tokens) => getSolanaBalances(fastify, network, address, tokens),
    poll: (fastify, network, signature) => pollSolanaTransaction(fastify, network, signature),
    buildTransaction: (fastify, network, walletAddress, instructions, minComputeUnits, references, shape) =>
      buildSolanaTransaction(fastify, network, walletAddress, instructions, minComputeUnits, references, shape),
    submit: (fastify, network, signedTransaction, extraSigners) =>
      submitSolanaTransaction(fastify, network, signedTransaction, extraSigners),
    wrap: (fastify, network, address, amount) => wrapSolana(fastify, network, address, amount),
    unwrap: (fastify, network, address, amount) => unwrapSolana(fastify, network, address, amount),
    unwrapRequiresAmount: false,
  },
  ethereum: {
    networks: ethereumNetworks,
    defaultNetwork: () => getEthereumChainConfig().defaultNetwork,
    status: (_fastify, network) => getEthereumStatus(network),
    estimateGas: (fastify, network) => estimateGasEthereum(fastify, network),
    balances: (fastify, network, address, tokens) => getEthereumBalances(fastify, network, address, tokens),
    poll: (fastify, network, signature) => pollEthereumTransaction(fastify, network, signature),
    wrap: (fastify, network, address, amount) => wrapEthereum(fastify, network, address, amount),
    unwrap: (fastify, network, address, amount) => unwrapEthereum(fastify, network, address, amount!),
    submit: (fastify, network, signedTransaction, extraSigners) =>
      submitEthereumTransaction(fastify, network, signedTransaction, extraSigners),
    captureBuild: (run) => captureEvmTransaction(run),
    unwrapRequiresAmount: true,
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAINS);

/**
 * The `chain` path parameter, enum-constrained so Swagger renders it as a dropdown
 * rather than a free-text box and an unknown chain is rejected at the schema. Built
 * from CHAINS, so adding a chain adds it to the docs. The default is documentation
 * only — a path parameter is always present, so nothing is ever injected for it.
 */
const ChainParamsSchema = Type.Object({
  chain: Type.String({
    description: 'Chain to operate on',
    enum: SUPPORTED_CHAINS,
    default: 'solana',
  }),
});

/**
 * Resolve the chain and network for a request, rejecting an unknown chain and a
 * network that belongs to a different one. The per-chain routes got the second
 * check for free from their network enums; parameterizing the path means doing
 * it here instead of accepting "ethereum-mainnet-beta".
 */
function resolveChain(chain: string, network?: string): { ops: ChainOps; network: string } {
  const ops = CHAINS[chain];
  if (!ops) {
    throw httpErrors.badRequest(`Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(', ')}`);
  }

  const resolved = network || ops.defaultNetwork();
  if (!ops.networks.includes(resolved)) {
    throw httpErrors.badRequest(
      `Network '${resolved}' is not a ${chain} network. Available: ${ops.networks.join(', ')}`,
    );
  }
  // Surfaces a misconfigured-but-listed network as a clear error rather than a
  // downstream failure inside the chain client.
  if (chain === 'solana') getSolanaNetworkConfig(resolved);
  else getEthereumNetworkConfig(resolved);

  return { ops, network: resolved };
}

interface ChainParams {
  chain: string;
}

export const chainRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.get<{ Params: ChainParams; Querystring: StatusRequestType }>(
    '/:chain/status',
    {
      schema: {
        description: 'Get the status of a chain and network',
        tags: ['/chains'],
        params: ChainParamsSchema,
        querystring: StatusRequestSchema,
        response: { 200: StatusResponseSchema },
      },
    },
    async (request) => {
      const { ops, network } = resolveChain(request.params.chain, request.query.network);
      return ops.status(fastify, network);
    },
  );

  fastify.get<{ Params: ChainParams; Querystring: EstimateGasRequestType }>(
    '/:chain/estimate-gas',
    {
      schema: {
        description: 'Estimate the current transaction fee on a chain',
        tags: ['/chains'],
        params: ChainParamsSchema,
        querystring: EstimateGasRequestSchema,
        response: { 200: EstimateGasResponseSchema },
      },
    },
    async (request) => {
      const { ops, network } = resolveChain(request.params.chain, request.query.network);
      return ops.estimateGas(fastify, network);
    },
  );

  fastify.post<{ Params: ChainParams; Body: BalanceRequestType }>(
    '/:chain/balances',
    {
      schema: {
        description: 'Get token balances for a wallet',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: BalanceRequestSchema,
        response: { 200: BalanceResponseSchema },
      },
    },
    async (request) => {
      const { chain } = request.params;
      const { ops, network } = resolveChain(chain, request.body.network);
      const address = request.body.address || configuredDefaultWallet(chain);
      if (!address) {
        throw httpErrors.badRequest(`No address given and no default wallet configured for ${chain}`);
      }
      return ops.balances(fastify, network, address, request.body.tokens);
    },
  );

  fastify.post<{ Params: ChainParams; Body: PollRequestType }>(
    '/:chain/poll',
    {
      schema: {
        description: 'Poll a transaction by signature/hash',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: PollRequestSchema,
        response: { 200: PollResponseSchema },
      },
    },
    async (request) => {
      const { ops, network } = resolveChain(request.params.chain, request.body.network);
      return ops.poll(fastify, network, request.body.signature);
    },
  );

  fastify.post<{ Params: ChainParams; Body: BuildTransactionRequestType }>(
    '/:chain/build-transaction',
    {
      schema: {
        description:
          'Build an unsigned transaction from caller-supplied instructions — the generic counterpart of ' +
          'the /trading build-* routes, for operations Gateway has no connector for. Gateway simulates, ' +
          'sizes the compute budget, sets the priority fee and a fresh blockhash, and leaves the ' +
          'fee-payer slot empty; the result signs and submits like any other build response. Only the ' +
          'wallet may be named as a signer.',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: BuildTransactionRequestSchema,
        response: { 200: BuildTransactionResponse },
      },
    },
    async (request) => {
      const { chain } = request.params;
      const { ops, network } = resolveChain(chain, request.body.network);
      if (!ops.buildTransaction) {
        throw httpErrors.badRequest(`Building transactions is not supported for ${chain} yet.`);
      }
      return ops.buildTransaction(
        fastify,
        network,
        request.body.walletAddress,
        request.body.instructions,
        request.body.minComputeUnits,
        request.body.references,
        { feePayer: request.body.feePayer, memo: request.body.memo, priority: request.body.priority },
      );
    },
  );

  fastify.post<{ Params: ChainParams; Body: SubmitRequestType }>(
    '/:chain/submit',
    {
      schema: {
        description:
          'Broadcast a transaction signed by the caller (the submit half of the build/sign/submit flow: ' +
          'see the build-* routes), then wait for its confirmation as execute does. Solana: re-merges the ' +
          'ephemeral signatures from the build response and verifies every signature locally before ' +
          'broadcasting, so a mutated message fails here with a clear error rather than being dropped ' +
          'silently by the network. Ethereum: takes the signed raw transaction (0x-hex), refuses one signed ' +
          'for another chain id, and reports a revert as TRANSACTION_FAILED.',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: SubmitRequestSchema,
        response: { 200: SubmitResponseSchema },
      },
    },
    async (request) => {
      const { chain } = request.params;
      const { ops, network } = resolveChain(chain, request.body.network);
      if (!ops.submit) {
        throw httpErrors.badRequest(
          `Submit is not supported for ${chain} yet — its connectors sign and broadcast in their execute routes.`,
        );
      }
      return ops.submit(fastify, network, request.body.signedTransaction, request.body.extraSigners);
    },
  );

  fastify.post<{ Params: ChainParams; Body: WrapRequestType }>(
    '/:chain/wrap',
    {
      schema: {
        description: 'Wrap native token into its wrapped form (SOL to WSOL, ETH to WETH, ...)',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: WrapRequestSchema,
        response: { 200: WrapResponseSchema },
      },
    },
    async (request) => {
      const { ops, network } = resolveChain(request.params.chain, request.body.network);
      return ops.wrap(fastify, network, request.body.address, request.body.amount);
    },
  );

  fastify.post<{ Params: ChainParams; Body: UnwrapRequestType }>(
    '/:chain/unwrap',
    {
      schema: {
        description: 'Unwrap a wrapped native token back into the native token',
        tags: ['/chains'],
        params: ChainParamsSchema,
        body: UnwrapRequestSchema,
        response: { 200: WrapResponseSchema },
      },
    },
    async (request) => {
      const { chain } = request.params;
      const { ops, network } = resolveChain(chain, request.body.network);
      if (ops.unwrapRequiresAmount && !request.body.amount) {
        throw httpErrors.badRequest(`amount is required to unwrap on ${chain}`);
      }
      return ops.unwrap(fastify, network, request.body.address, request.body.amount);
    },
  );

  const buildWrapRoute = (verb: 'wrap' | 'unwrap') =>
    fastify.post<{ Params: ChainParams; Body: WrapRequestType & UnwrapRequestType }>(
      `/:chain/build-${verb}`,
      {
        schema: {
          description:
            `Build the unsigned transaction /chains/{chain}/${verb} would sign and send, for the caller to ` +
            'sign with its own wallet and broadcast via /chains/{chain}/submit. Ethereum only for now.',
          tags: ['/chains'],
          params: ChainParamsSchema,
          body: verb === 'wrap' ? WrapRequestSchema : UnwrapRequestSchema,
          response: { 200: ChainBuildTransactionResponse },
        },
      },
      async (request) => {
        const { chain } = request.params;
        const { ops, network } = resolveChain(chain, request.body.network);
        if (!ops.captureBuild) {
          throw httpErrors.badRequest(`build-${verb} is not supported for ${chain} yet; use /chains/${chain}/${verb}.`);
        }
        const { address, amount } = request.body;
        if (verb === 'unwrap' && ops.unwrapRequiresAmount && !amount) {
          throw httpErrors.badRequest(`amount is required to unwrap on ${chain}`);
        }
        return ops.captureBuild(() =>
          verb === 'wrap'
            ? ops.wrap(fastify, network, address, amount!)
            : ops.unwrap(fastify, network, address, amount),
        );
      },
    );
  buildWrapRoute('wrap');
  buildWrapRoute('unwrap');

  // EVM-only operations keep their chain-specific paths.
  fastify.register(
    async (evm) => {
      await evm.register(sensible);
      evm.register(allowancesRoute);
      evm.register(approveRoute);
    },
    { prefix: '/ethereum' },
  );
};

export default chainRoutes;
