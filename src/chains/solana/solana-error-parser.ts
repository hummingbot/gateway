/**
 * Solana Program Error Parser
 *
 * Utility for parsing transaction errors from various Solana programs
 * and extracting structured error types.
 */

export type SolanaErrorType =
  | 'SLIPPAGE_EXCEEDED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_POSITION'
  | 'PRICE_LIMIT_OVERFLOW'
  | 'ACCOUNT_NOT_FOUND'
  | 'MATH_OVERFLOW'
  | 'UNKNOWN';

export interface ParsedSolanaError {
  type: SolanaErrorType;
  program: string;
  errorCode: number | null;
  errorCodeHex: string | null;
  message: string;
  rawError: string;
}

/**
 * Known Solana program IDs
 */
export const PROGRAM_IDS = {
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
} as const;

/**
 * Program-specific error code mappings
 * Error codes are in decimal format
 */
const PROGRAM_ERROR_CODES: Record<string, Record<number, { type: SolanaErrorType; message: string }>> = {
  // Jupiter error codes
  [PROGRAM_IDS.JUPITER]: {
    6001: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Slippage tolerance exceeded. The output amount would be less than your minimum.',
    },
    6002: {
      type: 'INVALID_POSITION',
      message: 'Invalid calculation result.',
    },
  },

  // Meteora DLMM error codes (lb_clmm program)
  [PROGRAM_IDS.METEORA_DLMM]: {
    6004: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Exceeded slippage tolerance. The swap output is less than minimum amount.',
    },
    6018: {
      type: 'MATH_OVERFLOW',
      message: 'Math operation overflow.',
    },
    6040: {
      type: 'INVALID_POSITION',
      message: 'Invalid position width. Use a position width of 69 bins or lower.',
    },
  },

  // Raydium CLMM error codes
  [PROGRAM_IDS.RAYDIUM_CLMM]: {
    6029: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Price slippage check failed. The calculated price does not match expected values.',
    },
    6030: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Too little output received. Slippage tolerance exceeded.',
    },
    6031: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Too much input paid. Slippage tolerance exceeded.',
    },
    6037: {
      type: 'PRICE_LIMIT_OVERFLOW',
      message: 'Square root price limit overflow.',
    },
  },

  // Orca Whirlpool error codes (same as Raydium CLMM since they share similar design)
  [PROGRAM_IDS.ORCA_WHIRLPOOL]: {
    6029: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Price slippage check failed.',
    },
    6030: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Too little output received. Slippage tolerance exceeded.',
    },
    6031: {
      type: 'SLIPPAGE_EXCEEDED',
      message: 'Too much input paid. Slippage tolerance exceeded.',
    },
  },
};

/**
 * Generic error codes that may appear across multiple programs
 * Used as fallback when program ID is not identified
 * Hex -> Decimal mappings:
 * - 0x1771 = 6001 (Jupiter SlippageToleranceExceeded)
 * - 0x1785 = 6021 (CLMM PriceSlippageCheck)
 * - 0x1786 = 6022 (CLMM TooLittleOutputReceived)
 * - 0x1787 = 6023 (CLMM TooMuchInputPaid)
 * - 0x177d = 6013 (CLMM SqrtPriceLimitOverflow)
 * - 0x1798 = 6040 (Meteora InvalidPositionWidth)
 */
const GENERIC_ERROR_CODES: Record<number, { type: SolanaErrorType; message: string }> = {
  // Slippage errors
  6001: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Slippage tolerance exceeded. The output amount would be less than your minimum.',
  },
  6004: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Exceeded slippage tolerance. The swap output is less than minimum amount.',
  },
  6021: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Price slippage check failed. The calculated price does not match expected values.',
  },
  6022: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Too little output received. Slippage tolerance exceeded.',
  },
  6023: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Too much input paid. Slippage tolerance exceeded.',
  },
  6029: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Price slippage check failed.',
  },
  6030: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Too little output received. Slippage tolerance exceeded.',
  },
  6031: {
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Too much input paid. Slippage tolerance exceeded.',
  },
  // Price/position errors
  6013: {
    type: 'PRICE_LIMIT_OVERFLOW',
    message: 'Square root price limit overflow.',
  },
  6037: {
    type: 'PRICE_LIMIT_OVERFLOW',
    message: 'Square root price limit overflow.',
  },
  6040: {
    type: 'INVALID_POSITION',
    message: 'Invalid position width. Use a position width of 69 bins or lower.',
  },
  // Math errors
  6018: {
    type: 'MATH_OVERFLOW',
    message: 'Math operation overflow.',
  },
};

/**
 * Generic error patterns that apply across programs
 * These are checked when program-specific codes don't match
 */
const GENERIC_ERROR_PATTERNS: Array<{ pattern: RegExp; type: SolanaErrorType; message: string }> = [
  {
    pattern: /InsufficientFunds|insufficient/i,
    type: 'INSUFFICIENT_BALANCE',
    message: 'Insufficient funds for transaction.',
  },
  {
    pattern: /AccountNotFound/i,
    type: 'ACCOUNT_NOT_FOUND',
    message: 'Required account not found.',
  },
  {
    pattern: /slippage/i,
    type: 'SLIPPAGE_EXCEEDED',
    message: 'Slippage tolerance exceeded.',
  },
];

/**
 * Extract error code from error message
 * Handles formats like:
 * - "custom program error: 0x1771"
 * - {"Custom":6001}
 * - "Error Code: SlippageToleranceExceeded"
 */
