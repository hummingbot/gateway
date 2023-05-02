import {
    invalidAddressError,
    invalidChainError,
    invalidNetworkError,
    invalidNonceError,
    invalidSpenderError,
    validateTezosAddress,
    validateTezosAllowancesRequest,
    validateTezosApproveRequest,
    validateTezosBalanceRequest,
    validateTezosChain,
    validateTezosNetwork,
    validateTezosNonce,
    validateTezosNonceRequest,
    validateTezosSpender,
    validateTezosTokenRequest
} from '../../../src/chains/tezos/tezos.validators';

describe('validateTezosAddress', () => {
    it('should return [] if the input is a valid Tezos address', () => {
        const validAddress = 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV';
        const result = validateTezosAddress({ address: validAddress });
        expect(result).toEqual([]);
    });

    it('should return error if the input is not a string', () => {
        const invalidAddress = 12345;
        const result = validateTezosAddress({ address: invalidAddress });
        expect(result).toEqual([invalidAddressError]);
    });

    it('should return error if the input is not a valid Tezos address', () => {
        const invalidAddress = '1234';
        const result = validateTezosAddress({ address: invalidAddress });
        expect(result).toEqual([invalidAddressError]);
    });
});

describe('validateTezosSpender', () => {
    it('should return [] if the input is a valid Tezos address', () => {
        const validAddress = 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV';
        const result = validateTezosSpender({ spender: validAddress });
        expect(result).toEqual([]);
    });

    it('should return error if the input is not a string', () => {
        const invalidSpender = 12345;
        const result = validateTezosSpender({ spender: invalidSpender });
        expect(result).toEqual([invalidSpenderError]);
    });

    it('should return error if the input is not a valid Tezos address or liquidity-baking', () => {
        const invalidSpender = '1234';
        const result = validateTezosSpender({ spender: invalidSpender });
        expect(result).toEqual([invalidSpenderError]);
    });
});

describe('validateTezosNonce', () => {
    it('should return [] if the input is undefined', () => {
        const result = validateTezosNonce({});
        expect(result).toEqual([]);
    });

    it('should return [] if the input is a non-negative integer', () => {
        const validNonce = 0;
        const result = validateTezosNonce({ nonce: validNonce });
        expect(result).toEqual([]);
    });

    it('should return error if the input is not an integer', () => {
        const invalidNonce = 'abc';
        const result = validateTezosNonce({ nonce: invalidNonce });
        expect(result).toEqual([invalidNonceError]);
    });

    it('should return error if the input is a negative integer', () => {
        const invalidNonce = -1;
        const result = validateTezosNonce({ nonce: invalidNonce });
        expect(result).toEqual([invalidNonceError]);
    });
});

describe('validateTezosChain', () => {
    it('should return [] if the input is a string', () => {
        const validChain = 'mainnet';
        const result = validateTezosChain({ chain: validChain });
        expect(result).toEqual([]);
    });

    it('should return error if the input is not a string', () => {
        const invalidChain = 12345;
        const result = validateTezosChain({ chain: invalidChain });
        expect(result).toEqual([invalidChainError]);
    });
});

describe('validateTezosNetwork', () => {
    it('should return [] if the input is a valid string', () => {
        const validNetwork = 'mainnet';
        const result = validateTezosNetwork({ network: validNetwork });
        expect(result).toEqual([]);
    });

    it('should return error if the input is not a string', () => {
        const invalidNetwork = 12345;
        const result = validateTezosNetwork({ network: invalidNetwork });
        expect(result).toEqual([invalidNetworkError]);
    });
});

