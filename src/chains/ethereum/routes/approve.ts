import { ethers, constants, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender as pancakeswapSpender } from '../../../connectors/pancakeswap/pancakeswap.contracts';
import { getSpender as uniswapSpender } from '../../../connectors/uniswap/uniswap.contracts';
import { EvmBuildTransactionResponse, EvmBuildTransactionResponseType } from '../../../schemas/build-schema';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { captureEvmTransaction, EvmCall, getEvmBuildContext, rethrowIfCaptured } from '../evm-build-mode';
import { ERC20_APPROVE_ABI, MAX_UINT160, MAX_UINT48, PERMIT2_ABI, PERMIT2_ADDRESS } from '../permit2';
import { ApproveRequestSchema, ApproveResponseSchema, ApproveRequestType, ApproveResponseType } from '../schemas';

// Default gas limit for approve operations
const APPROVE_GAS_LIMIT = 100000;

export async function approveEthereumToken(
  fastify: FastifyInstance,
  network: string,
  address: string,
  spender: string,
  token: string,
  amount?: string,
) {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  // Track if this is a Universal Router approval that needs Permit2
  let isUniversalRouter = false;
  let universalRouterAddress: string | null = null;

  // Determine the spender address based on the input
  let spenderAddress: string;
  try {
    // Check if the spender parameter is a connector name
    if (spender.includes('/') || spender === 'uniswap') {
      // Special case: Universal Router V2 uses Permit2 for approvals
      if (spender === 'uniswap/router') {
        logger.info(`Universal Router V2 approval requested - will handle Permit2 flow`);
        isUniversalRouter = true;
        // First approve to Permit2
        spenderAddress = PERMIT2_ADDRESS;
        // Get the actual Universal Router address for the second step
        universalRouterAddress = uniswapSpender(network, spender);
        logger.info(
          `Will approve token to Permit2, then grant Universal Router (${universalRouterAddress}) permission via Permit2`,
        );
      } else {
        logger.info(`Looking up spender address for connector: ${spender}`);
        spenderAddress = uniswapSpender(network, spender);
        if (spender.startsWith('pancakeswap')) spenderAddress = pancakeswapSpender(network, spender);
        logger.info(`Resolved connector ${spender} to spender address: ${spenderAddress}`);
      }
    } else {
      // Otherwise assume it's a direct address
      spenderAddress = spender;
    }
  } catch (error) {
    logger.error(`Failed to resolve spender address: ${error.message}`);
    throw fastify.httpErrors.badRequest(`Invalid spender: ${error.message}`);
  }

  // Try to find the token by symbol or address
  const fullToken = await ethereum.getToken(token);
  if (!fullToken) {
    throw fastify.httpErrors.badRequest(`Token not found in token list: ${token}`);
  }

  // Handle empty string, whitespace, undefined, or null as max approval
  const amountBigNumber =
    amount && amount.trim() !== '' ? utils.parseUnits(amount, fullToken.decimals) : constants.MaxUint256;

  if (amountBigNumber.eq(constants.MaxUint256)) {
    logger.info(`Approving maximum amount (MaxUint256) for ${fullToken.symbol}`);
  } else {
    logger.info(`Approving ${amount} ${fullToken.symbol} (${amountBigNumber.toString()} in wei)`);
  }

  // The ERC-20 approval, to the spender (or to Permit2 for the Universal Router).
  const erc20Call: EvmCall = {
    to: fullToken.address,
    data: new utils.Interface(ERC20_APPROVE_ABI).encodeFunctionData('approve', [spenderAddress, amountBigNumber]),
    gasLimit: APPROVE_GAS_LIMIT,
    description: `${fullToken.symbol} approve for ${spenderAddress}`,
  };
  const calls: EvmCall[] = [erc20Call];

  if (isUniversalRouter && universalRouterAddress) {
    // A Universal Router approval is two transactions: token -> Permit2, then Permit2 -> router.
    // Either one the wallet already has is skipped.
    const tokenContract = ethereum.getContract(fullToken.address);
    const erc20Allowance = await tokenContract.allowance(address, PERMIT2_ADDRESS);
    const needErc20 = erc20Allowance.lt(amountBigNumber);

    const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, ethereum.provider);
    const allowanceData = await permit2Contract.allowance(address, fullToken.address, universalRouterAddress);
    const needPermit2 =
      allowanceData.amount.lt(amountBigNumber) || Number(allowanceData.expiration) <= Math.floor(Date.now() / 1000);
    logger.info(
      `Universal Router approval of ${fullToken.symbol}: token->Permit2 ${needErc20 ? 'needed' : 'present'}, ` +
        `Permit2->router ${needPermit2 ? 'needed' : 'present'}`,
    );

    if (!needErc20 && !needPermit2) {
      if (getEvmBuildContext()) {
        throw fastify.httpErrors.badRequest(
          `${fullToken.symbol} is already approved for the Universal Router (${universalRouterAddress}); there is nothing to sign.`,
        );
      }
      return {
        signature: '0x0000000000000000000000000000000000000000000000000000000000000000',
        status: TransactionStatus.CONFIRMED,
        data: {
          tokenAddress: fullToken.address,
          spender: universalRouterAddress,
          amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
          nonce: 0,
          fee: '0',
        },
      };
    }

    calls.length = 0;
    const maxUint160 = ethers.BigNumber.from(MAX_UINT160);
    const permit2Amount = amountBigNumber.gt(maxUint160) ? maxUint160 : amountBigNumber;
    const permit2Call: EvmCall = {
      to: PERMIT2_ADDRESS,
      data: new utils.Interface(PERMIT2_ABI).encodeFunctionData('approve', [
        fullToken.address,
        universalRouterAddress,
        permit2Amount,
        MAX_UINT48,
      ]),
      gasLimit: APPROVE_GAS_LIMIT,
      description: `Permit2 approve of ${fullToken.symbol} for ${universalRouterAddress}`,
    };

    if (needErc20 && needPermit2 && getEvmBuildContext()) {
      // Build returns one operation plus the approvals to send before it: the token ->
      // Permit2 approval is recorded as that prerequisite, the Permit2 approval is the operation.
      await ethereum.requireAllowance(address, fullToken, PERMIT2_ADDRESS, amountBigNumber, spender);
      calls.push(permit2Call);
    } else {
      if (needErc20) calls.push(erc20Call);
      if (needPermit2) calls.push(permit2Call);
    }
  }

  try {
    let last: { signature: string; nonce: number } | undefined;
    let feeInWei = ethers.BigNumber.from(0);
    for (const call of calls) {
      const tx = await ethereum.sendTransactionForWallet(address, call);
      // A revert throws 400 TRANSACTION_FAILED out of the helper; only a still-pending
      // transaction comes back unconfirmed, and an approval cannot be reported without a
      // confirmed allowance.
      const outcome = await ethereum.handleTransactionConfirmation(tx);
      if (!outcome.confirmed) {
        throw new Error(`${call.description} transaction ${outcome.signature} timed out before confirming`);
      }
      feeInWei = feeInWei.add(outcome.receipt.gasUsed.mul(outcome.receipt.effectiveGasPrice));
      last = { signature: outcome.signature, nonce: tx.nonce };
    }

    return {
      signature: last!.signature,
      status: TransactionStatus.CONFIRMED,
      data: {
        tokenAddress: fullToken.address,
        spender: isUniversalRouter ? universalRouterAddress || spenderAddress : spenderAddress,
        amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
        nonce: last!.nonce,
        fee: utils.formatEther(feeInWei),
      },
    };
  } catch (error) {
    rethrowIfCaptured(error);
    if (error.statusCode) throw error;
    logger.error(`Error approving token: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to approve token: ${error.message}`);
  }
}

export const approveRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ApproveRequestType;
    Reply: ApproveResponseType;
  }>(
    '/approve',
    {
      schema: {
        description: 'Approve token spending',
        tags: ['/chains'],
        body: ApproveRequestSchema,
        response: {
          200: ApproveResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, spender, token, amount } = request.body;

      return await approveEthereumToken(fastify, network, address, spender, token, amount);
    },
  );

  fastify.post<{
    Body: ApproveRequestType;
    Reply: EvmBuildTransactionResponseType;
  }>(
    '/build-approve',
    {
      schema: {
        description:
          'Build the unsigned approval /approve would sign and send, for the caller to sign with its own wallet ' +
          'and broadcast via /chains/ethereum/submit. A Universal Router approval ("uniswap/router") that needs ' +
          'both steps returns the token -> Permit2 approval in approvals and the Permit2 -> router approval as ' +
          'unsignedTransaction.',
        tags: ['/chains'],
        body: ApproveRequestSchema,
        response: {
          200: EvmBuildTransactionResponse,
        },
      },
    },
    async (request) => {
      const { network, address, spender, token, amount } = request.body;
      return await captureEvmTransaction(() => approveEthereumToken(fastify, network, address, spender, token, amount));
    },
  );
};

export default approveRoute;