function extractErrorCode(errorMessage: string): { code: number | null; hex: string | null } {
  // Try hex format: "custom program error: 0x1771"
  const hexMatch = errorMessage.match(/custom program error: (0x[0-9a-fA-F]+)/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const code = parseInt(hex, 16);
    return { code, hex };
  }

  // Try JSON format: {"Custom":6001} or "Custom":6001
  const jsonMatch = errorMessage.match(/"Custom"\s*:\s*(\d+)/);
  if (jsonMatch) {
    const code = parseInt(jsonMatch[1], 10);
    const hex = '0x' + code.toString(16);
    return { code, hex };
  }

  // Try decimal format in InstructionError
  const decimalMatch = errorMessage.match(/InstructionError.*?(\d{4,})/);
  if (decimalMatch) {
    const code = parseInt(decimalMatch[1], 10);
    const hex = '0x' + code.toString(16);
    return { code, hex };
  }

  return { code: null, hex: null };
}

/**
 * Extract program ID from error message
 */
function extractProgramId(errorMessage: string): string | null {
  // Look for program invocation in logs
  const programMatch = errorMessage.match(/Program ([A-Za-z0-9]{32,44}) (?:invoke|failed)/);
  if (programMatch) {
    return programMatch[1];
  }

  // Check for known program names in the error
  if (errorMessage.includes('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')) {
    return PROGRAM_IDS.JUPITER;
  }
  if (errorMessage.includes('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo')) {
    return PROGRAM_IDS.METEORA_DLMM;
  }
  if (errorMessage.includes('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK')) {
    return PROGRAM_IDS.RAYDIUM_CLMM;
  }
  if (errorMessage.includes('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc')) {
    return PROGRAM_IDS.ORCA_WHIRLPOOL;
  }
  if (errorMessage.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')) {
    return PROGRAM_IDS.RAYDIUM_AMM;
  }

  return null;
}

/**
 * Get program name from program ID
 */
function getProgramName(programId: string | null): string {
  if (!programId) return 'Unknown';

  const names: Record<string, string> = {
    [PROGRAM_IDS.JUPITER]: 'Jupiter',
    [PROGRAM_IDS.METEORA_DLMM]: 'Meteora DLMM',
    [PROGRAM_IDS.RAYDIUM_CLMM]: 'Raydium CLMM',
    [PROGRAM_IDS.RAYDIUM_AMM]: 'Raydium AMM',
    [PROGRAM_IDS.ORCA_WHIRLPOOL]: 'Orca Whirlpool',
  };

  return names[programId] || programId.slice(0, 8) + '...';
}

/**
 * Parse a Solana transaction error message and return structured error info
 */
export function parseSolanaError(errorMessage: string): ParsedSolanaError {
  const { code, hex } = extractErrorCode(errorMessage);
  const programId = extractProgramId(errorMessage);
  const programName = getProgramName(programId);

  // Try program-specific error code lookup
  if (programId && code !== null && PROGRAM_ERROR_CODES[programId]) {
    const errorInfo = PROGRAM_ERROR_CODES[programId][code];
    if (errorInfo) {
      return {
        type: errorInfo.type,
        program: programName,
        errorCode: code,
        errorCodeHex: hex,
        message: errorInfo.message,
        rawError: errorMessage,
      };
    }
  }

  // Try generic error code lookup (for when program is unknown or code not in program-specific list)
  if (code !== null && GENERIC_ERROR_CODES[code]) {
    const errorInfo = GENERIC_ERROR_CODES[code];
    return {
      type: errorInfo.type,
      program: programName,
      errorCode: code,
      errorCodeHex: hex,
      message: errorInfo.message,
      rawError: errorMessage,
    };
  }

  // Try generic error patterns
  for (const { pattern, type, message } of GENERIC_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        type,
        program: programName,
        errorCode: code,
        errorCodeHex: hex,
        message,
        rawError: errorMessage,
      };
    }
  }

  // Unknown error
  return {
    type: 'UNKNOWN',
    program: programName,
    errorCode: code,
    errorCodeHex: hex,
    message: 'Transaction failed with an unknown error.',
    rawError: errorMessage,
  };
}

/**
 * Check if an error is a slippage error
 */
export function isSlippageError(errorMessage: string): boolean {
  const parsed = parseSolanaError(errorMessage);
  return parsed.type === 'SLIPPAGE_EXCEEDED';
}

/**
 * Check if an error is an insufficient balance error
 */
export function isInsufficientBalanceError(errorMessage: string): boolean {
  const parsed = parseSolanaError(errorMessage);
  return parsed.type === 'INSUFFICIENT_BALANCE';
}

/**
 * Get a user-friendly error message for a Solana error
 */
export function getUserFriendlyErrorMessage(errorMessage: string): string {
  const parsed = parseSolanaError(errorMessage);

  switch (parsed.type) {
    case 'SLIPPAGE_EXCEEDED':
      return `Swap failed: ${parsed.message} Consider increasing your slippage tolerance or the market price has moved significantly.`;
    case 'INSUFFICIENT_BALANCE':
      return `Transaction failed: ${parsed.message} Please check your token balance.`;
    case 'INVALID_POSITION':
      return `Position error: ${parsed.message}`;
    case 'PRICE_LIMIT_OVERFLOW':
      return `Swap failed: ${parsed.message} Adjust price limit/direction or retry with default limits.`;
    case 'ACCOUNT_NOT_FOUND':
      return `Transaction failed: ${parsed.message} The pool or token accounts may not be initialized.`;
    case 'MATH_OVERFLOW':
      return `Transaction failed: ${parsed.message} Try reducing the amount or adjusting parameters.`;
    default:
      return `Transaction failed. ${parsed.errorCodeHex ? `Error code: ${parsed.errorCodeHex}` : 'Unknown error.'}`;
  }
}
