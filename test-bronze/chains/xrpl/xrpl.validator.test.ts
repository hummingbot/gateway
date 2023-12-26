import {
  validateXRPLAddress,
  validateXRPLBalanceRequest,
  validateXRPLPollRequest,
  validateXRPLGetTokenRequest,
  invalidXRPLAddressError,
} from '../../../src/chains/xrpl/xrpl.validators';
import { HttpException } from '../../../src/services/error-handler';

import {
  invalidTxHashError,
  invalidTokenSymbolsError,
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
  it('valid when req.tokenSymbols is a token and address is a valid address', () => {
    expect(
      validateXRPLGetTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        tokenSymbols: ['XRP'],
      })
    ).toEqual(undefined);
  });

  it('return error when req.tokenSymbols and req.address does not exist', () => {
    try {
      validateXRPLGetTokenRequest({
        hello: 'world',
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(
        missingParameter('tokenSymbols')
      );
    }
  });

  it('return error when req.tokenSymbols is invalid', () => {
    try {
      validateXRPLGetTokenRequest({
        address: 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16',
        tokenSymbols: 123,
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(
        invalidTokenSymbolsError
      );
    }
  });

  it('return error when req.address is invalid', () => {
    try {
      validateXRPLGetTokenRequest({
        address: 123,
        tokenSymbols: ['XRP'],
      });
    } catch (error) {
      expect((error as HttpException).message).toEqual(invalidXRPLAddressError);
    }
  });
});
