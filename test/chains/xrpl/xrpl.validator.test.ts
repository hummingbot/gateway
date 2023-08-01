import {
  validateXRPLAddress,
  validateXRPLBalanceRequest,
  validateXRPLPollRequest,
  validateXRPLGetTokenRequest,
  validateXRPLPostTokenRequest,
  invalidXRPLAddressError,
} from '../../../src/chains/xrpl/xrpl.validators';
import { HttpException } from '../../../src/services/error-handler';

import {
  invalidTxHashError,
  invalidTokenError,
} from '../../../src/services/validators';

import { missingParameter } from '../../../src/services/validators';

import 'jest-extended';

describe('validateXRPLPollRequest', () => {
  it('valid when req.txHash is a txHash', () => {
    expect(
      validateXRPLPollRequest({
        txHash:
          '92EE240C1C31E50AAA7E3C00A6280A4BE52E65B5A8A4C1B4A6FEF9E170B14D0F', // noqa: mock
      })
    ).toEqual(undefined);
  });

  it('return error when req.txHash does not exist', () => {
    try {
      validateXRPLPollRequest({
        hello: 'world',
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(
        missingParameter('txHash')
      );
    }
  });

  it('return error when req.txHash is invalid', () => {
    try {
      validateXRPLPollRequest({
        txHash: 123,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidTxHashError);
    }
  });
});

describe('validateAddress', () => {
  it('valid when req.address is a address', () => {
    expect(
      validateXRPLAddress({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
      })
    ).toEqual([]);
  });

  it('return error when req.address does not exist', () => {
    expect(
      validateXRPLAddress({
        hello: 'world',
      })
    ).toEqual([missingParameter('address')]);
  });

  it('return error when req.address is invalid', () => {
    expect(
      validateXRPLAddress({
        address: 123,
      })
    ).toEqual([invalidXRPLAddressError]);
  });
});

describe('validateXRPLBalanceRequest', () => {
  it('valid when req.token is a token and address is a valid address', () => {
    expect(
      validateXRPLBalanceRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
      })
    ).toEqual(undefined);
  });

  it('return error when req.address is invalid', () => {
    try {
      validateXRPLBalanceRequest({
        address: 123,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidXRPLAddressError);
    }
  });
});

describe('validateXRPLGetTokenRequest', () => {
  it('valid when req.token is a token and address is a valid address', () => {
    expect(
      validateXRPLGetTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        token: 'XRP',
      })
    ).toEqual(undefined);
  });

  it('return error when req.token and req.address does not exist', () => {
    try {
      validateXRPLGetTokenRequest({
        hello: 'world',
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(
        [missingParameter('token'), missingParameter('address')].join(', ')
      );
    }
  });

  it('return error when req.token is invalid', () => {
    try {
      validateXRPLGetTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        token: 123,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidTokenError);
    }
  });

  it('return error when req.address is invalid', () => {
    try {
      validateXRPLGetTokenRequest({
        address: 123,
        token: `XRP`,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidXRPLAddressError);
    }
  });
});

describe('validateXRPLPostTokenRequest', () => {
  it('valid when req.token is a token and address is a valid address', () => {
    expect(
      validateXRPLPostTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        token: 'XRP',
      })
    ).toEqual(undefined);
  });

  it('return error when req.token and req.address does not exist', () => {
    try {
      validateXRPLPostTokenRequest({
        hello: 'world',
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(
        [missingParameter('token'), missingParameter('address')].join(', ')
      );
    }
  });

  it('return error when req.token is invalid', () => {
    try {
      validateXRPLPostTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        token: 123,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidTokenError);
    }
  });

  it('return error when req.address is invalid', () => {
    try {
      validateXRPLPostTokenRequest({
        address: 123,
        token: `XRP`,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidXRPLAddressError);
    }
  });
});
