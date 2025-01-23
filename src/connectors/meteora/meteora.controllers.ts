import { Meteora } from './meteora';
import { Keypair } from '@solana/web3.js';
import { Solana } from '../../chains/solana/solana';
import { wrapResponse } from '../../services/response-wrapper';
import {
  HttpException,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
  TRADE_NOT_FOUND_ERROR_CODE,
  TRADE_NOT_FOUND_ERROR_MESSAGE,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { logger } from '../../services/logger';

export async function getPositionsOwnedBy(
  solana: Solana,
  meteora: Meteora,
  poolAddress: string,
  walletAddress: string,
) {
  const initTime = Date.now();
  let wallet: Keypair;
  try {
    wallet = await solana.getWallet(walletAddress);
  } catch (err) {
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }

  try {
    const result = await meteora.getPositionsOwnedBy(poolAddress, wallet);
    return wrapResponse(result, initTime);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Pool not found')) {
        throw new HttpException(
          404,
          TRADE_NOT_FOUND_ERROR_MESSAGE,
          TRADE_NOT_FOUND_ERROR_CODE
        );
      }
      logger.error(e);
      throw new HttpException(
        500,
        e.message,
        UNKNOWN_ERROR_ERROR_CODE
      );
    }
    throw new HttpException(
      500,
      UNKNOWN_ERROR_MESSAGE,
      UNKNOWN_ERROR_ERROR_CODE
    );
  }
}

export async function getActiveBin(
  _solana: Solana,
  meteora: Meteora,
  poolAddress: string,
) {
  const initTime = Date.now();

  try {
    const result = await meteora.getActiveBin(poolAddress);
    return wrapResponse(result, initTime);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Pool not found')) {
        throw new HttpException(
          404,
          TRADE_NOT_FOUND_ERROR_MESSAGE,
          TRADE_NOT_FOUND_ERROR_CODE
        );
      }
      if (e.message.includes('Bin array not found')) {
        throw new HttpException(
          404,
          TRADE_NOT_FOUND_ERROR_MESSAGE,
          TRADE_NOT_FOUND_ERROR_CODE
        );
      }
      logger.error(e);
      throw new HttpException(
        500,
        e.message,
        UNKNOWN_ERROR_ERROR_CODE
      );
    }
    throw new HttpException(
      500,
      UNKNOWN_ERROR_MESSAGE,
      UNKNOWN_ERROR_ERROR_CODE
    );
  }
} 