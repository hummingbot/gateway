import { BigNumber } from 'bignumber.js';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from './tezos.base';
import { TransactionOperation, TezosToolkit } from '@taquito/taquito';
import { OperationContentsAndResultTransaction } from '@taquito/rpc';
import {
  latency,
  tokenValueToString,
} from '../../services/base';
import {
  BalanceRequest,
  BalanceResponse,
  PollRequest,
  PollResponse,
  ApproveRequest,
  ApproveResponse,
} from './tezos.request';

import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  AllowancesResponse,
} from '../../evm/evm.requests';
import { Tezosish, CustomTransaction } from '../../services/common-interfaces';
import { isAddress } from './tezos.validators';

export const getTokenSymbolsToTokens = (
  tezos: Tezosish,
  tokenSymbols: Array<string>
): Record<string, TokenInfo> => {
  const tokens: Record<string, TokenInfo> = {};

  for (let i = 0; i < tokenSymbols.length; i++) {
    const symbol = tokenSymbols[i];
    const token = tezos.getTokenForSymbol(symbol);
    if (token) tokens[symbol] = token;
  }

  return tokens;
};

export async function nonce(
  tezos: Tezosish,
  req: NonceRequest
): Promise<NonceResponse> {
  const nonce = await tezos.getNonce(req.address);
  return { nonce };
}

export async function balances(
  tezos: Tezosish,
  req: BalanceRequest
): Promise<BalanceResponse | string> {
  const initTime = Date.now();

  const tokens = getTokenSymbolsToTokens(tezos, req.tokenSymbols);
  const balances: Record<string, string> = {};
  if (req.tokenSymbols.includes(tezos.nativeTokenSymbol)) {
    balances[tezos.nativeTokenSymbol] = tokenValueToString(
      await tezos.getNativeBalance(req.address)
    );
  }
  await Promise.all(
    Object.keys(tokens).map(async (symbol) => {
      if (tokens[symbol] !== undefined && symbol !== tezos.nativeTokenSymbol) {
        const contractAddress = tokens[symbol].address;
        const tokenId = tokens[symbol].tokenId;
        const decimals = tokens[symbol].decimals;
        if (tokenId !== undefined) {
          const balance = await tezos.getTokenBalance(
            contractAddress,
            req.address,
            tokenId,
            decimals
          );
          balances[symbol] = tokenValueToString(balance);
        }
      }
    })
  );

  if (!Object.keys(balances).length) {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }

  return {
    network: tezos.chainName,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    balances: balances,
  };
}

// txStatus
// -1: not in the mempool or failed
// 1: applied
// 2: branch_delayed
// 3: branch_refused or refused
// 0: unprocessed
export async function poll(
  tezosish: Tezosish,
  req: PollRequest
): Promise<PollResponse> {
  const initTime = Date.now();

  let txStatus = -1;
  let txData = null;
  let txReceipt = null;
  const pendingTxs = await tezosish.getPendingTransactions();
  const appliedTx = pendingTxs.applied.find((tx) => tx.hash === req.txHash);
  if (appliedTx) {
    txStatus = 1;
    txData = appliedTx.contents;
    const tx = await tezosish.getTransaction(req.txHash);
    txReceipt = {
      status: txStatus,
      gasUsed: tx.reduce((acc, tx) => acc + tx.gasUsed, 0),
    };
  } else if (pendingTxs.branch_delayed.find((tx) => tx.hash === req.txHash)) {
    txStatus = 2;
  } else if (pendingTxs.branch_refused.find((tx) => tx.hash === req.txHash)) {
    txStatus = 3;
  } else if (pendingTxs.refused.find((tx) => tx.hash === req.txHash)) {
    txStatus = 3;
  } else if (pendingTxs.unprocessed.find((tx) => tx.hash === req.txHash)) {
    txStatus = 0;
  } else {
    const tx = await tezosish.getTransaction(req.txHash);
    if (tx) {
      txStatus = 1;
      txData = tx;
      txReceipt = {
        status: txStatus,
        gasUsed: tx.reduce((acc, tx) => acc + tx.gasUsed, 0),
      }
    }
  }

  const currentBlock = await tezosish.getCurrentBlockNumber();
  return {
    network: tezosish.chain,
    currentBlock,
    timestamp: initTime,
    txHash: req.txHash,
    txStatus,
    txData,
    txReceipt,
  };
}

