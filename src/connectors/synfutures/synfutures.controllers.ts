import { Transaction, Wallet } from 'ethers';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  INCOMPLETE_REQUEST_PARAM,
  INCOMPLETE_REQUEST_PARAM_CODE,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../../chains/ethereum/ethereum-base';
import { latency, gasCostInEthString } from '../../services/base';
import {
  Ethereumish,
  Tokenish,
  SynFuturesish,
} from '../../services/common-interfaces';
import { logger } from '../../services/logger';
import {
  EstimateGasResponse,
  PriceRequest,
  PerpPricesResponse,
  PerpCreateTakerRequest,
  PerpCreateTakerResponse,
  PerpAvailablePairsResponse,
  PerpPositionRequest,
  PerpPositionResponse,
  PerpMarketRequest,
  PerpMarketResponse,
  PerpBalanceResponse,
  PerpBalanceRequest,
} from '../../amm/amm.requests';
import { SynFuturesPosition } from './synfutures';

async function getWallet(ethereumish: Ethereumish, address: string) {
  let wallet: Wallet;

  try {
    wallet = await ethereumish.getWallet(address);
  } catch (err) {
    logger.error(`Wallet ${address} not available.`);
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE,
    );
  }

  return wallet;
}

export async function getPriceData(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  req: PriceRequest,
): Promise<PerpPricesResponse> {
  const startTimestamp: number = Date.now();
  let prices;
  try {
    prices = await synfuturesish.prices(`${req.base}-${req.quote}`);
  } catch (e) {
    throw new HttpException(
      500,
      UNKNOWN_ERROR_MESSAGE,
      UNKNOWN_ERROR_ERROR_CODE,
    );
  }

  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    markPrice: prices.markPrice.toString(),
    indexPrice: prices.indexPrice.toString(),
    indexTwapPrice: prices.indexTwapPrice.toString(),
    fairPrice: prices.fairPrice.toString(),
  };
}

export async function getAvailablePairs(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
): Promise<PerpAvailablePairsResponse> {
  const startTimestamp: number = Date.now();
  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    pairs: synfuturesish.availablePairs(),
  };
}

export async function checkMarketStatus(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  req: PerpMarketRequest,
): Promise<PerpMarketResponse> {
  const startTimestamp: number = Date.now();
  const status = await synfuturesish.isMarketActive(`${req.base}-${req.quote}`);
  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    isActive: status,
  };
}

export async function getPosition(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  req: PerpPositionRequest,
): Promise<PerpPositionResponse> {
  const startTimestamp: number = Date.now();
  const position = await synfuturesish.getPositions(
    req.address,
    `${req.base}-${req.quote}`,
  );
  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    ...(position as SynFuturesPosition),
  };
}

export async function createTakerOrder(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  req: PerpCreateTakerRequest,
  isOpen: boolean,
): Promise<PerpCreateTakerResponse> {
  const startTimestamp: number = Date.now();

  const gasPrice: number = ethereumish.gasPrice;

  const wallet = await getWallet(ethereumish, req.address);

  let tx: Transaction;

  if (isOpen) {
    if (!req.amount || !req.side) {
      throw new HttpException(
        500,
        INCOMPLETE_REQUEST_PARAM,
        INCOMPLETE_REQUEST_PARAM_CODE,
      );
    }

    tx = await synfuturesish.openPosition(
      wallet,
      req.side === 'LONG',
      `${req.base}-${req.quote}`,
      req.amount,
      req.nonce,
      req.allowedSlippage,
    );
  } else {
    tx = await synfuturesish.closePosition(
      wallet,
      `${req.base}-${req.quote}`,
      req.nonce,
      req.allowedSlippage,
    );
  }

  await ethereumish.txStorage.saveTx(
    ethereumish.chain,
    ethereumish.chainId,
    tx.hash as string,
    new Date(),
    ethereumish.gasPrice,
  );

  logger.info(
    `Order has been sent, txHash is ${tx.hash}, nonce is ${tx.nonce}, gasPrice is ${gasPrice}.`,
  );

  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount ? req.amount : '0',
    gasPrice: gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit: synfuturesish.gasLimit,
    gasCost: gasCostInEthString(gasPrice, synfuturesish.gasLimit),
    nonce: tx.nonce,
    txHash: tx.hash,
  };
}

export function getFullTokenFromSymbol(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  tokenSymbol: string,
): Tokenish {
  const tokenInfo: TokenInfo | undefined =
    ethereumish.getTokenBySymbol(tokenSymbol);
  let fullToken: Tokenish | undefined;
  if (tokenInfo) {
    fullToken = synfuturesish.getTokenByAddress(tokenInfo.address);
  }
  if (!fullToken)
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + tokenSymbol,
      TOKEN_NOT_SUPPORTED_ERROR_CODE,
    );
  return fullToken;
}

export async function estimateGas(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
): Promise<EstimateGasResponse> {
  const gasPrice: number = ethereumish.gasPrice;
  const gasLimit: number = synfuturesish.gasLimit;
  return {
    network: ethereumish.chain,
    timestamp: Date.now(),
    gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit,
    gasCost: gasCostInEthString(gasPrice, gasLimit),
  };
}

export async function getAccountValue(
  ethereumish: Ethereumish,
  synfuturesish: SynFuturesish,
  req: PerpBalanceRequest,
): Promise<PerpBalanceResponse> {
  if (!req.quote) {
    throw new HttpException(
      500,
      INCOMPLETE_REQUEST_PARAM,
      INCOMPLETE_REQUEST_PARAM_CODE,
    );
  }

  const startTimestamp: number = Date.now();

  let value;
  try {
    value = await synfuturesish.getAccountValue(req.address, req.quote);
  } catch (e) {
    throw new HttpException(
      500,
      UNKNOWN_ERROR_MESSAGE,
      UNKNOWN_ERROR_ERROR_CODE,
    );
  }

  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    balance: value.toString(),
  };
}
