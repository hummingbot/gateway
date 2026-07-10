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
  | 'INSTRUCTION_ERROR'
  | 'SWIG_PERMISSION_DENIED'
  | 'UNKNOWN';

export interface ParsedSolanaError {
  type: SolanaErrorType;
  program: string;
  errorCode: number | null;
  errorCodeHex: string | null;
  /** Index of the failing instruction, when the error is an InstructionError */
  instructionIndex: number | null;
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
  SWIG: 'swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB',
} as const;

/**
 * Swig program errors (SwigAuthenticateError enum in anagrambuild/swig-wallet
 * state/src/lib.rs, discriminants from 3000). Matched by program id + code — not via the
 * generic tables — because the 3000 range collides with unrelated Anchor error codes.
 * The two codes hit in practice get actionable messages; the rest resolve to their
 * enum name so users are not left with a bare hex code.
 */
const SWIG_ERROR_MESSAGES: Record<number, string> = {
  3005: 'Swig permission denied (0xbbd): the delegate role may not perform this action.',
  3006:
    'Swig role permission denied (0xbbe): the delegate role is missing a permission this transaction needs — ' +
    'a program not on its allowlist (every program the wrapped instructions invoke must be allowed), an uncapped ' +
    'token mint, or a missing/exhausted SOL cap. Inspect the live policy with `pnpm swig:show`; grant venues with ' +
    '`pnpm swig:allow-program` and caps with `pnpm swig:add-token`. Jupiter cannot run under a program allowlist — ' +
    'it routes through arbitrary programs and needs a token-cap-only role.',
  3008:
    'Swig permission denied (0xbc0): a token account touched by this transaction has an active delegate or ' +
    'close authority, which the Swig program refuses to spend through.',
  3011:
    'Swig spend cap exceeded (0xbc3, PermissionDeniedInsufficientBalance): a SOL or token cap on the delegate ' +
    'role has less remaining allowance than this transaction spends. Caps are ONE-TIME budgets, permanently ' +
    'decremented by every successful transaction — and rent paid for newly created accounts (ATAs, position ' +
    'accounts, NFT mints) also debits the SOL cap, so position management costs more SOL cap than a swap. ' +
    'Check remaining allowances with `pnpm swig:show`, then top up with `pnpm swig:add-token` (works for both ' +
    'per-mint caps and SOL headroom; one owner approval).',
  3023: 'Swig permission denied (0xbcf): a token account spent by this transaction is not owned by the Swig wallet.',
};
const SWIG_ERROR_NAMES: Record<number, string> = {
  3000: 'InvalidAuthority',
  3001: 'InvalidAuthorityPayload',
  3002: 'InvalidDataPayload',
  3005: 'PermissionDenied',
  3006: 'PermissionDeniedMissingPermission',
  3007: 'PermissionDeniedTokenAccountPermissionFailure',
  3008: 'PermissionDeniedTokenAccountDelegatePresent',
  3009: 'PermissionDeniedTokenAccountNotInitialized',
  3010: 'PermissionDeniedToManageAuthority',
  3011: 'PermissionDeniedInsufficientBalance',
  3014: 'PermissionDeniedSessionExpired',
  3020: 'PermissionDeniedStakeAccountInvalidState',
  3023: 'PermissionDeniedTokenAccountAuthorityNotSwig',
};
const SWIG_ERROR_MIN = 3000;
const SWIG_ERROR_MAX = 3039;

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
 * Runtime `InstructionError` variants (non-`Custom`) that Solana returns when a
 * program rejects an account or fails outside of a custom program error code.
 * These appear in errors like {"InstructionError":[3,"InvalidAccountData"]} and
 * carry no numeric error code, so they need to be matched by variant name.
 */
