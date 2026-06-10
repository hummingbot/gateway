/**
 * Create Privy Policy Route
 * Creates a signing policy in Privy (allowlist of destination addresses on Ethereum,
 * or program IDs on Solana) and optionally attaches it to a Privy wallet.
 */

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { getPrivyService, PrivyPolicyRule } from '../privy/privy-service';

// Request schema
export const CreatePrivyPolicyRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain the policy applies to',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  name: Type.String({
    description: 'Name to assign to the policy in Privy',
    examples: ['Gateway allowlist'],
  }),
  allowedAddresses: Type.Array(Type.String(), {
    description:
      'Allowlisted values: destination (to) addresses for Ethereum, program IDs for Solana. All other transactions are denied.',
    minItems: 1,
    examples: [['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8']],
  }),
  attachToWalletId: Type.Optional(
    Type.String({
      description: 'Privy wallet ID to attach the new policy to',
      examples: ['wallet_abc123'],
    }),
  ),
});

// Response schema
export const CreatePrivyPolicyResponseSchema = Type.Object({
  policyId: Type.String({
    description: 'ID of the created policy in Privy',
  }),
  name: Type.String({
    description: 'Policy name',
  }),
  chain: Type.String({
    description: 'Blockchain the policy applies to',
  }),
  ownerId: Type.Optional(
    Type.String({
      description: 'Key quorum ID owning the policy (set when an authorization key is configured)',
    }),
  ),
  attachedToWalletId: Type.Optional(
    Type.String({
      description: 'Privy wallet ID the policy was attached to',
    }),
  ),
  warnings: Type.Array(Type.String(), {
    description: 'Configuration warnings detected during policy creation',
  }),
});

export type CreatePrivyPolicyRequest = Static<typeof CreatePrivyPolicyRequestSchema>;
export type CreatePrivyPolicyResponse = Static<typeof CreatePrivyPolicyResponseSchema>;

/**
 * Build the Privy policy rules for a chain: one ALLOW rule restricted to the allowlist,
 * plus a catch-all DENY so no other method can sign.
 */
function buildPolicyRules(chain: string, allowedAddresses: string[]): PrivyPolicyRule[] {
  const allowRule: PrivyPolicyRule =
    chain === 'ethereum'
      ? {
          name: 'Allow transactions to allowlisted addresses',
          method: 'eth_signTransaction',
          action: 'ALLOW',
          conditions: [
            {
              field_source: 'ethereum_transaction',
              field: 'to',
              operator: 'in',
              value: allowedAddresses,
            },
          ],
        }
      : {
          name: 'Allow transactions with allowlisted programs',
          method: 'signTransaction',
          action: 'ALLOW',
          conditions: [
            {
              field_source: 'solana_program_instruction',
              field: 'programId',
              operator: 'in',
              value: allowedAddresses,
            },
          ],
        };

  return [
    allowRule,
    {
      name: 'Deny everything else',
      method: '*',
      action: 'DENY',
      conditions: [],
    },
  ];
}

export const createPrivyPolicyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: CreatePrivyPolicyRequest;
    Reply: CreatePrivyPolicyResponse;
  }>(
    '/privy-policy',
    {
      schema: {
        description:
          'Create a Privy signing policy that only allows transactions to allowlisted addresses (Ethereum) or programs (Solana), and optionally attach it to a Privy wallet',
        tags: ['/wallet'],
        body: {
          ...CreatePrivyPolicyRequestSchema,
          examples: [
            {
              chain: 'solana',
              name: 'Gateway allowlist',
              allowedAddresses: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'],
              attachToWalletId: 'wallet_abc123',
            },
          ],
        },
        response: {
          200: CreatePrivyPolicyResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, name, allowedAddresses, attachToWalletId } = request.body;

      const privyService = getPrivyService();
      if (!privyService.isConfigured()) {
        throw fastify.httpErrors.badRequest(
          'Privy credentials not configured. Set apiKeys.privyAppId and apiKeys.privyAppSecret in conf/apiKeys.yml',
        );
      }

      const warnings: string[] = [];
      if (!privyService.hasAuthorizationKey()) {
        warnings.push(
          'No authorization key is configured (apiKeys.privyAuthorizationKey): the policy has no owner, so anyone holding the app secret can change or remove it.',
        );
      }

      const rules = buildPolicyRules(chain, allowedAddresses);

      let policy;
      try {
        policy = await privyService.createPolicy({
          chainType: chain as 'ethereum' | 'solana',
          name,
          rules,
        });
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(`Failed to create Privy policy: ${error.message}`);
      }

      let attachedToWalletId: string | undefined;
      if (attachToWalletId) {
        try {
          await privyService.attachPolicyToWallet(attachToWalletId, policy.id);
          attachedToWalletId = attachToWalletId;
        } catch (error: any) {
          throw fastify.httpErrors.badRequest(
            `Policy ${policy.id} was created but could not be attached to wallet ${attachToWalletId}: ${error.message}`,
          );
        }
      }

      warnings.forEach((warning) => logger.warn(`Privy policy ${policy.id}: ${warning}`));
      logger.info(
        `Created Privy policy ${policy.id} (${chain}) with ${allowedAddresses.length} allowlisted ${
          chain === 'solana' ? 'programs' : 'addresses'
        }${attachedToWalletId ? `, attached to wallet ${attachedToWalletId}` : ''}`,
      );

      return {
        policyId: policy.id,
        name: policy.name,
        chain,
        ...(policy.ownerId ? { ownerId: policy.ownerId } : {}),
        ...(attachedToWalletId ? { attachedToWalletId } : {}),
        warnings,
      };
    },
  );
};

export default createPrivyPolicyRoute;
