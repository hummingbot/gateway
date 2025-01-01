import ethers, {
  constants,
  Wallet,
  utils,
  BigNumber,
  Transaction,
} from 'ethers';
import { bigNumberWithDecimalToStr } from '../../services/base';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { tokenValueToString } from '../../services/base';
import { TokenInfo } from './ethereum-base';
import { getConnector } from '../../services/connection-manager';

import {
  CustomTransactionReceipt,
  CustomTransactionResponse,
  PollRequest,
} from './ethereum.requests';
import {
  Chain as Ethereumish,
  Uniswapish,
} from '../../services/common-interfaces';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  ApproveRequest,
  CancelRequest,
} from '../chain.requests';
import { BalanceRequest, TokensRequest } from '../../network/network.requests';
import { logger } from '../../services/logger';
import {
  validateAllowancesRequest,
  validateApproveRequest,
  validateBalanceRequest,
  validateCancelRequest,
  validateNonceRequest,
} from './ethereum.validators';
import { validatePollRequest, validateTokensRequest } from '../chain.routes';

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

const toEthereumTransaction = (transaction: Transaction) => {
  let maxFeePerGas = null;
  if (transaction.maxFeePerGas) {
    maxFeePerGas = transaction.maxFeePerGas.toString();
  }
  let maxPriorityFeePerGas = null;
  if (transaction.maxPriorityFeePerGas) {
    maxPriorityFeePerGas = transaction.maxPriorityFeePerGas.toString();
  }
  let gasLimit = null;
  if (transaction.gasLimit) {
    gasLimit = transaction.gasLimit.toString();
  }
  return {
    ...transaction,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    value: transaction.value.toString(),
  };
};

export const willTxSucceed = (
  txDuration: number,
  txDurationLimit: number,
  txGasPrice: number,
  currentGasPrice: number
) => {
  if (txDuration > txDurationLimit && currentGasPrice > txGasPrice) {
    return false;
  }
  return true;
};

export class EVMController {
  // txStatus
  // -1: not in the mempool or failed
  // 1: succeeded
  // 2: in the mempool and likely to succeed
  // 3: in the mempool and likely to fail
  // 0: in the mempool but we dont have data to guess its status
  static async poll(ethereumish: Ethereumish, req: PollRequest) {
    validatePollRequest(req);

    const currentBlock = await ethereumish.getCurrentBlockNumber();
    let txData = await ethereumish.getTransaction(req.txHash);
    let txBlock, txReceipt, txStatus;
    if (!txData) {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        txData = await ethereumish.getTransaction(req.txHash);
        if (txData) break;
        retryCount++;
      }

      if (!txData) {
        // tx not found after retries
        logger.info(`Transaction ${req.txHash} not found in mempool or does not exist after ${MAX_RETRIES} retries.`);
        txBlock = -1;
        txReceipt = null;
        txStatus = -1;
      }
    }

