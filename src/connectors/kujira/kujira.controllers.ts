import { StatusCodes } from 'http-status-codes';
import { ResponseWrapper } from '../../services/common-interfaces';
import { HttpException } from '../../services/error-handler';
import { KujiraModel as Connector } from './kujira.model';
import { convertToResponseBody } from './kujira.convertors';
import {
  AllMarketsWithdrawsRequest,
  AllMarketsWithdrawsResponse,
  BalanceNotFoundError,
  CancelAllOrdersRequest,
  CancelAllOrdersResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  CancelOrdersRequest,
  CancelOrdersResponse,
  GetAllBalancesRequest,
  GetAllBalancesResponse,
  GetAllMarketsRequest,
  GetAllMarketsResponse,
  GetAllOrderBooksRequest,
  GetAllOrderBooksResponse,
  GetAllTickersRequest,
  GetAllTickersResponse,
  GetAllTokensRequest,
  GetAllTokensResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  GetBalancesRequest,
  GetBalancesResponse,
  GetCurrentBlockRequest,
  GetCurrentBlockResponse,
  GetEstimatedFeesRequest,
  GetEstimatedFeesResponse,
  GetMarketRequest,
  GetMarketResponse,
  GetMarketsRequest,
  GetMarketsResponse,
  GetOrderBookRequest,
  GetOrderBookResponse,
  GetOrderBooksRequest,
  GetOrderBooksResponse,
  GetOrderRequest,
  GetOrderResponse,
  GetOrdersRequest,
  GetOrdersResponse,
  GetRootRequest,
  GetRootResponse,
  GetTickerRequest,
  GetTickerResponse,
  GetTickersRequest,
  GetTickersResponse,
  GetTokenRequest,
  GetTokenResponse,
  GetTokensRequest,
  GetTokensResponse,
  GetTransactionRequest,
  GetTransactionResponse,
  GetTransactionsRequest,
  GetTransactionsResponse,
  GetWalletPublicKeyRequest,
  GetWalletPublicKeyResponse,
  GetWalletsPublicKeysRequest,
  GetWalletsPublicKeysResponse,
  MarketNotFoundError,
  MarketsWithdrawsFundsResponse,
  MarketsWithdrawsRequest,
  MarketWithdrawRequest,
  MarketWithdrawResponse,
  OrderBookNotFoundError,
  OrderNotFoundError,
  PlaceOrderRequest,
  PlaceOrderResponse,
  PlaceOrdersRequest,
  PlaceOrdersResponse,
  TickerNotFoundError,
  TokenNotFoundError,
  TransactionNotFoundError,
  WalletPublicKeyNotFoundError,
} from './kujira.types';
import {
  validateCancelAllOrdersRequest,
  validateCancelOrderRequest,
  validateCancelOrdersRequest,
  validateGetAllBalancesRequest,
  validateGetAllMarketsRequest,
  validateGetAllOrderBooksRequest,
  validateGetAllOrdersRequest,
  validateGetAllTickersRequest,
  validateGetAllTokensRequest,
  validateGetBalanceRequest,
  validateGetBalancesRequest,
  validateGetCurrentBlockRequest,
  validateGetEstimatedFeesRequest,
  validateGetMarketRequest,
  validateGetMarketsRequest,
  validateGetOrderBookRequest,
  validateGetOrderBooksRequest,
  validateGetOrderRequest,
  validateGetOrdersRequest,
  validateGetTickerRequest,
  validateGetTickersRequest,
  validateGetTokenRequest,
  validateGetTokensRequest,
  validateGetTransactionRequest,
  validateGetTransactionsRequest,
  validateGetWalletPublicKeyRequest,
  validateGetWalletsPublicKeysRequest,
  validatePlaceOrderRequest,
  validatePlaceOrdersRequest,
  validateSettleAllMarketsFundsRequest,
  validateSettleMarketFundsRequest,
  validateSettleMarketsFundsRequest,
} from './kujira.validators';

export async function getRoot(
  connector: Connector,
  request: GetRootRequest
): Promise<ResponseWrapper<GetRootResponse>> {
  const response = new ResponseWrapper<GetRootResponse>();

  response.body = convertToResponseBody(await connector.getRoot(request));

  response.status = StatusCodes.OK;

  return response;
}

