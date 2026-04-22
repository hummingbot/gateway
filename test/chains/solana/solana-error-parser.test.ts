import {
  parseSolanaError,
  isSlippageError,
  isInsufficientBalanceError,
  getUserFriendlyErrorMessage,
  PROGRAM_IDS,
} from '../../../src/chains/solana/solana-error-parser';

describe('Solana Error Parser', () => {
  describe('parseSolanaError', () => {
    describe('Jupiter errors', () => {
      it('should parse Jupiter slippage error (hex format)', () => {
        const errorMessage = `Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Jupiter');
        expect(result.errorCode).toBe(6001);
        expect(result.errorCodeHex).toBe('0x1771');
      });

      it('should parse Jupiter slippage error (JSON format)', () => {
        const errorMessage = `{"Custom":6001} Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6001);
      });
    });

    describe('Meteora DLMM errors', () => {
      it('should parse Meteora slippage error (hex format 0x1774 = 6004)', () => {
        const errorMessage = `Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo failed: custom program error: 0x1774`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Meteora DLMM');
        expect(result.errorCode).toBe(6004);
        expect(result.errorCodeHex).toBe('0x1774');
      });

      it('should parse Meteora slippage error (JSON format)', () => {
        const errorMessage = `{"Custom":6004} Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo invoke`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6004);
      });

      it('should parse Meteora slippage error via generic fallback when program ID not identified', () => {
        // Error message without program ID in expected format
        const errorMessage = `Transaction simulation failed: custom program error: 0x1774`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6004);
      });

      it('should parse Meteora math overflow error', () => {
        const errorMessage = `Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo failed: custom program error: 0x1782`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('MATH_OVERFLOW');
        expect(result.errorCode).toBe(6018);
      });

      it('should parse Meteora invalid position width error', () => {
        const errorMessage = `Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo failed: custom program error: 0x1798`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('INVALID_POSITION');
        expect(result.errorCode).toBe(6040);
      });
    });

    describe('Raydium CLMM errors', () => {
      it('should parse Raydium CLMM price slippage error (6029)', () => {
        const errorMessage = `Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x178d`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Raydium CLMM');
        expect(result.errorCode).toBe(6029);
      });

      it('should parse Raydium CLMM too little output error (6030)', () => {
        const errorMessage = `Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x178e`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6030);
      });

      it('should parse Raydium CLMM too much input error (6031)', () => {
        const errorMessage = `Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x178f`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6031);
      });

      it('should parse Raydium CLMM sqrt price limit overflow error', () => {
        const errorMessage = `Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x1795`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('PRICE_LIMIT_OVERFLOW');
        expect(result.errorCode).toBe(6037);
      });
    });

    describe('Orca Whirlpool errors', () => {
      it('should parse Orca slippage error via program ID string match', () => {
        const errorMessage = `Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x178d`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Orca Whirlpool');
        expect(result.errorCode).toBe(6029);
      });

      it('should parse Orca too little output error (6030)', () => {
        const errorMessage = `Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x178e`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Orca Whirlpool');
        expect(result.errorCode).toBe(6030);
      });

      it('should parse Orca too much input error (6031)', () => {
        const errorMessage = `Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x178f`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.program).toBe('Orca Whirlpool');
        expect(result.errorCode).toBe(6031);
      });
    });

    describe('Raydium AMM errors', () => {
      it('should identify Raydium AMM program from error message', () => {
        const errorMessage = `Program 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 failed: custom program error: 0x1771`;
        const result = parseSolanaError(errorMessage);

        expect(result.program).toBe('Raydium AMM');
        // Falls back to generic error code mapping
        expect(result.errorCode).toBe(6001);
        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
      });
    });

    describe('Generic error code fallback', () => {
      it('should handle slippage error when program ID not identified', () => {
        const errorMessage = `Transaction simulation failed: custom program error: 0x1771`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6001);
        expect(result.program).toBe('Unknown');
      });

      it('should handle error code 6004 (Meteora slippage) via generic fallback', () => {
        const errorMessage = `InstructionError: {"Custom":6004}`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6004);
      });

      it('should handle error code 6029 via generic fallback', () => {
        const errorMessage = `custom program error: 0x178d`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6029);
      });

      it('should handle error code 6030 via generic fallback', () => {
        const errorMessage = `custom program error: 0x178e`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6030);
      });

      it('should handle error code 6031 via generic fallback', () => {
        const errorMessage = `custom program error: 0x178f`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
        expect(result.errorCode).toBe(6031);
      });
    });

    describe('Generic error patterns', () => {
      it('should detect insufficient funds from error message pattern', () => {
        const errorMessage = `Transaction simulation failed: InsufficientFunds`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('INSUFFICIENT_BALANCE');
      });

      it('should detect slippage from error message pattern', () => {
        const errorMessage = `Transaction failed: slippage tolerance exceeded`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('SLIPPAGE_EXCEEDED');
      });

      it('should detect account not found error', () => {
        const errorMessage = `AccountNotFound: Token account does not exist`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('ACCOUNT_NOT_FOUND');
      });
    });

    describe('Unknown errors', () => {
      it('should return UNKNOWN for unrecognized errors', () => {
        const errorMessage = `Some random error with no matching pattern`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('UNKNOWN');
        expect(result.errorCode).toBeNull();
      });

      it('should return UNKNOWN for unrecognized error codes', () => {
        const errorMessage = `custom program error: 0x9999`;
        const result = parseSolanaError(errorMessage);

        expect(result.type).toBe('UNKNOWN');
        expect(result.errorCode).toBe(39321); // 0x9999 in decimal
      });
    });

    describe('Error code extraction formats', () => {
      it('should extract hex format error codes', () => {
        const errorMessage = `custom program error: 0x1771`;
        const result = parseSolanaError(errorMessage);

        expect(result.errorCode).toBe(6001);
        expect(result.errorCodeHex).toBe('0x1771');
      });

      it('should extract JSON format error codes', () => {
        const errorMessage = `{"Custom":6001}`;
        const result = parseSolanaError(errorMessage);

        expect(result.errorCode).toBe(6001);
        expect(result.errorCodeHex).toBe('0x1771');
      });

      it('should extract decimal format from InstructionError', () => {
        const errorMessage = `InstructionError at index 2: 6001`;
        const result = parseSolanaError(errorMessage);

        expect(result.errorCode).toBe(6001);
      });
    });
  });

  describe('isSlippageError', () => {
    it('should return true for Jupiter slippage errors', () => {
      expect(
        isSlippageError(`Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771`),
      ).toBe(true);
    });

    it('should return true for Meteora slippage errors', () => {
      expect(
        isSlippageError(`Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo failed: custom program error: 0x1774`),
      ).toBe(true);
    });

    it('should return true for Raydium CLMM slippage errors', () => {
      expect(
        isSlippageError(`Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x178e`),
      ).toBe(true);
    });

    it('should return true for Orca slippage errors', () => {
      expect(
        isSlippageError(`Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x178e`),
      ).toBe(true);
    });

    it('should return false for non-slippage errors', () => {
      expect(isSlippageError(`InsufficientFunds`)).toBe(false);
    });
  });

  describe('isInsufficientBalanceError', () => {
    it('should return true for insufficient balance errors', () => {
      expect(isInsufficientBalanceError(`Transaction failed: InsufficientFunds`)).toBe(true);
    });

    it('should return false for slippage errors', () => {
      expect(isInsufficientBalanceError(`custom program error: 0x1771`)).toBe(false);
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return user-friendly message for slippage errors', () => {
      const message = getUserFriendlyErrorMessage(`custom program error: 0x1771`);
      expect(message).toContain('Swap failed');
      expect(message).toContain('slippage');
    });

    it('should return user-friendly message for insufficient balance', () => {
      const message = getUserFriendlyErrorMessage(`InsufficientFunds`);
      expect(message).toContain('Transaction failed');
      expect(message).toContain('balance');
    });

    it('should return user-friendly message for price limit overflow', () => {
      const message = getUserFriendlyErrorMessage(
        `Program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK failed: custom program error: 0x1795`,
      );
      expect(message).toContain('Swap failed');
      expect(message).toContain('price limit');
    });

    it('should return generic message for unknown errors', () => {
      const message = getUserFriendlyErrorMessage(`Unknown error occurred`);
      expect(message).toContain('Transaction failed');
    });
  });

  describe('PROGRAM_IDS', () => {
    it('should have all expected program IDs defined', () => {
      expect(PROGRAM_IDS.JUPITER).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
      expect(PROGRAM_IDS.METEORA_DLMM).toBe('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
      expect(PROGRAM_IDS.RAYDIUM_CLMM).toBe('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
      expect(PROGRAM_IDS.RAYDIUM_AMM).toBe('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
      expect(PROGRAM_IDS.ORCA_WHIRLPOOL).toBe('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');
    });
  });
});