    if (txData) {
      txReceipt = await ethereumish.getTransactionReceipt(req.txHash);
      if (txReceipt === null) {
        // tx is in the mempool
        txBlock = -1;
        txReceipt = null;
        txStatus = 0;

        const transactions = await ethereumish.txStorage.getTxs(
          ethereumish.chain,
          ethereumish.chainId
        );

        if (transactions[txData.hash]) {
          const data: [Date, number] = transactions[txData.hash];
          const now = new Date();
          const txDuration = Math.abs(now.getTime() - data[0].getTime());
          if (
            willTxSucceed(txDuration, 60000 * 3, data[1], ethereumish.gasPrice)
          ) {
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
            const connector: Uniswapish =
              await getConnector<Uniswapish>(
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

    logger.info(
      `Poll ${ethereumish.chain}, txHash ${req.txHash}, status ${txStatus}.`
    );
    return {
      currentBlock,
      txHash: req.txHash,
      txBlock,
      txStatus,
      txData: toEthereumTransactionResponse(txData),
      txReceipt: toEthereumTransactionReceipt(txReceipt || null),
    };
  }

  static async nonce(
    ethereum: Ethereumish,
    req: NonceRequest
  ): Promise<NonceResponse> {
    validateNonceRequest(req);
    // get the address via the public key since we generally use the public
    // key to interact with gateway and the address is not part of the user config
    const wallet = await ethereum.getWallet(req.address);
    const nonce = await ethereum.nonceManager.getNonce(wallet.address);
    return { nonce };
  }

  static async nextNonce(
    ethereum: Ethereumish,
    req: NonceRequest
  ): Promise<NonceResponse> {
    validateNonceRequest(req);
    // get the address via the public key since we generally use the public
    // key to interact with gateway and the address is not part of the user config
    const wallet = await ethereum.getWallet(req.address);
    const nonce = await ethereum.nonceManager.getNextNonce(wallet.address);
    return { nonce };
  }

  static getTokenSymbolsToTokens = (
    ethereum: Ethereumish,
    tokenSymbols: Array<string>
  ): Record<string, TokenInfo> => {
    const tokens: Record<string, TokenInfo> = {};

    for (let i = 0; i < tokenSymbols.length; i++) {
      const symbol = tokenSymbols[i];
      const token = ethereum.getTokenBySymbol(symbol);
      if (token) tokens[symbol] = token;
    }

    return tokens;
  };

  static async getTokens(connection: Ethereumish, req: TokensRequest) {
    validateTokensRequest(req);
    let tokens: TokenInfo[] = [];
    if (!req.tokenSymbols) {
      tokens = connection.storedTokenList;
    } else {
      for (const t of req.tokenSymbols as []) {
        tokens.push(connection.getTokenForSymbol(t) as TokenInfo);
      }
    }

    return { tokens };
  }

  static async allowances(ethereumish: Ethereumish, req: AllowancesRequest) {
    validateAllowancesRequest(req);
    return EVMController.allowancesWithoutValidation(ethereumish, req);
  }

  static async allowancesWithoutValidation(
    ethereumish: Ethereumish,
    req: AllowancesRequest
  ) {
    const wallet = await ethereumish.getWallet(req.address);
    const tokens = EVMController.getTokenSymbolsToTokens(
      ethereumish,
      req.tokenSymbols
    );
    const spender = ethereumish.getSpender(req.spender);

    const approvals: Record<string, string> = {};
    await Promise.all(
      Object.keys(tokens).map(async (symbol) => {
        // instantiate a contract and pass in provider for read-only access
        const contract = ethereumish.getContract(
          tokens[symbol].address,
          ethereumish.provider
        );
        approvals[symbol] = tokenValueToString(
          await ethereumish.getERC20Allowance(
            contract,
            wallet,
            spender,
            tokens[symbol].decimals
          )
        );
      })
    );

    return {
      spender: spender,
      approvals: approvals,
    };
  }

  static async balances(ethereumish: Ethereumish, req: BalanceRequest) {
    validateBalanceRequest(req);

    let wallet: Wallet;
    const connector: Uniswapish | undefined = req.connector
      ? ((await getConnector(req.chain, req.network, req.connector)) as Uniswapish)
      : undefined;
    const balances: Record<string, string> = {};
    let connectorBalances: { [key: string]: string } | undefined;

    if (!connector?.balances) {
      try {
        wallet = await ethereumish.getWallet(req.address);
      } catch (err) {
        throw new HttpException(
          500,
          LOAD_WALLET_ERROR_MESSAGE + err,
          LOAD_WALLET_ERROR_CODE
        );
      }

      const tokens = EVMController.getTokenSymbolsToTokens(
        ethereumish,
        req.tokenSymbols
      );
      if (req.tokenSymbols.includes(ethereumish.nativeTokenSymbol)) {
        balances[ethereumish.nativeTokenSymbol] = tokenValueToString(
          await ethereumish.getNativeBalance(wallet)
        );
      }
      await Promise.all(
        Object.keys(tokens).map(async (symbol) => {
          if (tokens[symbol] !== undefined) {
            const address = tokens[symbol].address;
            const decimals = tokens[symbol].decimals;
            // instantiate a contract and pass in provider for read-only access
            const contract = ethereumish.getContract(
              address,
              ethereumish.provider
            );
            const balance = await ethereumish.getERC20Balance(
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
      connectorBalances = await connector.balances(req);
    }

    return {
      balances: connectorBalances || balances,
    };
  }

  static async approve(ethereumish: Ethereumish, req: ApproveRequest) {
    validateApproveRequest(req);
    return await EVMController.approveWithoutValidation(ethereumish, req);
  }

  static async approveWithoutValidation(
    ethereumish: Ethereumish,
    req: ApproveRequest
  ) {
    const {
      amount,
      nonce,
      address,
      token,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = req;

    const spender = ethereumish.getSpender(req.spender);
    let wallet: Wallet;
    try {
      wallet = await ethereumish.getWallet(address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }
    const fullToken = ethereumish.getTokenBySymbol(token);
    if (!fullToken) {
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + token,
        TOKEN_NOT_SUPPORTED_ERROR_CODE
      );
    }
    const amountBigNumber = amount
      ? utils.parseUnits(amount, fullToken.decimals)
      : constants.MaxUint256;

    let maxFeePerGasBigNumber;
    if (maxFeePerGas) {
      maxFeePerGasBigNumber = BigNumber.from(maxFeePerGas);
    }
    let maxPriorityFeePerGasBigNumber;
    if (maxPriorityFeePerGas) {
      maxPriorityFeePerGasBigNumber = BigNumber.from(maxPriorityFeePerGas);
    }
    // instantiate a contract and pass in wallet, which act on behalf of that signer
    const contract = ethereumish.getContract(fullToken.address, wallet);

    // convert strings to BigNumber
    // call approve function
    const approval = await ethereumish.approveERC20(
      contract,
      wallet,
      spender,
      amountBigNumber,
      nonce,
      maxFeePerGasBigNumber,
      maxPriorityFeePerGasBigNumber,
      ethereumish.gasPrice
    );

    if (approval.hash) {
      await ethereumish.txStorage.saveTx(
        ethereumish.chain,
        ethereumish.chainId,
        approval.hash,
        new Date(),
        ethereumish.gasPrice
      );
    }

    return {
      tokenAddress: fullToken.address,
      spender: spender,
      amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
      nonce: approval.nonce,
      approval: toEthereumTransaction(approval),
    };
  }

  static async cancel(ethereumish: Ethereumish, req: CancelRequest) {
    validateCancelRequest(req);
    let wallet: Wallet;
    try {
      wallet = await ethereumish.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    // call cancelTx function
    const cancelTx = await ethereumish.cancelTx(wallet, req.nonce);

    logger.info(
      `Cancelled transaction at nonce ${req.nonce}, cancel txHash ${cancelTx.hash}.`
    );

    return {
      txHash: cancelTx.hash,
    };
  }
}