export async function allowances(
  tezos: Tezosish,
  req: AllowancesRequest
): Promise<AllowancesResponse | string> {
  const initTime = Date.now();
  const tokens = getTokenSymbolsToTokens(tezos, req.tokenSymbols);
  const spender = req.spender;

  const approvals: Record<string, string> = {};
  await Promise.all(
    Object.keys(tokens).map(async (symbol) => {
      if (tokens[symbol].standard === 'TEZ') {
        const balance = await tezos.getNativeBalance(req.address);
        approvals[symbol] = balance.value.toString();
      } else if (tokens[symbol].standard === 'FA1.2') {
        approvals[symbol] = new BigNumber(2).pow(256).minus(1).toString();
      } else {
        approvals[symbol] = tokenValueToString(
          await tezos.getTokenAllowance(
            tokens[symbol].address,
            req.address,
            spender,
            'FA2',
            tokens[symbol].tokenId,
            tokens[symbol].decimals
          )
        );
      }
    })
  );

  if (!Object.keys(approvals).length) {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }

  return {
    network: tezos.chainName,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    spender: spender,
    approvals: approvals,
  };
}

export async function approve(
  tezos: Tezosish,
  req: ApproveRequest
): Promise<ApproveResponse | string> {
  const initTime = Date.now();
  const { amount, address, token, network } = req;

  let spender = req.spender;
  let wallet: TezosToolkit;
  try {
    wallet = await tezos.getWallet(address);
  } catch (err) {
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }
  const fullToken = tezos.getTokenForSymbol(token);
  if (!fullToken) {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + token,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }
  const amountBigNumber = amount
    ? new BigNumber(amount)
    : new BigNumber(2).pow(256).minus(1);

  // instantiate a contract and pass in wallet, which act on behalf of that signer
  const contract = await wallet.contract.at(fullToken.address);

  // convert strings to BigNumber
  // call approve function
  let approvalOperation: TransactionOperation | null = null;
  if (fullToken.standard == 'FA1.2') {
    approvalOperation = await contract.methods
      .approve(spender, amountBigNumber)
      .send();
  } else if (fullToken.standard == 'FA2') {
    approvalOperation = await contract.methods
      .update_operators([{
        add_operator: {
          owner: address,
          operator: spender,
          token_id: fullToken.tokenId,
        },
      }])
      .send();
  } else {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }

  if (
    approvalOperation !== null &&
    approvalOperation.operationResults.length > 0
  ) {
    const op = approvalOperation.operationResults[0];
    const chainId = await wallet.rpc.getChainId();
    return {
      network: tezos.chainName,
      timestamp: initTime,
      latency: latency(initTime, Date.now()),
      tokenAddress: fullToken.address,
      spender: spender,
      amount: amountBigNumber.toFixed(fullToken.decimals),
      nonce: parseInt(op.counter),
      approval: toTezosTransaction(approvalOperation.hash, op, chainId),
    };
  } else {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }
}

const toTezosTransaction = (
  hash: string,
  transaction: OperationContentsAndResultTransaction,
  chainId: string
): CustomTransaction => {
  return {
    hash,
    to: transaction.destination,
    from: transaction.source,
    nonce: parseInt(transaction.counter),
    gasLimit: String(
      parseInt(transaction.gas_limit) + parseInt(transaction.storage_limit)
    ),
    maxFeePerGas: null,
    value: transaction.amount,
    chainId: chainId,
    data: JSON.stringify(transaction.parameters),
    maxPriorityFeePerGas: null,
  };
};