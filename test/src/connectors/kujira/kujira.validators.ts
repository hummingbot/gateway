import { StatusCodes } from 'http-status-codes';
import { HttpException } from '../../services/error-handler';
import { BigNumber } from 'bignumber.js';
import {
  isFloatString,
  isNaturalNumberString,
} from '../../services/validators';
import { OrderSide, OrderType, OrderStatus } from './kujira.types';

type Validator = <Item>(
  item: undefined | null | any | Item,
  index?: number
) => { warnings: Array<string>; errors: Array<string> };

type RequestValidator = <Item>(item: undefined | null | any | Item) => {
  warnings: Array<string>;
  errors: Array<string>;
};

const createValidator = <Item, Value>(
  accessor: undefined | null | string | ((target: any | Item) => any | Value),
  validation: (
    item: undefined | null | any | Item,
    value: undefined | null | any | Value
  ) => boolean,
  error:
    | string
    | ((
        item: undefined | null | any | Item,
        value: undefined | null | any | Value,
        accessor:
          | undefined
          | null
          | string
          | ((target: any | Item) => any | Value),
        index?: number
      ) => string),
  optional: boolean = false
): Validator => {
  return (item: undefined | null | any | Item, index?: number) => {
    const warnings: Array<string> = [];
    const errors: Array<string> = [];

    let target: any | Value;
    if (item === undefined && accessor) {
      errors.push(`Request with undefined value informed when it shouldn't.`);
    } else if (item === null && accessor) {
      errors.push(`Request with null value informed when it shouldn't.`);
    } else if (!accessor) {
      target = item;
    } else if (typeof accessor === 'string') {
      if (!(`${accessor}` in item) && !optional) {
        errors.push(`The request is missing the key/property "${accessor}".`);
      } else {
        target = item[accessor];
      }
    } else {
      target = accessor(item);
    }

    if (!validation(item, target)) {
      if (typeof error === 'string') {
        if (optional) {
          warnings.push(error);
        } else {
          errors.push(error);
        }
      } else {
        if (optional) {
          warnings.push(error(item, target, accessor, index));
        } else {
          errors.push(error(item, target, accessor, index));
        }
      }
    }

    return {
      warnings,
      errors,
    };
  };
};

export const createRequestValidator = (
  validators: Array<Validator>,
  statusCode?: StatusCodes,
  headerMessage?: (request: any) => string,
  errorNumber?: number
): RequestValidator => {
  return <Item>(request: undefined | null | any | Item) => {
    let warnings: Array<string> = [];
    let errors: Array<string> = [];

    for (const validator of validators) {
      const result = validator(request);
      warnings = [...warnings, ...result.warnings];
      errors = [...errors, ...result.errors];
    }

    throwIfErrorsExist(errors, statusCode, request, headerMessage, errorNumber);

    return { warnings, errors };
  };
};

export const createBatchValidator = <Item>(
  validators: Array<Validator>,
  headerItemMessage?: (
    item: undefined | null | any | Item,
    index?: number
  ) => string,
  accessor:
    | undefined
    | null
    | string
    | ((target: any | Item) => any) = undefined
): ((input: any[]) => { warnings: Array<string>; errors: Array<string> }) => {
  return (input: any[]) => {
    let warnings: Array<string> = [];
    let errors: Array<string> = [];

    let items: any[] = [];
    if (input === undefined && accessor) {
      errors.push(`Request with undefined value informed when it shouldn't.`);
    } else if (input === null && accessor) {
      errors.push(`Request with null value informed when it shouldn't.`);
    } else if (!accessor) {
      items = input;
    } else if (typeof accessor === 'string') {
      if (!(`${accessor}` in input)) {
        errors.push(`The request is missing the key/property "${accessor}".`);
      } else {
        items = input[accessor as any];
      }
    } else {
      items = accessor(input);
    }

    let index = 0;
    for (const item of items) {
      for (const validator of validators) {
        const itemResult = validator(item, index);

        if (itemResult.warnings && itemResult.warnings.length > 0) {
          if (headerItemMessage) warnings.push(headerItemMessage(item, index));
        }

        if (itemResult.errors && itemResult.errors.length > 0) {
          if (headerItemMessage) errors.push(headerItemMessage(item, index));
        }

        warnings = [...warnings, ...itemResult.warnings];
        errors = [...errors, ...itemResult.errors];
      }
      index++;
    }

    return { warnings, errors };
  };
};

