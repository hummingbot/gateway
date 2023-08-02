import { Wallet, TxResponse } from 'xrpl';
import { XRPTokenInfo, XRPLish } from './xrpl';
import { TokenInfo, latency } from '../../services/base';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import {
  getNetworkId,
  getNotNullOrThrowError,
} from '../../chains/xrpl/xrpl.helpers';

import {
  XRPLBalanceRequest,
  XRPLBalanceResponse,
  XRPLPollRequest,
  XRPLPollResponse,
} from './xrpl.requests';

import {
  validateXRPLBalanceRequest,
  validateXRPLPollRequest,
  validateXRPLGetTokenRequest,
} from './xrpl.validators';
import { TokensRequest } from '../../network/network.requests';

export class XRPLController {
  static async currentBlockNumber(xrplish: XRPLish): Promise<number> {
    return xrplish.getCurrentLedgerIndex();
  }

  static async balances(
    xrplish: XRPLish,
    req: XRPLBalanceRequest
  ): Promise<XRPLBalanceResponse> {
    const initTime = Date.now();
    let wallet: Wallet;

    validateXRPLBalanceRequest(req);

    try {
      wallet = await xrplish.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    const balances = await xrplish.getAllBalance(wallet);

    return {
      network: xrplish.network,
      timestamp: initTime,
      latency: latency(initTime, Date.now()),
      address: req.address,
      balances,
    };
  }

  static async poll(
    xrplish: XRPLish,
    req: XRPLPollRequest
  ): Promise<XRPLPollResponse> {
    validateXRPLPollRequest(req);

    const initTime = Date.now();
    const currentLedgerIndex = await xrplish.getCurrentLedgerIndex();
    const txData = getNotNullOrThrowError<TxResponse>(
      await xrplish.getTransaction(req.txHash)
    );
    const txStatus = await xrplish.getTransactionStatusCode(txData);

    return {
      network: xrplish.network,
      timestamp: initTime,
      currentLedgerIndex: currentLedgerIndex,
      txHash: req.txHash,
      txStatus: txStatus,
      txLedgerIndex: txData.result.ledger_index,
      txData: getNotNullOrThrowError<TxResponse>(txData),
    };
  }

  static async getTokens(
    xrplish: XRPLish,
    req: TokensRequest
  ): Promise<{ tokens: TokenInfo[] }> {
    validateXRPLGetTokenRequest(req);
    let xrpTokens: XRPTokenInfo[] = [];
    if (req.tokenSymbols?.length === 0) {
      xrpTokens = xrplish.storedTokenList;
    } else {
      for (const t of req.tokenSymbols as []) {
        const arr = xrplish.getTokenForSymbol(t);
        if (arr !== undefined) {
          arr.forEach((token) => {
            xrpTokens.push(token);
          });
        }
      }
    }

    const tokens: TokenInfo[] = [];

    // Convert xrpTokens into tokens
    xrpTokens.map((xrpToken) => {
      const token: TokenInfo = {
        address: xrpToken.issuer,
        chainId: getNetworkId(req.network),
        decimals: 15,
        name: xrpToken.title,
        symbol: xrpToken.code,
      };
      tokens.push(token);
    });

    return { tokens };
  }
}
