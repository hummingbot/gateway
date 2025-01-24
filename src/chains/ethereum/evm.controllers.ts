import ethers, {
  constants,
  Wallet,
  utils,
  BigNumber,
  Transaction,
} from 'ethers';
import { bigNumberWithDecimalToStr, tokenValueToString } from '../../services/base';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from './ethereum-base';
import { getConnector } from '../../services/connection-manager';
import { wrapResponse } from '../../services/response-wrapper';

import {
  CustomTransactionReceipt,
  CustomTransactionResponse,
  PollRequest,
} from './ethereum.requests';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  ApproveRequest,
  CancelRequest,
  BalanceRequest,
  TokensRequest,
  StatusRequest,
  StatusResponse
} from '../../chains/chain.requests';
import { logger } from '../../services/logger';
import {
  validateAllowancesRequest,
  validateApproveRequest,
  validateBalanceRequest,
  validateCancelRequest,
  validateNonceRequest,
  validatePollRequest,
  validateTokensRequest
} from './ethereum.validators';
import { Ethereum } from './ethereum';

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
  // Helper method to ensure initialization
  private static async ensureInitialized(ethereum: Ethereum) {
    if (!ethereum.ready()) {
      await ethereum.init();
    }
  }

  // txStatus
  // -1: not in the mempool or failed
  // 1: succeeded
  // 2: in the mempool and likely to succeed
  // 3: in the mempool and likely to fail
  // 0: in the mempool but we dont have data to guess its status
  static async poll(ethereum: Ethereum, req: PollRequest) {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    validatePollRequest(req);

    const currentBlock = await ethereum.getCurrentBlockNumber();
    let txData = await ethereum.getTransaction(req.txHash);
    let txBlock, txReceipt, txStatus;
    if (!txData) {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        txData = await ethereum.getTransaction(req.txHash);
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
      txReceipt = await ethereum.getTransactionReceipt(req.txHash);
      if (txReceipt === null) {
        // tx is in the mempool
        txBlock = -1;
        txReceipt = null;
        txStatus = 0;

        const transactions = await ethereum.txStorage.getTxs(
          ethereum.chain,
          ethereum.chainId
        );

        if (transactions[txData.hash]) {
          const data: [Date, number] = transactions[txData.hash];
          const now = new Date();
          const txDuration = Math.abs(now.getTime() - data[0].getTime());
          if (
            willTxSucceed(txDuration, 60000 * 3, data[1], ethereum.gasPrice)
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
            const connector: any = await getConnector(
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
      `Poll ${ethereum.chain}, txHash ${req.txHash}, status ${txStatus}.`
    );
    return wrapResponse({
      currentBlock,
      txHash: req.txHash,
      txBlock,
      txStatus,
      txData: toEthereumTransactionResponse(txData),
      txReceipt: toEthereumTransactionReceipt(txReceipt || null),
    }, initTime);
  }

  static async nonce(
    ethereum: Ethereum,
    req: NonceRequest
  ): Promise<NonceResponse> {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    validateNonceRequest(req);
    // get the address via the public key since we generally use the public
    // key to interact with gateway and the address is not part of the user config
    const wallet = await ethereum.getWallet(req.address);
    const nonce = await ethereum.nonceManager.getNonce(wallet.address);
    return wrapResponse({ nonce }, initTime);
  }

  static async nextNonce(
    ethereum: Ethereum,
    req: NonceRequest
  ): Promise<NonceResponse> {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    validateNonceRequest(req);
    // get the address via the public key since we generally use the public
    // key to interact with gateway and the address is not part of the user config
    const wallet = await ethereum.getWallet(req.address);
    const nonce = await ethereum.nonceManager.getNextNonce(wallet.address);
    return wrapResponse({ nonce }, initTime);
  }

  static async getTokenSymbolsToTokens(
    ethereum: Ethereum,
    tokenSymbols: Array<string>
  ): Promise<Record<string, TokenInfo>> {
    await this.ensureInitialized(ethereum);
    const tokens: Record<string, TokenInfo> = {};

    for (let i = 0; i < tokenSymbols.length; i++) {
      const symbol = tokenSymbols[i];
      const token = ethereum.getTokenBySymbol(symbol);
      if (token) tokens[symbol] = token;
    }

    return tokens;
  }

  static async getTokens(connection: Ethereum, req: TokensRequest) {
    const initTime = Date.now();
    validateTokensRequest(req);
    await this.ensureInitialized(connection);
    
    let tokens: TokenInfo[] = [];
    if (!req.tokenSymbols) {
      tokens = connection.storedTokenList;
    } else {
      const symbolsArray = Array.isArray(req.tokenSymbols) 
        ? req.tokenSymbols 
        : typeof req.tokenSymbols === 'string'
          ? (req.tokenSymbols as string).replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = connection.getTokenForSymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }
    return wrapResponse({ tokens }, initTime);
  }

  static async allowances(ethereum: Ethereum, req: AllowancesRequest) {
    validateAllowancesRequest(req);
    return EVMController.allowancesWithoutValidation(ethereum, req);
  }

  static async allowancesWithoutValidation(
    ethereum: Ethereum,
    req: AllowancesRequest
  ) {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    
    const wallet = await ethereum.getWallet(req.address);
    const tokens = await this.getTokenSymbolsToTokens(
      ethereum,
      req.tokenSymbols
    );
    const spender = ethereum.getSpender(req.spender);

    const approvals: Record<string, string> = {};
    await Promise.all(
      Object.keys(tokens).map(async (symbol) => {
        const contract = ethereum.getContract(
          tokens[symbol].address,
          ethereum.provider
        );
        approvals[symbol] = tokenValueToString(
          await ethereum.getERC20Allowance(
            contract,
            wallet,
            spender,
            tokens[symbol].decimals
          )
        );
      })
    );

    return wrapResponse({
      spender: spender,
      approvals: approvals,
    }, initTime);
  }

  static async balances(ethereum: Ethereum, req: BalanceRequest) {
    const initTime = Date.now();
    validateBalanceRequest(req);

    let wallet: Wallet;
    const balances: Record<string, string> = {};

    try {
      wallet = await ethereum.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    // Get native token balance if requested
    if (req.tokenSymbols.includes(ethereum.nativeTokenSymbol)) {
      balances[ethereum.nativeTokenSymbol] = tokenValueToString(
        await ethereum.getNativeBalance(wallet)
      );
    }

    // Get ERC20 token balances
    await Promise.all(
      req.tokenSymbols.map(async (symbol) => {
        const token = ethereum.getTokenBySymbol(symbol);
        if (token) {
          const contract = ethereum.getContract(
            token.address,
            ethereum.provider
          );
          const balance = await ethereum.getERC20Balance(
            contract,
            wallet,
            token.decimals
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

    return wrapResponse({
      balances: balances,
    }, initTime);
  }

  static async approve(ethereum: Ethereum, req: ApproveRequest) {
    validateApproveRequest(req);
    return await EVMController.approveWithoutValidation(ethereum, req);
  }

  static async approveWithoutValidation(
    ethereum: Ethereum,
    req: ApproveRequest
  ) {
    await this.ensureInitialized(ethereum);
    
    const {
      amount,
      nonce,
      address,
      token,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = req;

    const spender = ethereum.getSpender(req.spender);
    let wallet: Wallet;
    try {
      wallet = await ethereum.getWallet(address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }
    const fullToken = ethereum.getTokenBySymbol(token);
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
    const contract = ethereum.getContract(fullToken.address, wallet);

    // convert strings to BigNumber
    // call approve function
    const approval = await ethereum.approveERC20(
      contract,
      wallet,
      spender,
      amountBigNumber,
      nonce,
      maxFeePerGasBigNumber,
      maxPriorityFeePerGasBigNumber,
      ethereum.gasPrice
    );

    if (approval.hash) {
      await ethereum.txStorage.saveTx(
        ethereum.chain,
        ethereum.chainId,
        approval.hash,
        new Date(),
        ethereum.gasPrice
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

  static async cancel(ethereum: Ethereum, req: CancelRequest) {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    validateCancelRequest(req);
    
    let wallet: Wallet;
    try {
      wallet = await ethereum.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    // call cancelTx function
    const cancelTx = await ethereum.cancelTx(wallet, req.nonce);

    logger.info(
      `Cancelled transaction at nonce ${req.nonce}, cancel txHash ${cancelTx.hash}.`
    );

    return wrapResponse({
      txHash: cancelTx.hash,
    }, initTime);
  }

  static async getStatus(ethereum: Ethereum, _req: StatusRequest): Promise<StatusResponse> {
    const initTime = Date.now();
    await this.ensureInitialized(ethereum);
    
    const chain = 'ethereum';
    const chainId = ethereum.chainId;
    const network = ethereum.chain;
    const rpcUrl = ethereum.rpcUrl;
    const nativeCurrency = ethereum.nativeTokenSymbol;
    const currentBlockNumber = await ethereum.getCurrentBlockNumber();

    return wrapResponse({
      chain,
      chainId,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
      timestamp: initTime,
      latency: Date.now() - initTime,
    }, initTime);
  }
}