/**
 Throw an error because the request parameter is malformed, collect all the
 errors related to the request to give the most information possible
 */
export const throwIfErrorsExist = (
  errors: Array<string>,
  statusCode: number = StatusCodes.NOT_FOUND,
  request: any,
  headerMessage?: (request: any, errorNumber?: number) => string,
  errorNumber?: number
): void => {
  if (errors.length > 0) {
    let message = headerMessage
      ? `${headerMessage(request, errorNumber)}\n`
      : '';
    message += errors.join('\n');

    throw new HttpException(statusCode, message);
  }
};

export const validateOrderClientId = (optional = false): Validator => {
  return createValidator(
    null,
    (target, _) =>
      typeof target === 'object'
        ? isNaturalNumberString(target.clientId)
        : target,
    (target, _) => {
      const id = typeof target === 'object' ? target.clientId : target;
      return `Invalid client id (${id}), it needs to be in big number format.`;
    },
    optional
  );
};

export const validateOrderClientIds = (optional = false): Validator => {
  return createValidator(
    'clientIds',
    (_, values) => {
      let ok = true;
      values === undefined
        ? (ok = true)
        : values.map((item: any) => {
            const id =
              typeof item === 'object'
                ? isNaturalNumberString(item.clientId)
                : item;

            ok = isNaturalNumberString(id) && ok;
          });

      return ok;
    },
    `Invalid client ids, it needs to be an array of big numbers.`,
    optional
  );
};

export const validateOrderExchangeId = (optional = false): Validator => {
  return createValidator(
    null,
    (target, _) =>
      typeof target == 'object' && 'id' in target
        ? isNaturalNumberString(target.id)
        : target,
    (target, _) => {
      const id = typeof target == 'object' ? target.id : target;

      return `Invalid exchange id (${id}), it needs to be in big number format.`;
    },
    optional
  );
};

export const validateOrderExchangeIds = (optional = false): Validator => {
  return createValidator(
    'ids',
    (_, values) => {
      let ok = true;
      values === undefined
        ? (ok = true)
        : values.map((item: any) => {
            const id = typeof item == 'object' ? item.id : item;

            ok = isNaturalNumberString(id) && ok;
          });

      return ok;
    },
    `Invalid exchange ids, it needs to be an array of big numbers.`,
    optional
  );
};

export const validateOrderMarketName = (optional = false): Validator => {
  return createValidator(
    'marketName',
    (_, value) => (value === undefined ? true : value.trim().length),
    (_, value) => `Invalid market name (${value}).`,
    optional
  );
};

export const validateOrderMarketNames = (optional = false): Validator => {
  return createValidator(
    'marketNames',
    (_, values) => {
      let ok = true;
      values === undefined
        ? (ok = true)
        : values.map((item: any) => (ok = item.trim().length && ok));

      return ok;
    },
    `Invalid market names, it needs to be an array of strings.`,
    optional
  );
};

export const validateOrderMarketId = (optional = false): Validator => {
  return createValidator(
    'marketId',
    (_, value) =>
      value === undefined
        ? true
        : value.trim().length && value.trim().slice(0, 6) === 'kujira',
    (_, value) => `Invalid market id (${value}).`,
    optional
  );
};

export const validateAllMarketIds = (optional = false): Validator => {
  return createValidator(
    'marketIds',
    (_, values) => {
      let ok = true;
      values === undefined
        ? (ok = true)
        : values.map(
            (item: any) =>
              (ok = item.trim().length && item.trim().slice(0, 6) === 'kujira')
          );

      return ok;
    },
    `Invalid market ids, it needs to be an array of strings.`,
    optional
  );
};

