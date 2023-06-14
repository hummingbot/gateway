import ethers, { constants, Wallet, utils, BigNumber } from 'ethers';
import { latency, bigNumberWithDecimalToStr } from '../../services/base';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { tokenValueToString } from '../../services/base';
import { getConnector } from '../../services/connection-manager';

import {
  UniswapLPish,
  Uniswapish,
  CLOBish,
  Celoish,
  CustomTransaction,
  CustomTransactionResponse,
  CustomTransactionReceipt,
} from '../../services/common-interfaces';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  CancelRequest,
  CancelResponse,
} from '../../evm/evm.requests';
import {
  PollRequest,
  PollResponse,
  BalanceRequest,
  BalanceResponse,
} from '../../network/network.requests';
import { logger } from '../../services/logger';
import { TokenInfo } from '../ethereum/ethereum-base';
import { CeloTxReceipt } from '@celo/connect/lib/types';
export async function nonce(
  celo: Celoish,
  req: NonceRequest
): Promise<NonceResponse> {
  // get the address via the public key since we generally use the public
  // key to interact with gateway and the address is not part of the user config
  const wallet = await celo.getWallet(req.address);
  const nonce = await celo.nonceManager.getNonce(wallet.address);
  return { nonce };
}

export async function nextNonce(
  celo: Celoish,
  req: NonceRequest
): Promise<NonceResponse> {
  // get the address via the public key since we generally use the public
  // key to interact with gateway and the address is not part of the user config
  const wallet = await celo.getWallet(req.address);
  const nonce = await celo.nonceManager.getNextNonce(wallet.address);
  return { nonce };
}

export const getTokenSymbolsToTokens = (
  celo: Celoish,
  tokenSymbols: Array<string>
): Record<string, TokenInfo> => {
  const tokens: Record<string, TokenInfo> = {};

  for (let i = 0; i < tokenSymbols.length; i++) {
    const symbol = tokenSymbols[i];
    const token = celo.getTokenBySymbol(symbol);
    if (token) tokens[symbol] = token;
  }

  return tokens;
};

export async function allowances(
  celo: Celoish,
  req: AllowancesRequest
): Promise<AllowancesResponse | string> {
  const initTime = Date.now();
  const wallet = await celo.getWallet(req.address);
  const tokens = getTokenSymbolsToTokens(celo, req.tokenSymbols);
  const spender = celo.getSpender(req.spender);

  const approvals: Record<string, string> = {};
  await Promise.all(
    Object.keys(tokens).map(async (symbol) => {
      // instantiate a contract and pass in provider for read-only access
      const contract = await celo.getContract(tokens[symbol].address);
      approvals[symbol] = tokenValueToString(
        await celo.getERC20Allowance(
          contract,
          wallet,
          spender,
          tokens[symbol].decimals
        )
      );
    })
  );

  return {
    network: celo.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    spender: spender,
    approvals: approvals,
  };
}