export async function getToken(
  connector: Connector,
  request: GetTokenRequest
): Promise<ResponseWrapper<GetTokenResponse>> {
  validateGetTokenRequest(request);

  const response = new ResponseWrapper<GetTokenResponse>();

  try {
    response.body = convertToResponseBody(await connector.getToken(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TokenNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getTokens(
  connector: Connector,
  request: GetTokensRequest
): Promise<ResponseWrapper<GetTokensResponse>> {
  validateGetTokensRequest(request);

  const response = new ResponseWrapper<GetTokensResponse>();

  try {
    response.body = convertToResponseBody(await connector.getTokens(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TokenNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getAllTokens(
  connector: Connector,
  request: GetAllTokensRequest
): Promise<ResponseWrapper<GetAllTokensResponse>> {
  validateGetAllTokensRequest(request);

  const response = new ResponseWrapper<GetAllTokensResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getAllTokens(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TokenNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getMarket(
  connector: Connector,
  request: GetMarketRequest
): Promise<ResponseWrapper<GetMarketResponse>> {
  validateGetMarketRequest(request);

  const response = new ResponseWrapper<GetMarketResponse>();

  try {
    response.body = convertToResponseBody(await connector.getMarket(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof MarketNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getMarkets(
  connector: Connector,
  request: GetMarketsRequest
): Promise<ResponseWrapper<GetMarketsResponse>> {
  validateGetMarketsRequest(request);

  const response = new ResponseWrapper<GetMarketsResponse>();

  try {
    response.body = convertToResponseBody(await connector.getMarkets(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof MarketNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getAllMarkets(
  connector: Connector,
  request: GetAllMarketsRequest
): Promise<ResponseWrapper<GetAllMarketsResponse>> {
  validateGetAllMarketsRequest(request);

  const response = new ResponseWrapper<GetAllMarketsResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getAllMarkets(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof MarketNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getOrderBook(
  connector: Connector,
  request: GetOrderBookRequest
): Promise<ResponseWrapper<GetOrderBookResponse>> {
  validateGetOrderBookRequest(request);

  const response = new ResponseWrapper<GetOrderBookResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getOrderBook(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderBookNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getOrderBooks(
  connector: Connector,
  request: GetOrderBooksRequest
): Promise<ResponseWrapper<GetOrderBooksResponse>> {
  validateGetOrderBooksRequest(request);

  const response = new ResponseWrapper<GetOrderBooksResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getOrderBooks(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderBookNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getAllOrderBooks(
  connector: Connector,
  request: GetAllOrderBooksRequest
): Promise<ResponseWrapper<GetAllOrderBooksResponse>> {
  validateGetAllOrderBooksRequest(request);

  const response = new ResponseWrapper<GetAllOrderBooksResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getAllOrderBooks(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderBookNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getTicker(
  connector: Connector,
  request: GetTickerRequest
): Promise<ResponseWrapper<GetTickerResponse>> {
  validateGetTickerRequest(request);

  const response = new ResponseWrapper<GetTickerResponse>();

  try {
    response.body = convertToResponseBody(await connector.getTicker(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TickerNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getTickers(
  connector: Connector,
  request: GetTickersRequest
): Promise<ResponseWrapper<GetTickersResponse>> {
  validateGetTickersRequest(request);

  const response = new ResponseWrapper<GetTickersResponse>();

  try {
    response.body = convertToResponseBody(await connector.getTickers(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TickerNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getAllTickers(
  connector: Connector,
  request: GetAllTickersRequest
): Promise<ResponseWrapper<GetAllTickersResponse>> {
  validateGetAllTickersRequest(request);

  const response = new ResponseWrapper<GetAllTickersResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getAllTickers(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TickerNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getBalance(
  connector: Connector,
  request: GetBalanceRequest
): Promise<ResponseWrapper<GetBalanceResponse>> {
  validateGetBalanceRequest(request);

  const response = new ResponseWrapper<GetBalanceResponse>();

  try {
    response.body = convertToResponseBody(await connector.getBalance(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof BalanceNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getBalances(
  connector: Connector,
  request: GetBalancesRequest
): Promise<ResponseWrapper<GetBalancesResponse>> {
  validateGetBalancesRequest(request);

  const response = new ResponseWrapper<GetBalancesResponse>();

  try {
    response.body = convertToResponseBody(await connector.getBalances(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof BalanceNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getAllBalances(
  connector: Connector,
  request: GetAllBalancesRequest
): Promise<ResponseWrapper<GetAllBalancesResponse>> {
  validateGetAllBalancesRequest(request);

  const response = new ResponseWrapper<GetAllBalancesResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getAllBalances(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof BalanceNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getOrder(
  connector: Connector,
  request: GetOrderRequest
): Promise<ResponseWrapper<GetOrderResponse>> {
  validateGetOrderRequest(request);

  const response = new ResponseWrapper<GetOrderResponse>();

  try {
    response.body = convertToResponseBody(await connector.getOrder(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getOrders(
  connector: Connector,
  request: GetOrdersRequest
): Promise<ResponseWrapper<GetOrdersResponse>> {
  if (request.ids) {
    validateGetOrdersRequest(request);
  } else if (
    request.marketId ||
    request.marketIds ||
    request.marketName ||
    request.marketNames ||
    request.status ||
    request.statuses
  ) {
    validateGetAllOrdersRequest(request);
  }

  const response = new ResponseWrapper<GetOrdersResponse>();

  try {
    response.body = convertToResponseBody(await connector.getOrders(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function placeOrder(
  connector: Connector,
  request: PlaceOrderRequest
): Promise<ResponseWrapper<PlaceOrderResponse>> {
  validatePlaceOrderRequest(request);

  const response = new ResponseWrapper<PlaceOrderResponse>();

  response.body = convertToResponseBody(await connector.placeOrder(request));

  response.status = StatusCodes.OK;

  return response;
}

export async function placeOrders(
  connector: Connector,
  request: PlaceOrdersRequest
): Promise<ResponseWrapper<PlaceOrdersResponse>> {
  validatePlaceOrdersRequest(request);

  const response = new ResponseWrapper<PlaceOrdersResponse>();

  response.body = convertToResponseBody(await connector.placeOrders(request));

  response.status = StatusCodes.OK;

  return response;
}

export async function cancelOrder(
  connector: Connector,
  request: CancelOrderRequest
): Promise<ResponseWrapper<CancelOrderResponse>> {
  validateCancelOrderRequest(request);

  const response = new ResponseWrapper<CancelOrderResponse>();

  try {
    response.body = convertToResponseBody(await connector.cancelOrder(request));

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function cancelOrders(
  connector: Connector,
  request: CancelOrdersRequest
): Promise<ResponseWrapper<CancelOrdersResponse>> {
  validateCancelOrdersRequest(request);

  const response = new ResponseWrapper<CancelOrdersResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.cancelOrders(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof OrderNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function cancelAllOrders(
  connector: Connector,
  request: CancelAllOrdersRequest
): Promise<ResponseWrapper<CancelAllOrdersResponse>> {
  validateCancelAllOrdersRequest(request);

  const response = new ResponseWrapper<CancelAllOrdersResponse>();

  response.body = convertToResponseBody(
    await connector.cancelAllOrders(request)
  );

  response.status = StatusCodes.OK;

  return response;
}

export async function withdrawFromMarket(
  connector: Connector,
  request: MarketWithdrawRequest
): Promise<ResponseWrapper<MarketWithdrawResponse>> {
  validateSettleMarketFundsRequest(request);

  const response = new ResponseWrapper<MarketWithdrawResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.withdrawFromMarket(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof MarketNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function withdrawFromMarkets(
  connector: Connector,
  request: MarketsWithdrawsRequest
): Promise<ResponseWrapper<MarketsWithdrawsFundsResponse>> {
  validateSettleMarketsFundsRequest(request);

  const response = new ResponseWrapper<MarketsWithdrawsFundsResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.withdrawFromMarkets(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof MarketNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function withdrawFromAllMarkets(
  connector: Connector,
  request: AllMarketsWithdrawsRequest
): Promise<ResponseWrapper<AllMarketsWithdrawsResponse>> {
  validateSettleAllMarketsFundsRequest(request);

  const response = new ResponseWrapper<AllMarketsWithdrawsResponse>();

  response.body = convertToResponseBody(
    await connector.withdrawFromAllMarkets(request)
  );

  response.status = StatusCodes.OK;

  return response;
}

export async function getWalletPublicKey(
  connector: Connector,
  request: GetWalletPublicKeyRequest
): Promise<ResponseWrapper<GetWalletPublicKeyResponse>> {
  validateGetWalletPublicKeyRequest(request);

  const response = new ResponseWrapper<GetWalletPublicKeyResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getWalletPublicKey(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof WalletPublicKeyNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getWalletsPublicKeys(
  connector: Connector,
  request: GetWalletsPublicKeysRequest
): Promise<ResponseWrapper<GetWalletsPublicKeysResponse>> {
  validateGetWalletsPublicKeysRequest(request);

  const response = new ResponseWrapper<GetWalletsPublicKeysResponse>();

  try {
    response.body = convertToResponseBody(
      connector.getWalletsPublicKeys(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof WalletPublicKeyNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getTransaction(
  connector: Connector,
  request: GetTransactionRequest
): Promise<ResponseWrapper<GetTransactionResponse>> {
  validateGetTransactionRequest(request);

  const response = new ResponseWrapper<GetTransactionResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getTransaction(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TransactionNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getTransactions(
  connector: Connector,
  request: GetTransactionsRequest
): Promise<ResponseWrapper<GetTransactionsResponse>> {
  validateGetTransactionsRequest(request);

  const response = new ResponseWrapper<GetTransactionsResponse>();

  try {
    response.body = convertToResponseBody(
      await connector.getTransactions(request)
    );

    response.status = StatusCodes.OK;

    return response;
  } catch (exception) {
    if (exception instanceof TransactionNotFoundError) {
      throw new HttpException(StatusCodes.NOT_FOUND, exception.message);
    } else {
      throw exception;
    }
  }
}

export async function getCurrentBlock(
  connector: Connector,
  request: GetCurrentBlockRequest
): Promise<ResponseWrapper<GetCurrentBlockResponse>> {
  validateGetCurrentBlockRequest(request);

  const response = new ResponseWrapper<GetCurrentBlockResponse>();

  response.body = convertToResponseBody(
    await connector.getCurrentBlock(request)
  );

  response.status = StatusCodes.OK;

  return response;
}

export async function getEstimatedFees(
  connector: Connector,
  request: GetEstimatedFeesRequest
): Promise<ResponseWrapper<GetEstimatedFeesResponse>> {
  validateGetEstimatedFeesRequest(request);

  const response = new ResponseWrapper<GetEstimatedFeesResponse>();

  response.body = convertToResponseBody(
    await connector.getEstimatedFees(request)
  );

  response.status = StatusCodes.OK;

  return response;
}