export const validateOrderOwnerAddress = (optional = false): Validator => {
  return createValidator(
    'ownerAddress',
    (_, value) => /^kujira[a-z0-9]{39}$/.test(value),
    (_, value) => `Invalid owner address (${value}).`,
    optional
  );
};

export const validateOrderOwnerAddresses = (optional = false): Validator => {
  return createValidator(
    'ownerAddresses',
    (_, values) => {
      let ok = true;
      values === undefined
        ? (ok = true)
        : values.map((item: any) => /^kujira[a-z0-9]{39}$/.test(item));

      return ok;
    },
    `Invalid owner addresses...`,
    optional
  );
};

export const validateOrderSide = (optional = false): Validator => {
  return createValidator(
    'side',
    (_, value) =>
      value &&
      (Object.values(OrderSide) as string[])
        .map((i) => i.toLowerCase())
        .includes(value.toLowerCase()),
    (_, value) => `Invalid order side (${value}).`,
    optional
  );
};

export const validateOrderPrice = (optional = false): Validator => {
  return createValidator(
    'price',
    (_, value) =>
      typeof value === 'undefined'
        ? true
        : typeof value === 'number' ||
          value instanceof BigNumber ||
          isFloatString(value),
    (_, value) => `Invalid order price (${value}).`,
    optional
  );
};

export const validateOrderAmount = (optional = false): Validator => {
  return createValidator(
    'amount',
    (_, value) =>
      typeof value === 'number' ||
      value instanceof BigNumber ||
      isFloatString(value),
    (_, value) => `Invalid order amount (${value}).`,
    optional
  );
};

export const validateOrderType = (optional = false): Validator => {
  return createValidator(
    'type',
    (_, value) =>
      value === undefined
        ? true
        : Object.values(OrderType)
            .map((item) => item.toLowerCase())
            .includes(value.toLowerCase()),
    (_, value) => `Invalid order type (${value}).`,
    optional
  );
};

export const validateOrderStatus = (optional = false): Validator => {
  return createValidator(
    'status',
    (_, value) =>
      value === undefined ? true : Object.values(OrderStatus).includes(value),
    (_, value) => `Invalid order(s) status (${value}).`,
    optional
  );
};

export const validateOrderStatuses = (optional = false): Validator => {
  return createValidator(
    'statuses',
    (_, values) =>
      values === undefined ? true : Object.values(OrderStatus).includes(values),
    (_, values) => `Invalid order(s) status (${values}).`,
    optional
  );
};

export const validateGetTokens = (optional = false): Validator => {
  return createValidator(
    null,
    (request) =>
      (request.names && request.names.length) ||
      (request.ids && request.ids.length) ||
      (request.symbols && request.symbols.length),
    `No tokens were informed. If you want to get all tokens, please do not inform the parameter "names" or "ids".`,
    optional
  );
};

export const validateIfExistsMarketIdOrMarketName = (
  optional = false
): Validator => {
  return createValidator(
    null,
    (request) => request.marketId || request.marketName,
    `No market name was informed. please inform the parameter marketId or marketName.`,
    optional
  );
};

export const validateGetTokenRequest: RequestValidator = createRequestValidator(
  [
    createValidator(
      null,
      (request) => request.id || request.name || request.symbol,
      `No token was informed. If you want to get a token, please inform the parameter "id".`,
      false
    ),
  ],
  StatusCodes.BAD_REQUEST
);

export const validateGetTokensRequest: RequestValidator =
  createRequestValidator([validateGetTokens(false)], StatusCodes.BAD_REQUEST);

export const validateGetAllTokensRequest: RequestValidator =
  createRequestValidator(
    [createValidator(null, (_request) => true, ``, false)],
    StatusCodes.BAD_REQUEST
  );

export const validateGetMarketRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.id || request.name,
        `No market was informed. If you want to get a market, please inform the parameter id or name.`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetMarketsRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (_request) => true,
        `Error occur when acessing /markets endpoint`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetAllMarketsRequest: RequestValidator =
  createRequestValidator(
    [createValidator(null, (_request) => true, ``, false)],
    StatusCodes.BAD_REQUEST
  );