describe('validateTezosNonceRequest', () => {
    it('should return no errors when given a valid address', () => {
        const req = { address: 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV' };
        const errors = validateTezosNonceRequest(req);
        expect(errors).toEqual(undefined);
    });

    it('should return an error when given an invalid address', () => {
        const req = { address: 'invalid-address' };
        const errors = () => validateTezosNonceRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given an object with missing address property', () => {
        const req = {};
        const errors = () => validateTezosNonceRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given a non-object input', () => {
        const req = 'not-an-object';
        const errors = () => validateTezosNonceRequest(req);
        expect(errors).toThrow();
    });
});

describe('validateTezosBalanceRequest', () => {
    it('should return no errors when given a valid address', () => {
        const req = {
            address: 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV',
            tokenSymbols: ['XTZ', 'cTEZ']
        };
        const errors = validateTezosBalanceRequest(req);
        expect(errors).toEqual(undefined);
    });

    it('should return an error when given an invalid address', () => {
        const req = { address: 'invalid-address' };
        const errors = () => validateTezosBalanceRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given an object with missing address property', () => {
        const req = {};
        const errors = () => validateTezosBalanceRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given a non-object input', () => {
        const req = 'not-an-object';
        const errors = () => validateTezosBalanceRequest(req);
        expect(errors).toThrow();
    });
});

describe('validateTezosTokenRequest', () => {
    it('should return no errors when given a valid address and token ID', () => {
        const req = {
            address: 'tz1aLmNpPGRoPne7Wv1U6QDg6a5z5P5kF5rK',
            tokenId: '1',
            tokenSymbols: ['XTZ', 'cTEZ'],
            chain: 'tezos',
            network: 'mainnet'
        };
        const errors = validateTezosTokenRequest(req);
        expect(errors).toEqual(undefined);
    });

    it('should return an error when given an invalid address', () => {
        const req = { address: 'invalid-address', tokenId: '1' };
        const errors = () => validateTezosTokenRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given an invalid token ID', () => {
        const req = { address: 'tz1aLmNpPGRoPne7Wv1U6QDg6a5z5P5kF5rK', tokenId: 'invalid-token-id' };
        const errors = () => validateTezosTokenRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given an object with missing address property', () => {
        const req = { tokenId: '1' };
        const errors = () => validateTezosTokenRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given an object with missing tokenId property', () => {
        const req = { address: 'tz1aLmNpPGRoPne7Wv1U6QDg6a5z5P5kF5rK' };
        const errors = () => validateTezosTokenRequest(req);
        expect(errors).toThrow();
    });

    it('should return an error when given a non-object input', () => {
        const req = 'not-an-object';
        const errors = () => validateTezosTokenRequest(req);
        expect(errors).toThrow();
    });
});

describe("validateTezosAllowancesRequest", () => {
    it("should return no errors when given valid input", () => {
        const req = {
            address: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            spender: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            tokenSymbols: ["XTZ", "cTEZ"],
        };
        const errors = validateTezosAllowancesRequest(req);
        expect(errors).toEqual(undefined);
    });

    it("should return an error when given an invalid address", () => {
        const req = {
            address: "invalid-address",
            spender: "KT1XvJ3tQxk3P1ZjxVRKvqoQHU2LhZ7VXp8s",
            tokenSymbols: ["XTZ", "cTEZ"],
        };
        const errors = () => validateTezosAllowancesRequest(req);
        expect(errors).toThrow();
    });

    it("should return an error when given an invalid spender address", () => {
        const req = {
            address: "tz1ZYWw7e2S1i1xqxCrLbTSDvpmexvqPghUf",
            spender: "invalid-address",
            tokenSymbols: ["XTZ", "cTEZ"],
        };
        const errors = () => validateTezosAllowancesRequest(req);
        expect(errors).toThrow();
    });
});

describe("validateTezosApproveRequest", () => {
    it("should return no errors when given valid input", () => {
        const req = {
            spender: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            amount: "100",
            address: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            token: "XTZ",
        };
        const errors = validateTezosApproveRequest(req);
        expect(errors).toEqual(undefined);
    });

    it("should return an error when given an invalid spender address", () => {
        const req = {
            spender: "invalid-address",
            amount: "100",
            address: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            token: "XTZ",
        };
        const errors = () => validateTezosApproveRequest(req);
        expect(errors).toThrow();
    });

    it("should return an error when given an invalid amount", () => {
        const req = {
            spender: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            amount: "not-a-number",
            address: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            token: "XTZ",
        };
        const errors = () => validateTezosApproveRequest(req);
        expect(errors).toThrow();
    });

    it("should return an error when given an invalid address", () => {
        const req = {
            spender: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            amount: "100",
            address: "invalid-address",
            token: "XTZ",
        };
        const errors = () => validateTezosApproveRequest(req);
        expect(errors).toThrow();
    });

    it("should return an error when given an invalid token", () => {
        const req = {
            spender: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            amount: "100",
            address: "tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV",
            token: 123,
        };
        const errors = () => validateTezosApproveRequest(req);
        expect(errors).toThrow();
    });
});