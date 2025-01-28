import {
    validateTonAddress,
    validateTonBalanceRequest,
    validateTonPollRequest,
    validateTxHash,
    validateAssetSymbols,
    validateAssetSymbol,
    validateAssetsRequest,
} from '../../../src/chains/ton/ton.validators';

jest.mock('../../../src/services/validators', () => ({
    validateNetwork: jest.fn((req: any) =>
        typeof req.network === 'string' && req.network === 'testnet'
            ? []
            : ['The network param must be "testnet".']
    ),
    validateTonAddress: jest.fn((req: any) =>
        typeof req.address === 'string'
            ? []
            : ['The address param is not a valid Ton private key (string mnemonic).']
    ),
    validateTokenSymbols: jest.fn((req: any) =>
        Array.isArray(req.assetSymbols) &&
            req.assetSymbols.every((symbol: string) => ['AIOTX', 'TON'].includes(symbol))
            ? []
            : ['Invalid token symbol']
    ),
    mkValidator: jest.fn((fieldName, errorMessage, validationFn) => (req: any) => {
        const value = req[fieldName];
        return validationFn(value) ? [] : [errorMessage];
    }),
    mkRequestValidator: jest.fn((validators) => (req: any) =>
        validators.reduce((errors: string[], validator: any) => {
            return errors.concat(validator(req));
        }, [])
    ),
    invalidTokenSymbolsError: 'Invalid token symbol',
}));

describe('Validators', () => {
    describe('validateTxHash', () => {
        it('should return an empty array if txHash is valid', () => {
            const result = validateTxHash({ txHash: 'validHash' });
            expect(result).toEqual([]);
        });

        it('should return an error if txHash is not a string', () => {
            const result = validateTxHash({ txHash: 123 });
            expect(result).toEqual(['The txHash param must be a string.']);
        });
    });

    describe('validateTonAddress', () => {
        it('should return an empty array if address is valid', () => {
            const result = validateTonAddress({ address: 'validAddress' });
            expect(result).toEqual([]);
        });

        it('should return an error if address is not a string', () => {
            const result = validateTonAddress({ address: 123 });
            expect(result).toEqual([
                'The address param is not a valid Ton private key (string mnemonic).',
            ]);
        });
    });

    describe('validateTonPollRequest', () => {
        it('should return an empty array for valid network and txHash', () => {
            const result = validateTonPollRequest({
                network: 'testnet',
                txHash: 'validHash',
            });
            expect(result).toEqual([]);
        });

        it('should return errors for invalid network and txHash', () => {
            const result = validateTonPollRequest({
                network: null,
                txHash: 123,
            });
            expect(result).toEqual([
                'The network param is not a string.',
                'The txHash param must be a string.',
            ]);
        });
    });

    describe('validateTonBalanceRequest', () => {
        it('should not throw for valid network, address, and tokenSymbols', () => {
            expect(() => {
                validateTonBalanceRequest({
                    network: 'testnet',
                    address: 'validAddress',
                    assetSymbols: ['AIOTX', 'TON'],
                });
            }).not.toThrow();
        });

        it('should throw for invalid network, address, and tokenSymbols', () => {
            expect(() => {
                validateTonBalanceRequest({
                    network: 123,
                    address: 456,
                    assetSymbols: 789,
                });
            }).not.toThrow();
        });
    });

    describe('validateAssetSymbols', () => {
        it('should return an empty array if assetSymbols is a valid array of strings', () => {
            const result = validateAssetSymbols({ assetSymbols: ['AIOTX', 'TON'] });
            expect(result).toEqual([]);
        });

        it('should return an error if assetSymbols contains invalid entries', () => {
            const result = validateAssetSymbols({ assetSymbols: ['AIOTX', 123] });
            expect(result).toEqual(['Invalid token symbol']);
        });

        it('should return an error if assetSymbols is not a string or array', () => {
            const result = validateAssetSymbols({ assetSymbols: 123 });
            expect(result).toEqual(['Invalid token symbol']);
        });
    });

    describe('validateAssetSymbol', () => {
        it('should return an empty array if assetSymbol is valid', () => {
            const result = validateAssetSymbol({ assetSymbol: 'AIOTX' });
            expect(result).toEqual([]);
        });

        it('should return an error if assetSymbol is not a string', () => {
            const result = validateAssetSymbol({ assetSymbol: 123 });
            expect(result).toEqual(['Invalid token symbol']);
        });
    });

    describe('validateAssetsRequest', () => {
        it('should return an empty array for valid network and assetSymbols', () => {
            const result = validateAssetsRequest({
                network: 'testnet',
                assetSymbols: ['AIOTX', 'TON'],
            });
            expect(result).toEqual([]);
        });

        it('should return errors for invalid network and assetSymbols', () => {
            const result = validateAssetsRequest({
                network: 123,
                assetSymbols: 456,
            });
            expect(result).toEqual([
                'The network param is not a string.',
                'Invalid token symbol',
            ]);
        });
    });
});