/**
 * Add Swig Wallet Route
 * Registers an existing Swig smart-contract wallet with Gateway.
 *
 * The Swig account and its restricted delegate role are provisioned out-of-band by the
 * operator (see scripts/swig/create-swig-wallet.ts) using the offline owner key. This
 * route verifies on-chain that the delegate role exists, derives the funds-owner
 * address, and stores the mapping so Gateway can sign through the wallet.
 */

import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { updateDefaultWallet } from '../../config/utils';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { getSwigService } from '../swig';
import { getSwigWallets, saveSwigWallets, getAllWalletAddressesForChain } from '../utils';

export const AddSwigWalletRequestSchema = Type.Object({
  network: Type.String({
    description: 'Solana network the Swig account lives on',
    default: 'mainnet-beta',
    examples: ['mainnet-beta', 'devnet'],
  }),
  accountAddress: Type.String({
    description: 'The Swig account (PDA) address returned by the provisioning script',
  }),
  ownerAddress: Type.String({
    description: 'Owner/root authority public key (kept offline)',
  }),
  delegateAddress: Type.String({
    description: 'Delegate authority public key — must be a local wallet in Gateway so it can sign',
  }),
  id: Type.String({
    description: 'Base58-encoded 32-byte Swig id from the provisioning script',
  }),
  delegateSigner: Type.Optional(
    Type.Union([Type.Literal('local'), Type.Literal('kms')], {
      description:
        "Custody backend for the delegate signing key: 'local' (encrypted keystore) or 'kms' (cloud KMS/HSM, no raw key on host). Defaults to 'local'.",
      default: 'local',
    }),
  ),
  passphrase: Type.String({
    description: 'Gateway passphrase (required for security)',
  }),
  setDefault: Type.Optional(
    Type.Boolean({
      description: 'Set this wallet as the default for Solana',
      default: false,
    }),
  ),
});

export const AddSwigWalletResponseSchema = Type.Object({
  address: Type.String({ description: 'The Swig wallet (funds-owner) address registered' }),
  accountAddress: Type.String({ description: 'The Swig account (PDA) address' }),
  delegateAddress: Type.String({ description: 'The delegate authority Gateway signs with' }),
  warnings: Type.Array(Type.String(), { description: 'Configuration warnings detected during registration' }),
  message: Type.String({ description: 'Success message' }),
});

export type AddSwigWalletRequest = Static<typeof AddSwigWalletRequestSchema>;
export type AddSwigWalletResponse = Static<typeof AddSwigWalletResponseSchema>;

export const addSwigWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddSwigWalletRequest;
    Reply: AddSwigWalletResponse;
  }>(
    '/add-swig',
    {
      schema: {
        description: 'Register an existing Swig smart-contract wallet with Gateway for transaction signing',
        tags: ['/wallet'],
        body: AddSwigWalletRequestSchema,
        response: { 200: AddSwigWalletResponseSchema },
      },
    },
    async (request) => {
      const { network, accountAddress, ownerAddress, delegateAddress, id, passphrase, setDefault } = request.body;
      const delegateSigner = request.body.delegateSigner ?? 'local';
      const chain = 'solana';

      const configuredPassphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!configuredPassphrase) {
        throw fastify.httpErrors.internalServerError('No passphrase configured');
      }
      if (passphrase !== configuredPassphrase) {
        logger.warn('Invalid passphrase provided for add-swig request');
        throw fastify.httpErrors.unauthorized('Invalid passphrase');
      }

      // Validate the supplied addresses are real public keys before touching the chain.
      let accountPk: PublicKey;
      let ownerPk: PublicKey;
      let delegatePk: PublicKey;
      try {
        accountPk = new PublicKey(accountAddress);
        ownerPk = new PublicKey(ownerAddress);
        delegatePk = new PublicKey(delegateAddress);
      } catch {
        throw fastify.httpErrors.badRequest(
          'accountAddress, ownerAddress and delegateAddress must be valid Solana addresses',
        );
      }

      const solana = await Solana.getInstance(network);
      const swigService = getSwigService();

      // Fetch on-chain Swig state. fetchSwig throws if the account does not exist.
      let swig;
      try {
        swig = await swigService.fetchSwig(solana.connection, accountPk);
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(
          `Failed to fetch Swig account ${accountAddress} on ${network}: ${error.message}`,
        );
      }

      // The delegate role must exist, or Gateway could never sign through this wallet.
      try {
        swigService.requireRole(swig, delegatePk, 'delegate');
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(error.message);
      }

      const warnings: string[] = [];
      // The owner role should exist too (sanity check on the provided owner address).
      try {
        swigService.requireRole(swig, ownerPk, 'owner/root');
      } catch {
        warnings.push(
          `No root role found for the provided ownerAddress ${ownerAddress}; verify it matches the key that created the wallet.`,
        );
      }

      // Derive the funds-owner address from chain state (do not trust client input for it).
      const walletPk = await swigService.getWalletAddress(swig);
      const address = walletPk.toBase58();

      // For a local-keystore delegate, Gateway can only sign if the delegate key is on disk.
      // For a KMS delegate the key lives in the KMS, so no local key file is expected.
      if (delegateSigner === 'local') {
        const localAddresses = await getAllWalletAddressesForChain(chain);
        if (!localAddresses.some((a) => a.toLowerCase() === delegateAddress.toLowerCase())) {
          warnings.push(
            `Delegate ${delegateAddress} is not a local Gateway wallet. Add it with POST /wallet/add so Gateway can sign Swig transactions.`,
          );
        }
      }

      const existing = await getSwigWallets(chain);
      if (existing.some((w) => w.address.toLowerCase() === address.toLowerCase())) {
        throw fastify.httpErrors.badRequest(`Swig wallet already registered: ${address}`);
      }

      existing.push({
        address,
        accountAddress,
        ownerAddress,
        delegateAddress,
        delegateSigner,
        id,
        addedAt: new Date().toISOString(),
      });
      await saveSwigWallets(chain, existing);

      if (setDefault) {
        updateDefaultWallet(fastify, chain, address);
      }

      warnings.forEach((w) => logger.warn(`Swig wallet ${address}: ${w}`));
      logger.info(`Registered Swig wallet ${address} (account ${accountAddress}, delegate ${delegateAddress})`);

      return {
        address,
        accountAddress,
        delegateAddress,
        warnings,
        message: 'Swig wallet registered successfully',
      };
    },
  );
};

export default addSwigWalletRoute;