const INSTRUCTION_ERROR_VARIANTS: Record<string, { type: SolanaErrorType; message: string }> = {
  InvalidAccountData: {
    type: 'INSTRUCTION_ERROR',
    message:
      'An account passed to the instruction has invalid or unexpected data. ' +
      'It may be uninitialized, owned by the wrong program, or hold a different token mint than expected.',
  },
  InvalidAccountOwner: {
    type: 'INSTRUCTION_ERROR',
    message: 'An account passed to the instruction is owned by an unexpected program.',
  },
  IllegalOwner: {
    type: 'INSTRUCTION_ERROR',
    message: 'An account passed to the instruction has an illegal owner.',
  },
  AccountNotExecutable: {
    type: 'INSTRUCTION_ERROR',
    message: 'An account expected to be an executable program is not executable.',
  },
  AccountDataTooSmall: {
    type: 'INSTRUCTION_ERROR',
    message: 'An account passed to the instruction has insufficient data size.',
  },
  NotEnoughAccountKeys: {
    type: 'INSTRUCTION_ERROR',
    message: 'The instruction was given fewer account keys than required.',
  },
  UninitializedAccount: {
    type: 'ACCOUNT_NOT_FOUND',
    message: 'An account passed to the instruction is uninitialized.',
  },
  MissingAccount: {
    type: 'ACCOUNT_NOT_FOUND',
    message: 'A required account was missing from the instruction.',
  },
  InsufficientFunds: {
    type: 'INSUFFICIENT_BALANCE',
    message: 'Insufficient funds to complete the instruction.',
  },
  ProgramFailedToComplete: {
    type: 'INSTRUCTION_ERROR',
    message: 'The program failed to complete execution.',
  },
  ComputationalBudgetExceeded: {
    type: 'INSTRUCTION_ERROR',
    message: 'The instruction exceeded its computational budget.',
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
 * Extract the failing instruction index and the (non-`Custom`) error variant
 * from an InstructionError, e.g. {"InstructionError":[3,"InvalidAccountData"]}.
 * For custom program errors ({"InstructionError":[3,{"Custom":6001}]}) the
 * variant is returned as null since the numeric code is extracted separately.
 */
function extractInstructionError(errorMessage: string): { index: number | null; variant: string | null } {
  const match = errorMessage.match(/"InstructionError"\s*:\s*\[\s*(\d+)\s*,\s*(.+?)\s*\]/);
  if (!match) {
    return { index: null, variant: null };
  }
  const index = parseInt(match[1], 10);
  // The variant is either a quoted string ("InvalidAccountData") or an object ({"Custom":6001}).
  const variantMatch = match[2].match(/^"([A-Za-z]+)"$/);
  return { index, variant: variantMatch ? variantMatch[1] : null };
}

/**
 * Extract the program log lines from a simulation error message.
 * `simulateTransaction` appends logs after a `Program Logs:` marker; this
 * returns the trailing lines (most relevant to the failure) for surfacing.
 */
export function extractProgramLogs(errorMessage: string, maxLines = 12): string[] {
  const marker = 'Program Logs:';
  const markerIndex = errorMessage.indexOf(marker);
  if (markerIndex === -1) {
    return [];
  }
  const lines = errorMessage
    .slice(markerIndex + marker.length)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.slice(-maxLines);
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
    [PROGRAM_IDS.SWIG]: 'Swig',
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
  const { index: instructionIndex, variant: instructionVariant } = extractInstructionError(errorMessage);

  // Swig policy rejections. Checked before the table lookups because the first program in
  // the logs is often ComputeBudget (top-level in a wrapped tx), which would misattribute
  // the error; the Swig program id appearing anywhere plus a code in the Swig enum range
  // is unambiguous.
  if (errorMessage.includes(PROGRAM_IDS.SWIG)) {
    if (code !== null && code >= SWIG_ERROR_MIN && code <= SWIG_ERROR_MAX) {
      const name = SWIG_ERROR_NAMES[code];
      const message =
        SWIG_ERROR_MESSAGES[code] ??
        `Swig program rejected the transaction (${hex}${name ? `, ${name}` : ''}). ` +
          'Inspect the wallet policy with `pnpm swig:show`.';
      return {
        type: 'SWIG_PERMISSION_DENIED',
        program: 'Swig',
        errorCode: code,
        errorCodeHex: hex,
        instructionIndex,
        message,
        rawError: errorMessage,
      };
    }
    // Solana runtime realloc limits are stricter for CPI (inner) instructions. Operations
    // that grow an account past that limit during init (e.g. Meteora DLMM position
    // creation) work top-level but cannot run wrapped inside the Swig `sign` instruction.
    if (errorMessage.includes('Failed to reallocate account data')) {
      return {
        type: 'INSTRUCTION_ERROR',
        program: programName,
        errorCode: code,
        errorCodeHex: hex,
        instructionIndex,
        message:
          'An inner instruction tried to grow an account beyond Solana’s CPI realloc limit. Account ' +
          'initializations that allocate large state (e.g. Meteora DLMM position creation) work when sent ' +
          'top-level but cannot run wrapped inside the Swig `sign` instruction. Use a narrower price range ' +
          '(fewer bins) or manage this position with a local wallet.',
        rawError: errorMessage,
      };
    }
  }

  // Try program-specific error code lookup
  if (programId && code !== null && PROGRAM_ERROR_CODES[programId]) {
    const errorInfo = PROGRAM_ERROR_CODES[programId][code];
    if (errorInfo) {
      return {
        type: errorInfo.type,
        program: programName,
        errorCode: code,
        errorCodeHex: hex,
        instructionIndex,
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
      instructionIndex,
      message: errorInfo.message,
      rawError: errorMessage,
    };
  }

  // Try non-`Custom` InstructionError variants (e.g. InvalidAccountData), which carry no numeric code
  if (instructionVariant && INSTRUCTION_ERROR_VARIANTS[instructionVariant]) {
    const errorInfo = INSTRUCTION_ERROR_VARIANTS[instructionVariant];
    const indexSuffix = instructionIndex !== null ? ` (failing instruction index ${instructionIndex})` : '';
    return {
      type: errorInfo.type,
      program: programName,
      errorCode: code,
      errorCodeHex: hex,
      instructionIndex,
      message: `${errorInfo.message}${indexSuffix}`,
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
        instructionIndex,
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
    instructionIndex,
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
    case 'INSTRUCTION_ERROR':
      return `Transaction simulation failed: ${parsed.message}`;
    case 'SWIG_PERMISSION_DENIED':
      return `Swig policy rejected the transaction: ${parsed.message}`;
    default:
      return `Transaction failed. ${parsed.errorCodeHex ? `Error code: ${parsed.errorCodeHex}` : 'Unknown error.'}`;
  }
}