export const validateGetOrderBookRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.marketId || request.marketName,
        `No market name was informed. If you want to get an order book, please inform the parameter marketId or marketName.`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetOrderBooksRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          (request.marketIds && request.marketIds.length) ||
          (request.marketNames && request.marketNames.length),
        `No market names or maket ids were informed. Please inform the parameter marketIds or marketNames. If you want to get all order books, please do not inform the parameter "marketIds".`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetAllOrderBooksRequest: RequestValidator =
  createRequestValidator(
    [createValidator(null, (_request) => true, ``, false)],
    StatusCodes.BAD_REQUEST
  );

export const validateGetTickerRequest: RequestValidator =
  createRequestValidator(
    [
      validateIfExistsMarketIdOrMarketName(),
      validateOrderMarketId(true),
      validateOrderMarketName(true),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetTickersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          (request.marketIds && request.marketIds.length) ||
          (request.marketNames && request.marketNames.length),
        `No market names were informed. please do not inform the parameter "marketIds".`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetAllTickersRequest: RequestValidator =
  createRequestValidator(
    [createValidator(null, (_request) => true, ``, false)],
    StatusCodes.BAD_REQUEST
  );

export const validateGetBalanceRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          (request.tokenId && request.ownerAddress) ||
          (request.tokenSymbol && request.ownerAddress),
        `No market name was informed. If you want to get a balance, please inform the parameter "marketId".`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetBalancesRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          (request.tokenIds && request.ownerAddress) ||
          (request.tokenSymbols && request.ownerAddress),
        `No market names were informed. If you want to get all balances, please do not inform the parameter "marketIds".`,
        false
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetAllBalancesRequest: RequestValidator =
  createRequestValidator(
    [createValidator(null, (request) => !!request.ownerAddress, ``, false)],
    StatusCodes.BAD_REQUEST
  );

export const validateGetOrderRequest: RequestValidator = createRequestValidator(
  [
    createValidator(
      null,
      (request) => request && (request.id || request.clientId),
      `No id or client id was informed.`,
      false
    ),
    validateOrderClientId(true),
    validateOrderExchangeId(true),
    validateOrderOwnerAddress(),
  ],
  StatusCodes.BAD_REQUEST,
  (request) => `Error when trying to get order "${request.id}"`
);

export const validateGetOrdersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          request &&
          ((request.ids && request.ids.length) ||
            (request.clientIds && request.clientIds.length)),
        `No orders were informed.`,
        false
      ),
      validateOrderClientIds(true),
      validateOrderExchangeIds(),
      validateOrderOwnerAddress(),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateGetAllOrdersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          request &&
          (request.ownerAddress ||
            (request.ownerAddresses && request.ownerAddresses.length)),
        `No owner address informed.`,
        false
      ),
      validateOrderOwnerAddress(true),
      validateOrderOwnerAddresses(true),
      createValidator(
        null,
        (request) =>
          request.status || (request.statuses && request.statuses.length),
        `No order status informed.`,
        true
      ),
      validateOrderStatus(true),
      validateOrderStatuses(true),
      validateOrderMarketId(true),
      validateAllMarketIds(true),
      validateOrderMarketName(true),
      validateOrderMarketNames(true),
    ],
    StatusCodes.BAD_REQUEST,
    (request) =>
      `Error when trying to get all orders for markets "${request.marketId} ? "${request.marketId} : "${request.marketId} "`
  );

export const validatePlaceOrderRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.marketId || request.marketName,
        `No market informed. Inform a marketIdd or marketName.`,
        false
      ),
      validateOrderMarketId(true),
      validateOrderMarketName(true),
      validateOrderOwnerAddress(),
      validateOrderSide(),
      validateOrderPrice(true),
      validateOrderAmount(),
      validateOrderType(),
    ],
    StatusCodes.BAD_REQUEST,
    (request) => `Error when trying to create order "${request.id}"`
  );