export async function balances(
  celo: Celoish,
  req: BalanceRequest
): Promise<BalanceResponse | string> {
  const initTime = Date.now();

  let wallet: Wallet;
  const connector: CLOBish | undefined = req.connector
    ? ((await getConnector(req.chain, req.network, req.connector)) as CLOBish)
    : undefined;
  const balances: Record<string, string> = {};
  let connectorBalances: { [key: string]: string } | undefined;

  if (!connector?.balances) {
    try {
      wallet = await celo.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    const tokens = getTokenSymbolsToTokens(celo, req.tokenSymbols);
    if (req.tokenSymbols.includes(celo.nativeTokenSymbol)) {
      balances[celo.nativeTokenSymbol] = tokenValueToString(
        await celo.getNativeBalance(wallet)
      );
    }
    await Promise.all(
      Object.keys(tokens).map(async (symbol) => {
        if (tokens[symbol] !== undefined) {
          const address = tokens[symbol].address;
          const decimals = tokens[symbol].decimals;
          // instantiate a contract and pass in provider for read-only access
          const contract = await celo.getContract(address);
          const balance = await celo.getERC20Balance(
            contract,
            wallet,
            decimals
          );
          balances[symbol] = tokenValueToString(balance);
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
  } else {
    // CLOB connector or any other connector that has the concept of separation of account has to implement a balance function
    connectorBalances = await connector.balances(req);
  }

  return {
    network: celo.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    balances: connectorBalances || balances,
  };
}

const toEthereumTransaction = (
  transaction: CeloTxReceipt
): CustomTransaction => {
  let gasPrice = transaction.gatewayFee?.toString();
  if (gasPrice == undefined) {
    gasPrice = '0';
  }
  const hash = transaction.transactionHash;
  return {
    chainId: 42220,
    data: transaction.logs.toString(),
    gasLimit: transaction.gasUsed.toString(),
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: '0',
    nonce: 0,
    value: '',
    hash: hash,
    gasPrice: BigNumber.from(gasPrice),
  };
};

export async function approve(
  celo: Celoish,
  req: ApproveRequest
): Promise<ApproveResponse | string> {
  const { amount, address, token } = req;

  const spender = celo.getSpender(req.spender);
  const initTime = Date.now();
  let wallet: Wallet;
  try {
    wallet = await celo.getWallet(address);
  } catch (err) {
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }
  let approval;
  let tokenAddress: string;
  let decimals;
  let amountBigNumber;
  const celoToken = await celo.getCeloTokenWrapper(token);
  if (celoToken) {
    decimals = await celoToken.decimals();
    amountBigNumber = amount
      ? utils.parseUnits(amount, decimals)
      : constants.MaxUint256;

    approval = await celo.approveCelo(celoToken, spender, amountBigNumber);
    tokenAddress = celoToken.address;
  } else {
    const fullToken = celo.getTokenBySymbol(token);
    if (!fullToken) {
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + token,
        TOKEN_NOT_SUPPORTED_ERROR_CODE
      );
    }
    decimals = fullToken.decimals;
    amountBigNumber = amount
      ? utils.parseUnits(amount, decimals)
      : constants.MaxUint256;
    const contract = await celo.getContract(fullToken.address);

    approval = await celo.approveERC20(
      contract,
      wallet,
      spender,
      amountBigNumber
    );
    tokenAddress = fullToken.address;
  }

  const hash = await approval.getHash();
  if (hash) {
    await celo.txStorage.saveTx(
      celo.chain,
      celo.chainId,
      hash,
      new Date(),
      celo.gasPrice
    );
  }

  const result = await approval.waitReceipt();

  return {
    network: celo.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    tokenAddress: tokenAddress,
    spender: spender,
    amount: bigNumberWithDecimalToStr(amountBigNumber, decimals),
    nonce: result.blockNumber,
    approval: toEthereumTransaction(result),
  };
}

// TransactionReceipt from ethers uses BigNumber which is not easy to interpret directly from JSON.
// Transform those BigNumbers to string and pass the rest of the data without changes.

const toEthereumTransactionReceipt = (
  receipt: ethers.providers.TransactionReceipt | null
): CustomTransactionReceipt | null => {
  if (receipt) {
    let effectiveGasPrice = null;
    if (receipt.effectiveGasPrice) {
      effectiveGasPrice = receipt.effectiveGasPrice.toString();
    }
    return {
      ...receipt,
      gasUsed: receipt.gasUsed.toString(),
      cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      effectiveGasPrice,
    };
  }

  return null;
};

const toEthereumTransactionResponse = (
  response: ethers.providers.TransactionResponse | null
): CustomTransactionResponse | null => {
  if (response) {
    let gasPrice = null;
    if (response.gasPrice) {
      gasPrice = response.gasPrice.toString();
    }
    return {
      ...response,
      gasPrice,
      gasLimit: response.gasLimit.toString(),
      value: response.value.toString(),
    };
  }

  return null;
};

export function willTxSucceed(
  txDuration: number,
  txDurationLimit: number,
  txGasPrice: number,
  currentGasPrice: number
): boolean {
  if (txDuration > txDurationLimit && currentGasPrice > txGasPrice) {
    return false;
  }
  return true;
}

// txStatus
// -1: not in the mempool or failed
// 1: succeeded
// 2: in the mempool and likely to succeed
// 3: in the mempool and likely to fail
// 0: in the mempool but we dont have data to guess its status
export async function poll(
  celo: Celoish,
  req: PollRequest
): Promise<PollResponse> {
  const initTime = Date.now();
  const currentBlock = await celo.getCurrentBlockNumber();
  const txData = await celo.getTransaction(req.txHash);
  let txBlock, txReceipt, txStatus;
  if (!txData) {
    // tx not found, didn't reach the mempool or it never existed
    txBlock = -1;
    txReceipt = null;
    txStatus = -1;
  } else {
    txReceipt = await celo.getTransactionReceipt(req.txHash);
    if (txReceipt === null) {
      // tx is in the mempool
      txBlock = -1;
      txReceipt = null;
      txStatus = 0;

      const transactions = await celo.txStorage.getTxs(
        celo.chain,
        celo.chainId
      );

      if (transactions[txData.hash]) {
        const data: [Date, number] = transactions[txData.hash];
        const now = new Date();
        const txDuration = Math.abs(now.getTime() - data[0].getTime());
        if (willTxSucceed(txDuration, 60000 * 3, data[1], celo.gasPrice)) {
          txStatus = 2;
        } else {
          txStatus = 3;
        }
      }
    } else {
      // tx has been processed
      txBlock = txReceipt.blockNumber;
      txStatus = typeof txReceipt.status === 'number' ? 1 : -1;

      // decode logs
      if (req.connector) {
        try {
          const connector: Uniswapish | UniswapLPish | CLOBish =
            await getConnector<Uniswapish | UniswapLPish | CLOBish>(
              req.chain,
              req.network,
              req.connector
            );

          txReceipt.logs = connector.abiDecoder?.decodeLogs(txReceipt.logs);
        } catch (e) {
          logger.error(e);
        }
      }
    }
  }

  logger.info(`Poll ${celo.chain}, txHash ${req.txHash}, status ${txStatus}.`);
  return {
    network: celo.chain,
    currentBlock,
    timestamp: initTime,
    txHash: req.txHash,
    txBlock,
    txStatus,
    txData: toEthereumTransactionResponse(txData),
    txReceipt: toEthereumTransactionReceipt(txReceipt),
  };
}

export async function cancel(
  celo: Celoish,
  req: CancelRequest
): Promise<CancelResponse> {
  const initTime = Date.now();
  let wallet: Wallet;
  try {
    wallet = await celo.getWallet(req.address);
  } catch (err) {
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }

  // call cancelTx function
  const cancelTx = await celo.cancelTx(wallet, req.nonce);

  logger.info(
    `Cancelled transaction at nonce ${req.nonce}, cancel txHash ${cancelTx.hash}.`
  );

  return {
    network: celo.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    txHash: cancelTx.hash,
  };
}