export const validatePlaceOrdersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.orders && request.orders.length,
        `No orders were informed.`,
        false
      ),
      validateOrderOwnerAddress(true),
      createBatchValidator(
        [
          createValidator(
            null,
            (request) => request.marketId || request.marketName,
            `marketId or maketName must be informed.`,
            false
          ),
          validateOrderMarketId(true),
          validateOrderMarketName(true),
          validateOrderOwnerAddress(true),
          validateOrderSide(),
          validateOrderPrice(true),
          validateOrderAmount(),
          validateOrderType(),
        ],
        (index) => `Invalid order request body  at position ${index}`,
        'orders'
      ),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateCancelOrderRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request && (request.marketId || request.marketName),
        `No market informed. Inform a market id or market name.`,
        false
      ),
      validateOrderMarketId(true),
      validateOrderMarketName(true),
      validateOrderExchangeId(true),
      validateOrderOwnerAddress(),
    ],
    StatusCodes.BAD_REQUEST,
    (request) => `Error when trying to cancel order "${request.id}"`
  );

export const validateCancelOrdersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          request &&
          (request.marketId ||
            request.marketName ||
            (request.marketIds && request.marketIds.length)),
        `No market informed. Inform a marketId, marketName ou marketNames.`,
        false
      ),
      validateOrderMarketId(true),
      validateOrderMarketName(true),
      createValidator(
        null,
        (values) => values && values.ids,
        `No orders were informed.`,
        true
      ),
      validateOrderExchangeIds(true),
      validateAllMarketIds(true),
      createValidator(
        null,
        (request) => request.ownerAddress || request.ownerAddresses,
        `No owner address informed. Please inform the parameter ownerAddress or ownerAddresses`,
        false
      ),
      validateOrderOwnerAddress(true),
      validateOrderOwnerAddresses(true),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateCancelAllOrdersRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.ownerAddress || request.ownerAddresses,
        `No owner address informed.`,
        false
      ),
      validateOrderOwnerAddress(true),
      validateOrderOwnerAddresses(true),
      createValidator(
        null,
        (request) =>
          request.marketId ||
          (request.marketIds && request.marketIds.length) ||
          request.marketName ||
          (request.marketNames && request.marketNames.length),
        `No market informed. Inform a market id or market name.`,
        true
      ),
      validateOrderMarketId(true),
      validateAllMarketIds(true),
      validateOrderMarketName(true),
      validateOrderMarketNames(true),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateSettleMarketFundsRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) =>
          request.ownerAddress ||
          (request.ownerAddresses && request.ownerAddresses.length),
        `No owner address informed.`,
        false
      ),
      validateOrderOwnerAddress(true),
      validateOrderOwnerAddresses(true),
      createValidator(
        null,
        (request) => request.marketId || request.marketName,
        `No market informed. Inform a marketId or marketName.`,
        false
      ),
      validateOrderMarketName(true),
      validateOrderMarketId(true),
    ],
    StatusCodes.BAD_REQUEST,
    (request) =>
      `Error when trying to settle funds for market "${request.marketId}."`
  );

export const validateSettleMarketsFundsRequest: RequestValidator =
  createRequestValidator(
    [
      createValidator(
        null,
        (request) => request.ownerAddresses || request.ownerAddress,
        `No owner address informed.`,
        false
      ),
      validateOrderOwnerAddress(true),
      validateOrderOwnerAddresses(true),
      createValidator(
        null,
        (request) =>
          (request.marketIds && request.marketIds.length) ||
          (request.marketNames && request.marketNames.length),
        `No markets informed. Inform market ids or market names.`,
        true
      ),
      validateAllMarketIds(true),
      validateOrderMarketNames(true),
    ],
    StatusCodes.BAD_REQUEST
  );

export const validateSettleAllMarketsFundsRequest: RequestValidator =
  createRequestValidator(
    [validateOrderOwnerAddress()],
    StatusCodes.BAD_REQUEST
  );

export const validateGetWalletPublicKeyRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);

export const validateGetWalletsPublicKeysRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);

export const validateGetTransactionRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);

export const validateGetTransactionsRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);

export const validateGetCurrentBlockRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);

export const validateGetEstimatedFeesRequest: RequestValidator =
  createRequestValidator([], StatusCodes.BAD_REQUEST);
